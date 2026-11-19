import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { validList } from '../../etl/taxonomy/fixtures.ts';
import { saveTaxonomy, TAXONOMY_IDS } from '../../etl/taxonomy/taxonomy.ts';
import { testDb } from '../test/db.ts';
import { file, opp, review } from '../test/result.ts';
import { ingest, summaryLine, type IngestDeps } from './ingest.ts';

let db: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.sql`truncate notices, notice_fields, ingest_runs, taxonomies cascade`; });

const tmp = () => mkdtempSync(join(tmpdir(), 'ingest-'));
const lists = (change: (id: string, t: ReturnType<typeof validList>) => void = () => {}) => {
  const dir = tmp();
  for (const id of TAXONOMY_IDS) { const t = validList(id); change(id, t); saveTaxonomy(t, dir); }
  return dir;
};
/** 가짜 임베딩: 글마다 1024차원. calls로 몇 번 불렀는지 센다 */
const fakeEmbed = () => { const f = Object.assign(async (texts: string[]) => { f.calls++; return texts.map(() => Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0))); }, { calls: 0 }); return f; };
/** 본문 보관본(직접 만든 줄) */
const bodies = (nos: number[]) => { const dir = tmp(); for (const no of nos) writeFileSync(join(dir, `${no}.html`), `<html><body><div class="fr-view"><p>본문 ${no} 접수 안내</p></div></body></html>`); return dir; };
const deps = (o: Partial<IngestDeps> = {}): IngestDeps => ({ sql: db.sql, mode: 'dev', taxonomyDir: lists(), cacheDir: bodies([1, 2]), embedDir: tmp(), embed: fakeEmbed(), ...o });
const count = async (q: string) => Number((await db.sql.unsafe(q))[0].n);

