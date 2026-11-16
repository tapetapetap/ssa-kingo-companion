import { describe, expect, it } from 'vitest';
import { WORLD } from '../../data/courses';
import { EXAMPLE_COURSES } from '../../data/seed';
import { planOf } from '../../domain/courses/plan';
import type { CourseState } from '../../domain/courses/types';
import { mapShape } from './map';

const shapeOf = (s: CourseState, showClosed = false, selected?: string) => mapShape(WORLD, s, planOf(WORLD, s), showClosed, selected);
const rows = (sh: ReturnType<typeof shapeOf>) => sh.lines.map(l => (l.kind === 'group' ? `#${l.label}` : l.field.id));
const dot = (sh: ReturnType<typeof shapeOf>, code: string) => [...sh.lines.flatMap(l => (l.kind === 'row' ? l.dots : [])), ...sh.experience].find(d => d.code === code);

describe('mapShape — 방향 없음', () => {
  const sh = shapeOf(EXAMPLE_COURSES);
  it('학기 8칸, 고른 학기에 지금', () => {
    expect(sh.cols.map(c => c.label)).toEqual(['1학년 1학기', '1학년 2학기', '2학년 1학기', '2학년 2학기', '3학년 1학기', '3학년 2학기', '4학년 1학기', '4학년 2학기']);
    expect(sh.cols.filter(c => c.now).map(c => c.id)).toEqual(['3-2']);
  });
  it('기초 줄 다음에 CSRankings 묶음 이름과 분야 줄, 접힌 줄과 선은 없다', () => {
    expect(rows(sh)).toEqual(['base', '#AI', 'ai', 'ml', 'vision', '#시스템', 'arch', 'os', 'network', 'security', 'db', 'pl', 'se', '#이론', 'theory', '#융합', 'graphics']);
    expect(sh.folded).toEqual([]);
    expect(sh.links).toEqual([]);
  });
  it('들은 과목은 taken, 안 들은 최근 열린 과목은 open, 옅음 없음', () => {
    expect(dot(sh, 'SWE3004')).toMatchObject({ state: 'taken', dim: false });
    expect(dot(sh, 'SWE3050')).toMatchObject({ state: 'open', dim: false });
  });
  it('안 들은 최근 안 열린 과목은 스위치를 켤 때만, 들은 과목은 늘', () => {
    expect(dot(sh, 'SWE3027')).toBeUndefined();
    expect(dot(sh, 'SWE2019')).toMatchObject({ state: 'taken' });
    expect(dot(shapeOf(EXAMPLE_COURSES, true), 'SWE3027')).toMatchObject({ state: 'closed' });
    expect(sh.experience.map(d => d.code)).not.toContain('SWE3056');
    expect(shapeOf(EXAMPLE_COURSES, true).experience).toHaveLength(14);
  });
  it('서랍으로 연 과목은 방향 없이도 그려진 앞뒤 선을 긋는다', () => {
    expect(shapeOf(EXAMPLE_COURSES, true, 'SWE3027').links).toEqual([{ from: 'SWE3005', to: 'SWE3027' }, { from: 'SWE3004', to: 'SWE3027' }]);
    expect(shapeOf(EXAMPLE_COURSES, false, 'SWE3027').links).toEqual([]);
  });
});

describe('mapShape — 방향 검색·추천', () => {
  const s = { ...EXAMPLE_COURSES, direction: 'search' };
  const sh = shapeOf(s);
  it('밝은 과목이 없는 줄은 접고, 남은 줄의 묶음 이름만 둔다', () => {
    expect(sh.folded.map(f => f.id)).toEqual(['arch', 'os', 'security', 'pl', 'graphics']);
    expect(rows(sh)).toEqual(['base', '#AI', 'ai', 'ml', 'vision', '#시스템', 'network', 'db', 'se', '#이론', 'theory']);
  });
  it('지금 들을 만한 과목은 now, 길 밖은 옅게', () => {
    expect(dot(sh, 'ESW4024')).toMatchObject({ state: 'now', dim: false });
    expect(dot(sh, 'SWE3047')).toMatchObject({ state: 'taken', dim: true });
    expect(dot(sh, 'ESW4014')).toMatchObject({ state: 'open', dim: false });
  });
  it('선은 그려진 밝은 과목끼리의 선수 관계', () => {
    expect(sh.links).toEqual(expect.arrayContaining([{ from: 'SWE2015', to: 'SWE3003' }, { from: 'SWE2015', to: 'ESW4014' }]));
    expect(sh.links).not.toContainEqual({ from: 'SWE2015', to: 'SWE2001' });
  });
  it('로드맵 학기와 거꾸로인 선수 관계는 선으로 긋지 않는다', () => {
    expect(sh.links).not.toContainEqual({ from: 'SWE3050', to: 'ESW4014' });
    expect(sh.links).toContainEqual({ from: 'SWE2016', to: 'ESW4014' });
  });
});
