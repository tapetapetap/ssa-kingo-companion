// 서비스 숫자(FR-043, 3단계 research R12): 날짜와 이름과 수뿐이다. 학생을 가리키는 값이 없다
import type { Sql } from '../db/sql.ts';

export const kstDay = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
export const COUNT_NAMES = ['consented', 'consented_new', 'active7', 'like', 'later', 'dislike', 'push_sent', 'push_failed', 'push_devices'] as const;
export type Counts = Record<typeof COUNT_NAMES[number], number>;

/** 그날(한국)의 숫자. 행동은 지금 상태만 있어 되돌린 것은 세지 않는다 */
export async function counts(sql: Sql, day: string, consentVersion: string): Promise<Counts> {
  const [r] = await sql<Counts[]>`
    with d as (select (${day}::date)::timestamp at time zone 'Asia/Seoul' as from_at, (${day}::date + 1)::timestamp at time zone 'Asia/Seoul' as to_at)
    select
      (select count(*) from consents where text_version = ${consentVersion} and agreed_at < d.to_at)::int as consented,
      (select count(*) from students s join consents c on c.student_id = s.id and c.text_version = ${consentVersion} where s.created_at >= d.from_at and s.created_at < d.to_at)::int as consented_new,
      (select count(distinct student_id) from sessions where last_used_at >= d.to_at - interval '7 days')::int as active7,
      (select count(*) from actions where kind = 'like' and at >= d.from_at and at < d.to_at)::int as like,
      (select count(*) from actions where kind = 'later' and at >= d.from_at and at < d.to_at)::int as later,
      (select count(*) from actions where kind = 'dislike' and at >= d.from_at and at < d.to_at)::int as dislike,
      (select count(distinct (student_id, endpoint_hash)) from push_sent where day = ${day} and status = 'sent')::int as push_sent,
      (select count(distinct (student_id, endpoint_hash)) from push_sent where day = ${day} and status = 'failed')::int as push_failed,
      (select count(*) from push_subscriptions)::int as push_devices
    from d`;
  return r;
}

/** 그날 숫자를 남긴다. 낮에 한 번 더 돌려도 처음 남긴 것을 둔다(지금 상태로 센 값이 섞이지 않게) */
export async function saveCounts(sql: Sql, day: string, consentVersion: string) {
  const c = await counts(sql, day, consentVersion);
  for (const [name, n] of Object.entries(c)) await sql`insert into daily_counts (day, name, n) values (${day}, ${name}, ${n}) on conflict (day, name) do nothing`;
}

/** api가 500을 낼 때마다 오늘 수를 1 올린다. 세지 못해도 답에는 영향이 없다 */
export async function countServerError(sql: Sql, now = new Date()) {
  await sql`insert into daily_counts (day, name, n) values (${kstDay(now)}, 'server_error', 1) on conflict (day, name) do update set n = daily_counts.n + 1`.catch(() => {});
}
