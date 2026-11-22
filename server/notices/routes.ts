// 공지 목록·자세히·카드 행동·내 목록(US4, FR-021~027, contracts/api.md). 오늘은 한국 날짜다(research R13)
import type { Ctx } from '../app.ts';
import { requireStudent } from '../auth/login.ts';
import type { Sql } from '../db/sql.ts';
import { HttpError, kstIso, type Route } from '../http.ts';
import { KINDS } from '../ingest/check.ts';
import { LIMITS } from '../limits.ts';
import { requireConsent } from '../me/onboarding.ts';

const TODAY = `(now() at time zone 'Asia/Seoul')::date`;
const REASONS = ['time', 'field', 'done', 'hard'];
const invalid = (field: string, message: string) => new HttpError(422, 'invalid', message, { field });

type Row = {
  id: string; title: string; host: string | null; kind: string | null; posted_on: string; deadline: string | null; closes_on: string;
  open: boolean; closed: boolean; gone: boolean; field_state: string; field_rule: string | null; url: string;
  a_kind: string | null; a_revisit: string | null; a_reason: string | null; a_at: Date | null;
};

/** 학생 하나가 보는 공지 칸. 점수·유사도는 넣지 않는다(FR-024) */
const SELECT = (sql: Sql, student: number) => sql`
  select n.id, n.title, n.host, n.kind, n.posted_on::text, n.deadline::text, n.closes_on::text, n.url, n.field_state, n.field_rule,
    (n.is_notice and not n.down and n.closes_on >= ${sql.unsafe(TODAY)}) as open, (n.down or not n.is_notice) as gone, (n.closes_on < ${sql.unsafe(TODAY)}) as closed,
    a.kind as a_kind, a.revisit_on::text as a_revisit, a.reason as a_reason, a.at as a_at
  from notices n left join actions a on a.notice_id = n.id and a.student_id = ${student}`;

/** 이 학생에게 숨길 공지: 관심 없음, 다시 볼 날 전인 나중에 보기(마감이 당겨져 닫히는 날이 앞서면 숨기지 않는다, FR-026) */
const HIDDEN = `(a.kind = 'dislike' or (a.kind = 'later' and a.revisit_on > ${TODAY} and a.revisit_on <= n.closes_on))`;
const OPEN = `(n.is_notice and not n.down and n.closes_on >= ${TODAY})`;

async function cards(sql: Sql, rows: Row[]) {
  const ids = rows.map(r => r.id);
  const fields = ids.length ? await sql<{ notice_id: string; id: string; name: string; level: string }[]>`
    select nf.notice_id, nf.field_id as id, f.name, nf.level from notice_fields nf
    join fields f on f.id = nf.field_id join taxonomies t on t.id = f.taxonomy_id and t.active
    where nf.notice_id = any(${ids}) order by nf.ord` : [];
  return rows.map(r => {
    const mine = fields.filter(f => f.notice_id === r.id).map(f => ({ id: f.id, name: f.name, level: f.level }));
    const judged = r.field_state === 'judged' || r.field_state === 'human';
    return {
      id: r.id, title: r.title, host: r.host, kind: r.kind, postedOn: r.posted_on, deadline: r.deadline, closesOn: r.closes_on, open: r.open, down: r.gone,
      fields: judged ? {
        core: mine.filter(f => f.level === 'core').map(({ id, name }) => ({ id, name })),
        related: mine.filter(f => f.level === 'related').map(({ id, name }) => ({ id, name })),
        by: r.field_state === 'human' ? '운영자' : r.field_rule
      } : null,
      url: r.url,
      action: r.a_kind ? { kind: r.a_kind, revisitOn: r.a_revisit, reason: r.a_reason, at: r.a_at ? kstIso(r.a_at) : null } : null
    };
  });
}

/** 글 번호(cse:123의 123) */
const NO = `cast(split_part(n.id, ':', 2) as bigint)`;
const termOf = (d: Date) => {
  const k = new Date(d.getTime() + 9 * 3600_000);
  const [y, m] = [k.getUTCFullYear(), k.getUTCMonth() + 1];
  return m >= 3 && m <= 8 ? `${y}-1` : `${m <= 2 ? y - 1 : y}-2`; // 1~2월은 앞 해의 2학기(research R13)
};

