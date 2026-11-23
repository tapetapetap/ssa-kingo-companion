// api 시작(plan '만드는 순서' 1): 설정 → 동의 문구 → 시작 검사 → DB 연결 → 적용 안 한 스키마 바꾸기가 있으면 이유를 내고 끝 → 서버 시작
import { checkStartup, defaultMethods, routes, type Ctx } from './app.ts';
import { loadConfig } from './config.ts';
import { pending } from './db/migrate.ts';
import { connect } from './db/sql.ts';
import { createServer } from './http.ts';
import { readConsent } from './me/onboarding.ts';
import { readOperators } from './ops/guard.ts';
import { startWorker } from './pick/repick.ts';

if (import.meta.main) {
  try {
    const c = loadConfig();
    const sql = connect(c.databaseUrl);
    const ctx: Ctx = { sql, mode: c.mode, consent: readConsent(c.consentFile), methods: c.mode === 'prod' ? {} : defaultMethods(), operators: readOperators(c.operatorsFile) };
    checkStartup(ctx);
    const todo = await pending(sql);
    if (todo.length) throw new Error(`적용하지 않은 스키마 바꾸기가 있어요(${todo.join(', ')}). node server/cli.ts migrate를 먼저 돌려요`);
    startWorker(sql); // 다시 고르기 일꾼(research R9)
    createServer(routes(ctx)).listen(c.port, () => { console.log(JSON.stringify({ at: new Date().toISOString(), kind: 'start', mode: c.mode, port: c.port })); });
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}
