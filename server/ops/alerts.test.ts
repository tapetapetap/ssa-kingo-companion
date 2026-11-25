import { describe, expect, it } from 'vitest';
import { alerts, judged, type Run } from './alerts.ts';

const NOW = new Date('2026-11-25T12:00:00+09:00');
/** n일 전 03:00에 시작한 작업 */
const run = (n: number, steps: Run['steps'] = {}): Run => {
  const startedAt = new Date(Date.parse('2026-11-25T03:00:00+09:00') - n * 86400_000);
  return { startedAt, endedAt: new Date(startedAt.getTime() + 3600_000), steps: { classifier: ok, ingest: ok, ...steps } };
};
const ok = { ok: true, skipped: false, error: null };
const bad = (error: string) => ({ ok: false, skipped: false, error });
const skipped = { ok: false, skipped: true, error: null };
const llm = (fresh: number, failed: number, skip = 0, field: unknown = null) => ({ classifier: { ...ok, llm: { cached: 100, fresh, failed, skipped: skip }, field } });
const kinds = (runs: Run[], now = NOW) => alerts(runs, now).map(a => a.kind);

describe('실패 띠 (FR-044)', () => {
  it('첫날과 모두 성공이면 없다', () => {
    expect(alerts([], NOW)).toEqual([]);
    expect(alerts([run(0), run(1)], NOW)).toEqual([]);
  });
  it('둘 잇단 분류기 실패: 까닭과 첫 때를 적는다. 하나면 없고, 성공하면 사라진다', () => {
    const c = { classifier: bad('분류기가 1로 끝났어요'), ingest: skipped };
    expect(alerts([run(0, c), run(1, c), run(2, c), run(3)], NOW)).toEqual([{ kind: 'classifier', text: '수집·판정이 잇달아 실패했어요', since: run(2).startedAt, reason: '분류기가 1로 끝났어요' }]);
    expect(kinds([run(0, c), run(1)])).toEqual([]);
    expect(kinds([run(0), run(1, c), run(2, c)])).toEqual([]);
  });
  it('넣기 실패와 섞인 것도 잇단 실패다. 건너뛴 것은 실패가 아니다', () => {
    const i = { ingest: bad('활성 분야 목록이 없어요') };
    expect(alerts([run(0, i), run(1, { classifier: bad('x'), ingest: skipped })], NOW)[0]).toMatchObject({ kind: 'ingest', reason: '활성 분야 목록이 없어요' });
    expect(kinds([run(0, { classifier: skipped }), run(1, { classifier: skipped })])).toEqual([]);
  });
  it('판정 실패 10%: 딱 10%는 아니고 넘으면 나온다. 보관 답은 세지 않는다', () => {
    expect(kinds([run(0, llm(9, 1)), run(1, llm(9, 1))])).toEqual([]);
    expect(alerts([run(0, llm(8, 1)), run(1, llm(8, 1))], NOW)[0]).toMatchObject({ kind: 'judge', reason: '새로 물은 9건 가운데 1건을 판정하지 못했어요' });
    expect(kinds([run(0, llm(8, 0, 1)), run(1, llm(8, 0, 1))])).toEqual(['judge']); // 못 물음
    expect(kinds([run(0, llm(10, 0, 0, { fresh: 5, failed: 1, notAsked: 1 })), run(1, llm(0, 0, 0, { fresh: 0, failed: 1, notAsked: 0 }))])).toEqual(['judge']);
  });
  it('새로 물은 것이 없거나 숫자가 없는 작업은 세지 않는다', () => {
    expect(judged(run(0))).toBeNull();
    expect(judged(run(0, llm(0, 0)))).toEqual({ asked: 0, failed: 0 });
    expect(kinds([run(0, llm(0, 0)), run(1, llm(1, 1)), run(2), run(3, llm(1, 1))])).toEqual(['judge']);
    expect(kinds([run(0, llm(1, 1)), run(1, llm(0, 0))])).toEqual([]);
  });
  it('마지막 작업이 36시간보다 오래됐으면 멈춤', () => {
    const at = (h: number) => new Date(run(0).endedAt.getTime() + h * 3600_000);
    expect(kinds([run(0)], at(36))).toEqual([]);
    expect(kinds([run(0)], new Date(at(36).getTime() + 1))).toEqual(['stale']);
  });
});
