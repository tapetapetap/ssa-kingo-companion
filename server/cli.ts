// 운영 명령(contracts/cli.md). 끝 코드: 0 성공, 1 거절·실패, 2 쓰는 법이 틀림. --json이면 같은 내용을 JSON으로
import { readFileSync } from 'node:fs';
import { accountCommand } from './auth/accounts.ts';
import { loadConfig, type Mode } from './config.ts';
import { migrate } from './db/migrate.ts';
import { connect, type Sql } from './db/sql.ts';
import { openModel } from './model.ts';
import { ingest, summaryLine, type IngestDeps } from './ingest/ingest.ts';
import { runRequests } from './ops/requests.ts';
import { exportGold } from './ops/export.ts';
import { backup, restore } from './jobs/backup.ts';
import { dailyLine, runDaily, type DailyDeps } from './jobs/daily.ts';
import { generateVAPIDKeys, notify, notifyLine, pushKeysOf, type NotifyDeps } from './push/send.ts';
import { readConsent } from './me/onboarding.ts';
import { status, type StatusDeps } from './jobs/status.ts';

const USAGE = '쓰는 법: node server/cli.ts migrate | ingest <결과 파일> --taxonomy <id> [--switch] [--dry-run] | account create <이메일> [--dept <학과>] | account password <이메일> | account delete <이메일> | export-gold <폴더> | daily [--skip-classifier] | backup | restore <백업 파일> | status | notify | requests | push-keys (모두 --json)';

/** stdin은 비밀번호를 받는 곳이다(시험은 글로 넣는다). 명령 기록에 남지 않게 인자로 받지 않는다 */
type Deps = { sql?: Sql; env?: Record<string, string | undefined>; ingest?: Partial<IngestDeps>; stdin?: () => Promise<string>; repoRoot?: string; daily?: Partial<DailyDeps>; status?: Partial<StatusDeps>; notify?: Partial<NotifyDeps>; run?: (cmd: string, args: string[]) => Promise<unknown> };
const readStdin = async () => { let s = ''; for await (const c of process.stdin) s += String(c); return s; };

function accountArgs(rest: string[]): { action: string; email: string; dept?: string } | null {
  const [action, email, ...more] = rest;
  if (!['create', 'password', 'delete'].includes(action) || !email || email.startsWith('--')) return null;
  if (more.length === 0) return { action, email };
  return action === 'create' && more.length === 2 && more[0] === '--dept' && !more[1].startsWith('--') ? { action, email, dept: more[1] } : null;
}

/** ingest 인자: 파일 하나와 --taxonomy <id>, 깃발 둘. 틀리면 null */
function ingestArgs(rest: string[]): { path: string; taxonomy: string; switch: boolean; dryRun: boolean } | null {
  const flags = new Set(['--switch', '--dry-run']);
  const at = rest.indexOf('--taxonomy');
  const taxonomy = at >= 0 ? rest[at + 1] : undefined;
  const others = rest.filter((a, i) => i !== at && i !== at + 1 && !flags.has(a));
  if (!taxonomy || taxonomy.startsWith('--') || others.length !== 1 || others[0].startsWith('--')) return null;
  return { path: others[0], taxonomy, switch: rest.includes('--switch'), dryRun: rest.includes('--dry-run') };
}

