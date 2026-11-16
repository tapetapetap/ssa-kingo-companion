import { describe, expect, it } from 'vitest';
import { WORLD } from '../../data/courses';
import { DIRECTIONS } from '../../data/courses/directions';
import { EXAMPLE_COURSES } from '../../data/seed';
import { closure, planOf, worldOf, type Plan } from './plan';
import type { CourseState, Major } from './types';

const demo = (direction: string | null, term: CourseState['term'] = EXAMPLE_COURSES.term): CourseState => ({ ...EXAMPLE_COURSES, term, direction });
const group = (p: Plan, g: string) => p.items.filter(i => i.group === g).map(i => i.code);
const item = (p: Plan, code: string) => p.items.find(i => i.code === code);

describe('planOf — 실제 데이터, 예시 학생(3학년 2학기)', () => {
  const search = planOf(WORLD, demo('search'));

  it('방향이 없으면 밝힘·진행 없이 빈 목록', () => {
    expect(planOf(WORLD, demo(null))).toEqual({ items: [], lit: null, progress: null, needsTerm: false });
  });
  it('검색·추천: 지금·나중·로드맵 밖으로 나누고 진행을 센다', () => {
    expect(group(search, 'now')).toEqual(['SWE3002', 'SWE3011', 'SWE3022', 'SWE3050', 'ESW4028', 'SWE3052', 'ESW4024']);
    expect(group(search, 'later')).toEqual(['ESW4014']);
    expect(group(search, 'other')).toEqual(['ESM3061', 'AIM4003']);
    expect(search.progress).toEqual({ done: 3, total: 10 });
  });
  it('밝은 과목 = 방향 과목의 선수 닫힘(들은 것 포함) ∪ 안 들은 전공코어', () => {
    expect(search.lit?.has('SWE2015')).toBe(true);
    expect(search.lit?.has('SWE3022')).toBe(true);
    expect(search.lit?.has('SWE3005')).toBe(false);
  });
  it('먼저 들을 과목이 남으면 나중, 이유에 이름을 적는다', () => {
    expect(item(search, 'ESW4014')).toMatchObject({ missing: ['SWE3050'], reasons: ['검색·추천 엔지니어 길', '먼저 들을 과목: 기계학습원론', '권장 3학년 2학기'] });
  });
  it('이유 한 줄: 방향 + 전공코어 + 학기, 선수가 없으면 선수 토막을 뺀다', () => {
    expect(item(search, 'SWE3050')?.reasons).toEqual(['검색·추천 엔지니어 길', '전공코어', '권장 4학년 1학기']);
    expect(item(search, 'SWE3002')?.reasons).toEqual(['전공코어', '권장 3학년 2학기']);
    expect(item(search, 'SWE3052')?.reasons).toEqual(['검색·추천 엔지니어 길', '권장 4학년 1학기']);
  });
  it('로드맵 밖 다른 학과 과목은 학과 확인 문구, 선수가 여럿이면 모두', () => {
    expect(item(search, 'AIM4003')?.reasons).toEqual(['검색·추천 엔지니어 길', '먼저 들을 과목: 기계학습원론, 심층신경망개론', '인공지능학과 과목', '전공 인정은 학과에 확인']);
  });
  it('최근 열리지 않은 과목은 closed', () => {
    expect(group(planOf(WORLD, demo('ai-security')), 'closed')).toContain('ESW4011');
  });
  it('선수 닫힘으로만 든 과목은 그 과목을 기다리는 과목 이름을 댄다', () => {
    const p = planOf(WORLD, { term: '2-1', taken: [], direction: 'vision' });
    expect(item(p, 'SWE3026')?.reasons).toEqual(['‘시계열데이터처리개론’의 먼저 들을 과목', '권장 3학년 1학기']);
  });
  it('4학년 2학기 학생의 늦은 과목은 지금에 남는다', () => {
    const p = planOf(WORLD, demo('search', '4-2'));
    expect(group(p, 'now')).toEqual(expect.arrayContaining(['SWE3002', 'ESW4024']));
  });
  it('학년·학기가 없으면 지금/나중을 나누지 않고 left', () => {
    const p = planOf(WORLD, demo('search', null));
    expect(p.needsTerm).toBe(true);
    expect(group(p, 'now')).toEqual([]);
    expect(group(p, 'later')).toEqual([]);
    expect(group(p, 'left')).toContain('ESW4014');
    expect(group(p, 'other')).toEqual(['ESM3061', 'AIM4003']);
  });
  it('어느 방향에서도 선수가 남은 과목은 지금에 없고 들은 과목은 목록에 없다(SC-003)', () => {
    for (const d of DIRECTIONS) {
      const p = planOf(WORLD, demo(d.id));
      expect(p.items.filter(i => i.group === 'now' && i.missing.length), d.id).toEqual([]);
      expect(p.items.filter(i => EXAMPLE_COURSES.taken.includes(i.code)), d.id).toEqual([]);
    }
  });
});

describe('planOf — 학기 없는 경험 층 과목', () => {
  const major: Major = {
    id: 'swe', name: '소프트웨어학과', checked: 'example',
    fields: [{ id: 'base', label: '기초', layer: 'base', areas: [] }, { id: 'experience', label: '경험', layer: 'experience', areas: [] }],
    placements: [{ code: 'R1', term: null, kind: 'research', field: 'experience' }, { code: 'B1', term: '4-2', kind: 'advanced', field: 'base' }, { code: 'B0', term: '1-1', kind: 'advanced', field: 'base' }],
    prereqs: []
  };
  const courses = ['R1', 'B1', 'B0'].map(code => ({ code, name: code, credits: 2, dept: '소프트웨어학과', offered: true }));
  const w = worldOf(major, courses, [{ id: 'l', prof: 'p', name: 'l', areas: ['ai'], topics: [], undergrad: 'none', alumni: '', courses: ['R1', 'B1', 'B0'] }], [{ id: 'd', name: '연구', side: '연구', area: 'ai', labs: ['l'] }]);
  it('학기 비교 없이 지금, 정렬은 맨 뒤, 학기 토막 없음', () => {
    const p = planOf(w, { term: '1-1', taken: [], direction: 'd' });
    expect(p.items.map(i => [i.code, i.group])).toEqual([['B0', 'now'], ['R1', 'now'], ['B1', 'later']]);
    expect(p.items.find(i => i.code === 'R1')?.reasons).toEqual(['연구 길']);
  });
});

describe('closure', () => {
  it('먼저 들을 과목을 끝까지 거슬러 더한다', () => {
    expect([...closure(['C'], new Map([['C', ['B']], ['B', ['A']]]))].sort()).toEqual(['A', 'B', 'C']);
  });
});
