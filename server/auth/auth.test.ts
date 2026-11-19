import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { checkStartup, defaultMethods } from '../app.ts';
import { testDb } from '../test/db.ts';
import { CONSENT, createDevStudent, PASSWORD, studentApp } from '../test/student.ts';

let db: Awaited<ReturnType<typeof testDb>>;
let app: Awaited<ReturnType<typeof studentApp>>;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.sql`truncate students cascade`;
  app = await studentApp(db.sql);
});
afterEach(async () => { await app.close(); });
const login = (email: string, password = PASSWORD) => app.request('POST', '/api/login', { method: 'dev', email, password });

describe('로그인과 계정 (US2, contracts/api.md)', () => {
  it('맞는 이메일·비밀번호로 들어오면 쿠키를 주고 다음 할 일은 동의다. 쿠키 속성을 지킨다', async () => {
    await createDevStudent(db.sql, 'dev1@example.com');
    const r = await login('DEV1@example.com ');
    expect(r).toMatchObject({ status: 200, body: { next: 'consent' } });
    expect(r.headers.get('set-cookie')).toMatch(/^kingo_session=[A-Za-z0-9_-]{43}; HttpOnly; SameSite=Lax; Path=\/; Max-Age=2592000$/);
    expect(await app.request('GET', '/api/me')).toMatchObject({ status: 200, body: { dept: '소프트웨어학과', next: 'consent', analysisOff: false } });
    expect((await db.sql`select token_hash from sessions`)[0].token_hash).toHaveLength(32); // 토큰은 해시만 남는다
  });

  it('틀리면 어느 쪽이 틀렸는지 말하지 않고, 5번 잇달아 틀리면 맞게 해도 15분 잠긴다. 잠금이 끝나면 0부터 센다', async () => {
    await createDevStudent(db.sql, 'dev1@example.com');
    expect((await login('nobody@example.com')).body).toMatchObject({ error: { code: 'bad_login' } });
    for (let i = 0; i < 5; i++) expect((await login('dev1@example.com', 'wrong pass')).body).toMatchObject({ error: { code: 'bad_login' } });
    const locked = await login('dev1@example.com');
    expect(locked).toMatchObject({ status: 403, body: { error: { code: 'locked' } } });
    expect(typeof (locked.body as { error: { until: string } }).error.until).toBe('string');
    await db.sql`update login_methods set locked_until = now() - interval '1 second'`;
    expect((await login('dev1@example.com', 'wrong pass')).status).toBe(401);
    expect((await db.sql`select failed_count from login_methods`)[0].failed_count).toBe(1);
    expect((await login('dev1@example.com')).status).toBe(200);
  });

  it('로그인 없거나 30일 지난 로그인은 login_required, 쓸 때마다 늘어나고, 로그아웃하면 그 쿠키는 바로 끝난다', async () => {
    expect((await app.request('GET', '/api/me')).body).toMatchObject({ error: { code: 'login_required' } });
    await createDevStudent(db.sql, 'dev1@example.com');
    await login('dev1@example.com');
    await db.sql`update sessions set last_used_at = now() - interval '2 days'`;
    const touched = await app.request('GET', '/api/me');
    expect(touched.headers.get('set-cookie')).toContain('Max-Age=2592000');
    expect((await db.sql`select last_used_at > now() - interval '1 minute' as fresh from sessions`)[0].fresh).toBe(true);
    await db.sql`update sessions set last_used_at = now() - interval '31 days'`;
    expect((await app.request('GET', '/api/me')).status).toBe(401);
    await login('dev1@example.com');
    const cookie = [...app.jar].map(([k, v]) => `${k}=${v}`).join('');
    expect((await app.request('POST', '/api/logout')).status).toBe(204);
    expect((await app.request('GET', '/api/me', undefined, { cookie })).status).toBe(401);
  });

  it('두 학생은 서로의 자료를 보지 못한다. 다른 로그인 방식을 붙여도 같은 자료다', async () => {
    const a = await createDevStudent(db.sql, 'a@example.com');
    await createDevStudent(db.sql, 'b@example.com');
    await db.sql`update students set dept = '지능형소프트웨어학과' where id = ${a}`;
    await db.sql`insert into login_methods (student_id, kind, subject) values (${a}, 'test', 'sso-a')`;
    await login('b@example.com');
    expect((await app.request('GET', '/api/me')).body).toMatchObject({ dept: '소프트웨어학과' });
    expect((await app.request('POST', '/api/login', { method: 'test', subject: 'sso-a' })).status).toBe(200);
    expect((await app.request('GET', '/api/me')).body).toMatchObject({ dept: '지능형소프트웨어학과' });
  });

  it('계정을 지우면 자료와 로그인 수단이 모두 지워지고 그 계정으로 들어올 수 없다. 확인이 없으면 invalid', async () => {
    await createDevStudent(db.sql, 'dev1@example.com');
    await login('dev1@example.com');
    expect((await app.request('DELETE', '/api/me', {})).body).toMatchObject({ error: { code: 'invalid', field: 'confirm' } });
    expect((await app.request('DELETE', '/api/me', { confirm: true })).status).toBe(204);
    for (const t of ['students', 'login_methods', 'sessions']) expect(Number((await db.sql.unsafe(`select count(*) n from ${t}`))[0].n)).toBe(0);
    expect((await login('dev1@example.com')).body).toMatchObject({ error: { code: 'bad_login' } });
  });

  it('운영 모드: 개발 로그인은 login_off, HTTPS가 아닌 로그인은 https_required. 쓸 수 있는 방식이 없거나 개발용 문구면 시작하지 않는다', async () => {
    await createDevStudent(db.sql, 'dev1@example.com');
    await db.sql`insert into login_methods (student_id, kind, subject) select id, 'test', 'sso-1' from students`;
    const prod = await studentApp(db.sql, { mode: 'prod' });
    try {
      expect((await prod.request('POST', '/api/login', { method: 'dev', email: 'dev1@example.com', password: PASSWORD })).body).toMatchObject({ error: { code: 'login_off' } });
      expect((await prod.request('POST', '/api/login', { method: 'test', subject: 'sso-1' })).body).toMatchObject({ error: { code: 'https_required' } });
      const ok = await prod.request('POST', '/api/login', { method: 'test', subject: 'sso-1' }, { 'x-forwarded-proto': 'https' });
      expect(ok.status).toBe(200);
      expect(ok.headers.get('set-cookie')).toMatch(/; Secure$/);
    } finally {
      await prod.close();
    }
    expect(() => checkStartup({ ...prod.ctx, methods: defaultMethods() })).toThrow('쓸 수 있는 로그인 방식이 없어');
    expect(() => checkStartup(prod.ctx)).toThrow(`개발용 동의 문구(${CONSENT.version})`);
    expect(() => checkStartup({ ...prod.ctx, consent: { version: '2027-1', text: 'x' } })).not.toThrow();
  });
});
