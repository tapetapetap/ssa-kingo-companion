import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { main } from './cli.ts';
import { testDb } from './test/db.ts';

let db: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
afterEach(() => { vi.restoreAllMocks(); });
const quiet = () => ({ err: vi.spyOn(console, 'error').mockImplementation(() => {}), log: vi.spyOn(console, 'log').mockImplementation(() => {}) });

describe('cli (contracts/cli.md)', () => {
  it.each([[[]], [['nope']], [['migrate', 'x']]])('%j는 쓰는 법과 2', async args => {
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
});
