import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Post } from '../../etl/notices/llm.ts';
import { openModel } from '../model.ts';
import { testDb } from '../test/db.ts';
import { seedTaxonomy } from '../test/student.ts';
import { checkFlow, writeFlow } from './flow.ts';
import { rebuild, stored } from './store.ts';

let db: Awaited<ReturnType<typeof testDb>>;
let me: number;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.sql`truncate students, taxonomies, notices cascade`;
  await seedTaxonomy(db.sql);
  [{ id: me }] = (await db.sql`insert into students default values returning id`).map(r => ({ id: Number(r.id) }));
  await db.sql`insert into answers (student_id, grade, term, goal) values (${me}, 3, 2, 'job')`;
});

const throttle = { readTemp: async () => 50, readGpu: async () => null, sleep: async () => {}, every: () => () => {}, logDir: mkdtempSync(join(tmpdir(), 'load-')) };
const model = (answer: unknown) => openModel(db.sql, 'daily', {
  throttle, post: (async () => (answer === 'down' ? Promise.reject(new TypeError('fetch failed')) : { status: 200, text: async () => JSON.stringify({ message: { content: JSON.stringify(answer) } }) })) as Post
});
const KEYS = new Set(['ans', 'picked', 'act:1', 'act:2']);
const l = (text: string, refs: string[]) => ({ text, refs });

describe('흐름 답 검사 (contracts/llm.md 표)', () => {
  it('걸린 문장만 버리고 4줄까지 쓴다', () => {
    const out = checkFlow(JSON.stringify({ lines: [
      l('근거 없음', []), l('근거 하나', ['act:1']), l('없는 줄', ['act:9', 'ans']), l('', ['ans', 'act:1']), l('가'.repeat(81), ['ans', 'act:1']),
      l('뺀 흐름', ['act:2', 'ans']), l('해커톤을 이어 했어요', ['act:1', 'act:2']), l('같은 근거', ['act:2', 'act:1']),
      l('하나', ['ans', 'act:1']), l('둘', ['picked', 'act:1']), l('셋', ['picked', 'act:2']), l('넷', ['ans', 'picked'])
    ] }), KEYS, new Set(['flow:act:2+ans']));
    expect(out!.map(f => f.key)).toEqual(['flow:act:1+act:2', 'flow:act:1+ans', 'flow:act:1+picked', 'flow:act:2+picked']);
    expect(checkFlow('흐름이에요', KEYS, new Set())).toBeNull();
  });
});

describe('writeFlow', () => {
  const addAct = async (name: string) => {
    await db.sql`insert into activities (student_id, name, term, kind) values (${me}, ${name}, '2025-2', 'hackathon')`;
    return rebuild(db.sql, me);
  };

  it('사실 줄이 처음 답·고른 분야뿐이면 쓰지 않는다', async () => {
    await rebuild(db.sql, me);
    expect(await writeFlow(db.sql, me, model({ lines: [] }))).toBe('skipped');
  });

  it('흐름을 쓰면 flow_version이 오른 뒤의 version과 같고, 다음에는 건너뛴다', async () => {
    await addAct('해커톤');
    const [{ id }] = await db.sql`select id from activities`;
    expect(await writeFlow(db.sql, me, model({ lines: [l('해커톤에 나갔어요', [`act:${id}`, 'ans'])] }))).toBe('written');
    const a = (await stored(db.sql, me))!;
    expect(a.flow_version).toBe(a.version);
    expect(a.md).toContain('## 컴패니언이 본 흐름\n- 해커톤에 나갔어요 (컴패니언)');
    expect(await writeFlow(db.sql, me, model({ lines: [] }))).toBe('skipped');
  });

  it('모델이 없으면 앞 흐름을 두고, 가리키던 활동을 지우면 흐름 문장이 빠진다', async () => {
    await addAct('해커톤');
    const [{ id }] = await db.sql`select id from activities`;
    await writeFlow(db.sql, me, model({ lines: [l('해커톤에 나갔어요', [`act:${id}`, 'ans'])] }));
    await addAct('캠프');
    expect(await writeFlow(db.sql, me, model('down'))).toBe('failed');
    expect((await stored(db.sql, me))!.flow).toHaveLength(1);
    await db.sql`delete from activities where id = ${id}`;
    await rebuild(db.sql, me);
    expect((await stored(db.sql, me))!.flow).toEqual([]);
  });
});
