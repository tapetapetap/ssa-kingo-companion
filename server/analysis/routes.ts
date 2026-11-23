// 나에 대한 프롬프트·나의 분석·직접 넣은 활동(US5, contracts/api.md '나에 대한 프롬프트와 나의 분석')
import type { Ctx } from '../app.ts';
import { requireStudent } from '../auth/login.ts';
import { HttpError, kstIso, type Route } from '../http.ts';
import { KINDS } from '../ingest/check.ts';
import { LIMITS } from '../limits.ts';
import { requireConsent } from '../me/onboarding.ts';
import { enqueue } from '../pick/queue.ts';
import { notExcludable, visible } from './lines.ts';
import { excludedOf, rebuild, stored } from './store.ts';

const invalid = (field: string, message: string) => new HttpError(422, 'invalid', message, { field });
const tooLong = (field: string, max: number) => new HttpError(422, 'too_long', `${max}자까지예요`, { field, max });
const off = () => new HttpError(409, 'analysis_off', '나의 분석을 꺼 두었어요');

type ActRow = { id: string; name: string; term: string; kind: string; field_ids: string[]; proof_url: string | null; created_at: Date; updated_at: Date };
const activity = (a: ActRow) => ({ id: Number(a.id), name: a.name, term: a.term, kind: a.kind, fieldIds: a.field_ids, proofUrl: a.proof_url, createdAt: kstIso(a.created_at), updatedAt: kstIso(a.updated_at) });

