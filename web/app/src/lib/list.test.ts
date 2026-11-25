import { expect, it } from 'vitest';
import type { ListItem } from '../api.ts';
import { ordered } from './list.ts';

const item = (id: string, deadline: string | null, ...flags: ListItem['flags']) => ({ notice: { id, deadline }, flags }) as ListItem;

it('다시 볼 날 → 마감 가까운 열린 → 마감 없는 열린 → 닫힌 → 내려간. 닫힌 나중에 보기는 다시 볼 날이 지나도 맨 아래다', () => {
  const got = ordered([
    item('down', '2026-12-01', 'down'), item('closedDue', '2026-11-01', 'revisit_due', 'closed'), item('none', null), item('late', '2026-12-30'),
    item('due2', null, 'revisit_due'), item('same1', '2026-12-05'), item('due1', '2026-12-31', 'revisit_due'), item('same2', '2026-12-05'),
    item('both', '2026-11-01', 'closed', 'down'), item('closed', '2026-11-20', 'closed')
  ]).map(x => x.notice.id);
  expect(got).toEqual(['due2', 'due1', 'same1', 'same2', 'late', 'none', 'closedDue', 'closed', 'down', 'both']);
});
