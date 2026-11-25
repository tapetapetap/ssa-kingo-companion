// 운영자 모니터링(FR-041~046, 3단계 contracts/api.md): 네 메뉴가 답 하나를 나눠 쓴다. 학생을 가리키는 값이 없다
import type { Ctx } from '../app.ts';
import { kstIso, type Route } from '../http.ts';
import { dailyRunning } from '../jobs/daily.ts';
import { LIMITS } from '../limits.ts';
import { installedModels } from '../model.ts';
import { alerts, judged, type Run } from './alerts.ts';
import { COUNT_NAMES, counts, kstDay } from './counts.ts';
import { requireOperator } from './guard.ts';
import { lastRequest, openRequest } from './requests.ts';

type RunRow = { started_at: Date; ended_at: Date; steps: Run['steps']; load: { gpuAvg: number | null; tempMax: number | null; requests: number } };
const n = (v: unknown) => (typeof v === 'number' ? v : null);

export function monitorRoutes(ctx: Ctx): Route[] {
  const sql = ctx.sql;
  return [
    ['GET', '/api/ops/monitor', async req => {
      const o = await requireOperator(ctx, req);
      const now = new Date();
      const rows = await sql<RunRow[]>`select started_at, ended_at, steps, load from daily_runs where started_at > now() - make_interval(days => ${LIMITS.monitorDays}) order by id desc`;
      // 마지막 작업이 14일보다 오래됐어도 멈춘 것을 알린다
      const [last] = rows.length ? rows : await sql<RunRow[]>`select started_at, ended_at, steps, load from daily_runs order by id desc limit 1`;
      const runs = (rows.length ? rows : last ? [last] : []).map(r => ({ startedAt: r.started_at, endedAt: r.ended_at, steps: r.steps }));
      const c = last?.steps.classifier ?? {};
      const [{ open }] = await sql<{ open: number }[]>`select count(*)::int as open from review_items where checked_at is null`;
      const [rate] = await sql<{ num: number; den: number }[]>`
        select count(distinct notice_id) filter (where action = 'edit')::int as num, count(distinct notice_id)::int as den
        from verdict_log where action in ('edit', 'confirm') and at > now() - make_interval(days => ${LIMITS.editRateDays})`;
      const today = kstDay(now);
      const saved = await sql<{ day: string; name: string; n: number }[]>`select day::text, name, n from daily_counts where day > ${today}::date - ${LIMITS.monitorDays}::int`;
      const live = await counts(sql, today, ctx.consent.version);
      const days = Array.from({ length: LIMITS.monitorDays }, (_, i) => kstDay(new Date(now.getTime() - i * 86400_000)));
      const names = await (ctx.models ?? installedModels)().then(ms => ms.map(m => m.name), () => null);
      const bad = (s: Run['steps']) => Object.entries(s).filter(([, x]) => !x.ok && !x.skipped).map(([k]) => k);
      return {
        body: {
          alerts: alerts(runs, now).map(a => ({ ...a, since: kstIso(a.since) })),
          health: { db: true, model: { ok: names !== null, names: names ?? [] }, lastDaily: last ? { startedAt: kstIso(last.started_at), endedAt: kstIso(last.ended_at), failed: bad(last.steps) } : null },
          today: { fetched: n(c.fetched), opportunity: n(c.opportunity), not: n(c.not), review: n(c.review), failed: last ? judged(runs[0])?.failed ?? null : null, reviewOpen: open },
          load: last ? { gpuAvg: last.load.gpuAvg, tempMax: last.load.tempMax } : { gpuAvg: null, tempMax: null },
          editRate: rate, request: await lastRequest(sql, 'daily'), dailyRunning: await dailyRunning(sql),
          days: rows.map(r => ({ day: kstDay(r.started_at), startedAt: kstIso(r.started_at), seconds: Math.round((r.ended_at.getTime() - r.started_at.getTime()) / 1000), steps: r.steps, load: { gpuAvg: r.load.gpuAvg, tempMax: r.load.tempMax, requests: r.load.requests } })),
          counts: days.map(day => {
            const of = (name: string) => saved.find(x => x.day === day && x.name === name)?.n ?? null;
            return { day, ...(day === today ? live : Object.fromEntries(COUNT_NAMES.map(k => [k, of(k)]))), server_error: of('server_error') ?? 0 };
          })
        },
        headers: o.headers
      };
    }],
    ['POST', '/api/ops/daily', async req => {
      const o = await requireOperator(ctx, req);
      return { status: 202, body: { request: await openRequest(sql, 'daily', o.by) }, headers: o.headers };
    }]
  ];
}
