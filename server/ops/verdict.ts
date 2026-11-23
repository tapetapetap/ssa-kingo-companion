// 운영자 판정 검토 경로(US7, FR-049~055, contracts/api.md '운영자 판정 검토'). 답에는 학생 자료가 없다
import type { Ctx } from '../app.ts';
import { rebuild } from '../analysis/store.ts';
import type { Db, Sql } from '../db/sql.ts';
import { HttpError, kstIso, type Route } from '../http.ts';
import { isDate, KINDS } from '../ingest/check.ts';
import { requireOperator } from './guard.ts';
import { applyHuman, refreshReview } from './review.ts';

type Named = { id: string; name: string };
type Fields = { core: string[]; related: string[] };
const CAMEL: Record<string, string> = { is_notice: 'isNotice', kind: 'kind', deadline: 'deadline', fields: 'fields' };
const SNAKE = Object.fromEntries(Object.entries(CAMEL).map(([k, v]) => [v, k]));
const REASONS = ['review', 'no_deadline', 'no_fields'];
const invalid = (field: string, message: string) => new HttpError(422, 'invalid', message, { field });

/** OpsNotice 여럿(ids 순서). 없는 id는 빠진다 */
export async function opsNotices(sql: Db, ids: string[]) {
  const rows = await sql<{ id: string; title: string; url: string; posted_on: string; host: string | null; down: boolean; closes_on: string; is_notice: boolean; kind: string | null; deadline: string | null; field_state: string; file: Record<string, unknown> }[]>`
    select id, title, url, posted_on::text, host, down, closes_on::text, is_notice, kind, deadline::text, field_state, file from notices where id = any(${ids})`;
  const names = new Map((await sql<Named[]>`select f.id, f.name from fields f join taxonomies t on t.id = f.taxonomy_id and t.active`).map(r => [r.id, r.name]));
  const named = (ids: string[]) => ids.map(id => ({ id, name: names.get(id) ?? id }));
  const nf = await sql<{ notice_id: string; field_id: string; level: string }[]>`select notice_id, field_id, level from notice_fields where notice_id = any(${ids}) order by ord`;
  const human = await sql<{ notice_id: string; field: string; value: unknown; by_operator: string; at: Date }[]>`select notice_id, field, value, by_operator, at from human_verdicts where notice_id = any(${ids})`;
  const byId = new Map(rows.map(r => {
    const f = r.file;
    const fileFields = f.fields as Fields | undefined;
    const mine = nf.filter(x => x.notice_id === r.id);
    return [r.id, {
      id: r.id, title: r.title, url: r.url, postedOn: r.posted_on, host: r.host, down: r.down, closesOn: r.closes_on,
      file: {
        verdict: 'why' in f ? 'review' : 'opportunity', kind: f.kind ?? null, deadline: f.deadline ?? null,
        fields: fileFields ? { core: named(fileFields.core), related: named(fileFields.related) } : null,
        rule: f.rule ?? null, deadlineRule: f.deadlineRule ?? null, reason: f.why ?? null
      },
      human: Object.fromEntries(human.filter(h => h.notice_id === r.id).map(h => [CAMEL[h.field], { value: h.value, by: h.by_operator, at: kstIso(h.at) }])),
      shown: {
        isNotice: r.is_notice, kind: r.kind, deadline: r.deadline,
        fields: r.field_state === 'off' || r.field_state === 'missing' ? null : {
          core: named(mine.filter(x => x.level === 'core').map(x => x.field_id)), related: named(mine.filter(x => x.level === 'related').map(x => x.field_id))
        }
      }
    }] as const;
  }));
  return ids.flatMap(id => byId.get(id) ?? []);
}
export type OpsNotice = Awaited<ReturnType<typeof opsNotices>>[number];

async function one(sql: Db, id: string) {
  const [n] = await opsNotices(sql, [id]);
  if (!n) throw new HttpError(404, 'not_found', '찾을 수 없는 공지예요');
  return n;
}

