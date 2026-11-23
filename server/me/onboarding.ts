// 동의·처음 질문·분야 고르기·다음 할 일(US2, FR-015~018, research R23)
import { readFileSync } from 'node:fs';
import type { Ctx } from '../app.ts';
import { requireStudent } from '../auth/login.ts';
import { HttpError, kstIso, type Route } from '../http.ts';
import { LIMITS } from '../limits.ts';
import { enqueue } from '../pick/queue.ts';

export type Consent = { version: string; text: string };

/** 문구 파일: 첫 줄이 'version: <판>'이고 나머지가 글이다 */
export function readConsent(file: string): Consent {
  const [first = '', ...rest] = readFileSync(file, 'utf8').split('\n');
  const m = /^version:\s*(\S+)\s*$/.exec(first);
  if (!m) throw new Error(`동의 문구 파일의 첫 줄이 'version: <판>'이 아니에요: ${file}`);
  return { version: m[1], text: rest.join('\n').trim() };
}

const GOALS = ['job', 'grad', 'startup', 'unsure'] as const;
const invalid = (field: string, message: string) => new HttpError(422, 'invalid', message, { field });

/** 지금 판 문구에 동의했는가. 아니면 학생 자료를 받지 않는다(FR-015) */
export async function requireConsent(ctx: Ctx, id: number) {
  const [c] = await ctx.sql`select 1 from consents where student_id = ${id} and text_version = ${ctx.consent.version}`;
  if (!c) throw new HttpError(403, 'consent_required', '먼저 개인정보 동의가 필요해요');
}

/** 다음 할 일 하나(FR-018): 동의 → 처음 질문 → 분야 고르기(활성 목록에서 3개 미만) → 홈 */
export async function nextStep(ctx: Ctx, id: number): Promise<'consent' | 'answers' | 'fields' | 'home'> {
  const [r] = await ctx.sql<{ consent: boolean; answers: boolean; fields: number }[]>`
    select exists(select 1 from consents where student_id = ${id} and text_version = ${ctx.consent.version}) as consent,
           exists(select 1 from answers where student_id = ${id}) as answers,
           (select count(*)::int from student_fields sf join fields f on f.id = sf.field_id join taxonomies t on t.id = f.taxonomy_id and t.active where sf.student_id = ${id}) as fields`;
  return !r.consent ? 'consent' : !r.answers ? 'answers' : r.fields < LIMITS.minFields ? 'fields' : 'home';
}

export function onboardingRoutes(ctx: Ctx): Route[] {
  const sql = ctx.sql;
  const pickedIds = async (id: number) => (await sql<{ field_id: string }[]>`
    select sf.field_id from student_fields sf join fields f on f.id = sf.field_id join taxonomies t on t.id = f.taxonomy_id and t.active
    where sf.student_id = ${id} order by f.ord`).map(r => r.field_id);
  const answersOf = async (id: number) => {
    const [a] = await sql<{ grade: number; term: number; goal: string; answered_at: Date }[]>`select grade, term, goal, answered_at from answers where student_id = ${id}`;
    return a ? { grade: a.grade, term: a.term, goal: a.goal, answeredAt: kstIso(a.answered_at) } : null;
  };
  return [
    ['GET', '/api/consent', async req => ({ body: ctx.consent, headers: (await requireStudent(ctx, req)).headers })],
    ['POST', '/api/consent', async req => {
      const s = await requireStudent(ctx, req);
      if ((req.body as Record<string, unknown>).version !== ctx.consent.version) throw invalid('version', '지금 동의 문구의 판이 아니에요');
      await sql`insert into consents (student_id, text_version) values (${s.id}, ${ctx.consent.version})
        on conflict (student_id) do update set text_version = excluded.text_version, agreed_at = now()`;
      return { status: 204, headers: s.headers };
    }],
    ['GET', '/api/me/answers', async req => {
      const s = await requireStudent(ctx, req);
      const a = await answersOf(s.id);
      if (!a) throw new HttpError(404, 'not_found', '아직 답하지 않았어요');
      return { body: a, headers: s.headers };
    }],
    ['PUT', '/api/me/answers', async req => {
      const s = await requireStudent(ctx, req);
      await requireConsent(ctx, s.id);
      const b = req.body as Record<string, unknown>;
      if (!Number.isInteger(b.grade) || (b.grade as number) < 1 || (b.grade as number) > 4) throw invalid('grade', '학년은 1~4예요(4는 4학년 이상)');
      if (b.term !== 1 && b.term !== 2) throw invalid('term', '학기는 1이나 2예요');
      if (!(GOALS as readonly unknown[]).includes(b.goal)) throw invalid('goal', '진로 목표는 job·grad·startup·unsure 중 하나예요');
      await sql`insert into answers (student_id, grade, term, goal) values (${s.id}, ${b.grade as number}, ${b.term}, ${b.goal as string})
        on conflict (student_id) do update set grade = excluded.grade, term = excluded.term, goal = excluded.goal, answered_at = now()`;
      await enqueue(sql, s.id, 'answers');
      return { body: await answersOf(s.id), headers: s.headers };
    }],
    ['GET', '/api/fields', async req => {
      const s = await requireStudent(ctx, req);
      const [t] = await sql<{ id: string; name: string; edition: string }[]>`select id, name, edition from taxonomies where active`;
      if (!t) throw new HttpError(404, 'not_found', '아직 분야 목록이 없어요');
      const groups = await sql`select id, name, parent_id as parent from field_groups where taxonomy_id = ${t.id} order by ord`;
      const fields = await sql`select id, name, group_id as group, description as desc from fields where taxonomy_id = ${t.id} order by ord`;
      return { body: { taxonomy: t, groups: [...groups], fields: [...fields] }, headers: s.headers };
    }],
    ['GET', '/api/me/fields', async req => {
      const s = await requireStudent(ctx, req);
      return { body: { ids: await pickedIds(s.id) }, headers: s.headers };
    }],
    ['PUT', '/api/me/fields', async req => {
      const s = await requireStudent(ctx, req);
      await requireConsent(ctx, s.id);
      const ids = (req.body as Record<string, unknown>).ids;
      if (!Array.isArray(ids) || !ids.every(x => typeof x === 'string')) throw invalid('ids', '분야 id 목록을 보내 주세요');
      if (new Set(ids).size !== ids.length) throw invalid('ids', '같은 분야가 두 번 있어요');
      if (ids.length < LIMITS.minFields) throw new HttpError(422, 'too_few_fields', `분야를 ${LIMITS.minFields}개 이상 골라 주세요`);
      const known = await sql<{ id: string }[]>`select f.id from fields f join taxonomies t on t.id = f.taxonomy_id and t.active where f.id = any(${ids as string[]})`;
      if (known.length !== ids.length) throw invalid('ids', '목록에 없는 분야가 있어요');
      await sql.begin(async tx => {
        await tx`delete from student_fields where student_id = ${s.id}`;
        for (const f of ids as string[]) await tx`insert into student_fields (student_id, field_id) values (${s.id}, ${f})`;
      });
      await enqueue(sql, s.id, 'fields');
      return { body: { ids: await pickedIds(s.id) }, headers: s.headers };
    }]
  ];
}
