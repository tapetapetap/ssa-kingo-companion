import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testApp } from '../test/app.ts';
import { testDb } from '../test/db.ts';
import { day, notice } from '../test/notice.ts';
import { createDevStudent } from '../test/student.ts';
import { counts, countServerError, saveCounts } from './counts.ts';

let db: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.sql`truncate students, notices, daily_counts cascade`; });

describe('서비스 숫자 (R12)', () => {
  it('동의·새 학생·쓴 학생·행동·알림을 센다. 알림은 통(학생·기기)으로 센다', async () => {
    const [a, b, c] = [await createDevStudent(db.sql, 'a@x.co'), await createDevStudent(db.sql, 'b@x.co'), await createDevStudent(db.sql, 'c@x.co')];
    await db.sql`insert into consents (student_id, text_version) values (${a}, 'v2'), (${b}, 'v2'), (${c}, 'v1')`;
    await db.sql`update students set created_at = now() - interval '3 days' where id = ${b}`;
    for (const no of [1, 2, 3]) await notice(db.sql, { no });
    await db.sql`insert into actions (student_id, notice_id, kind, at) values (${a}, 'cse:1', 'like', now()), (${a}, 'cse:2', 'dislike', now()), (${b}, 'cse:1', 'like', now() - interval '2 days')`;
    for (const [i, [s, days]] of ([[a, 0], [a, 0], [b, 6], [c, 9]] as const).entries()) {
      await db.sql`insert into sessions (token_hash, student_id, last_used_at) values (${Buffer.alloc(32, i + 1)}, ${s}, now() - make_interval(days => ${days}))`;
    }
    await db.sql`insert into push_subscriptions (student_id, token_hash, endpoint, p256dh, auth) values (${a}, ${Buffer.alloc(32, 1)}, 'https://fcm.googleapis.com/1', 'p', 'a')`;
    await db.sql`insert into push_sent (student_id, endpoint_hash, notice_id, kind, day, status) values
      (${a}, 'h1', 'cse:1', 'due0', ${day(0)}, 'sent'), (${a}, 'h1', 'cse:2', 'due3', ${day(0)}, 'sent'), (${a}, 'h2', 'cse:1', 'due0', ${day(0)}, 'failed'), (${a}, 'h1', 'cse:1', 'due3', ${day(-3)}, 'sent')`;
    const got = await counts(db.sql, day(0), 'v2');
    expect(got).toEqual({ consented: 2, consented_new: 1, active7: 2, like: 1, later: 0, dislike: 1, push_sent: 1, push_failed: 1, push_devices: 1 });
    await saveCounts(db.sql, day(0), 'v2');
    await db.sql`delete from actions`;
    await saveCounts(db.sql, day(0), 'v2');
    expect((await db.sql`select n from daily_counts where name = 'like'`).map(r => r.n)).toEqual([1]); // 한 번 더 돌려도 처음 값
  });

  it('api의 500만 오늘 수에 오른다. 하루 숫자를 남겨도 지워지지 않는다', async () => {
    const app = await testApp([['GET', '/api/boom', () => { throw new Error('x'); }]], undefined, undefined, () => countServerError(db.sql));
    await app.request('GET', '/api/boom');
    await app.request('GET', '/api/boom');
    await app.request('GET', '/api/nope');
    await app.close();
    // 서버는 세기를 기다리지 않고 답한다. 두 번 다 셀 때까지 기다린다
    for (let i = 0; i < 100 && (await db.sql`select n from daily_counts where name = 'server_error'`)[0]?.n !== 2; i++) await new Promise(r => setTimeout(r, 10));
    await saveCounts(db.sql, day(0), 'v2');
    expect((await db.sql`select n from daily_counts where day = ${day(0)} and name = 'server_error'`)[0].n).toBe(2);
  });
});
