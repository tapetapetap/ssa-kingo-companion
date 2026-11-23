// 나의 분석의 줄과 md(research R10, FR-029~032). 순수 함수: 같은 재료면 늘 같은 글이다
import { KIND_LABEL } from '../../etl/notices/classify.ts';

export type Section = 'done' | 'interest' | 'flow';
export type Line = { key: string; section: Section; text: string; source: string; proof: string | null; refs?: string[] };
export type Flow = { key: string; text: string; refs: string[] };
export type Activity = { id: number; name: string; term: string; kind: string; fieldNames: string[]; proofUrl: string | null };
export type Act = { kind: string; reason: string | null; at: string; core: string[] }; // at은 한국 날짜, core는 분야가 붙은 공지의 핵심 분야
export type Material = {
  answers: { grade: number; term: number; goal: string } | null; picked: string[]; activities: Activity[];
  actions: Act[]; fieldName: (id: string) => string | undefined; fieldOrder: string[]; today: string;
};

const GOAL: Record<string, string> = { job: '취업', grad: '대학원', startup: '창업', unsure: '아직 모름' };
/** 빼지 못하는 줄: 직접 넣은 활동, 처음 답, 고른 분야(FR-032c) */
export const notExcludable = (key: string) => key === 'ans' || key === 'picked' || key.startsWith('act:');

/** 이번 학기의 첫날: 3~8월은 그해 3월 1일, 9~12월은 그해 9월 1일, 1~2월은 앞 해 9월 1일 */
export function termStart(today: string): string {
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  return m >= 3 && m <= 8 ? `${y}-03-01` : `${m <= 2 ? y - 1 : y}-09-01`;
}
const minus = (d: string, n: number) => new Date(Date.parse(d) - n * 86_400_000).toISOString().slice(0, 10);

/** 몰린 분야(FR-031): 관심 있어요는 최근 30일 안 2번, 관심 없음은 이유 field·hard로 이번 학기 안 2번. 분야 목록 순서로 */
export function clusters(m: Pick<Material, 'actions' | 'today' | 'fieldOrder'>): { liked: string[]; disliked: string[] } {
  const count = (pick: (a: Act) => boolean) => {
    const n = new Map<string, number>();
    for (const a of m.actions.filter(pick)) for (const f of new Set(a.core)) n.set(f, (n.get(f) ?? 0) + 1);
    return m.fieldOrder.filter(f => (n.get(f) ?? 0) >= 2);
  };
  const from30 = minus(m.today, 30);
  const term = termStart(m.today);
  return {
    liked: count(a => a.kind === 'like' && a.at > from30 && a.at <= m.today),
    disliked: count(a => a.kind === 'dislike' && (a.reason === 'field' || a.reason === 'hard') && a.at >= term && a.at <= m.today)
  };
}

/** 사실 줄(뺀 줄도 들어 있다. md와 LLM은 뺀 줄을 거른다) */
export function factLines(m: Material): Line[] {
  const acts = [...m.activities].sort((a, b) => b.term.localeCompare(a.term) || a.id - b.id).map((a): Line => ({
    key: `act:${a.id}`, section: 'done', source: '직접 입력', proof: a.proofUrl ? '증빙 링크' : '증빙 없음',
    text: [a.term, a.name, (KIND_LABEL as Record<string, string>)[a.kind] ?? a.kind, ...(a.fieldNames.length ? [a.fieldNames.join(', ')] : [])].join(' · ')
  }));
  const out: Line[] = [...acts];
  if (m.answers) {
    const g = m.answers.grade >= 4 ? '4학년 이상' : `${m.answers.grade}학년`;
    out.push({ key: 'ans', section: 'interest', text: `처음 답: ${g} ${m.answers.term}학기, ${GOAL[m.answers.goal] ?? m.answers.goal}`, source: '처음 질문', proof: null });
  }
  if (m.picked.length) out.push({ key: 'picked', section: 'interest', text: `고른 분야: ${m.picked.map(m.fieldName).join(', ')}`, source: '분야 고르기', proof: null });
  const c = clusters(m);
  for (const f of c.liked) out.push({ key: `liked:${f}`, section: 'interest', text: `관심 있어요가 몰린 분야: ${m.fieldName(f)}`, source: '앱 기록', proof: null });
  for (const f of c.disliked) out.push({ key: `disliked:${f}`, section: 'interest', text: `관심 없음이 몰린 분야: ${m.fieldName(f)}`, source: '앱 기록', proof: null });
  return out;
}

export const flowKey = (refs: string[]) => `flow:${[...refs].sort().join('+')}`;

/** 보이는 줄: 뺀 줄을 거르고, 흐름은 지금 보이는 사실 줄만 가리키는 것만 둔다 */
export function visible(facts: Line[], flow: Flow[], excluded: Set<string>): Line[] {
  const shown = facts.filter(l => !excluded.has(l.key));
  const keys = new Set(shown.map(l => l.key));
  const fl = flow.filter(f => !excluded.has(f.key) && f.refs.every(r => keys.has(r)))
    .map((f): Line => ({ key: f.key, section: 'flow', text: f.text, source: '컴패니언', proof: null, refs: f.refs }));
  return [...shown, ...fl];
}

export function toMd(lines: Line[]): string {
  const part = (title: string, s: Section) => {
    const ls = lines.filter(l => l.section === s);
    return [`## ${title}`, ...(ls.length ? ls.map(l => `- ${l.text} (${[l.source, ...(l.proof ? [l.proof] : [])].join(', ')})`) : ['- 아직 없어요.'])].join('\n');
  };
  return ['# 나의 분석', part('해 온 활동', 'done'), part('관심 분야', 'interest'), part('컴패니언이 본 흐름', 'flow')].join('\n\n') + '\n';
}
