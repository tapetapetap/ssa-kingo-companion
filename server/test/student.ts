// 시험용 학생과 서버: 개발 계정을 만들고, 그 학생으로 로그인한 요청 도우미를 준다
import { validList } from '../../etl/taxonomy/fixtures.ts';
import { defaultMethods, routes, type Ctx } from '../app.ts';
import { testLogin } from '../auth/login.ts';
import { hashPassword } from '../auth/password.ts';
import type { Sql } from '../db/sql.ts';
import { testApp } from './app.ts';

export const PASSWORD = 'correct horse';
export const CONSENT = { version: 'dev-1', text: '시험 문구' };

export async function createDevStudent(sql: Sql, email: string, password = PASSWORD): Promise<number> {
  const [s] = await sql<{ id: string }[]>`insert into students default values returning id`;
  await sql`insert into login_methods (student_id, kind, subject, password_hash) values (${s.id}, 'dev', ${email}, ${await hashPassword(password)})`;
  return Number(s.id);
}

/** 활성 목록 하나(시험용 custom, 분야 80개)를 넣는다 */
export async function seedTaxonomy(sql: Sql) {
  const t = validList('custom');
  await sql`insert into taxonomies (id, name, edition, active) values (${t.id}, ${t.name}, ${t.edition}, true)`;
  for (const [i, g] of t.groups.entries()) await sql`insert into field_groups (taxonomy_id, id, name, parent_id, ord) values (${t.id}, ${g.id}, ${g.name}, ${g.parent}, ${i})`;
  for (const [i, f] of t.fields.entries()) await sql`insert into fields (taxonomy_id, id, name, group_id, description, ord) values (${t.id}, ${f.id}, ${f.name}, ${f.group}, ${f.desc}, ${i})`;
  return t;
}

export async function studentApp(sql: Sql, o: Partial<Ctx> = {}) {
  const ctx: Ctx = { sql, mode: 'dev', consent: CONSENT, methods: { ...defaultMethods(), test: testLogin }, ...o };
  return { ctx, ...(await testApp(routes(ctx))) };
}
