// 규칙 문장(research R8 표): 맞은 조건을 점수 큰 순으로 두 개까지 잇는다. 날짜·날 수는 쓰지 않는다
import { CONDS, type Scored } from './score.ts';

const PARTS: Record<(typeof CONDS)[number], [string, string]> = {
  picked: ['고른 분야와 맞고', '고른 분야와 맞아요'],
  liked: ['관심 있어요가 몰린 분야와 맞고', '관심 있어요가 몰린 분야와 맞아요'],
  related: ['고른 분야와 관련이 있고', '고른 분야와 관련이 있어요'],
  goal: ['진로 목표에 맞는 종류이고', '진로 목표에 맞는 종류예요'],
  vector: ['관심 있어 한 것과 비슷하고', '관심 있어 한 것과 비슷해요'],
  soon: ['마감이 가깝고', '마감이 가까워요']
};
export const NO_MATCH_REASON = '지금 열려 있는 공지 가운데 골랐어요';

export function ruleReason(s: Scored): string {
  const met = s.met.filter(m => m.cond !== 'vector' || m.points >= 10)
    .sort((a, b) => b.points - a.points || CONDS.indexOf(a.cond) - CONDS.indexOf(b.cond)).slice(0, 2);
  if (!met.length) return NO_MATCH_REASON;
  return met.length === 1 ? PARTS[met[0].cond][1] : `${PARTS[met[0].cond][0]} ${PARTS[met[1].cond][1]}`;
}
