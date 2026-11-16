import type { CourseWorld, Plan } from '../../domain/courses/plan';
import { TERMS, termLabel, type CourseState, type CsrGroup, type FieldDef, type Term } from '../../domain/courses/types';
import { CSR_GROUP_LABEL } from '../../data/courses/csrankings';

// 교과 지도: 가로 = 학기 8칸, 세로 = 지도 줄(CSRankings 묶음 이름 줄 포함), 점 = 과목, 선 = 선수 관계(plan.md '지도 모양').

export type DotState = 'taken' | 'now' | 'open' | 'closed';
/** row: 점이 놓인 줄 이름(접근 이름에 쓴다) */
export type MapDot = { code: string; name: string; row: string; term: Term | null; state: DotState; dim: boolean };
export type MapLine = { kind: 'group'; id: CsrGroup; label: string } | { kind: 'row'; field: FieldDef; dots: MapDot[] };
export type MapShape = {
  cols: { id: Term; label: string; now: boolean }[];
  lines: MapLine[];
  /** 방향을 골랐을 때 밝은 과목이 하나도 안 그려져 접힌 줄 */
  folded: FieldDef[];
  /** 학기 칸이 없는 경험 층 */
  experience: MapDot[];
  /** 들었다고 표시한 로드맵 밖 과목(다시 열고 취소할 자리) */
  outside: MapDot[];
  links: { from: string; to: string }[];
  /** 그려진 과목 전부(목록 줄이 서랍 대신 점을 찾아 갈지 정한다) */
  drawn: Set<string>;
};

export const STATE_LABEL: Record<DotState, string> = { taken: '들음', now: '지금 들을 만함', open: '들을 수 있음', closed: '최근 안 열림' };
export const OUTSIDE_LABEL = '로드맵 밖';

/**
 * 지도 모양. 안 들은 최근 안 열린 과목은 showClosed 일 때만 그린다(들은 과목은 늘).
 * 선: 방향을 골랐으면 그려진 밝은 과목끼리, 그리고 서랍으로 연 과목(selected)의 앞뒤. 둘 다 학기 칸에 그려진 과목끼리, 학기 순서대로일 때만
 * (로드맵과 거꾸로인 선수 관계, 예: 강화학습개론 3-2 ← 기계학습원론 4-1 은 서랍과 목록에서만 보인다).
 */
export function mapShape(w: CourseWorld, s: CourseState, plan: Plan, showClosed: boolean, selected?: string): MapShape {
  const taken = new Set(s.taken);
  const now = new Set(plan.items.filter(i => i.group === 'now').map(i => i.code));
  const lit = plan.lit;
  const dim = (code: string) => !!lit && !lit.has(code);
  const dots: (MapDot & { field: FieldDef })[] = [];
  for (const p of w.major.placements) {
    const c = w.course.get(p.code);
    const field = w.major.fields.find(f => f.id === p.field);
    if (!c || !field) continue;
    const state: DotState = taken.has(c.code) ? 'taken' : !c.offered ? 'closed' : now.has(c.code) ? 'now' : 'open';
    if (state === 'closed' && !showClosed) continue;
    dots.push({ code: c.code, name: c.name, row: field.label, field, term: p.term, state, dim: dim(c.code) });
  }

  const lines: MapLine[] = [];
  const folded: FieldDef[] = [];
  let group: CsrGroup | undefined;
  for (const f of w.major.fields) {
    if (f.layer === 'experience') continue;
    const row = dots.filter(d => d.field === f);
    if (!row.length) continue;
    if (lit && !row.some(d => !d.dim)) { folded.push(f); continue; }
    if (f.group && f.group !== group) lines.push({ kind: 'group', id: f.group, label: CSR_GROUP_LABEL[f.group] });
    group = f.group;
    lines.push({ kind: 'row', field: f, dots: row });
  }

  const experience = dots.filter(d => d.field.layer === 'experience');
  const outside = s.taken.filter(c => !w.place.has(c) && w.course.has(c))
    .map((c): MapDot => ({ code: c, name: w.course.get(c)!.name, row: OUTSIDE_LABEL, term: null, state: 'taken', dim: dim(c) }));
  const drawn = new Set([...lines.flatMap(l => (l.kind === 'row' ? l.dots : [])), ...experience, ...outside].map(d => d.code));
  const col = (c: string) => { const t = w.place.get(c)?.term; return t ? TERMS.indexOf(t) : -1; };
  const forward = (p: { from: string; to: string }) => col(p.from) >= 0 && col(p.from) <= col(p.to);
  const links = w.major.prereqs.filter(p => drawn.has(p.from) && drawn.has(p.to) && forward(p) && ((lit && lit.has(p.from) && lit.has(p.to)) || p.from === selected || p.to === selected));

  return { cols: TERMS.map(t => ({ id: t, label: termLabel(t), now: t === s.term })), lines, folded, experience, outside, links, drawn };
}
