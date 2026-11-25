// 내 목록의 순서(FR-017, contracts/app.md 5). 같은 자리 안은 서버가 준 순서(최근에 정한 것 먼저)다
import type { ListItem } from '../api.ts';

const rank = ({ notice, flags }: ListItem) =>
  flags.includes('down') ? 4 : flags.includes('closed') ? 3 : flags.includes('revisit_due') ? 0 : notice.deadline ? 1 : 2;

export const ordered = (items: ListItem[]): ListItem[] => items.toSorted((a, b) =>
  rank(a) - rank(b) || (rank(a) === 1 ? a.notice.deadline!.localeCompare(b.notice.deadline!) : 0));
