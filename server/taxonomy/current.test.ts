import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fieldVersion } from '../../etl/notices/fields.ts';
import { validList } from '../../etl/taxonomy/fixtures.ts';
import { loadTaxonomyFile, mergeDraft, saveTaxonomy, type Taxonomy } from '../../etl/taxonomy/taxonomy.ts';
import { testDb } from '../test/db.ts';
import { seedTaxonomy } from '../test/student.ts';
import { currentTaxonomy, currentVersion, measuredList, pendingFiles, versionName, writeVersionFile } from './current.ts';

let db: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.sql`truncate taxonomies, taxonomy_versions, taxonomy_changes, taxonomy_drafts cascade`; });

const tmp = () => mkdtempSync(join(tmpdir(), 'current-'));
const baseDir = (t = validList('custom')) => { const dir = tmp(); saveTaxonomy(t, dir); return dir; };
async function addVersion(t: Taxonomy, name: string, list: Taxonomy, edits: object[] = []) {
  const [v] = await db.sql<{ id: string }[]>`insert into taxonomy_versions (taxonomy_id, name, list, edits, field_version, base_version, by_operator)
    values (${t.id}, ${name}, ${db.sql.json(list as never)}, ${db.sql.json(edits as never)}, ${fieldVersion(list)}, ${fieldVersion(t)}, 'ops@x.co') returning id`;
  return v.id;
}

describe('지금 분야 판(4단계 research R1·R2·R6)', () => {
  it('바꾼 기록이 없으면 바탕 파일, 적용하면 그 판, 바탕으로 되돌리면 다시 바탕', async () => {
    const t = await seedTaxonomy(db.sql);
    const dir = baseDir(t);
    expect(await currentVersion(db.sql, dir)).toMatchObject({ name: '바탕', id: null, baseChanged: false });
    expect((await currentTaxonomy(db.sql, dir))?.fields[0].desc).toBe(t.fields[0].desc);
    const list = mergeDraft(t, [{ fieldId: t.fields[0].id, aliases: ['가'], desc: '고친 정의' }]);
    const id = await addVersion(t, '2026-11-28-1', list);
    await db.sql`insert into taxonomy_changes (taxonomy_id, kind, version_id, by_operator) values (${t.id}, 'apply', ${id}, 'ops@x.co')`;
    expect(await currentVersion(db.sql, dir)).toMatchObject({ name: '2026-11-28-1', id: Number(id) });
    expect((await currentTaxonomy(db.sql, dir))?.fields[0]).toMatchObject({ aliases: ['가'], desc: '고친 정의' });
    await db.sql`insert into taxonomy_changes (taxonomy_id, kind, version_id, by_operator) values (${t.id}, 'revert', null, 'ops@x.co')`;
    expect((await currentVersion(db.sql, dir))!.name).toBe('바탕');
  });

  it('바탕 파일의 판정 칸이 바뀌면 baseChanged, CSRankings만 바뀌면 그대로', async () => {
    const t = await seedTaxonomy(db.sql);
    const id = await addVersion(t, '2026-11-28-1', t);
    await db.sql`insert into taxonomy_changes (taxonomy_id, kind, version_id, by_operator) values (${t.id}, 'apply', ${id}, 'ops@x.co')`;
    expect((await currentVersion(db.sql, baseDir({ ...t, fields: t.fields.map((f, i) => (i ? f : { ...f, csr: [] })) })))!.baseChanged).toBe(false);
    expect((await currentVersion(db.sql, baseDir({ ...t, fields: t.fields.map((f, i) => (i ? f : { ...f, desc: '바뀐 바탕' })) })))!.baseChanged).toBe(true);
  });

  it('잴 목록은 언제나 바탕 + 판의 고침 + 초안이다. 바탕이 같으면 판 목록에 초안을 얹은 것과 같다', async () => {
    const t = validList('custom');
    const [a, b] = t.fields;
    const edits = [{ fieldId: a.id, aliases: ['가'], desc: a.desc }];
    const draft = [{ fieldId: b.id, aliases: ['나'], desc: '초안 정의' }];
    expect(measuredList(t, edits, draft)).toEqual(mergeDraft(mergeDraft(t, edits), draft));
    const newBase = { ...t, fields: t.fields.map((f, i) => (i === 2 ? { ...f, desc: '새 바탕' } : f)) };
    const m = measuredList(newBase, edits, draft);
    expect([m.fields[0].aliases, m.fields[1].desc, m.fields[2].desc]).toEqual([['가'], '초안 정의', '새 바탕']);
  });

  it('판 이름은 한국 날짜와 그날의 순번이다', async () => {
    const t = await seedTaxonomy(db.sql);
    const at = new Date('2026-11-28T15:30:00Z'); // 한국 11월 29일 00:30
    expect(await versionName(db.sql, t.id, at)).toBe('2026-11-29-1');
    await addVersion(t, '2026-11-29-1', t);
    expect(await versionName(db.sql, t.id, at)).toBe('2026-11-29-2');
  });

  it('판 파일은 <id>-<이름>.json, 바탕 꼴이고 덮어쓰지 않는다. 같은 내용이면 그대로, 다르면 던진다. 아직 못 쓴 판을 찾는다', async () => {
    const t = await seedTaxonomy(db.sql);
    const dir = tmp();
    const list = mergeDraft(t, [{ fieldId: t.fields[0].id, aliases: ['가'], desc: t.fields[0].desc }]);
    const id = await addVersion(t, '2026-11-28-1', list);
    expect((await pendingFiles(db.sql)).map(v => v.id)).toEqual([Number(id)]);
    const file = writeVersionFile(dir, { taxonomy_id: t.id, name: '2026-11-28-1', list });
    expect(file).toBe(join(dir, 'custom-2026-11-28-1.json'));
    expect(loadTaxonomyFile(file)).toEqual(list);
    expect(writeVersionFile(dir, { taxonomy_id: t.id, name: '2026-11-28-1', list })).toBe(file);
    writeFileSync(file, JSON.stringify({ ...list, name: '다른 것' }));
    expect(() => writeVersionFile(dir, { taxonomy_id: t.id, name: '2026-11-28-1', list })).toThrow('이미 다른 내용');
    expect(JSON.parse(readFileSync(file, 'utf8')).name).toBe('다른 것');
  });
});
