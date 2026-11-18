// 스키마 바꾸기(research R4): migrations/NNN_이름.sql을 번호 순서로 한 번씩, 파일마다 한 트랜잭션에서 적용하고 이름을 남긴다
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sql } from './sql.ts';

export const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url));

const files = (dir: string) => readdirSync(dir).filter(f => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();

async function applied(sql: Sql): Promise<Set<string>> {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  return new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map(r => r.name));
}

/** 적용하지 않은 파일 이름(서버가 시작할 때 본다) */
export async function pending(sql: Sql, dir = MIGRATIONS_DIR): Promise<string[]> {
  const done = await applied(sql);
  return files(dir).filter(f => !done.has(f));
}

/** 적용한 파일 이름을 돌려준다 */
export async function migrate(sql: Sql, dir = MIGRATIONS_DIR): Promise<string[]> {
  const todo = await pending(sql, dir);
  for (const name of todo) {
    await sql.begin(async tx => {
      await tx.unsafe(readFileSync(join(dir, name), 'utf8'));
      await tx`insert into schema_migrations (name) values (${name})`;
    });
  }
  return todo;
}
