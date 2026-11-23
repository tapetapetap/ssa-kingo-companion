import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../test/db.ts';
import { ingester } from '../test/ingest.ts';
import { file, opp, review } from '../test/result.ts';

let db: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.sql`truncate notices, taxonomies, ingest_runs, verdict_log cascade`; });

const items = async () => Object.fromEntries((await db.sql<{ notice_id: string; reasons: string[]; checked: boolean }[]>`
  select notice_id, reasons, checked_at is not null as checked from review_items order by notice_id`).map(r => [r.notice_id, r.checked ? [...r.reasons, '(확인)'] : r.reasons]));
const head = { taxonomy: { id: 'custom', prompt: '1a2b3c4d' } };
const judged = (no: number, core: string[], o: Record<string, unknown> = {}) => opp(no, { fields: { core, related: [] }, fieldRule: 'LLM: m', ...o });
const noDl = { deadline: null, deadlineRule: null };

describe('확인할 것의 이유 (US7, FR-050)', () => {
  it('확인 필요 글·마감 없는 기회·분야 칸이 빈 기회에 이유가 붙고, 이유가 없는 기회는 행이 없다', async () => {
    await ingester(db.sql)(file({ ...head, opportunities: [
      judged(1, []), judged(2, ['backend'], noDl), opp(4), judged(5, ['backend'])
    ], review: [review(3)] }));
    expect(await items()).toEqual({ 'cse:1': ['no_fields'], 'cse:2': ['no_deadline'], 'cse:3': ['review:LLM 확신 낮음'], 'cse:4': ['no_fields'] });
    expect((await db.sql`select is_notice from notices where id = 'cse:3'`)[0].is_notice).toBe(false);
  });

  it('결과 파일에 분야 판정이 없으면(off) no_fields는 붙지 않는다', async () => {
    await ingester(db.sql)(file({ opportunities: [opp(1), opp(2, noDl)], review: [] }));
    expect(await items()).toEqual({ 'cse:2': ['no_deadline'] });
  });

  it('이유가 같으면 확인 상태가 남고, 달라지면 풀리고, 없어지면 행이 사라진다. 내려간 공지도 빠진다', async () => {
    const put = ingester(db.sql);
    await put(file({ opportunities: [opp(1, noDl), opp(2, noDl)], review: [review(3)] }));
    await db.sql`update review_items set checked_by = 'ops@example.com', checked_at = now()`;
    await put(file({ opportunities: [opp(1, noDl), opp(2)], review: [review(3)] }));
    expect(await items()).toEqual({ 'cse:1': ['no_deadline', '(확인)'], 'cse:3': ['review:LLM 확신 낮음', '(확인)'] });
    await put(file({ opportunities: [opp(1, noDl), opp(2)], review: [{ ...review(3), why: '판정 실패' }] }));
    expect(await items()).toEqual({ 'cse:1': ['no_deadline', '(확인)'], 'cse:3': ['review:판정 실패'] });
    await put(file({ opportunities: [opp(2)], review: [] }));
    expect(await items()).toEqual({});
  });
});
