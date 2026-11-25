// 로그인(US2, research R5·R6): 로그인 방식은 { kind, verify }로 바꿔 끼운다. 2단계에 동작하는 방식은 개발 로그인(dev)이고 시험 안에만 test가 있다.
// 학생 자료는 students.id에 붙고 login_methods가 그 학생을 가리킨다(FR-009)
import { createHash } from 'node:crypto';
import type { Sql } from '../db/sql.ts';
import { HttpError, kstIso, type Req, type Res, type Route } from '../http.ts';
import { LIMITS } from '../limits.ts';
import type { Ctx } from '../app.ts';
import { verifyPassword } from './password.ts';
import { COOKIE, createSession, deleteSession, findSession, sessionCookie } from './sessions.ts';

export type LoginMethod = { kind: 'dev' | 'sso' | 'test'; verify: (sql: Sql, body: Record<string, unknown>) => Promise<number> };
const BAD_LOGIN = () => new HttpError(401, 'bad_login', '이메일이나 비밀번호가 맞지 않아요');
// 없는 계정도 비밀번호를 한 번 견줘, 걸린 시간으로 계정이 있는지 알 수 없게 한다
const DUMMY = 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

/** 개발 로그인: 소문자 이메일과 비밀번호. 5번 잇달아 틀리면 15분 잠그고, 잠금이 끝난 뒤 첫 시도에서 0부터 센다(FR-011) */
export const devLogin: LoginMethod = {
  kind: 'dev',
  async verify(sql, body) {
    const [email, password] = [body.email, body.password];
    if (typeof email !== 'string' || typeof password !== 'string') throw new HttpError(422, 'invalid', '이메일과 비밀번호를 보내 주세요', { field: 'email' });
    const [m] = await sql<{ id: string; student_id: string; password_hash: string | null; failed_count: number; locked: boolean; expired: boolean; locked_until: Date | null }[]>`
      select id, student_id, password_hash, failed_count, locked_until, coalesce(locked_until > now(), false) as locked, coalesce(locked_until <= now(), false) as expired
      from login_methods where kind = 'dev' and subject = ${email.trim().toLowerCase()}`;
    if (!m || !m.password_hash) {
      await verifyPassword(password, DUMMY);
      throw BAD_LOGIN();
    }
    if (m.locked) throw new HttpError(403, 'locked', '여러 번 틀려 잠시 잠겼어요', { until: m.locked_until ? kstIso(m.locked_until) : null });
    const failed = m.expired ? 0 : m.failed_count;
    if (await verifyPassword(password, m.password_hash)) {
      await sql`update login_methods set failed_count = 0, locked_until = null where id = ${m.id}`;
      return Number(m.student_id);
    }
    const lock = failed + 1 >= LIMITS.loginFailMax;
    await sql`update login_methods set failed_count = ${failed + 1}, locked_until = ${lock ? sql`now() + make_interval(mins => ${LIMITS.lockMinutes})` : null} where id = ${m.id}`;
    throw BAD_LOGIN();
  }
};

/** 시험에서만 쓰는 두 번째 방식: 로그인 수단의 subject만으로 들어온다(spec US2-8) */
export const testLogin: LoginMethod = {
  kind: 'test',
  async verify(sql, body) {
    const [m] = await sql<{ student_id: string }[]>`select student_id from login_methods where kind = 'test' and subject = ${String(body.subject)}`;
    if (!m) throw BAD_LOGIN();
    return Number(m.student_id);
  }
};

/** 로그인한 학생. 없으면 401. 쓴 때를 고쳐 적었으면 쿠키를 다시 실을 머리를 함께 준다 */
export async function requireStudent(ctx: Ctx, req: Req): Promise<{ id: number; headers: Record<string, string> }> {
  const s = await findSession(ctx.sql, req.cookies[COOKIE]);
  if (!s) throw new HttpError(401, 'login_required', '다시 로그인해 주세요');
  req.student = s.studentId;
  return { id: s.studentId, headers: s.touched ? { 'set-cookie': sessionCookie(req.cookies[COOKIE], ctx.mode === 'prod') } : {} };
}

/** 앱이 '쓰던 글'을 다른 학생에게 보이지 않으려고 견주는 표시(3단계 R16). 화면에 보이지 않는다 */
const studentTag = (id: number) => createHash('sha256').update(String(id)).digest('hex').slice(0, 8);

export function authRoutes(ctx: Ctx, next: (id: number) => Promise<string>): Route[] {
  const secure = ctx.mode === 'prod';
  return [
    ['GET', '/api/login/methods', () => ({ body: { methods: Object.keys(ctx.methods).filter(m => !(secure && m === 'dev')) } })],
    ['POST', '/api/login', async (req): Promise<Res> => {
      const body = req.body as Record<string, unknown>;
      const method = ctx.methods[String(body.method)];
      if (ctx.mode === 'prod' && body.method === 'dev') throw new HttpError(403, 'login_off', '운영에서는 이 방식으로 들어올 수 없어요');
      if (!method) throw new HttpError(422, 'invalid', '모르는 로그인 방식이에요', { field: 'method' });
      if (secure && req.headers['x-forwarded-proto'] !== 'https') throw new HttpError(403, 'https_required', '안전한 연결(HTTPS)로만 로그인할 수 있어요');
      const id = await method.verify(ctx.sql, body);
      req.student = id;
      await ctx.sql`update students set last_seen_at = now() where id = ${id}`;
      // 한 기기를 두 학생이 쓸 때 앞 학생의 로그인(과 그에 붙은 알림 구독)을 끝낸다(3단계 R6)
      if (req.cookies[COOKIE]) await deleteSession(ctx.sql, req.cookies[COOKIE]);
      const token = await createSession(ctx.sql, id);
      return { body: { next: await next(id) }, headers: { 'set-cookie': sessionCookie(token, secure) } };
    }],
    ['POST', '/api/logout', async req => {
      const token = req.cookies[COOKIE];
      if (token) await deleteSession(ctx.sql, token);
      return { status: 204, headers: { 'set-cookie': sessionCookie(null, secure) } };
    }],
    ['GET', '/api/me', async req => {
      const s = await requireStudent(ctx, req);
      const [st] = await ctx.sql<{ dept: string; analysis_off: boolean }[]>`select dept, analysis_off from students where id = ${s.id}`;
      return { body: { dept: st.dept, next: await next(s.id), analysisOff: st.analysis_off, tag: studentTag(s.id) }, headers: s.headers };
    }],
    ['DELETE', '/api/me', async req => {
      const s = await requireStudent(ctx, req);
      if ((req.body as Record<string, unknown>).confirm !== true) throw new HttpError(422, 'invalid', '지우려면 확인이 필요해요', { field: 'confirm' });
      await ctx.sql`delete from students where id = ${s.id}`; // 학생 자료와 로그인 수단·세션이 함께 지워진다(FR-020)
      return { status: 204, headers: { 'set-cookie': sessionCookie(null, secure) } };
    }]
  ];
}
