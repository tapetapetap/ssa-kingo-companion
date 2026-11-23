// 넣기(US1, research R11·R22): 결과 파일과 분야 목록을 검사하고 한 트랜잭션에서 공지와 분야를 갖춘다. 어긋나면 아무것도 바꾸지 않는다
import { createHash } from 'node:crypto';
import { checkTaxonomy, isTaxonomyId, loadTaxonomy, TAXONOMY_DIR, type Taxonomy } from '../../etl/taxonomy/taxonomy.ts';
import type { Mode } from '../config.ts';
import type { Sql } from '../db/sql.ts';
import { rebuild } from '../analysis/store.ts';
import { applyHuman, refreshReview, stripHumanFields } from '../ops/review.ts';
import { checkResultFile, type ResultFile } from './check.ts';
import { fieldVectorsFor, noticeVectorFor, vectorText, type VectorDeps } from './vectors.ts';

export type IngestSummary = {
  new: number; changed: number; same: number; down: number; revived: number; review: number; humanKept: number;
  vectors: { kept: number; made: number; failed: number }; taxonomy: { id: string; edition: string; chosen: boolean }; switched: { from: string; to: string } | null;
};
export type IngestResult = { ok: true; summary: IngestSummary; dryRun: boolean } | { ok: false; reason: string };
export type IngestDeps = VectorDeps & { sql: Sql; mode: Mode; taxonomyDir?: string };

const hash = (o: unknown) => createHash('sha1').update(JSON.stringify(o)).digest('hex');
const searchText = (title: string, host: string | null) => `${title}${host ?? ''}`.toLowerCase().replace(/\s+/g, '');
const noOf = (id: string) => Number(id.slice(4));

export function summaryLine(s: IngestSummary): string {
  const v = s.vectors;
  const line = `새 ${s.new} · 바뀜 ${s.changed} · 그대로 ${s.same} · 내려감 ${s.down} · 되살림 ${s.revived} · 확인 필요 ${s.review} · 사람 판정 유지 ${s.humanKept} · 벡터 보관 ${v.kept} / 새로 ${v.made} / 못 만듦 ${v.failed} · 분야 목록 ${s.taxonomy.id}(${s.taxonomy.edition}, ${s.taxonomy.chosen ? '고른 안' : '고르지 않은 안'})`;
  return s.switched ? `${line} · 목록 바꿈 ${s.switched.from} → ${s.switched.to}` : line;
}

async function reject(sql: Sql, f: Partial<ResultFile> | null, taxonomyId: string, reason: string, dryRun: boolean): Promise<IngestResult> {
  if (!dryRun) await sql`insert into ingest_runs (source, collected_at, since, taxonomy_id, rejected) values (${f?.source ?? ''}, ${f?.collectedAt ?? null}, ${f?.since ?? null}, ${taxonomyId}, ${reason})`;
  return { ok: false, reason };
}

