// 임베딩 지도(FR-047~050, 3단계 research R13): 세부 분야는 t-SNE, 공지는 가까운 분야 다섯의 가중 가운데. 매일 작업의 넣기 뒤에 만든다
import type { Ctx } from '../app.ts';
import type { Sql } from '../db/sql.ts';
import { kstIso, type Route } from '../http.ts';
import { LIMITS } from '../limits.ts';
import { hideSecrets } from '../log.ts';
import { requireOperator } from './guard.ts';
import { tsne } from './tsne.ts';

export type MapData = {
  fields: { id: string; x: number; y: number }[];
  /** rank는 첫 핵심 분야가 그 공지와 몇 번째로 가까운가(없으면 null), first는 가장 가까운 분야 */
  notices: { id: string; x: number; y: number; rank: number | null; first: string }[];
  pairs: { a: string; b: string; sim: number }[]; empty: { field: string; notices: string[] }[]; unused: string[]; noVector: number;
};
const NEAR = 5;
const unit = (text: string): number[] => {
  const v = JSON.parse(text) as number[];
  const len = Math.hypot(...v) || 1;
  return v.map(x => x / len);
};
const dot = (a: number[], b: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const round = (n: number) => Math.round(n * 10_000) / 10_000;

/** 지도 하나를 만들어 남기고(최근 7개만) 크기를 준다. 분야가 모자라면 까닭을 던진다 */
export async function buildMap(sql: Sql): Promise<{ fields: number; notices: number; noVector: number }> {
  const [t] = await sql<{ id: string; edition: string }[]>`select id, edition from taxonomies where active`;
  if (!t) throw new Error('활성 분야 목록이 없어요');
  const fields = (await sql<{ id: string; vector: string }[]>`select id, vector::text from fields where taxonomy_id = ${t.id} and vector is not null order by ord, id`).map(f => ({ id: f.id, v: unit(f.vector) }));
  if (fields.length < LIMITS.mapMinFields) throw new Error(`벡터가 있는 분야가 ${fields.length}개라 지도를 만들지 못했어요(${LIMITS.mapMinFields}개부터)`);
  const rows = await sql<{ id: string; vector: string | null; judged: boolean; core: string[]; related: string[] }[]>`
    select n.id, n.vector::text, n.field_state in ('judged', 'human') as judged,
      coalesce((select array_agg(nf.field_id order by nf.ord) from notice_fields nf join fields f on f.id = nf.field_id and f.taxonomy_id = ${t.id} where nf.notice_id = n.id and nf.level = 'core'), '{}') as core,
      coalesce((select array_agg(nf.field_id order by nf.ord) from notice_fields nf join fields f on f.id = nf.field_id and f.taxonomy_id = ${t.id} where nf.notice_id = n.id and nf.level = 'related'), '{}') as related
    from notices n where n.is_notice and not n.down and n.posted_on >= (now() at time zone 'Asia/Seoul')::date - ${LIMITS.mapDays}::int order by n.id`;

  const sims = fields.map(a => fields.map(b => dot(a.v, b.v)));
  const raw = tsne(sims.map(r => r.map(s => Math.max(0, 1 - s))));
  const [xs, ys] = [0, 1].map(k => raw.map(p => p[k]));
  const scale = (v: number, all: number[]) => { const [lo, hi] = [Math.min(...all), Math.max(...all)]; return hi > lo ? (v - lo) / (hi - lo) : 0.5; };
  const at = raw.map(([x, y]) => [scale(x, xs), scale(y, ys)]);

  const notices: MapData['notices'] = [];
  const nothing = new Map<string, string[]>(); // 핵심 없는 공지를 1위 분야로 묶음
  const used = new Set<string>();
  for (const n of rows) {
    if (!n.vector) continue;
    for (const f of [...n.core, ...n.related]) used.add(f);
    const v = unit(n.vector);
    const order = fields.map((f, i) => ({ i, s: dot(v, f.v) })).sort((a, b) => b.s - a.s || a.i - b.i);
    const near = order.slice(0, NEAR);
    const base = order[NEAR].s;
    const sum = near.reduce((s, x) => s + (x.s - base), 0);
    const w = near.map(x => (sum > 0 ? (x.s - base) / sum : 1 / NEAR));
    const [x, y] = [0, 1].map(k => near.reduce((s, p, j) => s + w[j] * at[p.i][k], 0));
    const first = fields[order[0].i].id;
    const r = n.core.length ? order.findIndex(o => fields[o.i].id === n.core[0]) : -1;
    notices.push({ id: n.id, x: round(x), y: round(y), rank: r < 0 ? null : r + 1, first });
    if (n.judged && !n.core.length) nothing.set(first, [...(nothing.get(first) ?? []), n.id]);
  }
  const pairs: MapData['pairs'] = [];
  for (let i = 0; i < fields.length; i++) for (let j = i + 1; j < fields.length; j++) pairs.push({ a: fields[i].id, b: fields[j].id, sim: round(sims[i][j]) });
  pairs.sort((p, q) => q.sim - p.sim || p.a.localeCompare(q.a) || p.b.localeCompare(q.b));
  const data: MapData = {
    fields: fields.map((f, i) => ({ id: f.id, x: round(at[i][0]), y: round(at[i][1]) })), notices, pairs: pairs.slice(0, LIMITS.mapPairs),
    empty: [...nothing].filter(([, ids]) => ids.length >= LIMITS.mapEmptyMin).map(([field, ids]) => ({ field, notices: ids })).sort((a, b) => b.notices.length - a.notices.length || a.field.localeCompare(b.field)),
    unused: fields.map(f => f.id).filter(id => !used.has(id)), noVector: rows.filter(n => !n.vector).length
  };
  await sql`insert into field_maps (taxonomy_id, edition, data) values (${t.id}, ${t.edition}, ${sql.json(data as never)})`;
  await sql`delete from field_maps where id not in (select id from field_maps order by id desc limit ${LIMITS.mapKeep})`;
  return { fields: fields.length, notices: notices.length, noVector: data.noVector };
}

export function mapRoutes(ctx: Ctx): Route[] {
  const sql = ctx.sql;
  return [['GET', '/api/ops/map', async req => {
    const o = await requireOperator(ctx, req);
    const [m] = await sql<{ at: Date; taxonomy_id: string; data: MapData }[]>`select at, taxonomy_id, data from field_maps order by id desc limit 1`;
    const [run] = await sql<{ started_at: Date; error: string | null }[]>`select started_at, steps->'map'->>'error' as error from daily_runs order by id desc limit 1`;
    if (!m) return { body: { at: null, reason: !run ? '아직 매일 작업이 돌지 않았어요' : run.error ? hideSecrets(run.error) : '아직 지도를 만들지 않았어요' }, headers: o.headers };
    const [active] = await sql<{ id: string }[]>`select id from taxonomies where active`;
    const groups = new Map((await sql<{ id: string; name: string; parent_id: string | null }[]>`select id, name, parent_id from field_groups where taxonomy_id = ${m.taxonomy_id}`).map(g => [g.id, g]));
    const top = (id: string) => { let g = groups.get(id); while (g?.parent_id && groups.has(g.parent_id)) g = groups.get(g.parent_id); return g; };
    const fields = new Map((await sql<{ id: string; name: string; group_id: string }[]>`select id, name, group_id from fields where taxonomy_id = ${m.taxonomy_id}`).map(f => [f.id, f]));
    // 분야와 순위는 지금 값으로 준다(지도를 만든 뒤 운영자가 고친 것을 따른다). 순위는 첫 핵심보다 가까운 분야 수 + 1
    const notices = new Map((await sql<{ id: string; title: string; kind: string | null; deadline: string | null; posted_on: string; source: string; core: string[]; related: string[]; rank: number | null; review: boolean }[]>`
      select n.id, n.title, n.kind, n.deadline::text, n.posted_on::text, n.source, x.core,
        coalesce((select array_agg(nf.field_id order by nf.ord) from notice_fields nf join fields f on f.id = nf.field_id and f.taxonomy_id = ${m.taxonomy_id} where nf.notice_id = n.id and nf.level = 'related'), '{}') as related,
        (select 1 + (select count(*) from fields o where o.taxonomy_id = ${m.taxonomy_id} and o.vector is not null and (o.vector <=> n.vector) < (c.vector <=> n.vector))
          from fields c where c.taxonomy_id = ${m.taxonomy_id} and c.id = x.core[1] and c.vector is not null)::int as rank,
        exists(select 1 from review_items r where r.notice_id = n.id and r.checked_at is null) as review
      from notices n cross join lateral (select coalesce((select array_agg(nf.field_id order by nf.ord) from notice_fields nf join fields f on f.id = nf.field_id and f.taxonomy_id = ${m.taxonomy_id} where nf.notice_id = n.id and nf.level = 'core'), '{}') as core) x
      where n.is_notice and not n.down and n.id = any(${m.data.notices.map(n => n.id)})`).map(n => [n.id, n]));
    return {
      body: {
        at: kstIso(m.at), stale: (!!run && m.at < run.started_at) || active?.id !== m.taxonomy_id,
        fields: m.data.fields.flatMap(f => { const x = fields.get(f.id); const g = x && top(x.group_id); return x ? [{ ...f, name: x.name, group: g?.id ?? '', groupName: g?.name ?? '' }] : []; }),
        // 그 뒤 내려갔거나 공지가 아니게 된 것은 뺀다
        notices: m.data.notices.flatMap(p => { const n = notices.get(p.id); return n ? [{ ...p, rank: n.rank, title: n.title, kind: n.kind, deadline: n.deadline, postedOn: n.posted_on, source: n.source, core: n.core, related: n.related, review: n.review }] : []; }),
        pairs: m.data.pairs, empty: m.data.empty.map(e => ({ ...e, notices: e.notices.filter(id => notices.get(id)?.core.length === 0) })).filter(e => e.notices.length > 0), unused: m.data.unused, noVector: m.data.noVector
      },
      headers: o.headers
    };
  }]];
}
