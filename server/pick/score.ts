// 가장 추천의 규칙 점수(research R8, FR-033b). 순수 함수: 같은 자료면 늘 같은 점수와 순서다
export type Cand = {
  id: string; no: number; kind: string | null; core: string[] | null; related: string[]; // core가 null이면 분야가 붙지 않은 공지
  vector: number[] | null; deadline: string | null; closesOn: string; postedOn: string;
};
export type Goal = 'job' | 'grad' | 'startup' | 'unsure';
export type Profile = {
  grade: number; goal: Goal; picked: Set<string>; liked: Set<string>; disliked: Set<string>; vector: number[] | null; today: string;
};
/** 맞은 조건. 같은 점수면 이 순서로 규칙 문장을 잇는다 */
export const CONDS = ['picked', 'liked', 'related', 'goal', 'vector', 'soon'] as const;
export type Cond = (typeof CONDS)[number];
export type Scored = { cand: Cand; score: number; met: { cond: Cond; points: number }[] };

/** 진로 목표에 맞는 종류(FR-033 표). 채용은 3학년 이상만 */
const GOAL_KINDS: Record<Goal, string[]> = {
  job: ['job', 'edu', 'lecture', 'hackathon'], grad: ['lecture', 'scholarship', 'course', 'contest', 'global'],
  startup: ['contest', 'hackathon', 'edu', 'mentoring'], unsure: []
};

export const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const unit = (v: number[]) => { const n = Math.hypot(...v); return n ? v.map(x => x / n) : null; };
export const cosine = (a: number[], b: number[]) => {
  const [ua, ub] = [unit(a), unit(b)];
  return ua && ub ? ua.reduce((s, x, i) => s + x * (ub[i] ?? 0), 0) : 0;
};

/** 학생 벡터: 있는 묶음(프롬프트, 관심 있어요 공지 평균, 고른 분야 평균)을 저마다 길이 1로 맞춰 평균한다. 없으면 null */
export function studentVector(groups: number[][][]): number[] | null {
  const units = groups.filter(g => g.length).map(g => unit(g[0].map((_, i) => g.reduce((s, v) => s + v[i], 0) / g.length))).filter(u => u !== null);
  if (!units.length) return null;
  return units[0].map((_, i) => units.reduce((s, u) => s + u[i], 0) / units.length);
}

export function scoreOne(c: Cand, p: Profile): Scored {
  const met: Scored['met'] = [];
  let score = 0;
  if (c.core) {
    if (c.core.some(f => p.picked.has(f))) met.push({ cond: 'picked', points: 40 });
    else if (c.core.some(f => p.liked.has(f))) met.push({ cond: 'liked', points: 40 });
    else if (c.related.some(f => p.picked.has(f) || p.liked.has(f))) met.push({ cond: 'related', points: 20 });
    if (c.core.some(f => p.disliked.has(f))) score -= 60;
  }
  if (c.kind && GOAL_KINDS[p.goal].includes(c.kind) && (c.kind !== 'job' || p.grade >= 3)) met.push({ cond: 'goal', points: 20 });
  if (c.vector && p.vector) {
    const pts = Math.round((20 * Math.max(0, cosine(c.vector, p.vector) - 0.3)) / 0.7);
    if (pts > 0) met.push({ cond: 'vector', points: pts });
  }
  if (c.deadline) {
    const d = days(p.today, c.deadline);
    const pts = d >= 0 && d <= 14 ? Math.round((10 * (14 - d)) / 14) : 0;
    if (pts > 0) met.push({ cond: 'soon', points: pts });
  }
  return { cand: c, score: score + met.reduce((s, m) => s + m.points, 0), met };
}

/** 점수 큰 순, 같으면 닫히는 날 가까운 순 → 게시 최근 순 → 글 번호 큰 순 */
export function rank(cands: Cand[], p: Profile): Scored[] {
  return cands.map(c => scoreOne(c, p)).sort((a, b) =>
    b.score - a.score || a.cand.closesOn.localeCompare(b.cand.closesOn) || b.cand.postedOn.localeCompare(a.cand.postedOn) || b.cand.no - a.cand.no);
}
