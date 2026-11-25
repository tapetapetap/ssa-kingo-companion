// 로그인 유지(research R5, FR-013): 32바이트 무작위 토큰을 쿠키로 주고 DB에는 SHA-256만 둔다.
// 마지막으로 쓴 때부터 30일이고, 쓴 때는 하루에 한 번만 고쳐 적는다
import { createHash, randomBytes } from 'node:crypto';
import type { Sql } from '../db/sql.ts';
import { LIMITS } from '../limits.ts';

export const COOKIE = 'kingo_session';
/** 쿠키 토큰의 DB 쪽 모습 */
export const digest = (token: string) => createHash('sha256').update(token).digest();

export async function createSession(sql: Sql, studentId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await sql`insert into sessions (token_hash, student_id) values (${digest(token)}, ${studentId})`;
  return token;
}

/** 살아 있는 로그인의 학생 번호. touched는 쓴 때를 고쳐 적었는가(그 답에 쿠키를 다시 실어 30일을 늘린다) */
export async function findSession(sql: Sql, token: string | undefined): Promise<{ studentId: number; touched: boolean } | null> {
  if (!token) return null;
  const [row] = await sql<{ student_id: string; stale: boolean }[]>`
    select student_id, last_used_at < now() - interval '1 day' as stale from sessions
    where token_hash = ${digest(token)} and last_used_at > now() - make_interval(days => ${LIMITS.sessionDays})`;
  if (!row) return null;
  if (row.stale) await sql`update sessions set last_used_at = now() where token_hash = ${digest(token)}`;
  return { studentId: Number(row.student_id), touched: row.stale };
}

export async function deleteSession(sql: Sql, token: string) {
  await sql`delete from sessions where token_hash = ${digest(token)}`;
}

export function sessionCookie(token: string | null, secure: boolean): string {
  const base = `${COOKIE}=${token ?? ''}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${token ? LIMITS.sessionDays * 86400 : 0}`;
  return secure ? `${base}; Secure` : base;
}