describe('ingest (US1)', () => {
  it('빈 서버에 넣으면 공지·분야 목록·벡터가 생기고, 같은 파일을 다시 넣으면 바뀐 것이 0이다', async () => {
    const d = deps();
    const r = await ingest(file(), 'custom', {}, d);
    expect(r.ok && summaryLine(r.summary)).toBe('새 2 · 바뀜 0 · 그대로 0 · 내려감 0 · 되살림 0 · 확인 필요 1 · 사람 판정 유지 0 · 벡터 보관 0 / 새로 2 / 못 만듦 0 · 분야 목록 custom(2026-11-16, 고르지 않은 안)');
    expect(await count('select count(*) n from notices where is_notice')).toBe(2);
    expect(await count('select count(*) n from notices where not is_notice')).toBe(1);
    expect(await count("select count(*) n from fields where taxonomy_id = 'custom' and vector is not null")).toBe(80);
    expect(await count("select count(*) n from notices where field_state = 'off'")).toBe(3);
    const again = await ingest(file(), 'custom', {}, d);
    expect(again.ok && summaryLine(again.summary)).toMatch(/^새 0 · 바뀜 0 · 그대로 2 · 내려감 0 · 되살림 0 · 확인 필요 1 · 사람 판정 유지 0 · 벡터 보관 0 \/ 새로 0 \/ 못 만듦 0/);
    expect(await count('select count(*) n from ingest_runs where rejected is null')).toBe(2);
  });

  it('마감이 바뀐 공지만 바뀜이고, 기준일 안인데 빠진 공지는 내려가고 다시 나오면 되살린다. 기준일 앞 공지는 그대로다', async () => {
    const d = deps();
    await ingest(file({ opportunities: [opp(2), opp(1), opp(5, { postedAt: '2026-08-01' })] }), 'custom', {}, d);
    const r = await ingest(file({ opportunities: [opp(2, { deadline: '2026-11-25' })], review: [] }), 'custom', {}, d);
    expect(r.ok && r.summary).toMatchObject({ new: 0, changed: 1, same: 0, down: 2, review: 0 }); // 1번 기회와 3번 확인 필요 글이 내려감, 5번은 기준일 앞
    expect((await db.sql`select id, down, deadline::text from notices order by id`).map(x => [x.id, x.down, x.deadline])).toEqual([
      ['cse:1', true, '2026-11-20'], ['cse:2', false, '2026-11-25'], ['cse:3', true, null], ['cse:5', false, '2026-11-20']
    ]);
    const back = await ingest(file({ opportunities: [opp(2, { deadline: '2026-11-25' }), opp(1)], review: [] }), 'custom', {}, d);
    expect(back.ok && back.summary).toMatchObject({ revived: 1, same: 1, down: 0 });
  });

  it('확인 필요 글은 공지가 아닌 글로 들어가고, 기회가 확인 필요가 되면 공지가 아니게 된다. 확인 필요에서 기회가 되면 새다', async () => {
    const d = deps();
    await ingest(file(), 'custom', {}, d);
    const r = await ingest(file({ opportunities: [opp(2), opp(3)], review: [review(1)] }), 'custom', {}, d);
    expect(r.ok && r.summary).toMatchObject({ new: 1, same: 1, review: 1, down: 0 });
    expect((await db.sql`select id, is_notice, kind from notices order by id`).map(x => [x.id, x.is_notice, x.kind])).toEqual([['cse:1', false, null], ['cse:2', true, 'job'], ['cse:3', true, 'job']]);
  });

  it('벡터: 보관을 먼저 쓰고, 본문이 없거나 길이가 1024가 아니면 못 만듦이다. 확인 필요 글은 벡터를 만들지 않는다', async () => {
    const embedDir = tmp();
    mkdirSync(join(embedDir, 'bge-m3', 'notices'), { recursive: true });
    writeFileSync(join(embedDir, 'bge-m3', 'notices', '2.json'), JSON.stringify({ vector: Array.from({ length: 1024 }, () => 0.1) }));
    writeFileSync(join(embedDir, 'bge-m3', 'notices', '4.json'), JSON.stringify({ vector: [1, 2, 3] }));
    const embed = fakeEmbed();
    const r = await ingest(file({ opportunities: [opp(4), opp(2), opp(1), opp(7)] }), 'custom', {}, deps({ embedDir, embed, cacheDir: bodies([1]) }));
    expect(r.ok && r.summary.vectors).toEqual({ kept: 1, made: 1, failed: 2 }); // 2 보관 · 1 새로 · 4 길이 틀림 · 7 본문 없음
    expect((await db.sql`select id from notices where vector is not null order by id`).map(x => x.id)).toEqual(['cse:1', 'cse:2']);
  });

  it.each<[string, () => [unknown, string, { switch?: boolean }, Partial<IngestDeps>], string]>([
    ['분야 id가 목록에 없음', () => [file({ taxonomy: { id: 'custom', prompt: '1a2b3c4d' }, opportunities: [opp(1, { fields: { core: ['web-x'], related: [] }, fieldRule: 'LLM: m' })] }), 'custom', {}, {}], "'web-x'는 분야 목록 custom에 없어요"],
    ['머리의 목록이 다름', () => [file({ taxonomy: { id: 'ncs', prompt: '1a2b3c4d' } }), 'custom', {}, {}], '결과 파일은 분야 목록 ncs로 판정했어요'],
    ['운영 모드인데 고른 표시 없음', () => [file(), 'custom', {}, { mode: 'prod' }], '운영 모드는 고른 분야 목록만'],
    ['없는 목록', () => [file(), 'nope', {}, {}], '없는 분야 목록이에요: nope'],
    ['목록 파일 검사 실패', () => [file(), 'custom', {}, { taxonomyDir: lists((id, t) => { if (id === 'custom') t.fields[0].desc = ''; }) }], '설명이 비었어요']
  ])('거절: %s면 아무것도 바꾸지 않고 이유를 기록한다', async (_name, args, message) => {
    const [input, id, o, extra] = args();
    const r = await ingest(input, id, o, deps(extra));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain(message);
    expect(await count('select count(*) n from notices')).toBe(0);
    expect(await count('select count(*) n from taxonomies')).toBe(0);
    expect((await db.sql`select rejected from ingest_runs`)[0].rejected).toContain(message);
  });

  it('활성 목록과 다른 목록은 --switch가 있어야 갈아탄다', async () => {
    const d = deps();
    await ingest(file(), 'custom', {}, d);
    const r = await ingest(file(), 'csrankings', {}, d);
    expect(!r.ok && r.reason).toContain('지금 분야 목록은 custom이에요. csrankings로 갈아타려면 --switch를 붙여요');
    const s = await ingest(file(), 'csrankings', { switch: true }, d);
    expect(s.ok && summaryLine(s.summary)).toContain('목록 바꿈 custom → csrankings');
    expect((await db.sql`select id from taxonomies where active`).map(x => x.id)).toEqual(['csrankings']);
  });

  it('--dry-run은 요약만 내고 아무것도 쓰지 않으며 모델을 부르지 않는다', async () => {
    const embed = fakeEmbed();
    const r = await ingest(file(), 'custom', { dryRun: true }, deps({ embed }));
    expect(r.ok && r.summary).toMatchObject({ new: 2, vectors: { kept: 0, made: 2, failed: 0 } });
    expect(embed.calls).toBe(0);
    expect(await count('select count(*) n from notices')).toBe(0);
    expect(await count('select count(*) n from ingest_runs')).toBe(0);
  });

  it('분야 칸이 있으면 공지 분야와 field_state가 생긴다', async () => {
    const f = file({ taxonomy: { id: 'custom', prompt: '1a2b3c4d' }, opportunities: [opp(1, { fields: { core: ['backend'], related: ['csr-ai', 'qa'] }, fieldRule: 'LLM: gemma4:12b' }), opp(2)] });
    await ingest(f, 'custom', {}, deps());
    expect((await db.sql`select id, field_state, field_rule from notices order by id`).map(x => [x.id, x.field_state, x.field_rule])).toEqual([['cse:1', 'judged', 'LLM: gemma4:12b'], ['cse:2', 'missing', null], ['cse:3', 'off', null]]);
    expect((await db.sql`select field_id, level, ord from notice_fields order by level, ord`).map(x => `${x.level}:${x.field_id}`)).toEqual(['core:backend', 'related:csr-ai', 'related:qa']);
  });
});
