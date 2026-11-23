// 가장 추천 하나 고르기(FR-033·035·036): 규칙으로 후보 10개 → 모델이 있으면 LLM이 하나 → 답 검사에 걸리면 규칙 1위. 결과는 picks에 둔다
import type { Sql } from '../db/sql.ts';
import { LIMITS } from '../limits.ts';
import type { Model } from '../model.ts';
import { readAnalysis } from '../analysis/store.ts';
import { loadCands, loadStudent } from './candidates.ts';
import { checkPick, PICK_SYSTEM, PICK_VERSION, pickMaterial, pickSchema, type Line } from './llm.ts';
import { ruleReason } from './reason.ts';
import { rank } from './score.ts';

export type PickResult = { noticeId: string; method: string } | null;

/** 나의 분석 줄(뺀 줄 제외, 흐름 포함)과 판. 꺼져 있으면 null(FR-034) */
export type Analysis = { version: number; lines: Line[] } | null;
export type AnalysisOf = (sql: Sql, student: number) => Promise<Analysis>;

/** takenAt: 일꾼이 줄에서 행을 집은 때의 queued_at. 그 뒤에 홈이 바로 바꾼 가장 추천은 덮지 않는다 */
export async function choosePick(sql: Sql, student: number, model: Model | null, analysisOf: AnalysisOf = readAnalysis, takenAt?: string): Promise<PickResult> {
  const st = await loadStudent(sql, student);
  if (!st) return null;
  const analysis = await analysisOf(sql, student);
  // 몰린 분야(R8): 관심 있어요가 몰린 분야는 고른 분야처럼, 관심 없음이 몰린 분야는 뒤로
  for (const l of analysis?.lines ?? []) {
    if (l.key.startsWith('liked:')) st.profile.liked.add(l.key.slice(6));
    if (l.key.startsWith('disliked:')) st.profile.disliked.add(l.key.slice(9));
  }
  const top = rank(await loadCands(sql, student), st.profile).slice(0, LIMITS.candidates);
  if (!top.length) {
    await sql`delete from picks where student_id = ${student}`;
    return null;
  }
  let chosen = top[0];
  let reason = ruleReason(chosen);
  let cited: (Line | { key: 'prompt' })[] = [];
  let method = 'rule';
  let promptVersion: string | null = null;
  if (model) {
    const ids = top.map(s => s.cand.id);
    const meta = await sql<{ id: string; title: string; host: string | null }[]>`select id, title, host from notices where id = any(${ids})`;
    const names = await sql<{ notice_id: string; name: string }[]>`
      select nf.notice_id, f.name from notice_fields nf join fields f on f.id = nf.field_id join taxonomies t on t.id = f.taxonomy_id and t.active
      where nf.notice_id = any(${ids}) and nf.level = 'core' order by nf.ord`;
    const cands = top.map(s => {
      const m = meta.find(x => x.id === s.cand.id)!;
      return { title: m.title, host: m.host, kind: s.cand.kind, deadline: s.cand.deadline, coreNames: s.cand.core ? names.filter(n => n.notice_id === s.cand.id).map(n => n.name) : [] };
    });
    const lines = analysis?.lines ?? null;
    const user = pickMaterial({ cands, grade: st.profile.grade, term: st.term, goal: st.profile.goal, pickedNames: st.pickedNames, prompt: st.prompt, lines });
    const out = await model.chat(PICK_SYSTEM, user, pickSchema(top.length));
    const ok = typeof out === 'string' ? null : checkPick(out.text, top.length, (lines ?? []).map(l => l.key), !!st.prompt);
    if (ok) {
      chosen = top[ok.index];
      reason = ok.reason;
      cited = ok.cited.map(k => (k === 'prompt' ? { key: 'prompt' as const } : lines!.find(l => l.key === k)!));
      method = `llm:${model.name}`;
      promptVersion = PICK_VERSION;
    }
  }
  await sql`insert into picks (student_id, notice_id, reason, cited, analysis_version, method, prompt_version)
    values (${student}, ${chosen.cand.id}, ${reason}, ${sql.json(cited)}, ${analysis?.version ?? null}, ${method}, ${promptVersion})
    on conflict (student_id) do update set notice_id = excluded.notice_id, reason = excluded.reason, cited = excluded.cited,
      analysis_version = excluded.analysis_version, method = excluded.method, prompt_version = excluded.prompt_version, computed_at = now()
    where picks.computed_at <= coalesce((${takenAt ?? null}::text)::timestamptz, 'infinity')`;
  return { noticeId: chosen.cand.id, method };
}
