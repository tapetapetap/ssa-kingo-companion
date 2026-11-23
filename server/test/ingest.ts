// 시험용 넣기: 임시 목록 폴더와 가짜 임베딩으로 결과 파일을 넣는다(운영자 시험이 쓴다)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validList } from '../../etl/taxonomy/fixtures.ts';
import { saveTaxonomy, TAXONOMY_IDS } from '../../etl/taxonomy/taxonomy.ts';
import type { Sql } from '../db/sql.ts';
import { ingest } from '../ingest/ingest.ts';

/** change로 custom 목록을 바꿔 넣을 수 있다(사라진 분야 시험) */
export function ingester(sql: Sql, change: (t: ReturnType<typeof validList>) => void = () => {}) {
  const tmp = () => mkdtempSync(join(tmpdir(), 'ops-'));
  const taxonomyDir = tmp();
  for (const id of TAXONOMY_IDS) { const t = validList(id); if (id === 'custom') change(t); saveTaxonomy(t, taxonomyDir); }
  const d = { sql, mode: 'dev' as const, taxonomyDir, cacheDir: tmp(), embedDir: tmp(), embed: async (texts: string[]) => texts.map(() => Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0))) };
  return async (f: unknown) => {
    const r = await ingest(f, 'custom', {}, d);
    if (!r.ok) throw new Error(r.reason);
    return r.summary;
  };
}
