import { pathCourses, type CourseWorld } from './plan';
import type { Course, CsrArea, CsrGroup, Lab } from './types';

/**
 * 교과 지도 데이터 검사(spec FR-015). 문제를 사람이 읽는 문장으로 돌려준다. 비면 통과.
 * courses·labs 는 찾기 표(Map)로 만들기 전의 목록(겹친 id 를 보려고), areaGroup: CSRankings 분야 → 묶음(src/data/courses/csrankings.ts).
 */
export function checkWorld(w: CourseWorld, courses: Course[], labs: Lab[], areaGroup: Map<CsrArea, CsrGroup>): string[] {
  const out: string[] = [];
  const known = (c: string, where: string) => { if (!w.course.has(c)) out.push(`${where}: 과목표에 없는 ${c}`); };

  const twice = (ids: string[], where: string) => new Set(ids.filter((x, i) => ids.indexOf(x) !== i)).forEach(x => out.push(`${where}: ${x} 가 두 번`));
  twice(courses.map(c => c.code), '과목표');
  twice(labs.map(l => l.id), '연구실');
  twice(w.directions.map(d => d.id), '진로 방향');

  // 줄: 분야 줄은 한 묶음 안의 CSRankings 분야, 분야 하나는 줄 하나에만
  const areaRow = new Map<CsrArea, string>();
  for (const f of w.major.fields) {
    if (f.layer === 'field') {
      if (!f.group || !f.areas.length) out.push(`줄 ${f.id}: 묶음이나 분야가 없음`);
      for (const a of f.areas) {
        if (areaGroup.get(a) !== f.group) out.push(`줄 ${f.id}: ${a} 는 ${f.group} 묶음이 아님`);
        if (areaRow.has(a)) out.push(`줄 ${f.id}: ${a} 가 줄 ${areaRow.get(a)} 에도 있음`);
        areaRow.set(a, f.id);
      }
    } else if (f.group || f.areas.length) out.push(`줄 ${f.id}: 기초·경험 줄에 CSRankings 분야`);
  }

  // 배치: 과목마다 한 번, 줄은 있는 줄, 경험 줄 ⟺ 학기 없음, CSRankings 분야는 그 줄 안
  const seen = new Set<string>();
  for (const p of w.major.placements) {
    known(p.code, '배치');
    if (seen.has(p.code)) out.push(`배치: ${p.code} 가 두 번`);
    seen.add(p.code);
    const f = w.major.fields.find(x => x.id === p.field);
    if (!f) { out.push(`배치 ${p.code}: 없는 줄 ${p.field}`); continue; }
    if ((f.layer === 'experience') !== (p.term === null)) out.push(`배치 ${p.code}: 경험 줄과 학기 없음이 맞지 않음`);
    if (f.layer === 'field' ? !p.area || !f.areas.includes(p.area) : p.area) out.push(`배치 ${p.code}: CSRankings 분야가 줄 ${f.id} 와 맞지 않음`);
  }

  // 선수 관계: 과목표 안, 고리 없음
  for (const p of w.major.prereqs) { known(p.from, '선수'); known(p.to, '선수'); }
  const state = new Map<string, 'open' | 'done'>();
  const visit = (c: string): boolean => {
    if (state.get(c) === 'done') return false;
    if (state.get(c) === 'open') return true;
    state.set(c, 'open');
    const loop = (w.before.get(c) ?? []).some(visit);
    state.set(c, 'done');
    return loop;
  };
  for (const c of w.before.keys()) if (visit(c)) { out.push(`선수: ${c} 에서 고리`); break; }

  // 연구실·방향: 과목·연구실이 있고, 방향마다 과목·연구실 1개 이상(SC-002)
  for (const l of w.lab.values()) l.courses.forEach(c => known(c, `연구실 ${l.id}`));
  for (const d of w.directions) {
    if (!d.labs.length) out.push(`방향 ${d.id}: 연구실 없음`);
    d.labs.filter(id => !w.lab.has(id)).forEach(id => out.push(`방향 ${d.id}: 없는 연구실 ${id}`));
    if (!pathCourses(d, w).length) out.push(`방향 ${d.id}: 과목 없음`);
  }
  return out;
}
