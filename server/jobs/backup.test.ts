import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../test/db.ts';
import { createDevStudent } from '../test/student.ts';
import { backup, restore } from './backup.ts';

let db: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });

describe('백업과 되살리기 (research R15)', () => {
  it('파일 이름은 한국 날짜이고 같은 날은 덮어쓴다. 이름의 날짜가 7일 이상 앞선 백업만 지우고 꼴이 다른 파일은 둔다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'backup-'));
    for (const f of ['kingo-2026-11-17.dump', 'kingo-2026-11-18.dump', 'kingo-2026-11-24.dump', 'notes.txt', 'kingo-old.dump']) writeFileSync(join(dir, f), 'old');
    const calls: string[][] = [];
    const run = async (cmd: string, args: string[]) => { calls.push([cmd, ...args]); writeFileSync(args[2], 'new'); };
    const file = await backup(dir, 'postgres://x/kingo', new Date('2026-11-23T15:30:00Z'), run); // 한국 2026-11-24 00:30
    expect(file).toBe(join(dir, 'kingo-2026-11-24.dump'));
    expect(calls).toEqual([['pg_dump', '-Fc', '-f', file, 'postgres://x/kingo']]);
    expect(readFileSync(file, 'utf8')).toBe('new');
    expect(readdirSync(dir).sort()).toEqual(['kingo-2026-11-18.dump', 'kingo-2026-11-24.dump', 'kingo-old.dump', 'notes.txt']);
  });

  it('비어 있지 않은 DB에는 되살리지 않고, 빈 DB에는 pg_restore --clean으로 되살린다', async () => {
    const calls: string[][] = [];
    const run = async (cmd: string, args: string[]) => { calls.push([cmd, ...args]); };
    await db.sql`truncate students, notices cascade`;
    await restore(db.sql, '/b/kingo-2026-11-24.dump', 'postgres://x/kingo', run);
    expect(calls).toEqual([['pg_restore', '--clean', '--if-exists', '--no-owner', '-d', 'postgres://x/kingo', '/b/kingo-2026-11-24.dump']]);
    await createDevStudent(db.sql, 'a@x.co');
    await expect(restore(db.sql, '/b/x.dump', 'postgres://x/kingo', run)).rejects.toThrow('되살리지 않았어요: DB가 비어 있지 않아요');
    expect(calls.length).toBe(1);
    expect(existsSync('/b/x.dump')).toBe(false);
  });
});
