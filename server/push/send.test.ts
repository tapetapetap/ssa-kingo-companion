import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../test/db.ts';
import { day, notice } from '../test/notice.ts';
import { CONSENT, createDevStudent } from '../test/student.ts';
import { notify, notifyLine, pushKeysOf, type NotifyDeps, type SendFn } from './send.ts';

let db: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.sql`truncate students, notices, push_sent cascade`; });

const at = (hhmm: string, d = 0) => new Date(`${day(d)}T${hhmm}:00+09:00`);
type Sent = { endpoint: string; payload: { title: string; body: string; url: string; tag: string }; ttl: number };
function server(fail: (n: number, endpoint: string) => number | null = () => null) {
  const sent: Sent[] = [];
  let n = 0;
  const send: SendFn = async (s, payload, ttl) => {
    const code = fail(++n, s.endpoint);
    if (code) throw Object.assign(new Error('x'), { statusCode: code });
    sent.push({ endpoint: s.endpoint, payload: JSON.parse(payload), ttl });
  };
  return { sent, send, tried: () => n };
}
const run = (o: Partial<NotifyDeps>) => notify({ sql: db.sql, consentVersion: CONSENT.version, keys: { publicKey: 'p', privateKey: 'k', subject: 'https://x' }, now: () => at('09:00'), wait: async () => {}, ...o });
let seq = 0;
async function device(student: number, host = 'fcm.googleapis.com') {
  const token = Buffer.alloc(32, ++seq);
  await db.sql`insert into sessions (token_hash, student_id) values (${token}, ${student})`;
  const endpoint = `https://${host}/fcm/send/${seq}`;
  await db.sql`insert into push_subscriptions (student_id, token_hash, endpoint, p256dh, auth) values (${student}, ${token}, ${endpoint}, 'p', 'a')`;
  return endpoint;
}
async function student(email = 'a@example.com', agreed = true) {
  const id = await createDevStudent(db.sql, email);
  if (agreed) await db.sql`insert into consents (student_id, text_version) values (${id}, ${CONSENT.version})`;
  return id;
}
const like = (s: number, no: number) => db.sql`insert into actions (student_id, notice_id, kind) values (${s}, ${`cse:${no}`}, 'like')`;
const rows = async () => (await db.sql`select status, attempts from push_sent order by notice_id`).map(r => `${r.status}${r.attempts}`);

