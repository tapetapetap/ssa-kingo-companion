// api 시작(plan '만드는 순서' 1): 설정 → DB 연결 → 적용 안 한 스키마 바꾸기가 있으면 이유를 내고 끝 → 서버 시작
import { loadConfig } from './config.ts';
import { pending } from './db/migrate.ts';
import { connect } from './db/sql.ts';
import { createServer, health, type Route } from './http.ts';

/** 경로는 단계마다 여기에 더한다 */
export const routes = (): Route[] => [health];

if (import.meta.main) {
  try {
    const c = loadConfig();
    const sql = connect(c.databaseUrl);
    const todo = await pending(sql);
    if (todo.length) throw new Error(`적용하지 않은 스키마 바꾸기가 있어요(${todo.join(', ')}). node server/cli.ts migrate를 먼저 돌려요`);
    createServer(routes()).listen(c.port, () => { console.log(JSON.stringify({ at: new Date().toISOString(), kind: 'start', mode: c.mode, port: c.port })); });
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}
