// 알림 글(3단계 research R8, FR-033): 공지 제목과 마감뿐이다. 학생을 가리키는 값이 없다
import { LIMITS } from '../limits.ts';

export type Kind = 'due0' | 'due3' | 'revisit';
export type Item = { noticeId: string; title: string; kind: Kind };
export type Payload = { title: string; body: string; url: string; tag: string };

const ORDER: Kind[] = ['due0', 'due3', 'revisit'];
const ONE = { due0: '오늘 마감', due3: '3일 뒤 마감', revisit: '다시 볼 날이에요' };
const MANY = { due0: '오늘 마감', due3: '3일 뒤 마감', revisit: '다시 볼 공지' };
const cut = (s: string) => { const c = [...s]; return c.length > LIMITS.pushTitleChars ? `${c.slice(0, LIMITS.pushTitleChars).join('')}…` : s; };

/** 하나면 그 공지, 둘 이상이면 종류별 개수와 제목 셋까지. 순서는 오늘 마감 → 3일 뒤 → 다시 볼 날 */
export function message(items: Item[], day: string): Payload {
  const tag = `kingo-${day}`;
  const xs = ORDER.flatMap(k => items.filter(i => i.kind === k));
  if (xs.length === 1) return { title: cut(xs[0].title), body: ONE[xs[0].kind], url: `/notices/${encodeURIComponent(xs[0].noticeId)}`, tag };
  const counts = ORDER.map(k => [MANY[k], xs.filter(i => i.kind === k).length] as const).filter(([, n]) => n);
  const lines = xs.slice(0, 3).map(i => cut(i.title));
  if (xs.length > 3) lines.push(`외 ${xs.length - 3}개`);
  return { title: counts.map(([label, n]) => `${label} ${n}개`).join(', '), body: lines.join('\n'), url: '/list', tag };
}
