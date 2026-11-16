import { isCore, KIND_LABEL, nextTerm, TERMS, termLabel, type Course, type CourseState, type Direction, type Lab, type Major, type Placement } from './types';

/** 지도·목록·서랍이 함께 쓰는 찾기 표. 데이터마다 한 번 만든다. */
export type CourseWorld = {
  major: Major;
  course: Map<string, Course>;
  place: Map<string, Placement>;
  lab: Map<string, Lab>;
  directions: Direction[];
  /** 과목 → 먼저 들을 과목 */
  before: Map<string, string[]>;
  /** 과목 → 이 과목을 먼저 들을 과목으로 두는 과목 */
  after: Map<string, string[]>;
};

const push = (m: Map<string, string[]>, k: string, v: string) => m.set(k, [...(m.get(k) ?? []), v]);

export function worldOf(major: Major, courses: Course[], labs: Lab[], directions: Direction[]): CourseWorld {
  const before = new Map<string, string[]>();
  const after = new Map<string, string[]>();
  for (const p of major.prereqs) { push(before, p.to, p.from); push(after, p.from, p.to); }
  return {
    major, directions, before, after,
    course: new Map(courses.map(c => [c.code, c])),
    place: new Map(major.placements.map(p => [p.code, p])),
    lab: new Map(labs.map(l => [l.id, l]))
  };
}

/** 방향의 과목: 그 방향 연구실들이 꼽은 과목 중 과목표에 있는 것(합집합, 처음 나온 순서) */
export function pathCourses(dir: Direction, w: CourseWorld): string[] {
  return [...new Set(dir.labs.flatMap(id => w.lab.get(id)?.courses ?? []))].filter(c => w.course.has(c));
}

/** 먼저 들을 과목(before: 과목 → 먼저 들을 과목)을 끝까지 거슬러 더한 집합(자기 포함). 고리는 데이터 검사가 막는다. */
export function closure(codes: Iterable<string>, before: Map<string, string[]>): Set<string> {
  const out = new Set<string>();
  const stack = [...codes];
  while (stack.length) {
    const c = stack.pop()!;
    if (out.has(c)) continue;
    out.add(c);
    stack.push(...(before.get(c) ?? []));
  }
  return out;
}

/** 이 과목을 방향의 과목으로 둔 진로 방향들 */
export const directionsOf = (code: string, w: CourseWorld) => w.directions.filter(d => pathCourses(d, w).includes(code));

export type PlanGroup = 'now' | 'later' | 'left' | 'closed' | 'other';
export const PLAN_GROUPS: PlanGroup[] = ['now', 'later', 'left', 'closed', 'other'];
/** reasons: 이유 한 줄의 토막들. 화면이 따로 그려 나눈다(가운뎃점 사슬 금지, 문구 검사) */
export type PlanItem = { code: string; group: PlanGroup; missing: string[]; reasons: string[] };
export type Plan = {
  items: PlanItem[];
  /** 밝은 과목. 방향이 없으면 null(모두 같은 밝기) */
  lit: Set<string> | null;
  /** 방향 과목 중 들은 수. 방향이 없으면 null */
  progress: { done: number; total: number } | null;
  needsTerm: boolean;
};

/** 정렬 열쇠: 권장 학기(없으면 맨 뒤) → 전공코어 먼저 → 이름 */
function byOrder(w: CourseWorld) {
  const key = (c: string) => {
    const p = w.place.get(c);
    return { t: p?.term ? TERMS.indexOf(p.term) : TERMS.length, core: p && isCore(p.kind) ? 0 : 1, name: w.course.get(c)?.name ?? c };
  };
  return (a: string, b: string) => {
    const x = key(a), y = key(b);
    return x.t - y.t || x.core - y.core || x.name.localeCompare(y.name, 'ko');
  };
}

/**
 * 고른 방향과 학생 상태로 '이 길의 과목'을 묶는다. 점수 없이 묶음과 정렬만(plan.md '들을 만한 과목 규칙').
 * 목록 = 밝은 과목 − 들은 과목. 밝은 과목 = 방향 과목의 선수 닫힘 ∪ 안 들은 전공코어.
 */
export function planOf(w: CourseWorld, s: CourseState): Plan {
  const dir = s.direction ? w.directions.find(d => d.id === s.direction) : undefined;
  const needsTerm = s.term === null;
  if (!dir) return { items: [], lit: null, progress: null, needsTerm };

  const taken = new Set(s.taken);
  const path = pathCourses(dir, w);
  const onPath = new Set(path);
  const lit = closure(path, w.before);
  for (const p of w.major.placements) if (isCore(p.kind) && !taken.has(p.code)) lit.add(p.code);

  const order = byOrder(w);
  const name = (c: string) => w.course.get(c)?.name ?? c;
  const next = s.term && nextTerm(s.term);

  const items = [...lit].filter(c => !taken.has(c) && w.course.has(c)).map((code): PlanItem => {
    const course = w.course.get(code)!;
    const place = w.place.get(code);
    const before = w.before.get(code) ?? [];
    const missing = before.filter(c => !taken.has(c)).sort(order);
    const core = !!place && isCore(place.kind);
    const late = !!place?.term && !!next && TERMS.indexOf(place.term) > TERMS.indexOf(next);
    const group: PlanGroup = !place ? 'other' : !course.offered ? 'closed' : needsTerm ? 'left' : missing.length || late ? 'later' : 'now';

    const parts: string[] = [];
    if (onPath.has(code)) parts.push(`${dir.name} 길`);
    if (core) parts.push(KIND_LABEL[place.kind]);
    if (!onPath.has(code) && !core) {
      const needer = (w.after.get(code) ?? []).filter(c => lit.has(c)).sort(order)[0];
      if (needer) parts.push(`‘${name(needer)}’의 먼저 들을 과목`);
    }
    if (before.length) parts.push(missing.length ? `먼저 들을 과목: ${missing.map(name).join(', ')}` : '먼저 들을 과목을 다 들었어요');
    if (place?.term) parts.push(`권장 ${termLabel(place.term)}`);
    if (!place && course.dept !== w.major.name) parts.push(`${course.dept} 과목`, '전공 인정은 학과에 확인');

    return { code, group, missing, reasons: parts };
  });
  items.sort((a, b) => PLAN_GROUPS.indexOf(a.group) - PLAN_GROUPS.indexOf(b.group) || order(a.code, b.code));

  return { items, lit, progress: { done: path.filter(c => taken.has(c)).length, total: path.length }, needsTerm };
}
