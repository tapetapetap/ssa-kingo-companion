// 상태 보기(contracts/cli.md '상태 보기'): 다섯 줄. 하나라도 닿지 못하면 ok가 거짓이다(끝 코드 1)
import { pending } from '../db/migrate.ts';
import type { Sql } from '../db/sql.ts';
import { summaryLine, type IngestSummary } from '../ingest/ingest.ts';
import { ollamaBase } from '../../etl/notices/llm.ts';

type Get = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
export type StatusDeps = { sql: Sql; ollamaHost: string; apiUrl: string; get?: Get };

const kst = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const get: Get = url => fetch(url, { signal: AbortSignal.timeout(5000) });

export async function status(d: StatusDeps): Promise<{ ok: boolean; lines: string[] }> {
  const g = d.get ?? get;
  let ok = true;
  const line = async (label: string, fn: () => Promise<string>) => {
    try {
      return `${label}: ${await fn()}`;
    } catch (e) {
      ok = false;
      return `${label}: 닿지 못함(${msg(e)})`;
    }
  };
  const lines = [
    await line('DB', async () => `닿음 · 적용 안 된 바꾸기 ${(await pending(d.sql)).length}`),
    await line('마지막 매일 작업', async () => {
      const [r] = await d.sql<{ ended_at: Date; steps: Record<string, { ok: boolean; skipped: boolean }> }[]>`select ended_at, steps from daily_runs order by id desc limit 1`;
      if (!r) return '아직 없음';
      const bad = Object.entries(r.steps).filter(([, s]) => !s.ok && !s.skipped).map(([k]) => k);
      return `${kst(r.ended_at)} 끝 · ${bad.length ? `실패한 단계 ${bad.join(', ')}` : '실패한 단계 없음'}`;
    }),
    await line('마지막 넣기', async () => {
      const [r] = await d.sql<{ at: Date; summary: IngestSummary | null; rejected: string | null }[]>`select at, summary, rejected from ingest_runs order by id desc limit 1`;
      if (!r) return '아직 없음';
      return `${kst(r.at)} · ${r.rejected ? `넣지 않았어요: ${r.rejected}` : summaryLine(r.summary!)}`;
    }),
    await line('모델 서버', async () => {
      const r = await g(`${ollamaBase(d.ollamaHost)}/api/tags`);
      if (!r.ok) throw new Error('답이 실패예요');
      const names = ((await r.json()) as { models?: { name: string }[] }).models?.map(m => m.name) ?? [];
      return `닿음(${names.join(', ') || '모델 없음'})`;
    }),
    await line('api', async () => {
      const r = await g(`${d.apiUrl.replace(/\/$/, '')}/api/health`);
      if (!r.ok) throw new Error('답이 실패예요');
      const [q] = await d.sql<{ n: number }[]>`select count(*)::int as n from repick_queue`;
      return `닿음 · 다시 고르기 줄 ${q.n}`;
    })
  ];
  return { ok, lines };
}
