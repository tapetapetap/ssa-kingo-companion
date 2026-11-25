import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DailyBusy, type DailyRun } from '../jobs/daily.ts';
import { testDb } from '../test/db.ts';
import { lastRequest, openRequest, runRequests } from './requests.ts';

let db: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.sql`truncate op_requests cascade`; });
const fine = { ok: true, skipped: false, seconds: 1, error: null };
const done = (steps = {}) => async () => ({ steps: { classifier: fine, ...steps } }) as unknown as DailyRun;
const run = (daily: () => Promise<DailyRun> = done()) => runRequests({ sql: db.sql, daily });

describe('운영자 요청 (R9)', () => {
  it('없으면 요청 없음. 적으면 기다리고, 처리하면 끝난다. 열린 것이 있으면 already', async () => {
    expect(await lastRequest(db.sql, 'daily')).toBeNull();
    expect(await run()).toBe('요청 없음');
    expect(await openRequest(db.sql, 'daily', 'ops@example.com')).toMatchObject({ kind: 'daily', by: 'ops@example.com', status: 'waiting', model: null, startedAt: null });
    await expect(openRequest(db.sql, 'daily', 'ops@example.com')).rejects.toMatchObject({ status: 409, code: 'already' });
    expect(await run()).toBe('매일 작업 끝');
    expect(await lastRequest(db.sql, 'daily')).toMatchObject({ status: 'done', error: null });
    expect((await openRequest(db.sql, 'daily', 'ops@example.com')).status).toBe('waiting');
  });

  it('단계가 실패해도 끝남이고 실패한 단계를 적는다. 건너뛴 것은 실패가 아니다', async () => {
    await openRequest(db.sql, 'daily', 'o');
    expect(await run(done({ ingest: { ...fine, ok: false, error: 'x' }, backup: { ...fine, ok: false, skipped: true } }))).toBe('매일 작업 끝(실패한 단계 ingest)');
    expect(await lastRequest(db.sql, 'daily')).toMatchObject({ status: 'done', error: '실패한 단계: ingest' });
  });

  it('매일 작업이 돌고 있으면 다시 기다리고, 작업이 던지면 실패로 남는다', async () => {
    await openRequest(db.sql, 'daily', 'o');
    expect(await run(async () => { throw new DailyBusy('x'); })).toBe('매일 작업이 돌고 있어 기다려요');
    expect(await lastRequest(db.sql, 'daily')).toMatchObject({ status: 'waiting', startedAt: null });
    await expect(run(async () => { throw new Error('DB에 닿지 못했어요 postgres://a:b@db/x'); })).rejects.toThrow();
    expect(await lastRequest(db.sql, 'daily')).toMatchObject({ status: 'failed', error: 'DB에 닿지 못했어요 (주소 가림)' });
  });

  it('도중에 죽은 매일 작업은 실패, 죽은 재기는 멈춤으로 되돌린다', async () => {
    await db.sql`insert into op_requests (kind, by_operator, status) values ('daily', 'o', 'running')`;
    await db.sql`insert into op_requests (kind, model, by_operator, status) values ('model_trial', 'm', 'o', 'running')`;
    await run();
    expect(await lastRequest(db.sql, 'daily')).toMatchObject({ status: 'failed', error: '도중에 끝났어요' });
    expect(await lastRequest(db.sql, 'model_trial')).toMatchObject({ status: 'paused', model: 'm' });
  });

  it('둘이 함께 돌지 않는다', async () => {
    await openRequest(db.sql, 'daily', 'o');
    let go = () => {};
    const first = run(() => new Promise(ok => { go = () => ok({ steps: {} } as DailyRun); }));
    while ((await lastRequest(db.sql, 'daily'))?.status !== 'running') await new Promise(r => setTimeout(r, 5));
    expect(await run()).toBe('다른 요청 처리가 돌고 있어요');
    expect((await lastRequest(db.sql, 'daily'))?.status).toBe('running');
    go();
    await first;
  });
});
