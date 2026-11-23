// 사람 판정 덮기와 확인할 것의 이유(US7, FR-050·052, data-model 3). 넣기와 운영자 고치기가 같은 함수를 부른다
import type { Db } from '../db/sql.ts';

/** 사람 판정이 있는 칸을 보이는 값으로 쓴다. 넣기는 결과 파일 값을 쓴 뒤, 고치기는 판정을 남긴 뒤 부른다 */
export async function applyHuman(sql: Db, ids: string[]) {
  await sql`update notices n set is_notice = h.value::boolean from human_verdicts h where h.notice_id = n.id and h.field = 'is_notice' and n.id = any(${ids})`;
  await sql`update notices n set kind = h.value #>> '{}' from human_verdicts h where h.notice_id = n.id and h.field = 'kind' and n.id = any(${ids})`;
  await sql`update notices n set deadline = (h.value #>> '{}')::date from human_verdicts h where h.notice_id = n.id and h.field = 'deadline' and n.id = any(${ids})`;
  const f = await sql<{ notice_id: string }[]>`
    update notices n set field_state = 'human', field_rule = '운영자' from human_verdicts h
    where h.notice_id = n.id and h.field = 'fields' and n.id = any(${ids}) returning n.id as notice_id`;
  const fids = f.map(r => r.notice_id);
  if (!fids.length) return;
  await sql`delete from notice_fields where notice_id = any(${fids})`;
  await sql`
    insert into notice_fields (notice_id, field_id, level, ord)
    select h.notice_id, x.id, lv.level, x.ord - 1 from human_verdicts h
    cross join (values ('core'), ('related')) lv(level)
    cross join lateral jsonb_array_elements_text(h.value -> lv.level) with ordinality x(id, ord)
    where h.field = 'fields' and h.notice_id = any(${fids})`;
}

/** 이유를 다시 센다(data-model '이유' 표). 이유가 같으면 확인 상태를 두고, 달라지면 풀고, 없어지면 행을 지운다.
 *  onlyExisting이면 있는 행의 이유만 고친다(운영자 고치기: 확인 상태는 부른 쪽이 채운다) */
export async function refreshReview(sql: Db, ids: string[], onlyExisting = false) {
  const rows = await sql<{ id: string; reasons: string[] }[]>`
    select n.id, array_remove(array[
      case when n.file ? 'why' then 'review:' || (n.file ->> 'why') end,
      case when not n.file ? 'why' and n.deadline is null and not exists (select 1 from human_verdicts h where h.notice_id = n.id and h.field = 'deadline') then 'no_deadline' end,
      case when n.field_state = 'missing' or (n.field_state = 'judged' and not exists (select 1 from notice_fields nf where nf.notice_id = n.id)) then 'no_fields' end
    ], null) as reasons
    from notices n where n.id = any(${ids})`;
  const has = rows.filter(r => r.reasons.length);
  await sql`delete from review_items where notice_id = any(${rows.filter(r => !r.reasons.length).map(r => r.id)})`;
  for (const r of has) {
    if (onlyExisting) await sql`update review_items set reasons = ${r.reasons} where notice_id = ${r.id}`;
    else await sql`insert into review_items (notice_id, reasons) values (${r.id}, ${r.reasons})
      on conflict (notice_id) do update set reasons = excluded.reasons,
        checked_by = case when review_items.reasons = excluded.reasons then review_items.checked_by end,
        checked_at = case when review_items.reasons = excluded.reasons then review_items.checked_at end`;
  }
}

/** 목록에서 사라진 분야를 사람 판정의 분야에서 빼고 고친 기록에 남긴다(research R11). keep이 비면 모두 뺀다(목록 갈아타기) */
export async function stripHumanFields(sql: Db, keep: string[]) {
  const rows = await sql<{ notice_id: string; value: { core: string[]; related: string[] } }[]>`select notice_id, value from human_verdicts where field = 'fields'`;
  for (const r of rows) {
    const next = { core: r.value.core.filter(id => keep.includes(id)), related: r.value.related.filter(id => keep.includes(id)) };
    if (next.core.length === r.value.core.length && next.related.length === r.value.related.length) continue;
    await sql`update human_verdicts set value = ${sql.json(next)} where notice_id = ${r.notice_id} and field = 'fields'`;
    await sql`insert into verdict_log (notice_id, field, action, old, new, by_operator) values (${r.notice_id}, 'fields', 'edit', ${sql.json(r.value)}, ${sql.json(next)}, 'ingest')`;
  }
}
