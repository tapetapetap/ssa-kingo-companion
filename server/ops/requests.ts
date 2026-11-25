// 운영자 요청(FR-045, 3단계 research R9): api는 적어 두기만 하고, jobs의 'requests' 명령이 10분마다 가져가 한다(api가 컨테이너를 켤 수 없다)
import type { Sql } from '../db/sql.ts';
import { HttpError, kstIso } from '../http.ts';
import { hideSecrets } from '../log.ts';
import { DailyBusy, type DailyRun } from '../jobs/daily.ts';

export type Kind = 'daily' | 'model_trial';
type Row = { id: string; kind: Kind; model: string | null; by_operator: string; at: Date; status: string; done: number; total: number; started_at: Date | null; ended_at: Date | null; error: string | null };
const view = (r: Row) => ({
  id: Number(r.id), kind: r.kind, model: r.model, by: r.by_operator, at: kstIso(r.at), status: r.status, done: r.done, total: r.total,
  startedAt: r.started_at && kstIso(r.started_at), endedAt: r.ended_at && kstIso(r.ended_at), error: r.error
});

/** 그 종류의 마지막 요청(끝난 것 포함). 한 번도 없으면 null */
export async function lastRequest(sql: Sql, kind: Kind) {
  const [r] = await sql<Row[]>`select * from op_requests where kind = ${kind} order by id desc limit 1`;
  return r ? view(r) : null;
}

/** 요청을 적는다. 열린 요청(기다림·도는 중·멈춤)이 있으면 already */
export async function openRequest(sql: Sql, kind: Kind, by: string, model: string | null = null) {
  const [r] = await sql<Row[]>`insert into op_requests (kind, model, by_operator) values (${kind}, ${model}, ${by})
    on conflict (kind) where status in ('waiting', 'running', 'paused') do nothing returning *`;
  if (!r) throw new HttpError(409, 'already', '이미 요청했어요. 끝난 뒤에 다시 해 주세요');
  return view(r);
}

export type RequestDeps = { sql: Sql; daily: () => Promise<DailyRun> };

/** 기다리는 요청을 한다. 출력 한 줄을 준다 */
export async function runRequests(d: RequestDeps): Promise<string> {
  const { sql } = d;
  const conn = await sql.reserve();
  try {
    const [{ ok }] = await conn<{ ok: boolean }[]>`select pg_try_advisory_lock(hashtext('kingo:requests:' || current_schema())) as ok`;
    if (!ok) return '다른 요청 처리가 돌고 있어요';
    try {
      // 잠금을 얻었으니 '도는 중'으로 남은 것은 도중에 죽은 것이다
      await sql`update op_requests set status = 'failed', ended_at = now(), error = '도중에 끝났어요' where kind = 'daily' and status = 'running'`;
      await sql`update op_requests set status = 'paused' where kind = 'model_trial' and status = 'running'`;
      return await daily(d) ?? '요청 없음';
    } finally {
      await conn`select pg_advisory_unlock(hashtext('kingo:requests:' || current_schema()))`;
    }
  } finally {
    conn.release();
  }
}

async function daily({ sql, daily }: RequestDeps): Promise<string | null> {
  const [r] = await sql<{ id: string }[]>`update op_requests set status = 'running', started_at = now() where kind = 'daily' and status = 'waiting' returning id`;
  if (!r) return null;
  const end = (status: 'done' | 'failed', error: string | null) => sql`update op_requests set status = ${status}, ended_at = now(), error = ${error} where id = ${r.id}`;
  try {
    const run = await daily();
    const bad = Object.entries(run.steps).filter(([, s]) => !s.ok && !s.skipped).map(([k]) => k);
    await end('done', bad.length ? `실패한 단계: ${bad.join(', ')}` : null);
    return bad.length ? `매일 작업 끝(실패한 단계 ${bad.join(', ')})` : '매일 작업 끝';
  } catch (e) {
    if (e instanceof DailyBusy) {
      await sql`update op_requests set status = 'waiting', started_at = null where id = ${r.id}`; // 다음 10분에 다시 본다
      return '매일 작업이 돌고 있어 기다려요';
    }
    await end('failed', hideSecrets(e instanceof Error ? e.message : String(e)));
    throw e;
  }
}
