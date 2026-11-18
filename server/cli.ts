// 운영 명령(contracts/cli.md). 끝 코드: 0 성공, 1 거절·실패, 2 쓰는 법이 틀림. --json이면 같은 내용을 JSON으로
import { loadConfig } from './config.ts';
import { migrate } from './db/migrate.ts';
import { connect, type Sql } from './db/sql.ts';

const USAGE = '쓰는 법: node server/cli.ts migrate [--json]';

/** 시험은 sql을 넣는다. 없으면 설정의 DB에 붙고 끝나면 닫는다 */
export async function main(args: string[], deps: { sql?: Sql; env?: Record<string, string | undefined> } = {}): Promise<number> {
  const json = args.includes('--json');
  const [cmd, ...rest] = args.filter(a => a !== '--json');
  if (cmd !== 'migrate' || rest.length) {
    console.error(USAGE);
    return 2;
  }
  let sql = deps.sql;
  try {
    sql ??= connect(loadConfig(deps.env).databaseUrl);
    const done = await migrate(sql);
    console.log(json ? JSON.stringify({ applied: done }) : done.length ? `스키마 바꾸기 ${done.length}개를 적용했어요: ${done.join(', ')}` : '적용할 스키마 바꾸기가 없어요');
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  } finally {
    if (!deps.sql) await sql?.end({ timeout: 5 });
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