const logItems = async (sql: Sql, notice: string | null) => (await sql<{ notice_id: string; field: string | null; action: string; old: unknown; new: unknown; by_operator: string; at: Date }[]>`
  select notice_id, field, action, old, new, by_operator, at from verdict_log where (${notice}::text is null or notice_id = ${notice}) order by id desc limit 500`)
  .map(r => ({ noticeId: r.notice_id, field: r.field && CAMEL[r.field], action: r.action, old: r.old, new: r.new, by: r.by_operator, at: kstIso(r.at) }));

/** 보낸 칸을 검사하고 사람 판정 값(DB 칸 이름 → 값)으로 돌려준다 */
async function checkVerdict(sql: Db, b: Record<string, unknown>, now: OpsNotice): Promise<[string, unknown][]> {
  if (typeof b !== 'object' || b === null || Array.isArray(b)) throw invalid('verdict', '고칠 칸을 보내 주세요');
  const unknown = Object.keys(b).find(k => !(k in SNAKE));
  if (unknown) throw invalid(unknown, '모르는 칸이에요');
  if (!Object.keys(b).length) throw invalid('verdict', '고칠 칸을 보내 주세요');
  if ('isNotice' in b && typeof b.isNotice !== 'boolean') throw invalid('isNotice', '공지인지는 참이나 거짓이에요');
  if ('kind' in b && !(KINDS as readonly unknown[]).includes(b.kind)) throw invalid('kind', '모르는 종류예요');
  if ('deadline' in b && b.deadline !== null && !isDate(b.deadline)) throw invalid('deadline', '마감은 YYYY-MM-DD나 null이에요');
  if ('fields' in b) {
    const f = b.fields as Record<string, unknown> | null;
    const ok = (v: unknown, max: number) => Array.isArray(v) && v.length <= max && v.every(x => typeof x === 'string');
    if (typeof f !== 'object' || f === null || Object.keys(f).some(k => k !== 'core' && k !== 'related') || !ok(f.core, 2) || !ok(f.related, 5)) throw invalid('fields', '핵심 2개·관련 5개까지예요');
    const all = [...f.core as string[], ...f.related as string[]];
    if (new Set(all).size !== all.length) throw invalid('fields', '같은 분야가 두 번 있어요');
    const known = await sql`select f.id from fields f join taxonomies t on t.id = f.taxonomy_id and t.active where f.id = any(${all})`;
    if (known.length !== all.length) throw invalid('fields', '목록에 없는 분야가 있어요');
    b.fields = { core: f.core, related: f.related };
  }
  const isNotice = 'isNotice' in b ? b.isNotice : now.shown.isNotice;
  const kind = 'kind' in b ? b.kind : now.shown.kind;
  if (isNotice && !kind) throw invalid('kind', '공지에는 종류가 있어야 해요');
  return Object.entries(b).map(([k, v]) => [SNAKE[k], v]);
}

