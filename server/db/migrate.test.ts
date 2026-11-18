import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../test/db.ts';
import { MIGRATIONS_DIR, migrate, pending } from './migrate.ts';

let db: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });

describe('migrate (research R4)', () => {
  it('시험 틀이 저장소의 마이그레이션을 모두 적용했고 다시 돌리면 아무것도 하지 않는다', async () => {
    expect(await pending(db.sql)).toEqual([]);
    expect(await migrate(db.sql)).toEqual([]);
    const names = (await db.sql<{ name: string }[]>`select name from schema_migrations order by name`).map(r => r.name);
    expect(names[0]).toBe('001_base.sql');
  });

  it('번호 순서로 한 번씩 적용하고, 실패한 파일은 남기지 않는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'));
    writeFileSync(join(dir, '002_b.sql'), 'create table b (id int)');
    writeFileSync(join(dir, '001_a.sql'), 'create table a (id int)');
    writeFileSync(join(dir, 'notes.txt'), 'x');
    await db.sql`delete from schema_migrations`;
    expect(await migrate(db.sql, dir)).toEqual(['001_a.sql', '002_b.sql']);
    expect(await migrate(db.sql, dir)).toEqual([]);
    writeFileSync(join(dir, '003_bad.sql'), 'create table c (id int); select * from nope');
    await expect(migrate(db.sql, dir)).rejects.toThrow();
    expect(await pending(db.sql, dir)).toEqual(['003_bad.sql']);
    expect((await db.sql`select to_regclass('c') as t`)[0].t).toBeNull(); // 트랜잭션이라 반쯤 적용되지 않는다
    expect(MIGRATIONS_DIR).toMatch(/server\/db\/migrations$/);
  });
});
