import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DailyBusy, type DailyRun } from '../jobs/daily.ts';
import { testDb } from '../test/db.ts';
import { lastRequest, nightOpen, openRequest, runRequests, type RequestDeps } from './requests.ts';

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

  const kst = (hm: string) => new Date(`2026-11-25T${hm}:00+09:00`);
  it('모델을 재도 되는 때: 22:00~02:50, 그리고 오늘 매일 작업이 끝난 뒤~07:00', async () => {
    await db.sql`truncate daily_runs`;
    const open = (hm: string) => nightOpen(db.sql, kst(hm));
    expect([await open('21:59'), await open('22:00'), await open('00:10'), await open('02:49'), await open('02:50')]).toEqual([false, true, true, true, false]);
    expect([await open('03:30'), await open('06:59')]).toEqual([false, false]); // 매일 작업이 없던 날은 아침 시간이 없다
    await db.sql`insert into daily_runs (started_at, ended_at, steps, load) values ('2026-11-24T23:00:00+09:00', now(), '{}', '{}')`;
    expect(await open('05:00')).toBe(false); // 오늘 03:00 앞에 시작한 것
    await db.sql`insert into daily_runs (started_at, ended_at, steps, load) values ('2026-11-25T03:00:00+09:00', now(), '{}', '{}')`;
    expect([await open('05:00'), await open('06:59'), await open('07:00'), await open('12:00')]).toEqual([true, true, false, false]);
    const conn = await db.sql.reserve();
    await conn`select pg_advisory_lock(hashtext('kingo:daily:' || current_schema()))`;
    expect(await open('05:00')).toBe(false); // 다른 매일 작업이 도는 중
    await conn`select pg_advisory_unlock(hashtext('kingo:daily:' || current_schema()))`;
    conn.release();
  });

  it('재기: 밤에만 돌고, 멈추면 이어 할 수 있게 남고, 끝나거나 실패하면 닫는다', async () => {
    await openRequest(db.sql, 'model_trial', 'o', 'b:1');
    const at = (hm: string, trial: RequestDeps['trial']) => runRequests({ sql: db.sql, daily: done(), now: () => kst(hm), trial });
    expect(await at('12:00', async () => 'done')).toBe('요청 없음');
    expect(await at('23:00', async () => 'night')).toBe('모델 재기 멈춤 0/0');
    expect(await lastRequest(db.sql, 'model_trial')).toMatchObject({ status: 'paused', endedAt: null });
    expect(await at('23:00', async () => { throw new Error('정답셋이 없어요'); })).toBe('모델 재기 실패(정답셋이 없어요)');
    expect(await lastRequest(db.sql, 'model_trial')).toMatchObject({ status: 'failed', error: '정답셋이 없어요' });
    await openRequest(db.sql, 'model_trial', 'o', 'b:1');
    expect(await at('23:00', async () => 'done')).toBe('모델 재기 끝 0/0');
    expect(await lastRequest(db.sql, 'model_trial')).toMatchObject({ status: 'done' });
  });

  it('재는 중에 매일 작업을 요청하면 물러나 먼저 돌리고, 밤이 남았으면 이어서 잰다', async () => {
    await openRequest(db.sql, 'model_trial', 'o', 'b:1');
    const order: string[] = [];
    const line = await runRequests({
      sql: db.sql, now: () => kst('23:00'), daily: async () => { order.push('매일'); return done()(); },
      trial: async (_, stop) => {
        order.push('재기');
        if (order.length === 1) await openRequest(db.sql, 'daily', 'o');
        return await stop() ?? 'done';
      }
    });
    expect(order).toEqual(['재기', '매일', '재기']);
    expect(line).toBe('모델 재기 멈춤 0/0 · 매일 작업 끝 · 모델 재기 끝 0/0');
  });

  it('정해진 매일 작업이 돌고 있으면 재기도 돌리지 않고 다음 10분을 기다린다', async () => {
    await openRequest(db.sql, 'model_trial', 'o', 'b:1');
    await openRequest(db.sql, 'daily', 'o');
    let tried = 0;
    expect(await runRequests({ sql: db.sql, now: () => kst('23:00'), daily: async () => { throw new DailyBusy('x'); }, trial: async () => { tried++; return 'done'; } })).toBe('매일 작업이 돌고 있어 기다려요');
    expect(tried).toBe(0);
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
