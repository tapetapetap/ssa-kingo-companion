// 다시 고르기 줄에 넣기(research R9). 학생마다 한 행이라 밀린 것이 하나로 합쳐진다(FR-037). 다른 모듈을 가져오지 않는다(순환을 피함)
import type { Sql } from '../db/sql.ts';

export type Cause = 'daily' | 'answers' | 'fields' | 'action' | 'prompt' | 'analysis' | 'ingest';

export async function enqueue(sql: Sql, student: number, cause: Cause) {
  await sql`insert into repick_queue (student_id, cause) values (${student}, ${cause})
    on conflict (student_id) do update set queued_at = clock_timestamp(), cause = excluded.cause`;
}
