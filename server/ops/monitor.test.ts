import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../test/db.ts';
import { day, notice } from '../test/notice.ts';
import { CONSENT, createDevStudent, PASSWORD, studentApp } from '../test/student.ts';

let db: Awaited<ReturnType<typeof testDb>>;
let app: Awaited<ReturnType<typeof studentApp>>;
const operators = new Map([['dev:ops@example.com', 'operator']]);
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.sql`truncate students, notices, daily_runs, daily_counts, op_requests, verdict_log, push_sent cascade`;
  app = await studentApp(db.sql, { operators, models: async () => [{ name: 'gemma4:12b', size: 1, parameterSize: '12B', family: 'gemma' }] });
  await createDevStudent(db.sql, 'ops@example.com');
  await app.request('POST', '/api/login', { method: 'dev', email: 'ops@example.com', password: PASSWORD });
});
afterEach(async () => { await app.close(); });
const monitor = async () => (await app.request('GET', '/api/ops/monitor')).body as Record<string, never> & { counts: Record<string, unknown>[]; days: Record<string, unknown>[]; alerts: { kind: string; since: string }[] };
const ok = { ok: true, skipped: false, seconds: 1, error: null };
async function daily(daysAgo: number, steps: Record<string, unknown> = {}) {
  const at = new Date(Date.now() - daysAgo * 86400_000 - 3600_000);
  await db.sql`insert into daily_runs (started_at, ended_at, steps, load) values (${at}, ${new Date(at.getTime() + 90_000)}, ${db.sql.json({ classifier: ok, ingest: ok, ...steps } as never)}, ${db.sql.json({ gpuAvg: 78.9, tempMax: 71.9, requests: 40, classifierLine: null })})`;
}

