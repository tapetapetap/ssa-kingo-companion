// 나의 분석 다시 쓰기(research R10, FR-032a). 재료를 바꾸는 요청 뒤에 부른다. md가 바뀔 때만 판을 올리고 다시 고르기를 건다
import type { Sql } from '../db/sql.ts';
import { TODAY } from '../notices/routes.ts';
import { enqueue } from '../pick/queue.ts';
import { factLines, toMd, visible, type Act, type Activity, type Flow, type Line } from './lines.ts';

// ponytail: 재료 쓰기와 다시 쓰기가 한 트랜잭션은 아니다. 같은 학생의 요청이 겹치거나 다시 쓰기가 실패하면 분석이 늦을 수 있고,
// 다음 다시 쓰기(읽을 때마다 한다)가 맞춘다. 몰린 분야가 날짜로 바뀌어서 읽을 때 다시 쓰고, 매일 작업도 모두 다시 쓴다(R10)

type Stored = { version: number; lines: Line[]; flow: Flow[]; flow_version: number | null; md: string; made_at: Date };

export async function excludedOf(sql: Sql, student: number) {
  return new Set((await sql<{ line_key: string }[]>`select line_key from excluded_lines where student_id = ${student}`).map(r => r.line_key));
}

export async function stored(sql: Sql, student: number): Promise<Stored | null> {
  const [a] = await sql<Stored[]>`select version, lines, flow, flow_version, md, made_at from analyses where student_id = ${student}`;
  return a ?? null;
}

/** 사실 줄을 다시 만들고 md를 쓴다. flow를 주면 그 흐름으로 바꾼다(flow.ts). 꺼져 있으면 null */
export async function rebuild(sql: Sql, student: number, flow?: Flow[]): Promise<Stored | null> {
  const [s] = await sql<{ analysis_off: boolean }[]>`select analysis_off from students where id = ${student}`;
  if (!s || s.analysis_off) return null;
  const fields = await sql<{ id: string; name: string }[]>`select f.id, f.name from fields f join taxonomies t on t.id = f.taxonomy_id and t.active order by f.ord`;
  const name = new Map(fields.map(f => [f.id, f.name]));
  const [answers] = await sql<{ grade: number; term: number; goal: string }[]>`select grade, term, goal from answers where student_id = ${student}`;
  const picked = (await sql<{ field_id: string }[]>`
    select sf.field_id from student_fields sf join fields f on f.id = sf.field_id join taxonomies t on t.id = f.taxonomy_id and t.active
    where sf.student_id = ${student} order by f.ord`).map(r => r.field_id);
  const acts = await sql<{ id: string; name: string; term: string; kind: string; field_ids: string[]; proof_url: string | null }[]>`
    select id, name, term, kind, field_ids, proof_url from activities where student_id = ${student}`;
  const actions = await sql<Act[]>`
    select a.kind, a.reason, (a.at at time zone 'Asia/Seoul')::date::text as at,
      coalesce(array(select nf.field_id from notice_fields nf where nf.notice_id = n.id and nf.level = 'core'), '{}') as core
    from actions a join notices n on n.id = a.notice_id
    where a.student_id = ${student} and n.field_state in ('judged', 'human')`;
  const [{ today }] = await sql<{ today: string }[]>`select ${sql.unsafe(TODAY)}::text as today`;
  const activities: Activity[] = acts.map(a => ({
    id: Number(a.id), name: a.name, term: a.term, kind: a.kind, proofUrl: a.proof_url, fieldNames: a.field_ids.flatMap(f => (name.has(f) ? [name.get(f)!] : []))
  }));
  const facts = factLines({ answers: answers ?? null, picked, activities, actions, fieldName: id => name.get(id), fieldOrder: fields.map(f => f.id), today });
  const prev = await stored(sql, student);
  // 지금 없는 줄을 가리키는 흐름 문장은 뺀다(뺀 줄을 가리키는 것은 되살리면 다시 보이게 둔다)
  const keys = new Set(facts.map(l => l.key));
  const nextFlow = (flow ?? prev?.flow ?? []).filter(f => f.refs.every(r => keys.has(r)));
  const md = toMd(visible(facts, nextFlow, await excludedOf(sql, student)));
  const version = !prev ? 1 : prev.md === md ? prev.version : prev.version + 1;
  const [a] = await sql<Stored[]>`
    insert into analyses (student_id, version, lines, flow, md) values (${student}, ${version}, ${sql.json(facts)}, ${sql.json(nextFlow)}, ${md})
    on conflict (student_id) do update set version = excluded.version, lines = excluded.lines, flow = excluded.flow, md = excluded.md,
      made_at = case when analyses.md = excluded.md then analyses.made_at else now() end
    returning version, lines, flow, flow_version, md, made_at`;
  if (!prev || prev.md !== md) await enqueue(sql, student, 'analysis');
  return a;
}

/** 가장 추천이 읽는 분석: 보이는 줄(흐름 포함)과 판. 꺼져 있으면 null. 몰린 분야는 날짜로 바뀌므로 읽을 때 다시 쓴다 */
export async function readAnalysis(sql: Sql, student: number) {
  const a = await rebuild(sql, student);
  if (!a) return null;
  return { version: a.version, lines: visible(a.lines, a.flow, await excludedOf(sql, student)) };
}
