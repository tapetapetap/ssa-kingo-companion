import { describe, expect, it } from 'vitest';
import { ruleReason, NO_MATCH_REASON } from './reason.ts';
import { rank, scoreOne, studentVector, type Cand, type Profile } from './score.ts';

const cand = (o: Partial<Cand> = {}): Cand => ({
  id: 'cse:1', no: 1, kind: null, core: [], related: [], sim: null, deadline: null, closesOn: '2026-12-31', postedOn: '2026-11-01', ...o
});
const prof = (o: Partial<Profile> = {}): Profile => ({
  grade: 3, goal: 'unsure', picked: new Set(['backend']), liked: new Set(), disliked: new Set(), vector: null, today: '2026-11-20', ...o
});

describe('규칙 점수 (research R8)', () => {
  it.each<[string, Partial<Cand>, Partial<Profile>, number]>([
    ['핵심이 고른 분야', { core: ['backend'] }, {}, 40],
    ['핵심이 몰린 분야', { core: ['llm'] }, { liked: new Set(['llm']) }, 40],
    ['고른 분야이자 몰린 분야여도 40', { core: ['backend'] }, { liked: new Set(['backend']) }, 40],
    ['관련만 맞음', { core: ['qa'], related: ['backend'] }, {}, 20],
    ['관심 없음이 몰린 분야', { core: ['backend'] }, { disliked: new Set(['backend']) }, -20],
    ['진로 목표 종류', { kind: 'hackathon' }, { goal: 'job' }, 20],
    ['채용은 3학년 이상만', { kind: 'job' }, { goal: 'job', grade: 2 }, 0],
    ['아직 모름은 종류 점수 없음', { kind: 'hackathon' }, { goal: 'unsure' }, 0],
    ['벡터 유사도 1', { sim: 1 }, {}, 20],
    ['벡터 유사도 0.3 이하는 0', { sim: 0.3 }, {}, 0],
    ['마감 오늘', { deadline: '2026-11-20' }, {}, 10],
    ['마감 7일 남음', { deadline: '2026-11-27' }, {}, 5],
    ['마감 14일 남음은 0', { deadline: '2026-12-04' }, {}, 0],
    ['분야가 붙지 않은 공지는 분야 점수 0', { core: null, related: [] }, {}, 0]
  ])('%s', (_name, c, p, score) => {
    expect(scoreOne(cand(c), prof(p)).score).toBe(score);
  });

  it('동점은 닫히는 날 가까운 순 → 게시 최근 순 → 글 번호 큰 순이고, 같은 자료면 같은 순서다', () => {
    const cs = [
      cand({ id: 'cse:1', no: 1, closesOn: '2026-12-10', postedOn: '2026-11-01' }),
      cand({ id: 'cse:2', no: 2, closesOn: '2026-12-01', postedOn: '2026-11-01' }),
      cand({ id: 'cse:3', no: 3, closesOn: '2026-12-10', postedOn: '2026-11-05' }),
      cand({ id: 'cse:4', no: 4, closesOn: '2026-12-10', postedOn: '2026-11-05' })
    ];
    const ids = rank(cs, prof()).map(s => s.cand.id);
    expect(ids).toEqual(['cse:2', 'cse:4', 'cse:3', 'cse:1']);
    expect(rank([...cs].reverse(), prof()).map(s => s.cand.id)).toEqual(ids);
  });

  it('학생 벡터는 있는 묶음끼리 길이 1로 맞춰 평균하고, 묶음이 없으면 null이다', () => {
    expect(studentVector([[], [], []])).toBeNull();
    expect(studentVector([[[2, 0]], [], []])).toEqual([1, 0]);
    expect(studentVector([[[3, 0]], [[0, 1], [0, 3]], []])).toEqual([0.5, 0.5]);
  });
});

describe('규칙 문장 (research R8 표)', () => {
  it.each<[string, Partial<Cand>, Partial<Profile>, string]>([
    ['둘을 잇는다', { core: ['backend'], deadline: '2026-11-22' }, {}, '고른 분야와 맞고 마감이 가까워요'],
    ['하나면 끝 꼴', { core: ['backend'] }, {}, '고른 분야와 맞아요'],
    ['같은 점수는 표 순서(진로 목표 20 > 관련 20보다 뒤)', { core: ['qa'], related: ['backend'], kind: 'hackathon' }, { goal: 'job' }, '고른 분야와 관련이 있고 진로 목표에 맞는 종류예요'],
    ['벡터 10 미만은 문장에 넣지 않는다', { sim: 0.6 }, {}, NO_MATCH_REASON],
    ['맞은 조건이 없음', {}, {}, NO_MATCH_REASON],
    ['14일 남음은 마감 조각 없음', { deadline: '2026-12-04' }, {}, NO_MATCH_REASON]
  ])('%s', (_name, c, p, text) => {
    const r = ruleReason(scoreOne(cand(c), prof(p)));
    expect(r).toBe(text);
    expect(r).not.toMatch(/\d/);
  });
});