export function opsRoutes(ctx: Ctx): Route[] {
  const sql = ctx.sql;
  return [
    ['GET', '/api/ops/review', async req => {
      const o = await requireOperator(ctx, req);
      const reason = req.query.get('reason') || null;
      if (reason && !REASONS.includes(reason)) throw invalid('reason', '이유는 review·no_deadline·no_fields 중 하나예요');
      const checked = req.query.get('checked') || null;
      if (checked !== null && checked !== 'true' && checked !== 'false') throw invalid('checked', 'checked는 true나 false예요');
      const rows = await sql<{ notice_id: string; reasons: string[]; checked_at: Date | null; checked_by: string | null }[]>`
        select r.notice_id, r.reasons, r.checked_at, r.checked_by from review_items r join notices n on n.id = r.notice_id
        where not n.down
          and (${reason}::text is null or (${reason}::text = 'review' and exists (select 1 from unnest(r.reasons) x where x like 'review:%')) or ${reason}::text = any(r.reasons))
          and (${checked}::text is null or (r.checked_at is not null) = (${checked}::text = 'true'))
        order by n.posted_on desc, n.id desc`;
      const notices = await opsNotices(sql, rows.map(r => r.notice_id));
      return {
        body: { items: rows.map((r, i) => ({ notice: notices[i], reasons: r.reasons, checkedAt: r.checked_at && kstIso(r.checked_at), checkedBy: r.checked_by })) },
        headers: o.headers
      };
    }],
    ['GET', '/api/ops/notices/:id', async req => {
      const o = await requireOperator(ctx, req);
      const notice = await one(sql, req.params.id);
      return { body: { notice, log: await logItems(sql, notice.id) }, headers: o.headers };
    }],
    ['PUT', '/api/ops/notices/:id/verdict', async req => {
      const o = await requireOperator(ctx, req);
      const id = (await one(sql, req.params.id)).id;
      // 앞 값은 트랜잭션 안에서 행을 잠근 뒤 읽는다(두 운영자가 함께 고쳐도 기록의 앞 값이 맞게)
      // jsonb는 글로 보내 바꾼다(sql.json(null)은 SQL NULL이 되고, 글에 ::jsonb만 붙이면 두 번 글이 된다)
      await sql.begin(async tx => {
        await tx`select 1 from notices where id = ${id} for update`;
        const now = await one(tx, id);
        const sent = await checkVerdict(tx, req.body as Record<string, unknown>, now);
        const old = (f: string): unknown => {
          const v = now.shown[CAMEL[f] as keyof typeof now.shown];
          return f === 'fields' && v ? { core: now.shown.fields!.core.map(x => x.id), related: now.shown.fields!.related.map(x => x.id) } : v;
        };
        for (const [f, v] of sent) {
          await tx`insert into verdict_log (notice_id, field, action, old, new, by_operator) values (${id}, ${f}, 'edit', ${JSON.stringify(old(f))}::text::jsonb, ${JSON.stringify(v)}::text::jsonb, ${o.by})`;
          await tx`insert into human_verdicts (notice_id, field, value, by_operator) values (${id}, ${f}, ${JSON.stringify(v)}::text::jsonb, ${o.by})
            on conflict (notice_id, field) do update set value = excluded.value, by_operator = excluded.by_operator, at = now()`;
        }
        await applyHuman(tx, [id]);
        // 고친 공지는 확인한 것으로 남긴다. 확인할 것에 행이 없던 공지는 행을 만들지 않는다
        await refreshReview(tx, [id], true);
        await tx`update review_items set checked_by = ${o.by}, checked_at = now() where notice_id = ${id}`;
      });
      // 이 공지에 행동한 학생의 분석은 공지 분야·종류를 읽는다(바뀌면 분석이 다시 고르기를 건다)
      for (const r of await sql<{ student_id: string }[]>`select distinct student_id from actions where notice_id = ${id}`) await rebuild(sql, Number(r.student_id));
      return { body: await one(sql, id), headers: o.headers };
    }],
    ['POST', '/api/ops/notices/:id/confirm', async req => {
      const o = await requireOperator(ctx, req);
      const n = await one(sql, req.params.id);
      await sql.begin(async tx => {
        // 확인할 것에 없는 공지는 기록도 남기지 않는다(한 일이 없다)
        const done = await tx`update review_items set checked_by = ${o.by}, checked_at = now() where notice_id = ${n.id}`;
        if (done.count) await tx`insert into verdict_log (notice_id, action, by_operator) values (${n.id}, 'confirm', ${o.by})`;
      });
      return { status: 204, headers: o.headers };
    }],
    ['POST', '/api/ops/notices/:id/rejudge', async req => {
      const o = await requireOperator(ctx, req);
      const n = await one(sql, req.params.id);
      await sql.begin(async tx => {
        await tx`insert into rejudge_marks (notice_id, by_operator) values (${n.id}, ${o.by}) on conflict (notice_id) do update set by_operator = excluded.by_operator, at = now()`;
        await tx`insert into verdict_log (notice_id, action, by_operator) values (${n.id}, 'rejudge', ${o.by})`;
      });
      return { status: 204, headers: o.headers };
    }],
    ['GET', '/api/ops/log', async req => {
      const o = await requireOperator(ctx, req);
      return { body: { items: await logItems(sql, req.query.get('notice') || null) }, headers: o.headers };
    }]
  ];
}
