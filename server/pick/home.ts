// 홈(US3, contracts/api.md 홈, FR-038): 가장 추천 하나와 선반 셋. 앞의 가장 추천이 지금 후보가 될 수 없으면 그 자리에서 규칙 1위로 바꾸고 다시 고르기를 건다
import type { Ctx } from '../app.ts';
import { requireStudent } from '../auth/login.ts';
import { kstIso, type Route } from '../http.ts';
import { nextStep } from '../me/onboarding.ts';
import { cards, HIDDEN, OPEN, SELECT, TODAY, type Row } from '../notices/routes.ts';
import { readAnalysis } from '../analysis/store.ts';
import { choosePick } from './choose.ts';
import { enqueue } from './queue.ts';
import { buildShelves } from './shelves.ts';

const methodText = (m: string) => (m === 'rule' ? '규칙' : `LLM: ${m.replace(/^llm:/, '')}`);

export function homeRoutes(ctx: Ctx): Route[] {
  const sql = ctx.sql;
  return [['GET', '/api/home', async req => {
    const s = await requireStudent(ctx, req);
    const done = (await nextStep(ctx, s.id)) === 'home';
    // 거르기를 지난 열린 공지(관심 있어요는 선반에는 나오지만 가장 추천은 아니다)
    // 비슷한 공지의 유사도(관심 있어요 공지들과의 코사인 최댓값)는 DB가 센다. 벡터를 받아 JS에서 세면 공지 3,000건에 홈이 1초를 넘었다(SC-007, T089)
    const rows = await sql<(Row & { sim: number | null; no: string })[]>`
      select x.*, split_part(x.id, ':', 2) as no,
        (select max(1 - (v.vector <=> ln.vector)) from actions la join notices ln on ln.id = la.notice_id
         where la.student_id = ${s.id} and la.kind = 'like' and ln.vector is not null)::float8 as sim
      from (${SELECT(sql, s.id)} where ${sql.unsafe(OPEN)} and not coalesce(${sql.unsafe(HIDDEN)}, false)) x join notices v on v.id = x.id`;
    const all = await cards(sql, rows);
    const [{ today }] = await sql<{ today: string }[]>`select ${sql.unsafe(TODAY)}::text as today`;
    const [{ judged }] = await sql<{ judged: boolean }[]>`select exists(select 1 from notices n where ${sql.unsafe(OPEN)} and n.field_state in ('judged', 'human')) as judged`;

    let pick = null;
    let pickEmpty: string | null = null;
    if (!done) pickEmpty = 'fields_not_done';
    else {
      let [p] = await sql<{ notice_id: string; reason: string; cited: { key: string; text?: string }[]; method: string; computed_at: Date }[]>`
        select notice_id, reason, cited, method, computed_at from picks where student_id = ${s.id}`;
      const usable = (id: string) => rows.some(r => r.id === id && r.a_kind !== 'like');
      if (!p || !usable(p.notice_id)) {
        // 바로 바꾸기: 규칙 1위를 지금 고르고 다시 고르기를 건다(FR-038, SC-003)
        const r = await choosePick(sql, s.id, null);
        if (r) await enqueue(sql, s.id, p ? 'action' : 'fields');
        [p] = await sql<typeof p[]>`select notice_id, reason, cited, method, computed_at from picks where student_id = ${s.id}`;
      }
      if (p) {
        const [q] = await sql`select 1 from repick_queue where student_id = ${s.id}`;
        const card = all[rows.findIndex(r => r.id === p.notice_id)];
        // 참고한 줄은 지금 보이는 줄만 준다. 학생이 뺀 줄은 다시 고르기 전에도 바로 빠진다(US5 시나리오 6)
        const now = new Map((await readAnalysis(sql, s.id))?.lines.map(l => [l.key, l.text]));
        const hasPrompt = (await sql`select 1 from prompts where student_id = ${s.id}`).length > 0;
        // 글은 지금 줄의 글로 준다(활동 이름을 고쳤을 수 있다)
        const cited = p.cited.flatMap(c => (c.key === 'prompt' ? (hasPrompt ? [c] : []) : now.has(c.key) ? [{ ...c, text: now.get(c.key) }] : []));
        pick = { notice: card, reason: p.reason, cited, method: methodText(p.method), computedAt: kstIso(p.computed_at), repicking: !!q };
      } else pickEmpty = rows.length ? 'no_match' : 'no_open_notices';
    }

    const picked = new Set((await sql<{ field_id: string }[]>`select field_id from student_fields where student_id = ${s.id}`).map(r => r.field_id));
    const anyLikes = (await sql`select 1 from actions where student_id = ${s.id} and kind = 'like' limit 1`).length > 0;
    const items = rows.map((r, i) => ({
      card: all[i], id: r.id, no: Number(r.no), core: all[i].fields ? all[i].fields!.core.map(f => f.id) : null, related: all[i].fields?.related.map(f => f.id) ?? [],
      deadline: r.deadline, postedOn: r.posted_on, liked: r.a_kind === 'like', sim: r.sim
    }));
    const seen = new Set(pick ? [pick.notice.id] : []);
    const shelves = buildShelves(items, { picked, today, seen, anyJudged: judged });
    if (!anyLikes) shelves.similar = { items: [], empty: 'no_likes' };
    return { body: { pick, pickEmpty, shelves }, headers: s.headers };
  }]];
}
