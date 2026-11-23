// 운영자 목록(research R17, FR-049): 시작할 때 한 번 읽는다. 파일이 없으면 운영자가 없어 모든 ops 경로가 forbidden이다
import { existsSync, readFileSync } from 'node:fs';
import type { Ctx } from '../app.ts';
import { requireStudent } from '../auth/login.ts';
import { HttpError, type Req } from '../http.ts';

/** '로그인 수단:subject' → 역할(operator·dept, 2단계에서는 권한이 같다) */
export type Operators = Map<string, string>;
const key = (kind: string, subject: string) => `${kind}:${subject.trim().toLowerCase()}`;

export function readOperators(file: string | null): Operators {
  if (!file || !existsSync(file)) return new Map();
  const o = JSON.parse(readFileSync(file, 'utf8')) as { operators?: unknown };
  const list = Array.isArray(o.operators) ? o.operators as Record<string, unknown>[] : null;
  if (!list || !list.every(x => typeof x.kind === 'string' && typeof x.subject === 'string' && (x.role === 'operator' || x.role === 'dept'))) {
    throw new Error(`운영자 목록 꼴이 아니에요({ operators: [{ kind, subject, role }] }): ${file}`);
  }
  return new Map(list.map(x => [key(String(x.kind), String(x.subject)), String(x.role)]));
}

/** 로그인한 운영자. 고친 기록에 적을 subject 글을 준다(학생 번호가 아니다) */
export async function requireOperator(ctx: Ctx, req: Req): Promise<{ by: string; headers: Record<string, string> }> {
  const s = await requireStudent(ctx, req);
  const methods = await ctx.sql<{ kind: string; subject: string }[]>`select kind, subject from login_methods where student_id = ${s.id}`;
  const m = methods.find(x => ctx.operators?.has(key(x.kind, x.subject)));
  if (!m) throw new HttpError(403, 'forbidden', '운영자 계정이 아니에요');
  return { by: m.subject, headers: s.headers };
}
