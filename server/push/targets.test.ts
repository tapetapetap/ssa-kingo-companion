import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../test/db.ts';
import { day, notice } from '../test/notice.ts';
import { createDevStudent } from '../test/student.ts';
import { targets } from './targets.ts';

let db: Awaited<ReturnType<typeof testDb>>;
let me: number;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.sql`truncate students, notices cascade`;
  me = await createDevStudent(db.sql, 'a@example.com');
});
const act = (no: number, kind: string, revisit: number | null = null) => db.sql`insert into actions (student_id, notice_id, kind, revisit_on) values (${me}, ${`cse:${no}`}, ${kind}, ${revisit === null ? null : day(revisit)})`;

describe('오늘 알릴 공지 (FR-032)', () => {
  it('SC-004: 날짜·상태 조합 100가지에서 보내야 할 것만 고른다', async () => {
    const deadlines = [null, -1, 0, 1, 2, 3, 4, 10]; // 8
    const states = [{}, { down: true }, { isNotice: false }]; // 3
    const acts: [string | null, number | null][] = [['like', null], ['later', 0], ['later', 1], ['dislike', null], [null, null]]; // 5
    let no = 0;
    const want: string[] = [];
    for (const d of deadlines) for (const s of states) for (const [kind, revisit] of acts) {
      no++;
      await notice(db.sql, { no, deadline: d, ...s });
      if (kind) await act(no, kind, revisit);
      const open = !('down' in s) && !('isNotice' in s) && (d === null || d >= 0);
      if (open && kind === 'like' && d === 0) want.push(`cse:${no}:due0`);
      if (open && kind === 'like' && d === 3) want.push(`cse:${no}:due3`);
      if (open && kind === 'later' && revisit === 0) want.push(`cse:${no}:revisit`);
    }
    expect(no).toBeGreaterThanOrEqual(100);
    const got = (await targets(db.sql, me, day(0))).map(t => `${t.noticeId}:${t.kind}`);
    expect(got.toSorted()).toEqual(want.toSorted());
  });

  it('마감 없는 공지와 게시 30일이 지나 닫힌 공지는 마감 알림이 없다', async () => {
    await notice(db.sql, { no: 1, deadline: null, posted: -27 }); // 닫히는 날이 3일 뒤지만 마감이 아니다
    await notice(db.sql, { no: 2, deadline: null, posted: -40 });
    await act(1, 'like');
    await act(2, 'later', 0);
    expect(await targets(db.sql, me, day(0))).toEqual([]);
  });

  it('사람 판정으로 바뀐 마감을 따른다. 바뀐 날짜면 다시 대상이 된다', async () => {
    await notice(db.sql, { no: 1, deadline: 3 });
    await act(1, 'like');
    expect((await targets(db.sql, me, day(0)))[0].kind).toBe('due3');
    await db.sql`update notices set deadline = ${day(5)}`;
    expect(await targets(db.sql, me, day(0))).toEqual([]);
    expect((await targets(db.sql, me, day(2)))[0].kind).toBe('due3');
    expect((await targets(db.sql, me, day(5)))[0].kind).toBe('due0');
  });

  it('행동을 지웠으면 없고, 다른 학생의 것은 섞이지 않는다', async () => {
    await notice(db.sql, { no: 1, deadline: 0, title: '오늘' });
    await act(1, 'like');
    const other = await createDevStudent(db.sql, 'b@example.com');
    expect(await targets(db.sql, other, day(0))).toEqual([]);
    expect(await targets(db.sql, me, day(0))).toEqual([{ noticeId: 'cse:1', title: '오늘', kind: 'due0' }]);
    await db.sql`delete from actions`;
    expect(await targets(db.sql, me, day(0))).toEqual([]);
  });
});
