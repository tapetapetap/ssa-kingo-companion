import { describe, expect, it } from 'vitest';
import { COURSES } from '../../data/courses/catalog';
import { DIRECTIONS, LABS } from '../../data/courses/directions';
import { AREA_GROUP, WORLD } from '../../data/courses';
import { SWE } from '../../data/courses/swe';
import { EXAMPLE_COURSES } from '../../data/seed';
import { checkWorld } from './check';
import { pathCourses, worldOf } from './plan';
import { TERMS, type Major } from './types';

describe('교과 지도 데이터 검사(실제 데이터)', () => {
  it('문제 0건', () => {
    expect(checkWorld(WORLD, COURSES, AREA_GROUP)).toEqual([]);
  });
  it('로드맵 학기 칸 69개가 학기별 개수대로 놓이고 경험 층은 14개(SC-001)', () => {
    const count = Object.fromEntries(TERMS.map(t => [t, SWE.placements.filter(p => p.term === t).length]));
    expect(count).toEqual({ '1-1': 1, '1-2': 2, '2-1': 4, '2-2': 4, '3-1': 11, '3-2': 14, '4-1': 18, '4-2': 15 });
    expect(SWE.placements.filter(p => p.term === null)).toHaveLength(14);
    expect(COURSES).toHaveLength(95);
  });
  it('진로 방향 28가지 모두 과목과 연구실이 있다(SC-002)', () => {
    expect(DIRECTIONS).toHaveLength(28);
    expect(LABS).toHaveLength(34);
    for (const d of DIRECTIONS) {
      expect(d.labs.length, d.id).toBeGreaterThan(0);
      expect(pathCourses(d, WORLD).length, d.id).toBeGreaterThan(0);
    }
  });
  it('예시 학생이 들은 과목은 모두 지도에 있다', () => {
    expect(EXAMPLE_COURSES.taken.filter(c => !WORLD.place.has(c))).toEqual([]);
  });
});

describe('교과 지도 데이터 검사(틀린 데이터)', () => {
  const broken: Major = {
    ...SWE,
    fields: [...SWE.fields.slice(0, 2), { id: 'ml', label: '머신러닝', layer: 'field', group: 'ai', areas: ['mlmining', 'sec'] }, ...SWE.fields.slice(3)],
    placements: [...SWE.placements, { code: 'NOPE000', term: '1-1', kind: 'advanced', field: 'base' }, { code: 'SWE3042', term: '4-1', kind: 'research', field: 'experience' }],
    prereqs: [...SWE.prereqs, { from: 'SWE3027', to: 'SWE3005' }]
  };
  const problems = checkWorld(worldOf(broken, COURSES, LABS, [...DIRECTIONS, { id: 'x', name: 'x', side: '산업', area: 'ai', labs: ['nolab'] }]), COURSES, AREA_GROUP);
  it('없는 학수번호, 두 묶음에 걸친 줄, 겹친 분야, 경험 줄의 학기, 선수 고리, 없는 연구실을 찾는다', () => {
    const has = (s: string) => problems.some(p => p.includes(s));
    expect(has('과목표에 없는 NOPE000')).toBe(true);
    expect(has('sec 는 ai 묶음이 아님')).toBe(true);
    expect(has('sec 가 줄 ml 에도 있음')).toBe(true);
    expect(has('SWE3042 가 두 번')).toBe(true);
    expect(has('고리')).toBe(true);
    expect(has('없는 연구실 nolab')).toBe(true);
  });
});
