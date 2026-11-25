// 비어 있는 까닭 → 글과 할 일(contracts/app.md 7). 모르는 까닭이 오면 뭉뚱그린 글을 쓴다
export type EmptyText = { title: string; description?: string; link?: { label: string; href: string }; clear?: true };

const HOME: Record<string, EmptyText> = {
  fields_not_done: { title: '분야를 먼저 골라 주세요', description: '고른 분야를 보고 공지를 골라 드려요.', link: { label: '분야 고르러 가기', href: '/me/fields' } },
  no_open_notices: { title: '지금 열린 공지가 없어요', description: '새 공지가 올라오면 여기에서 먼저 보여 드려요.' },
  no_match: { title: '맞는 공지를 모두 봤어요', description: '다른 공지도 둘러보세요.', link: { label: '공지 보러 가기', href: '/notices' } }
};
const LIST: Record<string, EmptyText> = {
  no_open_notices: { title: '지금 열린 공지가 없어요', description: '새 공지가 올라오면 여기에 보여요.' },
  no_match: { title: '찾는 말이나 거르기에 맞는 공지가 없어요', clear: true }
};
const UNKNOWN: EmptyText = { title: '지금 보여 줄 공지가 없어요' };
const pick = (t: Record<string, EmptyText>, reason: string | null) => (reason && Object.hasOwn(t, reason) ? t[reason] : UNKNOWN);
export const homeEmpty = (reason: string | null) => pick(HOME, reason);
export const listEmpty = (reason: string | null) => pick(LIST, reason);
