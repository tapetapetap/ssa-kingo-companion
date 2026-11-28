// 지금 분야 판(4단계 research R1·R2·R6): 적용한 판의 전체 목록은 DB에, 바탕은 저장소 파일에 있다
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fieldVersion } from '../../etl/notices/fields.ts';
import { isTaxonomyId, loadTaxonomy, mergeDraft, TAXONOMY_DIR, type DraftLine, type Taxonomy } from '../../etl/taxonomy/taxonomy.ts';
import type { Sql } from '../db/sql.ts';
import { kstDay } from '../ops/counts.ts';

export const VERSIONS_DIR = fileURLToPath(new URL('../../etl/taxonomy/versions', import.meta.url));

type VersionRow = { id: string; taxonomy_id: string; name: string; list: Taxonomy; edits: DraftLine[]; field_version: string; base_version: string; trial_id: string | null; by_operator: string; at: Date; file: string | null };
export type Current = {
  taxonomyId: string; name: string; id: number | null; list: Taxonomy; edits: DraftLine[]; baseVersion: string;
  /** 판을 만든 뒤 바탕 파일의 판정 칸이 바뀜 */
  baseChanged: boolean; by: string | null; at: Date | null; trialId: number | null;
};

/** 활성 목록의 지금 판. 활성 목록이 없거나 바탕 파일을 읽지 못하면 null */
export async function currentVersion(sql: Sql, dir = TAXONOMY_DIR): Promise<Current | null> {
  const [a] = await sql<{ id: string }[]>`select id from taxonomies where active`;
  if (!a || !isTaxonomyId(a.id)) return null;
  let base: Taxonomy;
  try {
    base = loadTaxonomy(a.id, dir);
  } catch {
    return null;
  }
  const baseVersion = fieldVersion(base);
  const [c] = await sql<{ version_id: string | null }[]>`select version_id from taxonomy_changes where taxonomy_id = ${a.id} order by id desc limit 1`;
  const [v] = c?.version_id ? await sql<VersionRow[]>`select * from taxonomy_versions where id = ${c.version_id}` : [];
  if (!v) return { taxonomyId: a.id, name: '바탕', id: null, list: base, edits: [], baseVersion, baseChanged: false, by: null, at: null, trialId: null };
  return {
    taxonomyId: a.id, name: v.name, id: Number(v.id), list: v.list, edits: v.edits, baseVersion: v.base_version,
    baseChanged: v.base_version !== baseVersion, by: v.by_operator, at: v.at, trialId: v.trial_id === null ? null : Number(v.trial_id)
  };
}

export const currentTaxonomy = async (sql: Sql, dir = TAXONOMY_DIR) => (await currentVersion(sql, dir))?.list ?? null;

/** 잴 목록: 바탕 + 판의 고침 + 초안. 바탕이 그대로면 판 목록에 초안을 얹은 것과 같고, 바탕이 바뀌면 새 바탕에 고침을 얹는다(research R5) */
export function measuredList(base: Taxonomy, edits: DraftLine[], draft: DraftLine[]): Taxonomy {
  const by = new Map(edits.map(e => [e.fieldId, e]));
  for (const d of draft) by.set(d.fieldId, d);
  return mergeDraft(base, [...by.values()]);
}

/** 한국 날짜와 그날의 순번. 적용과 같은 잠금 안에서 부른다(research R6) */
export async function versionName(sql: Sql, taxonomyId: string, now = new Date()): Promise<string> {
  const day = kstDay(now);
  const [r] = await sql<{ n: number }[]>`select count(*)::int as n from taxonomy_versions where taxonomy_id = ${taxonomyId} and name like ${day + '-%'}`;
  return `${day}-${r.n + 1}`;
}

/** 판 파일을 쓴다. 이미 있으면 덮어쓰지 않는다: 같은 내용이면 그 경로, 다르면 던진다 */
export function writeVersionFile(dir: string, v: { taxonomy_id: string; name: string; list: Taxonomy }): string {
  const file = join(dir, `${v.taxonomy_id}-${v.name}.json`);
  const text = `${JSON.stringify(v.list, null, 2)}\n`;
  if (existsSync(file)) {
    if (readFileSync(file, 'utf8') === text) return file;
    throw new Error(`판 파일이 이미 다른 내용으로 있어요: ${file}`);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${file}.tmp`, text);
  renameSync(`${file}.tmp`, file);
  return file;
}

/** 아직 판 파일을 쓰지 못한 판 */
export async function pendingFiles(sql: Sql) {
  const rows = await sql<VersionRow[]>`select * from taxonomy_versions where file is null order by id`;
  return rows.map(r => ({ id: Number(r.id), taxonomy_id: r.taxonomy_id, name: r.name, list: r.list }));
}