export function analysisRoutes(ctx: Ctx): Route[] {
  const sql = ctx.sql;
  const isOff = async (id: number) => (await sql<{ o: boolean }[]>`select analysis_off as o from students where id = ${id}`)[0].o;
  const promptOf = async (id: number) => {
    const [p] = await sql<{ body: string; updated_at: Date }[]>`select body, updated_at from prompts where student_id = ${id}`;
    return { body: p?.body ?? '', updatedAt: p ? kstIso(p.updated_at) : null };
  };

  /** 활동 본문 검사. partial이면 보낸 칸만 본다 */
  const checkActivity = async (b: Record<string, unknown>, partial: boolean) => {
    const has = (k: string) => !partial || b[k] !== undefined;
    if (has('name')) {
      if (typeof b.name !== 'string' || !b.name.trim()) throw invalid('name', '이름을 적어 주세요');
      if (b.name.length > LIMITS.activityNameChars) throw tooLong('name', LIMITS.activityNameChars);
    }
    if (has('term') && (typeof b.term !== 'string' || !/^\d{4}-[12]$/.test(b.term))) throw invalid('term', '학기는 2025-2 꼴이에요');
    if (has('kind') && !(KINDS as readonly unknown[]).includes(b.kind)) throw invalid('kind', '모르는 종류예요');
    if (has('fieldIds')) {
      const ids = b.fieldIds;
      if (!Array.isArray(ids) || !ids.every(x => typeof x === 'string') || ids.length > 2 || new Set(ids).size !== ids.length) throw invalid('fieldIds', '분야는 2개까지예요');
      const known = ids.length ? await sql`select f.id from fields f join taxonomies t on t.id = f.taxonomy_id and t.active where f.id = any(${ids as string[]})` : [];
      if (known.length !== ids.length) throw invalid('fieldIds', '목록에 없는 분야가 있어요');
    }
    if (b.proofUrl !== undefined && b.proofUrl !== null) {
      if (typeof b.proofUrl !== 'string' || !/^https?:\/\//.test(b.proofUrl)) throw invalid('proofUrl', '증빙 주소는 http:// 나 https://로 시작해요');
      if (b.proofUrl.length > LIMITS.proofUrlChars) throw tooLong('proofUrl', LIMITS.proofUrlChars);
    }
  };
  const mine = async (student: number, id: string) => {
    if (!/^\d+$/.test(id)) throw new HttpError(404, 'not_found', '찾을 수 없는 활동이에요');
    const [a] = await sql<ActRow[]>`select * from activities where id = ${id} and student_id = ${student}`;
    if (!a) throw new HttpError(404, 'not_found', '찾을 수 없는 활동이에요');
    return a;
  };

  return [
    ['GET', '/api/me/prompt', async req => {
      const s = await requireStudent(ctx, req);
      return { body: await promptOf(s.id), headers: s.headers };
    }],
    ['PUT', '/api/me/prompt', async req => {
      const s = await requireStudent(ctx, req);
      await requireConsent(ctx, s.id);
      const body = (req.body as Record<string, unknown>).body;
      if (typeof body !== 'string') throw invalid('body', '글을 보내 주세요');
      if (body.length > LIMITS.promptChars) throw tooLong('body', LIMITS.promptChars);
      // 모델은 부르지 않는다. 벡터를 비우고 다시 고르기 일꾼이 그 학생 차례에 만든다(research R9)
      await sql`insert into prompts (student_id, body) values (${s.id}, ${body})
        on conflict (student_id) do update set body = excluded.body, vector = null, updated_at = now()`;
      await enqueue(sql, s.id, 'prompt');
      return { body: await promptOf(s.id), headers: s.headers };
    }],
    ['DELETE', '/api/me/prompt', async req => {
      const s = await requireStudent(ctx, req);
      await sql`delete from prompts where student_id = ${s.id}`;
      await enqueue(sql, s.id, 'prompt');
      return { status: 204, headers: s.headers };
    }],
    ['GET', '/api/me/analysis', async req => {
      const s = await requireStudent(ctx, req);
      if (await isOff(s.id)) return { body: { off: true }, headers: s.headers };
      const a = (await stored(sql, s.id)) ?? (await rebuild(sql, s.id))!;
      const excluded = await excludedOf(sql, s.id);
      return {
        body: { off: false, version: a.version, madeAt: kstIso(a.made_at), md: a.md, lines: visible(a.lines, a.flow, excluded), excluded: [...excluded].map(key => ({ key })) },
        headers: s.headers
      };
    }],
    ['GET', '/api/me/analysis.md', async req => {
      const s = await requireStudent(ctx, req);
      if (await isOff(s.id)) throw off();
      const a = (await stored(sql, s.id)) ?? (await rebuild(sql, s.id))!;
      return { body: a.md, headers: { ...s.headers, 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': 'attachment; filename="analysis.md"' } };
    }],
    ['PUT', '/api/me/analysis/excluded/:key', async req => {
      const s = await requireStudent(ctx, req);
      await requireConsent(ctx, s.id);
      if (await isOff(s.id)) throw off();
      const key = req.params.key;
      if (notExcludable(key)) throw invalid('key', '직접 넣은 활동·처음 답·고른 분야 줄은 빼지 않아요');
      const a = (await stored(sql, s.id)) ?? (await rebuild(sql, s.id))!;
      if (!visible(a.lines, a.flow, new Set()).some(l => l.key === key)) throw new HttpError(404, 'not_found', '지금 분석에 없는 줄이에요');
      await sql`insert into excluded_lines (student_id, line_key) values (${s.id}, ${key}) on conflict do nothing`;
      await rebuild(sql, s.id);
      return { status: 204, headers: s.headers };
    }],
    ['DELETE', '/api/me/analysis/excluded/:key', async req => {
      const s = await requireStudent(ctx, req);
      if (await isOff(s.id)) throw off();
      await sql`delete from excluded_lines where student_id = ${s.id} and line_key = ${req.params.key}`;
      await rebuild(sql, s.id);
      return { status: 204, headers: s.headers };
    }],
    ['PUT', '/api/me/analysis/off', async req => {
      const s = await requireStudent(ctx, req);
      await requireConsent(ctx, s.id);
      const o = (req.body as Record<string, unknown>).off;
      if (typeof o !== 'boolean') throw invalid('off', 'off는 true나 false예요');
      await sql`update students set analysis_off = ${o} where id = ${s.id}`;
      if (o) {
        await sql`delete from analyses where student_id = ${s.id}`;
        await sql`delete from excluded_lines where student_id = ${s.id}`;
        await enqueue(sql, s.id, 'analysis');
      } else await rebuild(sql, s.id);
      return { status: 204, headers: s.headers };
    }],
    ['GET', '/api/me/activities', async req => {
      const s = await requireStudent(ctx, req);
      const rows = await sql<ActRow[]>`select * from activities where student_id = ${s.id} order by term desc, id`;
      return { body: { items: rows.map(activity) }, headers: s.headers };
    }],
    ['POST', '/api/me/activities', async req => {
      const s = await requireStudent(ctx, req);
      await requireConsent(ctx, s.id);
      const b = req.body as Record<string, unknown>;
      await checkActivity(b, false);
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int n from activities where student_id = ${s.id}`;
      if (n >= LIMITS.activityCount) throw new HttpError(422, 'limit_reached', `활동은 ${LIMITS.activityCount}개까지예요`, { max: LIMITS.activityCount });
      const [a] = await sql<ActRow[]>`insert into activities (student_id, name, term, kind, field_ids, proof_url)
        values (${s.id}, ${(b.name as string).trim()}, ${b.term as string}, ${b.kind as string}, ${b.fieldIds as string[]}, ${(b.proofUrl as string | undefined) ?? null}) returning *`;
      await rebuild(sql, s.id);
      return { status: 201, body: activity(a), headers: s.headers };
    }],
    ['PATCH', '/api/me/activities/:id', async req => {
      const s = await requireStudent(ctx, req);
      await requireConsent(ctx, s.id);
      const old = await mine(s.id, req.params.id);
      const b = req.body as Record<string, unknown>;
      await checkActivity(b, true);
      const v = <T>(k: string, prev: T) => (b[k] === undefined ? prev : (b[k] as T));
      const [a] = await sql<ActRow[]>`update activities set name = ${v('name', old.name).trim()}, term = ${v('term', old.term)}, kind = ${v('kind', old.kind)},
        field_ids = ${v('fieldIds', old.field_ids)}, proof_url = ${v('proofUrl', old.proof_url)}, updated_at = now() where id = ${old.id} returning *`;
      await rebuild(sql, s.id);
      return { body: activity(a), headers: s.headers };
    }],
    ['DELETE', '/api/me/activities/:id', async req => {
      const s = await requireStudent(ctx, req);
      const a = await mine(s.id, req.params.id);
      await sql`delete from activities where id = ${a.id}`;
      await rebuild(sql, s.id);
      return { status: 204, headers: s.headers };
    }]
  ];
}
