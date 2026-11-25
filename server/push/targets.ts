// 오늘 알릴 공지(FR-032, R7): 관심 있어요의 마감이 오늘이거나 3일 뒤, 나중에 보기의 다시 볼 날이 오늘. 열린 공지만.
// notices.deadline은 사람 판정이 반영된 보이는 값이다(2단계 R22)
import type { Sql } from '../db/sql.ts';
import type { Item } from './message.ts';

export async function targets(sql: Sql, student: number, today: string): Promise<Item[]> {
  return sql<Item[]>`
    select n.id as "noticeId", n.title, case when a.kind = 'later' then 'revisit' when n.deadline = ${today}::date then 'due0' else 'due3' end as kind
    from actions a join notices n on n.id = a.notice_id
    where a.student_id = ${student} and n.is_notice and not n.down and n.closes_on >= ${today}::date
      and ((a.kind = 'like' and n.deadline in (${today}::date, ${today}::date + 3)) or (a.kind = 'later' and a.revisit_on = ${today}::date))
    order by n.closes_on, n.id`;
}
