import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validList } from '../etl/taxonomy/fixtures.ts';
import { saveTaxonomy, TAXONOMY_IDS } from '../etl/taxonomy/taxonomy.ts';
import { main } from './cli.ts';
import { readFileSync } from 'node:fs';
import { applyHuman } from './ops/review.ts';
import { ingester } from './test/ingest.ts';
import { file, opp } from './test/result.ts';
import { testDb } from './test/db.ts';

let db: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
afterEach(() => { vi.restoreAllMocks(); });
const quiet = () => ({ err: vi.spyOn(console, 'error').mockImplementation(() => {}), log: vi.spyOn(console, 'log').mockImplementation(() => {}) });

describe('cli (contracts/cli.md)', () => {
  it.each([[[]], [['nope']], [['migrate', 'x']], [['ingest']], [['ingest', 'a.json']], [['ingest', 'a.json', '--taxonomy']], [['ingest', 'a.json', 'b.json', '--taxonomy', 'custom']], [['account']], [['account', 'make', 'a@b.co']], [['account', 'delete', 'a@b.co', '--dept', 'x']], [['export-gold']], [['export-gold', 'a', 'b']]])('%j는 쓰는 법과 2', async args => {
    const { err } = quiet();
    expect(await main(args, { sql: db.sql })).toBe(2);
    expect(String(err.mock.calls[0][0])).toMatch(/^쓰는 법: /);
  });

  it('migrate는 적용할 것이 없으면 그렇게 말하고 0, --json이면 JSON', async () => {
    const { log } = quiet();
    expect(await main(['migrate'], { sql: db.sql })).toBe(0);
    expect(await main(['migrate', '--json'], { sql: db.sql })).toBe(0);
    expect(log.mock.calls.map(c => c[0])).toEqual(['적용할 스키마 바꾸기가 없어요', '{"applied":[]}']);
  });

  it('설정이 틀리면 이유를 내고 1', async () => {
    const { err } = quiet();
    expect(await main(['migrate'], { env: {} })).toBe(1);
    expect(String(err.mock.calls[0][0])).toContain('KINGO_MODE');
  });

  it('ingest는 요약 한 줄을 내고 0, 거절이면 이유와 1, 파일이 없으면 1', async () => {
    const { err, log } = quiet();
    const dir = mkdtempSync(join(tmpdir(), 'cli-'));
    for (const id of TAXONOMY_IDS) saveTaxonomy(validList(id), dir);
    const path = join(dir, 'out.json');
    writeFileSync(path, JSON.stringify(file()));
    const embed = async (texts: string[]) => texts.map(() => Array.from({ length: 1024 }, () => 0));
    const extra = { taxonomyDir: dir, embedDir: dir, cacheDir: dir, embed };
    expect(await main(['ingest', path, '--taxonomy', 'custom', '--dry-run'], { sql: db.sql, ingest: extra })).toBe(0);
    expect(String(log.mock.calls[0][0])).toMatch(/^\(해 보기\) 새 2 · 바뀜 0/);
    expect(await main(['ingest', path, '--taxonomy', 'custom', '--json'], { sql: db.sql, ingest: extra })).toBe(0);
    expect(JSON.parse(String(log.mock.calls[1][0]))).toMatchObject({ dryRun: false, new: 2, review: 1 });
    expect(await main(['ingest', path, '--taxonomy', 'ncs'], { sql: db.sql, ingest: extra })).toBe(1);
    expect(String(err.mock.calls[0][0])).toContain('넣지 않았어요: 지금 분야 목록은 custom이에요');
    expect(await main(['ingest', join(dir, 'none.json'), '--taxonomy', 'custom'], { sql: db.sql, ingest: extra })).toBe(1);
    expect(String(err.mock.calls[1][0])).toContain('결과 파일을 읽지 못했어요');
  });

  it('account: 만들기·비밀번호 바꾸기·지우기. 비밀번호는 표준 입력으로 받고, 운영 모드는 만들기·바꾸기를 거절한다', async () => {
    const { err, log } = quiet();
    const pw = (s: string) => async () => `${s}\n`;
    expect(await main(['account', 'create', 'Dev1@Example.com', '--dept', '지능형소프트웨어학과'], { sql: db.sql, stdin: pw('correct horse') })).toBe(0);
    expect(String(log.mock.calls[0][0])).toBe('개발 계정을 만들었어요: dev1@example.com');
    expect((await db.sql`select s.dept, m.subject from students s join login_methods m on m.student_id = s.id`)[0]).toMatchObject({ dept: '지능형소프트웨어학과', subject: 'dev1@example.com' });
    expect(await main(['account', 'create', 'dev1@example.com'], { sql: db.sql, stdin: pw('correct horse') })).toBe(1);
    expect(String(err.mock.calls.at(-1)?.[0])).toContain('이미 있는 계정이에요');
    expect(await main(['account', 'create', 'dev2@example.com'], { sql: db.sql, stdin: pw('short') })).toBe(1);
    expect(String(err.mock.calls.at(-1)?.[0])).toContain('8자 이상');
    expect(await main(['account', 'password', 'dev1@example.com'], { sql: db.sql, stdin: pw('another horse') })).toBe(0);
    expect(await main(['account', 'password', 'dev1@example.com'], { sql: db.sql, env: { KINGO_MODE: 'prod' }, stdin: pw('another horse') })).toBe(1);
    expect(String(err.mock.calls.at(-1)?.[0])).toContain('운영 모드에서는 개발 계정을');
    expect(await main(['account', 'delete', 'dev1@example.com'], { sql: db.sql, env: { KINGO_MODE: 'prod' } })).toBe(0);
    expect(Number((await db.sql`select count(*) n from students`)[0].n)).toBe(0);
    expect(await main(['account', 'delete', 'dev1@example.com'], { sql: db.sql })).toBe(1);
  });

  it('export-gold: 사람 판정이 있는 공지만 보이는 값으로 CSV에 쓰고, 저장소 안 폴더는 거절한다(FR-053)', async () => {
    const { err, log } = quiet();
    await db.sql`truncate notices, taxonomies cascade`;
    await ingester(db.sql)(file({ taxonomy: { id: 'custom', prompt: '1a2b3c4d' }, opportunities: [opp(1, { title: '[가나다] "인턴" 모집', fields: { core: ['backend'], related: [] }, fieldRule: 'LLM: m' }), opp(2)] }));
    await db.sql`insert into human_verdicts (notice_id, field, value, by_operator) values ('cse:1', 'kind', '"edu"', 'ops@example.com'), ('cse:1', 'fields', '{"core":["frontend"],"related":[]}', 'ops@example.com')`;
    await applyHuman(db.sql, ['cse:1']);
    const dir = join(mkdtempSync(join(tmpdir(), 'gold-')), 'out');
    expect(await main(['export-gold', dir], { sql: db.sql })).toBe(0);
    const path = String(log.mock.calls[0][0]).replace(/^정답셋 후보 1개를 썼어요: /, '');
    const [head, row, end] = readFileSync(path, 'utf8').split('\n');
    expect(head).toBe('"링크","제목","게시일","주최","기회","종류","마감","핵심 분야","관련 분야","고친 칸","고친 때"');
    expect(row).toMatch(/^"https:\/\/cse\.skku\.edu\/cse\/notice\.do\?mode=view&articleNo=1","\[가나다\] ""인턴"" 모집","2026-11-01","가나다","O","교육·캠프","2026-11-20","frontend","-","fields\|kind","[^"]+\+09:00"$/);
    expect(end).toBe('');
    expect(await main(['export-gold', join(process.cwd(), 'gold-out')], { sql: db.sql })).toBe(1);
    expect(String(err.mock.calls[0][0])).toContain('저장소 안 폴더에는 쓰지 않아요');
  });
});