describe('알림 보내기 (R7)', () => {
  it('기기마다 한 통으로 묶고, 두 번 돌리면 두 번째는 0이다(FR-034)', async () => {
    const s = await student();
    for (const no of [1, 2]) {
      await notice(db.sql, { no, deadline: no === 1 ? 0 : 3 });
      await like(s, no);
    }
    const ends = [await device(s), await device(s, 'web.push.apple.com')];
    const srv = server();
    expect(await run({ send: srv.send })).toEqual({ sent: 2, failed: 0, gone: 0, skipped: 0 });
    expect(srv.sent.map(x => x.endpoint)).toEqual(ends);
    expect(srv.sent[0].payload).toEqual({ title: '오늘 마감 1개, 3일 뒤 마감 1개', body: '공지 1\n공지 2', url: '/list', tag: `kingo-${day(0)}` });
    expect(srv.sent[0].ttl).toBe(15 * 3600); // 09:00부터 그날 24시까지
    expect(await run({ send: srv.send })).toEqual({ sent: 0, failed: 0, gone: 0, skipped: 2 });
    // 그 뒤 새 대상이 생겨도 하루 한 통이다
    await notice(db.sql, { no: 3, deadline: 0 });
    await like(s, 3);
    expect((await run({ send: srv.send })).sent).toBe(0);
    expect(srv.sent).toHaveLength(2);
    // 다음 날은 다시
    expect(await run({ send: srv.send, now: () => at('09:00', 3) })).toMatchObject({ sent: 2 });
  });

  it('보낼 것이 없으면 조용하다. 동의 판이 옛것이거나 로그인이 30일 지난 기기에는 보내지 않는다', async () => {
    await notice(db.sql, { no: 1, deadline: 0 });
    const quiet = await student('q@example.com');
    await device(quiet);
    const old = await student('o@example.com', false);
    await db.sql`insert into consents (student_id, text_version) values (${old}, 'dev-0')`;
    await like(old, 1);
    await device(old);
    const expired = await student('e@example.com');
    await like(expired, 1);
    await device(expired);
    await db.sql`update sessions set last_used_at = now() - interval '31 days' where student_id = ${expired}`;
    const srv = server();
    expect(await run({ send: srv.send })).toEqual({ sent: 0, failed: 0, gone: 0, skipped: 0 });
    expect(await db.sql`select 1 from push_subscriptions where student_id = ${expired}`).toHaveLength(0);
  });

  it('410·404면 구독을 지우고, 다른 실패는 10분 뒤 한 번 더 보내고 그만둔다. 손으로 다시 돌려도 두 번까지다', async () => {
    const s = await student();
    await notice(db.sql, { no: 1, deadline: 0 });
    await like(s, 1);
    await device(s);
    const gone = server(() => 410);
    expect(await run({ send: gone.send })).toEqual({ sent: 0, failed: 0, gone: 1, skipped: 0 });
    expect(await db.sql`select 1 from push_subscriptions`).toHaveLength(0);

    await device(s);
    const waits: number[] = [];
    const flaky = server(n => (n === 1 ? 500 : null));
    expect(await run({ send: flaky.send, wait: async ms => { waits.push(ms); } })).toEqual({ sent: 1, failed: 0, gone: 0, skipped: 0 });
    expect(waits).toEqual([600_000]);

    await db.sql`truncate push_sent`;
    const down = server(() => 503);
    expect(await run({ send: down.send })).toEqual({ sent: 0, failed: 1, gone: 0, skipped: 0 });
    expect(down.tried()).toBe(2);
    expect(await rows()).toEqual(['failed2']);
    expect(await run({ send: down.send })).toEqual({ sent: 0, failed: 0, gone: 0, skipped: 1 });
    expect(down.tried()).toBe(2);
  });

  it('첫 바퀴 뒤 프로세스가 끝났으면 다시 돌릴 때 남은 한 번을 바로 쓴다', async () => {
    const s = await student();
    await notice(db.sql, { no: 1, deadline: 0 });
    await like(s, 1);
    await device(s);
    await expect(run({ send: server(() => 500).send, wait: async () => { throw new Error('꺼짐'); } })).rejects.toThrow('꺼짐');
    expect(await rows()).toEqual(['failed1']);
    const ok = server();
    expect(await run({ send: ok.send, wait: async () => { throw new Error('기다리지 않는다'); } })).toMatchObject({ sent: 1 });
    expect(await rows()).toEqual(['sent2']);
  });

  it('보내다 죽어 sending으로 남은 것은 다시 보내지 않는다. 두 개가 함께 돌지 않는다', async () => {
    const s = await student();
    await notice(db.sql, { no: 1, deadline: 0 });
    await like(s, 1);
    await device(s);
    let release = () => {};
    const slow = run({ send: () => new Promise<void>(r => { release = r; }) });
    while (!(await rows()).length) await new Promise(r => setTimeout(r, 5));
    await expect(run({ send: server().send })).rejects.toThrow('다른 알림 보내기가 돌고 있어요');
    release();
    await slow;
    await db.sql`update push_sent set status = 'sending'`;
    expect(await run({ send: server().send })).toMatchObject({ sent: 0, skipped: 1 });
  });

  it('09:00 전과 21:00부터는 보내지 않는다. 다시 보내기도 21:00을 본다', async () => {
    const s = await student();
    await notice(db.sql, { no: 1, deadline: 0 });
    await like(s, 1);
    await device(s);
    const srv = server();
    for (const t of ['08:59', '21:00', '00:30']) expect((await run({ send: srv.send, now: () => at(t) })).sent).toBe(0);
    expect(srv.tried()).toBe(0);
    let t = at('20:55');
    const down = server(() => 500);
    expect(await run({ send: down.send, now: () => t, wait: async () => { t = at('21:05'); } })).toEqual({ sent: 0, failed: 1, gone: 0, skipped: 0 });
    expect(down.tried()).toBe(1);
    expect((await run({ send: srv.send, now: () => at('20:59') })).sent).toBe(1);
    expect(srv.sent[0].ttl).toBe(3 * 3600 + 60);
  });

  it('보내기 직전에 다시 본다: 앞 기기에 보내는 사이 취소하면 뒤 기기에는 없다', async () => {
    const s = await student();
    await notice(db.sql, { no: 1, deadline: 0 });
    await like(s, 1);
    await device(s);
    await device(s);
    let n = 0;
    expect(await run({ send: async () => { n++; await db.sql`delete from actions`; } })).toMatchObject({ sent: 1 });
    expect(n).toBe(1);
  });

  it('저장된 주소가 정한 푸시 서버가 아니면 부르지 않는다. 30일 지난 기록은 지운다', async () => {
    const s = await student();
    await notice(db.sql, { no: 1, deadline: 0 });
    await like(s, 1);
    await device(s, 'ollama');
    await db.sql`insert into push_sent (student_id, endpoint_hash, notice_id, kind, day, status) values (${s}, 'x', 'cse:9', 'due0', ${day(-31)}, 'sent'), (${s}, 'x', 'cse:9', 'due0', ${day(-30)}, 'sent')`;
    const srv = server();
    expect(await run({ send: srv.send })).toMatchObject({ sent: 0, failed: 1 });
    expect(srv.tried()).toBe(0);
    expect((await db.sql`select day::text from push_sent where notice_id = 'cse:9'`).map(r => r.day)).toEqual([day(-30)]);
  });

  it('키가 없으면 던지고, 요약에는 숫자뿐이다', async () => {
    await expect(run({ keys: null })).rejects.toThrow('알림 키가 없어요');
    expect(notifyLine({ sent: 3, failed: 0, gone: 1, skipped: 2 })).toBe('알림 보냄 3 · 실패 0 · 사라짐 1 · 건너뜀 2');
    const env = { KINGO_PUSH_PUBLIC_KEY: 'a', KINGO_PUSH_PRIVATE_KEY: 'b', KINGO_PUBLIC_URL: 'https://x' };
    expect(pushKeysOf(env)).toEqual({ publicKey: 'a', privateKey: 'b', subject: 'https://x' });
    for (const k of Object.keys(env)) expect(pushKeysOf({ ...env, [k]: '' })).toBeNull();
    expect(pushKeysOf({ ...env, KINGO_PUBLIC_URL: 'http://localhost' })).toBeNull();
  });
});
