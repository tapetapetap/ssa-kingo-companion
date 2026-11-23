// 시험용 공지 넣기(공지 목록·홈 시험이 함께 쓴다)
import type { Sql } from '../db/sql.ts';

/** 오늘(한국)에서 d일 뒤의 날짜 */
export const day = (d: number) => new Date(Date.now() + 9 * 3600_000 + d * 86400_000).toISOString().slice(0, 10);
export type N = { no: number; title?: string; host?: string | null; kind?: string; posted?: number; deadline?: number | null; isNotice?: boolean; down?: boolean; core?: string[]; related?: string[]; judged?: boolean; vector?: number[] };
export async function notice(sql: Sql, n: N) {
  const title = n.title ?? `공지 ${n.no}`;
  const host = n.host === undefined ? '가나다' : n.host;
  await sql`insert into notices (id, source, title, url, posted_on, host, is_notice, kind, deadline, field_state, field_rule, search_text, down, file, file_hash)
    values (${`cse:${n.no}`}, 'src', ${title}, ${`https://x/${n.no}`}, ${day(n.posted ?? -1)}, ${host}, ${n.isNotice ?? true}, ${n.kind ?? 'job'},
      ${n.deadline === null ? null : day(n.deadline ?? 10)}, ${n.judged === false ? 'off' : 'judged'}, 'LLM: m', ${`${title}${host ?? ''}`.toLowerCase().replace(/\s+/g, '')}, ${n.down ?? false}, '{}', 'h')`;
  if (n.vector) await sql`update notices set vector = ${JSON.stringify(n.vector)}::vector where id = ${`cse:${n.no}`}`;
  for (const [level, ids] of [['core', n.core ?? []], ['related', n.related ?? []]] as const) {
    for (const [i, id] of ids.entries()) await sql`insert into notice_fields (notice_id, field_id, level, ord) values (${`cse:${n.no}`}, ${id}, ${level}, ${i})`;
  }
}
/** 1024차원 벡터: i번째 칸만 1(같은 i끼리 유사도 1, 다르면 0) */
export const axis = (i: number) => Array.from({ length: 1024 }, (_, k) => (k === i ? 1 : 0));
