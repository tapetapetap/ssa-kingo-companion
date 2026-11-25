import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../test/db.ts';
import { CONSENT, createDevStudent, PASSWORD, studentApp } from '../test/student.ts';

let db: Awaited<ReturnType<typeof testDb>>;
let app: Awaited<ReturnType<typeof studentApp>>;
const push = { publicKey: 'BPub', publicUrl: 'https://kingo.example.ac.kr' };
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.sql`truncate students cascade`;
  app = await studentApp(db.sql, { push });
});
afterEach(async () => { await app.close(); });

const KEYS = { p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url'), auth: Buffer.alloc(16, 2).toString('base64url') };
const sub = (n: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: KEYS });
const join = async (email: string, a = app) => {
  const id = await createDevStudent(db.sql, email);
  await db.sql`insert into consents (student_id, text_version) values (${id}, ${CONSENT.version})`;
  await a.request('POST', '/api/login', { method: 'dev', email, password: PASSWORD });
  return id;
};
const again = (email: string, a = app) => a.request('POST', '/api/login', { method: 'dev', email, password: PASSWORD });
const subs = async () => (await db.sql`select student_id::int as s, endpoint from push_subscriptions order by id`).map(r => [r.s, r.endpoint.split('/').at(-1)]);
const on = async (a = app) => ((await a.request('GET', '/api/me')).body as { push: unknown }).push;

describe('기기 구독 (R6, contracts/api.md)', () => {
  it('키를 받고 켜고 끈다. /api/me가 준비와 켜짐을 알린다', async () => {
    const id = await join('a@example.com');
    expect((await app.request('GET', '/api/me/push/key')).body).toEqual({ key: 'BPub' });
    expect(await on()).toEqual({ ready: true, on: false });
    expect((await app.request('PUT', '/api/me/push', sub('1'))).status).toBe(204);
    expect((await app.request('PUT', '/api/me/push', sub('2'))).status).toBe(204); // 세션마다 하나
    expect(await subs()).toEqual([[id, '2']]);
    expect(await on()).toEqual({ ready: true, on: true });
    expect((await app.request('DELETE', '/api/me/push')).status).toBe(204);
    expect(await on()).toEqual({ ready: true, on: false });
  });

  it('로그아웃·계정 지우기·다른 학생의 로그인으로 사라진다', async () => {
    await join('a@example.com');
    await app.request('PUT', '/api/me/push', sub('1'));
    await app.request('POST', '/api/logout');
    expect(await subs()).toEqual([]);
    await again('a@example.com');
    await app.request('PUT', '/api/me/push', sub('1'));
    await join('b@example.com'); // 로그아웃하지 않고 같은 기기에서 다른 학생이 들어옴
    expect(await subs()).toEqual([]);
    await app.request('PUT', '/api/me/push', sub('1'));
    await app.request('DELETE', '/api/me', { confirm: true });
    expect(await subs()).toEqual([]);
  });

  it('같은 주소를 다른 학생이 켜면 마지막에 켠 학생의 것이다. 남의 구독은 끄지 못한다', async () => {
    await join('a@example.com');
    await app.request('PUT', '/api/me/push', sub('1'));
    const other = await studentApp(db.sql, { push });
    const b = await join('b@example.com', other);
    await other.request('DELETE', '/api/me/push');
    expect(await subs()).toHaveLength(1);
    await other.request('PUT', '/api/me/push', sub('1'));
    expect(await subs()).toEqual([[b, '1']]);
    await app.request('DELETE', '/api/me/push');
    expect(await subs()).toEqual([[b, '1']]);
    await other.close();
  });

  it('한 학생은 10대까지, 넘으면 가장 오래된 것을 지운다', async () => {
    const id = await join('a@example.com');
    for (let i = 1; i <= 11; i++) {
      app.jar.clear();
      await again('a@example.com');
      await app.request('PUT', '/api/me/push', sub(String(i)));
    }
    expect(await subs()).toEqual(Array.from({ length: 10 }, (_, i) => [id, String(i + 2)]));
  });

  it('거절: 로그인 없음, 동의 전, 푸시 서버가 아닌 주소, 틀린 키', async () => {
    expect((await app.request('GET', '/api/me/push/key')).status).toBe(401);
    expect((await app.request('PUT', '/api/me/push', sub('1'))).status).toBe(401);
    await createDevStudent(db.sql, 'new@example.com');
    await again('new@example.com');
    expect((await app.request('PUT', '/api/me/push', sub('1'))).body).toMatchObject({ error: { code: 'consent_required' } });
    await join('a@example.com');
    expect((await app.request('PUT', '/api/me/push', { ...sub('1'), endpoint: 'http://ollama:11434/api/tags' })).body).toMatchObject({ error: { code: 'invalid', field: 'endpoint' } });
    expect((await app.request('PUT', '/api/me/push', { endpoint: sub('1').endpoint })).body).toMatchObject({ error: { code: 'invalid', field: 'keys' } });
    expect(await subs()).toEqual([]);
  });

  it('준비 전(공개 키나 서비스 주소 없음)이면 404이고 /api/me가 준비 전이라고 한다', async () => {
    for (const p of [undefined, { publicKey: null, publicUrl: push.publicUrl }, { publicKey: 'BPub', publicUrl: null }]) {
      await db.sql`truncate students cascade`;
      const none = await studentApp(db.sql, { push: p });
      await join('a@example.com', none);
      expect(await on(none)).toEqual({ ready: false, on: false });
      expect((await none.request('GET', '/api/me/push/key')).body).toMatchObject({ error: { code: 'not_found', message: '알림은 아직 준비 중이에요' } });
      expect((await none.request('PUT', '/api/me/push', sub('1'))).status).toBe(404);
      await none.close();
    }
  });
});
