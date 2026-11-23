// 백업과 되살리기(research R15): pg_dump -Fc로 한국 날짜 파일 하나, 같은 날은 덮어쓰고 7일 앞선 파일은 지운다. 되살리기는 빈 DB에만
import { execFile } from 'node:child_process';
import { readdirSync, unlinkSync } from 'node:fs';
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
  await run('pg_dump', ['-Fc', '-f', file, databaseUrl]);
  const cut = kstDay(new Date(now.getTime() - 7 * 86400_000));
  for (const f of readdirSync(dir)) {
    const m = NAME.exec(f);
    if (m && m[1] <= cut) unlinkSync(join(dir, f));
  }
  return file;
}

/** 빈 DB(students와 notices 표가 없거나 둘 다 0행)에만 되살린다. 아니면 던진다 */
export async function restore(sql: Sql, file: string, databaseUrl: string, run = exec) {
  let n = 0;
  for (const t of ['students', 'notices']) {
    const [e] = await sql<{ ok: boolean }[]>`select to_regclass(${t}) is not null as ok`;
    if (e.ok) n += Number((await sql.unsafe(`select count(*)::int as n from ${t}`))[0].n);
  }
  if (n > 0) throw new Error('되살리지 않았어요: DB가 비어 있지 않아요');
  await run('pg_restore', ['--clean', '--if-exists', '--no-owner', '-d', databaseUrl, file]);
}
