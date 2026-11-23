import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../test/db.ts';
import { status } from './status.ts';

let db: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.sql`truncate daily_runs, ingest_runs, repick_queue`; });

const up = async (url: string) => ({ ok: true, json: async () => (url.endsWith('/api/tags') ? { models: [{ name: 'gemma4:12b' }, { name: 'bge-m3' }] } : { ok: true }) });

describe('상태 보기 (contracts/cli.md)', () => {
  it('다섯 줄을 내고, 모두 닿으면 ok다. 아직 돈 적이 없으면 그렇게 말한다', async () => {
    const r = await status({ sql: db.sql, ollamaHost: '127.0.0.1:11434', apiUrl: 'http://127.0.0.1:8080', get: up });
    expect(r).toEqual({ ok: true, lines: [
      'DB: 닿음 · 적용 안 된 바꾸기 0', '마지막 매일 작업: 아직 없음', '마지막 넣기: 아직 없음', '모델 서버: 닿음(gemma4:12b, bge-m3)', 'api: 닿음 · 다시 고르기 줄 0'
    ] });
  });

  it('마지막 매일 작업의 실패한 단계와 넣기 거절 이유를 적고, 하나라도 닿지 못하면 ok가 거짓이다', async () => {
    await db.sql`insert into daily_runs (started_at, ended_at, steps, load) values ('2026-11-24T03:00:00+09:00', '2026-11-24T03:41:00+09:00',
      ${db.sql.json({ classifier: { ok: false, skipped: false }, ingest: { ok: false, skipped: true }, backup: { ok: true, skipped: false } })}, '{}')`;
    await db.sql`insert into ingest_runs (at, source, taxonomy_id, rejected) values ('2026-11-24T03:12:00+09:00', 's', 'custom', '파일이 틀려요')`;
    const r = await status({ sql: db.sql, ollamaHost: 'h', apiUrl: 'http://a', get: async url => { if (url.includes('/api/tags')) throw new Error('연결 거부'); return up(url); } });
    expect(r.ok).toBe(false);
    expect(r.lines.slice(1, 4)).toEqual(['마지막 매일 작업: 2026-11-24 03:41 끝 · 실패한 단계 classifier', '마지막 넣기: 2026-11-24 03:12 · 넣지 않았어요: 파일이 틀려요', '모델 서버: 닿지 못함(연결 거부)']);
  });
});