/** 시험은 sql을 넣는다. 없으면 설정의 DB에 붙고 끝나면 닫는다 */
export async function main(args: string[], deps: Deps = {}): Promise<number> {
  const json = args.includes('--json');
  const [cmd, ...rest] = args.filter(a => a !== '--json');
  const ing = cmd === 'ingest' ? ingestArgs(rest) : null;
  const acc = cmd === 'account' ? accountArgs(rest) : null;
  const gold = cmd === 'export-gold' && rest.length === 1 && !rest[0].startsWith('--') ? rest[0] : null;
  const ops = (cmd === 'daily' && (rest.length === 0 || (rest.length === 1 && rest[0] === '--skip-classifier')))
    || ((cmd === 'backup' || cmd === 'status' || cmd === 'notify' || cmd === 'requests') && rest.length === 0) || (cmd === 'restore' && rest.length === 1 && !rest[0].startsWith('--'));
  if (!((cmd === 'migrate' || cmd === 'push-keys') && rest.length === 0) && !ing && !acc && !gold && !ops) {
    console.error(USAGE);
    return 2;
  }
  if (cmd === 'push-keys') {
    const k = generateVAPIDKeys(); // 출력만 한다(파일에도 DB에도 쓰지 않는다)
    console.log(json ? JSON.stringify(k) : `KINGO_PUSH_PUBLIC_KEY=${k.publicKey}\nKINGO_PUSH_PRIVATE_KEY=${k.privateKey}`);
    return 0;
  }
  let sql = deps.sql;
  try {
    const mode: Mode = deps.sql ? (deps.env?.KINGO_MODE === 'prod' ? 'prod' : 'dev') : loadConfig(deps.env).mode;
    sql ??= connect(loadConfig(deps.env).databaseUrl);
    if (ing) return await runIngest(sql, ing, mode, json, deps.ingest);
    if (ops) {
      const c = deps.sql ? { databaseUrl: '', backupDir: null, ollamaHost: '', apiUrl: '' } : loadConfig(deps.env);
      if (cmd === 'status') {
        const r = await status({ sql, ollamaHost: c.ollamaHost, apiUrl: c.apiUrl, ...deps.status });
        console.log(json ? JSON.stringify(r) : r.lines.join('\n'));
        return r.ok ? 0 : 1;
      }
      if (cmd === 'notify') {
        const r = await notify({ sql, consentVersion: deps.notify?.consentVersion ?? readConsent(loadConfig(deps.env).consentFile).version, keys: pushKeysOf(deps.env ?? process.env), ...deps.notify });
        console.log(json ? JSON.stringify(r) : notifyLine(r));
        return 0;
      }
      const daily = (): DailyDeps => ({ sql: sql!, mode, databaseUrl: c.databaseUrl, backupDir: c.backupDir, skipClassifier: rest.includes('--skip-classifier'), consentVersion: deps.sql ? undefined : readConsent(loadConfig(deps.env).consentFile).version, ...deps.daily });
      if (cmd === 'requests') {
        const line = await runRequests({ sql, daily: () => runDaily(daily()) });
        console.log(json ? JSON.stringify({ result: line }) : line);
        return 0;
      }
      if (cmd === 'daily') {
        const r = await runDaily(daily());
        console.log(json ? JSON.stringify(r) : dailyLine(r));
        return Object.values(r.steps).some(x => !x.ok && !x.skipped) ? 1 : 0;
      }
      if (cmd === 'backup') {
        if (!c.backupDir) throw new Error('KINGO_BACKUP_DIR가 없어요');
        const file = await backup(c.backupDir, c.databaseUrl, new Date(), deps.run);
        console.log(json ? JSON.stringify({ file }) : `백업했어요: ${file}`);
        return 0;
      }
      await restore(sql, rest[0], c.databaseUrl, deps.run);
      console.log(json ? JSON.stringify({ restored: rest[0] }) : `되살렸어요: ${rest[0]}`);
      return 0;
    }
    if (gold) {
      const r = await exportGold(sql, gold, deps.repoRoot);
      console.log(json ? JSON.stringify(r) : `정답셋 후보 ${r.rows}개를 썼어요: ${r.path}`);
      return 0;
    }
    if (acc) {
      const password = acc.action === 'delete' ? undefined : (await (deps.stdin ?? readStdin)()).replace(/\r?\n$/, '');
      const msg = await accountCommand(sql, mode, acc.action, acc.email, { password, dept: acc.dept });
      console.log(json ? JSON.stringify({ ok: true, message: msg }) : msg);
      return 0;
    }
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

async function runIngest(sql: Sql, a: NonNullable<ReturnType<typeof ingestArgs>>, mode: Mode, json: boolean, extra: Partial<IngestDeps> = {}): Promise<number> {
  let input: unknown;
  try {
    input = JSON.parse(readFileSync(a.path, 'utf8'));
  } catch {
    console.error(`넣지 않았어요: 결과 파일을 읽지 못했어요(${a.path})`);
    return 1;
  }
  // 넣기의 임베딩도 부하 제한 하나와 모델 잠금을 지난다(research R7, T054b)
  const model = extra.embed ? null : openModel(sql, 'ingest');
  try {
    const embed = extra.embed ?? model!.embed;
    const r = await ingest(input, a.taxonomy, { switch: a.switch, dryRun: a.dryRun }, { sql, mode, embed, ...extra });
    if (!r.ok) {
      console.error(json ? JSON.stringify({ rejected: r.reason }) : `넣지 않았어요: ${r.reason}`);
      return 1;
    }
    console.log(json ? JSON.stringify({ dryRun: r.dryRun, ...r.summary }) : `${r.dryRun ? '(해 보기) ' : ''}${summaryLine(r.summary)}`);
    const load = await model?.close();
    if (load?.line) console.log(load.line);
    return 0;
  } finally {
    await model?.close();
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
