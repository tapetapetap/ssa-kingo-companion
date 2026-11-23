// 백업과 되살리기(research R15): pg_dump -Fc로 한국 날짜 파일 하나, 같은 날은 덮어쓰고 7일 앞선 파일은 지운다. 되살리기는 빈 DB에만
import { execFile } from 'node:child_process';
import { readdirSync, renameSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Sql } from '../db/sql.ts';

export type Run = (cmd: string, args: string[]) => Promise<unknown>;
const exec: Run = (cmd, args) => promisify(execFile)(cmd, args);
const NAME = /^kingo-(\d{4}-\d{2}-\d{2})\.dump$/;
export const kstDay = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

/** 쓴 파일 경로. 이름의 날짜가 오늘보다 7일 이상 앞선 백업을 지운다(오늘과 앞 6일이 남는다). 꼴이 다른 파일은 둔다 */
export async function backup(dir: string, databaseUrl: string, now = new Date(), run = exec): Promise<string> {
  const today = kstDay(now);
  const file = join(dir, `kingo-${today}.dump`);
  // 임시 파일에 쓰고 다 쓴 뒤에 바꾼다: 같은 날 두 번째 백업이 실패해도 앞의 좋은 백업이 남는다
  const tmp = `${file}.tmp`;
  try {
    await run('pg_dump', ['-Fc', '-f', tmp, databaseUrl]);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
  renameSync(tmp, file);
  const cut = kstDay(new Date(now.getTime() - 7 * 86400_000));
  for (const f of readdirSync(dir)) {
    const m = NAME.exec(f);
    if (m && m[1] <= cut) unlinkSync(join(dir, f));
  }
  return file;
}

/** 빈 DB(스키마 바꾸기 기록 말고 행이 있는 표가 없음)에만 되살린다. --clean이 모든 표를 갈아 끼우므로 운영자 계정·분야 목록·사람 판정도 본다 */
export async function restore(sql: Sql, file: string, databaseUrl: string, run = exec) {
  let n = 0;
  const tables = await sql<{ t: string }[]>`select quote_ident(table_name) as t from information_schema.tables
    where table_schema = current_schema() and table_type = 'BASE TABLE' and table_name <> 'schema_migrations'`;
  for (const { t } of tables) n += Number((await sql.unsafe(`select count(*)::int as n from ${t}`))[0].n);
  if (n > 0) throw new Error('되살리지 않았어요: DB가 비어 있지 않아요');
  await run('pg_restore', ['--clean', '--if-exists', '--no-owner', '-d', databaseUrl, file]);
}