describe('모니터링 (contracts/api.md)', () => {
  it('아무것도 없으면 빈 값과 띠 없음', async () => {
    const m = await monitor();
    expect(m).toMatchObject({ alerts: [], health: { db: true, model: { ok: true, names: ['gemma4:12b'] }, lastDaily: null }, today: { fetched: null, failed: null, reviewOpen: 0 }, load: { gpuAvg: null }, editRate: { num: 0, den: 0 }, request: null, dailyRunning: false, days: [] });
    expect(m.counts).toHaveLength(14);
    expect(m.counts[0]).toMatchObject({ day: day(0), consented: 0, server_error: 0 });
    expect(m.counts[1]).toMatchObject({ day: day(-1), consented: null, push_sent: null });
  });

  it('숫자가 기록과 같다: 오늘, 부하, 단계, 14일, 수정 비율, 지난 숫자', async () => {
    await daily(0, { classifier: { ...ok, fetched: 5, opportunity: 120, not: 250, review: 30, new: { opportunity: 2, not: 2, review: 1 }, llm: { cached: 400, fresh: 4, failed: 1, skipped: 0 }, field: { cached: 1, fresh: 1, failed: 0, notAsked: 0 } } });
    await daily(20);
    for (const no of [1, 2]) await notice(db.sql, { no });
    await db.sql`insert into review_items (notice_id, reasons, checked_at) values ('cse:1', array['no_deadline'], null), ('cse:2', array['no_fields'], now())`;
    await db.sql`insert into verdict_log (notice_id, action, by_operator, at) values ('cse:1', 'edit', 'o', now()), ('cse:1', 'confirm', 'o', now()), ('cse:2', 'confirm', 'o', now()), ('cse:3', 'edit', 'o', now() - interval '31 days'), ('cse:4', 'rejudge', 'o', now())`;
    await db.sql`insert into daily_counts (day, name, n) values (${day(-1)}, 'like', 7), (${day(-1)}, 'server_error', 2), (${day(-14)}, 'like', 9)`;
    const m = await monitor();
    expect(m).toMatchObject({ today: { fetched: 5, opportunity: 2, not: 2, review: 1, failed: 1, reviewOpen: 1 }, load: { gpuAvg: 78.9, tempMax: 71.9 }, editRate: { num: 1, den: 2 } });
    expect(m.days).toHaveLength(1);
    expect(m.days[0]).toMatchObject({ seconds: 90, steps: { classifier: { ok: true, fetched: 5 } }, load: { requests: 40 } });
    expect(m.counts[1]).toMatchObject({ like: 7, server_error: 2, later: null });
  });

  it('실패 둘이면 띠, 성공하면 사라진다. 오래 멈췄으면 14일이 지나도 알린다', async () => {
    const bad = { classifier: { ...ok, ok: false, error: '분류기가 1로 끝났어요' }, ingest: { ...ok, ok: false, skipped: true } };
    await daily(1, bad);
    await daily(0, bad);
    expect((await monitor()).alerts).toMatchObject([{ kind: 'classifier', reason: '분류기가 1로 끝났어요' }]);
    await daily(0);
    expect((await monitor()).alerts).toEqual([]);
    await db.sql`truncate daily_runs`;
    await daily(30);
    expect((await monitor()).alerts).toMatchObject([{ kind: 'stale' }]);
  });

  it('한 번 더 돌리기는 요청만 적고 202, 열려 있으면 409', async () => {
    expect(await app.request('POST', '/api/ops/daily')).toMatchObject({ status: 202, body: { request: { kind: 'daily', status: 'waiting', by: 'ops@example.com' } } });
    expect(await app.request('POST', '/api/ops/daily')).toMatchObject({ status: 409, body: { error: { code: 'already' } } });
    expect((await monitor()).request).toMatchObject({ status: 'waiting' });
  });

  it('모델 서버에 닿지 못해도 답한다', async () => {
    const down = await studentApp(db.sql, { operators, models: async () => { throw new Error('닿지 못함'); } });
    await down.request('POST', '/api/login', { method: 'dev', email: 'ops@example.com', password: PASSWORD });
    expect((await down.request('GET', '/api/ops/monitor')).body).toMatchObject({ health: { db: true, model: { ok: false, names: [] } } });
    await down.close();
  });

  it('오류 글의 DB 주소와 백업 경로는 주지 않는다', async () => {
    const pw = 'postgres://kingo:s3cret@db:5432/kingo';
    const fail = { ok: false, skipped: false, seconds: 1, error: `Command failed: pg_dump -Fc -f /backup/x.tmp ${pw}` };
    await daily(1, { ingest: fail });
    await daily(0, { ingest: fail, backup: { ...ok, file: '/backup/kingo.dump' } });
    const text = JSON.stringify(await monitor());
    expect(text).toContain('pg_dump');
    for (const s of ['s3cret', 'kingo.dump']) expect([s, text.includes(s)]).toEqual([s, false]);
  });

  it('운영자만 부르고, 답의 어디에도 학생을 가리키는 값이 없다(SC-007)', async () => {
    const id = await createDevStudent(db.sql, 'secret-student@example.com');
    await db.sql`insert into consents (student_id, text_version) values (${id}, ${CONSENT.version})`;
    await db.sql`insert into prompts (student_id, body) values (${id}, '몰래쓴프롬프트')`;
    await notice(db.sql, { no: 1 });
    await db.sql`insert into actions (student_id, notice_id, kind) values (${id}, 'cse:1', 'like')`;
    await daily(0);
    await app.request('POST', '/api/ops/daily');
    const text = JSON.stringify(await monitor());
    for (const s of ['secret-student', '몰래쓴프롬프트', 'student', 'cse:1']) expect([s, text.includes(s)]).toEqual([s, false]);
    await app.request('POST', '/api/login', { method: 'dev', email: 'secret-student@example.com', password: PASSWORD });
    expect((await app.request('GET', '/api/ops/monitor')).status).toBe(403);
    expect((await app.request('POST', '/api/ops/daily')).status).toBe(403);
    await app.request('POST', '/api/logout');
    expect((await app.request('GET', '/api/ops/monitor')).status).toBe(401);
  });
});