export async function ingest(input: unknown, taxonomyId: string, o: { switch?: boolean; dryRun?: boolean }, d: IngestDeps): Promise<IngestResult> {
  const { sql } = d;
  const dryRun = !!o.dryRun;
  const f = (typeof input === 'object' && input !== null ? input : null) as Partial<ResultFile> | null;
  if (!isTaxonomyId(taxonomyId)) return reject(sql, f, taxonomyId, `없는 분야 목록이에요: ${taxonomyId}`, dryRun);
  let t: Taxonomy;
  try {
    t = loadTaxonomy(taxonomyId, d.taxonomyDir ?? TAXONOMY_DIR);
  } catch (e) {
    return reject(sql, f, taxonomyId, e instanceof Error ? e.message : String(e), dryRun);
  }
  const listBad = checkTaxonomy(t);
  if (listBad.length) return reject(sql, f, taxonomyId, listBad[0], dryRun);
  const bad = checkResultFile(input, t);
  if (bad.length) return reject(sql, f, taxonomyId, bad.length > 1 ? `${bad[0]} (외 ${bad.length - 1}곳)` : bad[0], dryRun);
  const file = input as ResultFile;
  if (file.taxonomy && file.taxonomy.id !== t.id) return reject(sql, file, taxonomyId, `결과 파일은 분야 목록 ${file.taxonomy.id}로 판정했어요(--taxonomy ${t.id})`, dryRun);
  if (d.mode === 'prod' && !t.chosen) return reject(sql, file, taxonomyId, `운영 모드는 고른 분야 목록만 넣어요(${t.id}에 고른 표시가 없어요)`, dryRun);
  const active = (await sql<{ id: string }[]>`select id from taxonomies where active`)[0]?.id ?? null;
  if (active && active !== t.id && !o.switch) {
    return reject(sql, file, taxonomyId, `지금 분야 목록은 ${active}이에요. ${t.id}로 갈아타려면 --switch를 붙여요(고른 분야와 활동·사람 판정의 분야가 지워져요)`, dryRun);
  }

  // 지금 DB 상태와 견준다(쓰기 전, 트랜잭션 밖에서 벡터를 갖춘다: 임베딩이 오래 걸릴 수 있다)
  const rows = await sql<{ id: string; file_hash: string; down: boolean; is_notice: boolean; has_vector: boolean }[]>`
    select id, file_hash, down, is_notice, vector is not null as has_vector from notices where source = ${file.source}`;
  const before = new Map(rows.map(r => [r.id, r]));
  const s: IngestSummary = {
    new: 0, changed: 0, same: 0, down: 0, revived: 0, review: file.review.length, humanKept: 0,
    vectors: { kept: 0, made: 0, failed: 0 }, taxonomy: { id: t.id, edition: t.edition, chosen: !!t.chosen }, switched: active && active !== t.id ? { from: active, to: t.id } : null
  };
  const vectors = new Map<string, number[]>();
  for (const x of file.opportunities) {
    const b = before.get(x.id);
    if (!b || !b.is_notice) s.new++;
    else if (b.down) s.revived++;
    else if (b.file_hash === hash(x)) s.same++;
    else s.changed++;
    if (b?.has_vector) continue;
    const r = await noticeVectorFor({ no: noOf(x.id), title: x.title, postedAt: x.postedAt }, { ...d, dryRun });
    s.vectors[r.how]++;
    if (r.vector) vectors.set(x.id, r.vector);
  }
  const inFile = new Set([...file.opportunities, ...file.review].map(x => x.id));
  const sinceRows = await sql<{ id: string }[]>`select id from notices where source = ${file.source} and not down and posted_on >= ${file.since}`;
  const goneIds = sinceRows.map(r => r.id).filter(id => !inFile.has(id));
  s.down = goneIds.length;
  s.humanKept = Number((await sql<{ n: number }[]>`select count(distinct notice_id)::int as n from human_verdicts where notice_id = any(${[...inFile]})`)[0].n);
  if (dryRun) return { ok: true, summary: s, dryRun };
  const fv = await fieldVectorsFor(t, d);

  await sql.begin(async tx => {
    if (s.switched) await tx`update taxonomies set active = false where active`;
    await tx`insert into taxonomies (id, name, edition, chosen, active) values (${t.id}, ${t.name}, ${t.edition}, ${t.chosen ? tx.json(t.chosen) : null}, true)
      on conflict (id) do update set name = excluded.name, edition = excluded.edition, chosen = excluded.chosen, active = true, loaded_at = now()`;
    await tx`delete from field_groups where taxonomy_id = ${t.id}`;
    for (const [i, g] of t.groups.entries()) await tx`insert into field_groups (taxonomy_id, id, name, parent_id, ord) values (${t.id}, ${g.id}, ${g.name}, ${g.parent}, ${i})`;
    await tx`delete from fields where taxonomy_id = ${t.id} and not (id = any(${t.fields.map(x => x.id)}))`;
    // 고른 분야: 목록을 갈아타면 모두, 같은 목록의 새 판이면 사라진 분야만 뺀다(FR-008). 남은 분야가 3개 미만이면 다음 할 일이 분야 고르기가 된다
    if (s.switched) await tx`delete from student_fields`;
    else await tx`delete from student_fields where not (field_id = any(${t.fields.map(x => x.id)}))`;
    // 직접 넣은 활동의 분야와 몰린 분야의 뺀 줄도 같다(research R11). 활동은 남는다
    const keep = s.switched ? [] : t.fields.map(x => x.id);
    await tx`update activities set field_ids = array(select f from unnest(field_ids) f where f = any(${keep}::text[])) where not (field_ids <@ ${keep}::text[])`;
    await tx`delete from excluded_lines where (line_key like 'liked:%' or line_key like 'disliked:%') and not (split_part(line_key, ':', 2) = any(${keep}::text[]))`;
    await stripHumanFields(tx, keep);
    for (const [i, x] of t.fields.entries()) {
      const v = fv ? fv.vectors[fv.ids.indexOf(x.id)] : null;
      await tx`insert into fields (taxonomy_id, id, name, group_id, description, ord, vector) values (${t.id}, ${x.id}, ${x.name}, ${x.group}, ${x.desc}, ${i}, ${v ? vectorText(v) : null}::vector)
        on conflict (taxonomy_id, id) do update set name = excluded.name, group_id = excluded.group_id, description = excluded.description, ord = excluded.ord, vector = coalesce(excluded.vector, fields.vector)`;
    }
    for (const x of file.opportunities) {
      const state = !file.taxonomy ? 'off' : x.fields ? 'judged' : 'missing';
      const v = vectors.get(x.id);
      await tx`insert into notices (id, source, title, url, posted_on, host, is_notice, kind, deadline, field_state, field_rule, search_text, vector, down, file, file_hash)
        values (${x.id}, ${file.source}, ${x.title}, ${x.url}, ${x.postedAt}, ${x.host}, true, ${x.kind}, ${x.deadline}, ${state}, ${x.fieldRule ?? null}, ${searchText(x.title, x.host)}, ${v ? vectorText(v) : null}::vector, false, ${tx.json(x)}, ${hash(x)})
        on conflict (id) do update set title = excluded.title, url = excluded.url, posted_on = excluded.posted_on, host = excluded.host, is_notice = true, kind = excluded.kind,
          deadline = excluded.deadline, field_state = excluded.field_state, field_rule = excluded.field_rule, search_text = excluded.search_text,
          vector = coalesce(excluded.vector, notices.vector), down = false, file = excluded.file,
          updated_at = case when notices.file_hash = excluded.file_hash and not notices.down then notices.updated_at else now() end, file_hash = excluded.file_hash`;
      await tx`delete from notice_fields where notice_id = ${x.id}`;
      for (const [lv, ids] of [['core', x.fields?.core ?? []], ['related', x.fields?.related ?? []]] as const) {
        for (const [i, id] of ids.entries()) await tx`insert into notice_fields (notice_id, field_id, level, ord) values (${x.id}, ${id}, ${lv}, ${i})`;
      }
    }
    for (const x of file.review) {
      await tx`insert into notices (id, source, title, url, posted_on, host, is_notice, kind, deadline, field_state, field_rule, search_text, down, file, file_hash)
        values (${x.id}, ${file.source}, ${x.title}, ${x.url}, ${x.postedAt}, null, false, null, null, 'off', null, ${searchText(x.title, null)}, false, ${tx.json(x)}, ${hash(x)})
        on conflict (id) do update set title = excluded.title, url = excluded.url, posted_on = excluded.posted_on, host = null, is_notice = false, kind = null, deadline = null,
          field_state = 'off', field_rule = null, search_text = excluded.search_text, down = false, file = excluded.file, file_hash = excluded.file_hash, updated_at = now()`;
      await tx`delete from notice_fields where notice_id = ${x.id}`;
    }
    if (goneIds.length) await tx`update notices set down = true, updated_at = now() where id = any(${goneIds})`;
    // 사람 판정이 있는 칸은 결과 파일 값 위에 다시 덮는다(FR-052). 내려간 공지는 확인할 것에서 뺀다
    await applyHuman(tx, [...inFile]);
    await refreshReview(tx, [...inFile]);
    await tx`delete from review_items where notice_id = any(${goneIds})`;
    await tx`insert into ingest_runs (source, collected_at, since, taxonomy_id, taxonomy_edition, summary) values (${file.source}, ${file.collectedAt}, ${file.since}, ${t.id}, ${t.edition}, ${tx.json(s)})`;
  });
  // 분야 이름·목록과 공지 분야가 바뀌었을 수 있어 분석을 모두 다시 쓴다(판은 글이 바뀐 학생만 오른다)
  for (const r of await sql<{ student_id: string }[]>`select student_id from analyses`) await rebuild(sql, Number(r.student_id));
  return { ok: true, summary: s, dryRun };
}
