import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validList } from '../etl/taxonomy/fixtures.ts';
import { saveTaxonomy, TAXONOMY_IDS } from '../etl/taxonomy/taxonomy.ts';
import { main } from './cli.ts';
import { file } from './test/result.ts';
import { testDb } from './test/db.ts';

let db: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
afterEach(() => { vi.restoreAllMocks(); });
const quiet = () => ({ err: vi.spyOn(console, 'error').mockImplementation(() => {}), log: vi.spyOn(console, 'log').mockImplementation(() => {}) });

describe('cli (contracts/cli.md)', () => {
  it.each([[[]], [['nope']], [['migrate', 'x']], [['ingest']], [['ingest', 'a.json']], [['ingest', 'a.json', '--taxonomy']], [['ingest', 'a.json', 'b.json', '--taxonomy', 'custom']], [['account']], [['account', 'make', 'a@b.co']], [['account', 'delete', 'a@b.co', '--dept', 'x']]])('%j는 쓰는 법과 2', async args => {
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
});
