// 모델을 잰 조건(FR-054, 3단계 research R15): 하나라도 지금과 다르면 그 결과로 바꿀 수 없다
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fieldVersion } from '../../etl/notices/fields.ts';
import { roundFile } from '../../etl/notices/gold.ts';
import { PROMPT_VERSION } from '../../etl/notices/llm.ts';
import type { Taxonomy, TaxonomyId } from '../../etl/taxonomy/taxonomy.ts';
import type { Sql } from '../db/sql.ts';
import { currentTaxonomy } from '../taxonomy/current.ts';

/** 재는 방법의 판. 방법을 바꾸면 올린다 */
export const TRIAL_VERSION = 1;
export type Conditions = { taxonomy: Taxonomy; fieldVersion: string; promptVersion: string; goldVersion: string | null };

/** 활성 목록의 지금 분야 판(적용한 판이 없으면 바탕 파일). 없거나 읽지 못하면 null(4단계 research R1) */
export const activeTaxonomy = (sql: Sql, dir?: string): Promise<Taxonomy | null> => currentTaxonomy(sql, dir);

/** 지금 조건. 정답셋은 api가 볼 수 없어 jobs가 10분마다 적어 둔 판을 읽는다(없으면 모든 결과가 낡은 것이다) */
export async function conditions(sql: Sql, dir?: string): Promise<Conditions | null> {
  const taxonomy = await activeTaxonomy(sql, dir);
  if (!taxonomy) return null;
  const [g] = await sql<{ value: string }[]>`select value from op_state where key = 'gold_version'`;
  return { taxonomy, fieldVersion: fieldVersion(taxonomy), promptVersion: PROMPT_VERSION, goldVersion: g?.value ?? null };
}

/** 그 목록의 정답 파일이 있는 가장 큰 회차. 없으면 0 */
export function latestRound(goldDir: string, id: TaxonomyId): number {
  let n = 0;
  while (existsSync(roundFile(goldDir, id, n + 1))) n++;
  return n;
}

/** 쓰는 정답 파일 셋의 판. 하나라도 없으면 null */
export function goldVersion(goldDir: string, id: TaxonomyId): string | null {
  const n = latestRound(goldDir, id);
  const files = [join(goldDir, 'dev-501.csv'), roundFile(goldDir, 'sample', n), roundFile(goldDir, id, n)];
  if (!n || !files.every(f => existsSync(f))) return null;
  const h = createHash('sha1');
  for (const f of files) h.update(readFileSync(f));
  return h.digest('hex').slice(0, 8);
}

/** jobs가 정답셋 판을 적는다 */
export async function saveGoldVersion(sql: Sql, goldDir: string, dir?: string) {
  const t = await activeTaxonomy(sql, dir);
  let v: string | null = null;
  try {
    v = t && goldVersion(goldDir, t.id);
  } catch { /* 읽지 못하는 파일이 있으면 정답셋이 없는 것과 같다. 다른 운영자 요청은 막지 않는다 */ }
  if (v) await sql`insert into op_state (key, value) values ('gold_version', ${v}) on conflict (key) do update set value = excluded.value, at = now()`;
  else await sql`delete from op_state where key = 'gold_version'`;
}