export function noticeRoutes(ctx: Ctx): Route[] {
  const sql = ctx.sql;
  const one = async (student: number, id: string) => (await sql<Row[]>`${SELECT(sql, student)} where n.id = ${id}`)[0];
  return [
    ['GET', '/api/notices', async req => {
      const s = await requireStudent(ctx, req);
      const q = req.query;
      const kinds = q.get('kind') ? q.get('kind')!.split(',') : [];
      if (kinds.some(k => !(KINDS as readonly string[]).includes(k))) throw invalid('kind', '모르는 종류예요');
      const fieldIds = q.get('field') ? q.get('field')!.split(',') : [];
      const sort = q.get('sort') ?? 'new';
      if (sort !== 'new' && sort !== 'due') throw invalid('sort', '정렬은 new나 due예요');
      const text = (q.get('q') ?? '').toLowerCase().replace(/\s+/g, '');
      if ((q.get('q') ?? '').length > LIMITS.queryChars) throw new HttpError(422, 'too_long', `찾는 말은 ${LIMITS.queryChars}자까지예요`, { max: LIMITS.queryChars });
      const offset = q.get('cursor') ? Number(Buffer.from(q.get('cursor')!, 'base64url').toString()) : 0;
      if (!Number.isInteger(offset) || offset < 0) throw invalid('cursor', '다음 쪽 표시가 틀려요');
      const like = `%${text.replace(/[\\%_]/g, c => `\\${c}`)}%`;
      const rows = await sql<Row[]>`${SELECT(sql, s.id)}
        where ${sql.unsafe(OPEN)} and not coalesce(${sql.unsafe(HIDDEN)}, false)
          and (${kinds.length === 0} or n.kind = any(${kinds}::text[]))
          and (${fieldIds.length === 0} or exists (select 1 from notice_fields nf where nf.notice_id = n.id and nf.field_id = any(${fieldIds}::text[])))
          and (${text === ''} or n.search_text like ${like})
        order by ${sort === 'new' ? sql.unsafe(`n.posted_on desc, ${NO} desc`) : sql.unsafe(`(n.deadline is null), n.closes_on, n.posted_on desc, ${NO} desc`)}
        limit ${LIMITS.pageSize + 1} offset ${offset}`;
      const items = await cards(sql, rows.slice(0, LIMITS.pageSize));
      let empty: string | null = null;
      if (!items.length && offset === 0) {
        const [o] = await sql<{ n: number }[]>`select count(*)::int as n from notices n where ${sql.unsafe(OPEN)}`;
        empty = o.n ? 'no_match' : 'no_open_notices';
      }
      const next = rows.length > LIMITS.pageSize ? Buffer.from(String(offset + LIMITS.pageSize)).toString('base64url') : null;
      return { body: { items, next, empty }, headers: s.headers };
    }],
    ['GET', '/api/notices/:id', async req => {
      const s = await requireStudent(ctx, req);
      const r = await one(s.id, req.params.id);
      const [n] = r ? await sql<{ is_notice: boolean }[]>`select is_notice from notices where id = ${r.id}` : [];
      if (!r || (!n.is_notice && !r.a_kind)) throw new HttpError(404, 'not_found', '찾을 수 없는 공지예요');
      return { body: (await cards(sql, [r]))[0], headers: s.headers };
    }],
    ['PUT', '/api/notices/:id/action', async req => {
      const s = await requireStudent(ctx, req);
      await requireConsent(ctx, s.id);
      const r = await one(s.id, req.params.id);
      if (!r) throw new HttpError(404, 'not_found', '찾을 수 없는 공지예요');
      const b = req.body as Record<string, unknown>;
      if (!['like', 'later', 'dislike'].includes(String(b.kind))) throw invalid('kind', '행동은 like·later·dislike 중 하나예요');
      if (!r.open) throw invalid('kind', '닫히거나 내려간 공지에는 새 행동을 남기지 않아요');
      let revisit: string | null = null;
      if (b.kind === 'later') {
        if (typeof b.revisitOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.revisitOn)) throw invalid('revisitOn', '다시 볼 날을 보내 주세요');
        const [ok] = await sql<{ ok: boolean }[]>`select (${b.revisitOn}::date > ${sql.unsafe(TODAY)} and ${b.revisitOn}::date <= ${r.closes_on}::date) as ok`;
        if (!ok.ok) throw invalid('revisitOn', '다시 볼 날은 내일부터 닫히는 날까지예요');
        revisit = b.revisitOn;
      } else if (b.revisitOn !== undefined && b.revisitOn !== null) throw invalid('revisitOn', '다시 볼 날은 나중에 보기에만 있어요');
      const reason = b.reason ?? null;
      if (reason !== null && (b.kind !== 'dislike' || !REASONS.includes(String(reason)))) throw invalid('reason', '이유는 관심 없음에만, time·field·done·hard 중 하나예요');
      await sql`insert into actions (student_id, notice_id, kind, revisit_on, reason) values (${s.id}, ${r.id}, ${b.kind as string}, ${revisit}, ${reason as string | null})
        on conflict (student_id, notice_id) do update set kind = excluded.kind, revisit_on = excluded.revisit_on, reason = excluded.reason, at = now()`;
      const card = (await cards(sql, [await one(s.id, r.id)]))[0];
      const suggestActivity = reason === 'done'
        ? { name: r.title.slice(0, LIMITS.activityNameChars), term: termOf(new Date()), kind: r.kind, fieldIds: card.fields?.core.map(f => f.id) ?? [] }
        : null;
      return { body: { action: card.action, suggestActivity }, headers: s.headers };
    }],
    ['DELETE', '/api/notices/:id/action', async req => {
      const s = await requireStudent(ctx, req);
      await sql`delete from actions where student_id = ${s.id} and notice_id = ${req.params.id}`;
      return { status: 204, headers: s.headers };
    }],
    ['GET', '/api/me/list', async req => {
      const s = await requireStudent(ctx, req);
      const rows = await sql<(Row & { due: boolean })[]>`
        select x.*, (x.a_kind = 'later' and x.a_revisit::date <= ${sql.unsafe(TODAY)}) as due from (${SELECT(sql, s.id)}) x
        where x.a_kind in ('like', 'later') order by x.a_at desc`;
      const list = await cards(sql, rows);
      return {
        body: { items: list.map((notice, i) => ({ notice, flags: [rows[i].due && 'revisit_due', rows[i].closed && 'closed', rows[i].gone && 'down'].filter(Boolean) })) },
        headers: s.headers
      };
    }]
  ];
}
