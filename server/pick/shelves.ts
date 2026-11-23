// 선반 셋(FR-039·040, contracts/api.md 홈): 홈을 열 때 계산한다. 마감 임박 → 관심 분야 새 공지 → 비슷한 공지 순서로 채우고,
// 앞에 나온 공지(가장 추천 포함)는 뺀 뒤 10개로 자른다. 동점은 글 번호 큰 순이다
import { LIMITS } from '../limits.ts';
import { cosine, days } from './score.ts';

export type ShelfItem<C> = { card: C; no: number; core: string[] | null; related: string[]; deadline: string | null; postedOn: string; liked: boolean; vector: number[] | null };
export type Empty = 'no_open_notices' | 'no_field_verdicts' | 'no_likes' | 'no_match';
export type Shelf<C> = { items: C[]; empty: Empty | null };

export function buildShelves<C>(all: ShelfItem<C>[], o: { picked: Set<string>; today: string; seen: Set<number>; anyJudged: boolean; likedVectors: number[][] }) {
  const seen = new Set(o.seen);
  const take = (list: ShelfItem<C>[], empty: Empty | null = null): Shelf<C> => {
    const items = list.filter(x => !seen.has(x.no)).slice(0, LIMITS.shelfSize);
    for (const x of items) seen.add(x.no);
    return { items: items.map(x => x.card), empty: items.length ? null : empty ?? (all.length ? 'no_match' : 'no_open_notices') };
  };
  const coreHit = (x: ShelfItem<C>) => !!x.core?.some(f => o.picked.has(f));
  const soon = take(all.filter(x => x.deadline && days(o.today, x.deadline) >= 0 && days(o.today, x.deadline) <= LIMITS.soonDays)
    .sort((a, b) => Number(coreHit(b)) - Number(coreHit(a)) || a.deadline!.localeCompare(b.deadline!) || b.no - a.no));
  const field = o.anyJudged
    ? take(all.filter(x => !x.liked && days(x.postedOn, o.today) <= LIMITS.newDays && [...(x.core ?? []), ...x.related].some(f => o.picked.has(f)))
      .sort((a, b) => b.postedOn.localeCompare(a.postedOn) || b.no - a.no))
    : { items: [], empty: 'no_field_verdicts' as const };
  const similar = o.likedVectors.length
    ? take(all.filter(x => !x.liked && x.vector).map(x => ({ x, s: Math.max(...o.likedVectors.map(v => cosine(x.vector!, v))) }))
      .sort((a, b) => b.s - a.s || b.x.no - a.x.no).map(({ x }) => x))
    : { items: [], empty: 'no_likes' as const };
  return { soon, field, similar };
}
