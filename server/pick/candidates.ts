// 추천 후보(FR-033a·b, research R8): 거르기를 지난 열린 공지를 규칙 점수로 줄 세운다. 학생 자료는 이 학생 것만 읽는다
import type { Sql } from '../db/sql.ts';
import { HIDDEN, OPEN, TODAY } from '../notices/routes.ts';
import { studentVector, type Cand, type Goal, type Profile } from './score.ts';

const vec = (t: string | null) => (t ? (JSON.parse(t) as number[]) : null);
const NO = `cast(split_part(n.id, ':', 2) as bigint)`;

/** 거르기(a): 열린 공지에서 관심 있어요·관심 없음을 누른 공지와 다시 볼 날 전인 공지를 뺀다. 학생 벡터와의 유사도는 DB가 센다
 *  (벡터를 받아 JS에서 세면 공지 3,000건에 한 번 고르기가 0.5초를 넘어 그동안 서버가 멈췄다, T089) */
export async function loadCands(sql: Sql, student: number, vector: number[] | null): Promise<Cand[]> {
  const rows = await sql<{ id: string; no: string; kind: string | null; field_state: string; sim: number | null; deadline: string | null; closes_on: string; posted_on: string }[]>`
    select n.id, ${sql.unsafe(NO)}::text as no, n.kind, n.field_state, (1 - (n.vector <=> ${vector ? JSON.stringify(vector) : null}::vector))::float8 as sim,
      n.deadline::text, n.closes_on::text, n.posted_on::text
    from notices n left join actions a on a.notice_id = n.id and a.student_id = ${student}
    where ${sql.unsafe(OPEN)} and not coalesce(${sql.unsafe(HIDDEN)} or a.kind = 'like', false)`;
  const ids = rows.map(r => r.id);
  const fields = ids.length ? await sql<{ notice_id: string; field_id: string; level: string }[]>`
    select nf.notice_id, nf.field_id, nf.level from notice_fields nf join fields f on f.id = nf.field_id join taxonomies t on t.id = f.taxonomy_id and t.active
    where nf.notice_id = any(${ids}) order by nf.ord` : [];
  const byNotice = new Map<string, typeof fields[number][]>();
  for (const f of fields) byNotice.set(f.notice_id, [...(byNotice.get(f.notice_id) ?? []), f]);
  return rows.map(r => {
    const mine = byNotice.get(r.id) ?? [];
    const judged = r.field_state === 'judged' || r.field_state === 'human';
    return {
      id: r.id, no: Number(r.no), kind: r.kind, sim: r.sim, deadline: r.deadline, closesOn: r.closes_on, postedOn: r.posted_on,
      core: judged ? mine.filter(f => f.level === 'core').map(f => f.field_id) : null,
      related: judged ? mine.filter(f => f.level === 'related').map(f => f.field_id) : []
    };
  });
}

export type Student = { profile: Profile; term: number; pickedNames: string[]; prompt: string | null; promptVector: number[] | null };

/** 처음 답과 고른 분야가 없으면 null(아직 가장 추천을 고르지 않는다). 몰린 분야는 나의 분석이 생기면 채운다(US5 T065) */
export async function loadStudent(sql: Sql, student: number): Promise<Student | null> {
  const [a] = await sql<{ grade: number; term: number; goal: Goal; today: string }[]>`
    select grade, term, goal, ${sql.unsafe(TODAY)}::text as today from answers where student_id = ${student}`;
  if (!a) return null;
  const picked = await sql<{ id: string; name: string; vector: string | null }[]>`
    select f.id, f.name, f.vector::text from student_fields sf join fields f on f.id = sf.field_id join taxonomies t on t.id = f.taxonomy_id and t.active
    where sf.student_id = ${student} order by f.ord`;
  if (!picked.length) return null;
  const [p] = await sql<{ body: string; vector: string | null }[]>`select body, vector::text from prompts where student_id = ${student}`;
  const liked = await sql<{ vector: string }[]>`
    select n.vector::text from actions a join notices n on n.id = a.notice_id where a.student_id = ${student} and a.kind = 'like' and n.vector is not null`;
  const promptVector = vec(p?.vector ?? null);
  const groups = [promptVector ? [promptVector] : [], liked.map(l => vec(l.vector)!), picked.flatMap(f => (f.vector ? [vec(f.vector)!] : []))];
  return {
    profile: { grade: a.grade, goal: a.goal, picked: new Set(picked.map(f => f.id)), liked: new Set(), disliked: new Set(), vector: studentVector(groups), today: a.today },
    term: a.term, pickedNames: picked.map(f => f.name), prompt: p?.body ?? null, promptVector
  };
}
