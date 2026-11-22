// 개발 계정 명령(FR-011·FR-012): 운영자가 서버 컴퓨터에서만 만들고, 비밀번호를 정하고, 지운다. 스스로 가입은 없다
import type { Mode } from '../config.ts';
import type { Sql } from '../db/sql.ts';
import { hashPassword } from './password.ts';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const norm = (email: string) => email.trim().toLowerCase();

export async function accountCommand(sql: Sql, mode: Mode, action: string, email: string, o: { password?: string; dept?: string }): Promise<string> {
  if (!EMAIL.test(email.trim())) throw new Error(`이메일 꼴이 아니에요: ${email}`);
  const subject = norm(email);
  if (action !== 'delete' && mode === 'prod') throw new Error('운영 모드에서는 개발 계정을 만들거나 비밀번호를 정하지 않아요');
  if (action === 'create') {
    const hash = await hashPassword(o.password ?? '');
    return sql.begin(async tx => {
      const [dup] = await tx`select 1 from login_methods where kind = 'dev' and subject = ${subject}`;
      if (dup) throw new Error(`이미 있는 계정이에요: ${subject}`);
      const [s] = await tx<{ id: string }[]>`insert into students (dept) values (${o.dept ?? '소프트웨어학과'}) returning id`;
      await tx`insert into login_methods (student_id, kind, subject, password_hash) values (${s.id}, 'dev', ${subject}, ${hash})`;
      return `개발 계정을 만들었어요: ${subject}`;
    });
  }
  if (action === 'password') {
    const hash = await hashPassword(o.password ?? '');
    const r = await sql`update login_methods set password_hash = ${hash}, failed_count = 0, locked_until = null where kind = 'dev' and subject = ${subject}`;
    if (!r.count) throw new Error(`없는 계정이에요: ${subject}`);
    // 비밀번호를 바꾸면 그 학생의 다른 기기 로그인도 끝낸다
    await sql`delete from sessions where student_id in (select student_id from login_methods where kind = 'dev' and subject = ${subject})`;
    return `비밀번호를 바꿨어요: ${subject}`;
  }
  const r = await sql`delete from students where id in (select student_id from login_methods where kind = 'dev' and subject = ${subject})`;
  if (!r.count) throw new Error(`없는 계정이에요: ${subject}`);
  return `계정과 그 학생 자료를 지웠어요: ${subject}`;
}
