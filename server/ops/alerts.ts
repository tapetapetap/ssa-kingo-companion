// 실패 띠(FR-044, 3단계 research R11). 순수 함수: 매일 작업 기록(최근 것부터)과 지금
import { LIMITS } from '../limits.ts';

export type Run = { startedAt: Date; endedAt: Date; steps: Record<string, Record<string, unknown>> };
export type Alert = { kind: 'classifier' | 'ingest' | 'judge' | 'stale'; text: string; since: Date; reason: string };

const failed = (r: Run, step: string) => !!r.steps[step] && !r.steps[step].ok && !r.steps[step].skipped;
const num = (o: unknown, k: string) => { const v = (o as Record<string, unknown> | null | undefined)?.[k]; return typeof v === 'number' ? v : 0; };

/** 새로 물은 것과 그중 실패(못 물음 포함). 분류기 숫자가 없으면 null */
export function judged(r: Run): { asked: number; failed: number } | null {
  const c = r.steps.classifier;
  if (!c || typeof c.llm !== 'object' || c.llm === null) return null;
  const bad = num(c.llm, 'failed') + num(c.llm, 'skipped') + num(c.field, 'failed') + num(c.field, 'notAsked');
  return { asked: num(c.llm, 'fresh') + num(c.field, 'fresh') + bad, failed: bad };
}

/** 앞에서부터 잇단 실패가 alertRuns번 이상이면 그 첫 작업 */
function streak(runs: Run[], bad: (r: Run) => boolean): Run | null {
  const n = runs.findIndex(r => !bad(r));
  const len = n < 0 ? runs.length : n;
  return len >= LIMITS.alertRuns ? runs[len - 1] : null;
}

export function alerts(runs: Run[], now: Date): Alert[] {
  if (!runs.length) return [];
  const out: Alert[] = [];
  const last = runs[0];
  // 분류기가 실패하면 넣기는 건너뛴다. 둘을 함께 보고, 마지막에 실패한 단계를 적는다
  const collect = streak(runs, r => failed(r, 'classifier') || failed(r, 'ingest'));
  if (collect) {
    const kind = failed(last, 'classifier') ? 'classifier' : 'ingest';
    out.push({ kind, text: kind === 'classifier' ? '수집·판정이 잇달아 실패했어요' : '넣기가 잇달아 실패했어요', since: collect.startedAt, reason: String(last.steps[kind].error ?? '') });
  }
  const counted = runs.flatMap(r => { const j = judged(r); return j && j.asked > 0 ? [{ r, ...j }] : []; });
  const over = (x: { asked: number; failed: number }) => x.failed * 100 > x.asked * LIMITS.alertFailPercent;
  const n = counted.findIndex(x => !over(x));
  const len = n < 0 ? counted.length : n;
  if (len >= LIMITS.alertRuns) out.push({ kind: 'judge', text: '판정 실패가 많아요', since: counted[len - 1].r.startedAt, reason: `새로 물은 ${counted[0].asked}건 가운데 ${counted[0].failed}건을 판정하지 못했어요` });
  if (now.getTime() - last.endedAt.getTime() > LIMITS.alertStaleHours * 3600_000) out.push({ kind: 'stale', text: '매일 작업이 멈췄어요', since: last.endedAt, reason: `마지막 매일 작업이 ${LIMITS.alertStaleHours}시간보다 오래됐어요` });
  return out;
}
