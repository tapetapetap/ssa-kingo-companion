import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../test/db.ts';
import { ingester } from '../test/ingest.ts';
import { day } from '../test/notice.ts';
import { file, opp, review } from '../test/result.ts';
import { createDevStudent, PASSWORD, studentApp } from '../test/student.ts';

let db: Awaited<ReturnType<typeof testDb>>;
let ops: Awaited<ReturnType<typeof studentApp>>;
let stu: Awaited<ReturnType<typeof studentApp>>;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
afterEach(async () => { await ops.close(); await stu.close(); });

const OPS = 'ops@example.com';
const operators = new Map([[`dev:${OPS}`, 'operator']]);
const head = { taxonomy: { id: 'custom', prompt: '1a2b3c4d' } };
const later = { deadline: day(10) };
/** 1: 마감 없는 기회, 2: 분야 붙은 기회, 3: 확인 필요 글 */
const theFile = () => file({ ...head, opportunities: [opp(1, { deadline: null, deadlineRule: null, fields: { core: ['backend'], related: [] }, fieldRule: 'LLM: m' }), opp(2, { ...later, fields: { core: ['frontend'], related: ['qa'] }, fieldRule: 'LLM: m' })], review: [review(3)] });

beforeEach(async () => {
  await db.sql`truncate students, taxonomies, notices, ingest_runs, verdict_log cascade`;
  await ingester(db.sql)(theFile());
  ops = await studentApp(db.sql, { operators });
  stu = await studentApp(db.sql, { operators });
  await createDevStudent(db.sql, OPS);
  await createDevStudent(db.sql, 'dev1@example.com');
  await ops.request('POST', '/api/login', { method: 'dev', email: OPS, password: PASSWORD });
  await stu.request('POST', '/api/login', { method: 'dev', email: 'dev1@example.com', password: PASSWORD });
});

type Item = { notice: { id: string }; reasons: string[]; checkedAt: string | null; checkedBy: string | null };
const reviewIds = async (q = '') => ((await ops.request('GET', `/api/ops/review${q}`)).body as { items: Item[] }).items.map(x => x.notice.id);
const ALL = [['GET', '/api/ops/review'], ['GET', '/api/ops/notices/cse:1'], ['PUT', '/api/ops/notices/cse:1/verdict'], ['POST', '/api/ops/notices/cse:1/confirm'], ['POST', '/api/ops/notices/cse:1/rejudge'], ['GET', '/api/ops/log']] as const;

describe('운영자 판정 검토 (US7, contracts/api.md)', () => {
  it('운영자 목록에 없는 계정은 모든 ops 경로에서 forbidden, 로그인이 없으면 login_required, 목록 파일이 없으면 모두 forbidden (SC-014)', async () => {
    for (const [m, p] of ALL) expect((await stu.request(m, p, m === 'GET' ? undefined : { kind: 'edu' })).body).toMatchObject({ error: { code: 'forbidden', message: '운영자 계정이 아니에요' } });
    const none = await studentApp(db.sql);
    await none.request('POST', '/api/login', { method: 'dev', email: OPS, password: PASSWORD });
    for (const [m, p] of ALL) expect((await none.request(m, p, m === 'GET' ? undefined : {})).status).toBe(403);
    await none.request('POST', '/api/logout');
    expect((await none.request('GET', '/api/ops/review')).body).toMatchObject({ error: { code: 'login_required' } });
    await none.close();
  });

  it('확인할 것은 이유와 함께 모이고 reason·checked로 거른다. OpsNotice는 계약의 꼴이고 학생 자료가 없다', async () => {
    const r = await ops.request('GET', '/api/ops/review');
    expect(r.status).toBe(200);
    const items = (r.body as { items: Item[] }).items;
    expect(items.map(x => [x.notice.id, x.reasons])).toEqual([['cse:3', ['review:LLM 확신 낮음']], ['cse:1', ['no_deadline']]]);
    expect(items[1]).toEqual({
      notice: {
        id: 'cse:1', title: '제목 1', url: opp(1).url, postedOn: '2026-11-01', host: '가나다', down: false, closesOn: '2026-12-01',
        file: { verdict: 'opportunity', kind: 'job', deadline: null, fields: { core: [{ id: 'backend', name: '백엔드' }], related: [] }, rule: 'LLM: gemma4:12b', deadlineRule: null, reason: null },
        human: {}, shown: { isNotice: true, kind: 'job', deadline: null, fields: { core: [{ id: 'backend', name: '백엔드' }], related: [] } }
      },
      reasons: ['no_deadline'], checkedAt: null, checkedBy: null
    });
    expect(items[0].notice).toMatchObject({ file: { verdict: 'review', reason: 'LLM 확신 낮음', kind: null, fields: null }, shown: { isNotice: false, kind: null, fields: null } });
    expect(await reviewIds('?reason=review')).toEqual(['cse:3']);
    expect(await reviewIds('?reason=no_deadline&checked=false')).toEqual(['cse:1']);
    expect(await reviewIds('?reason=no_fields')).toEqual([]);
    expect((await ops.request('GET', '/api/ops/review?reason=x')).body).toMatchObject({ error: { code: 'invalid', field: 'reason' } });
    expect(JSON.stringify(r.body)).not.toMatch(/dev1@|student|prompt|analysis|action/);
    expect((await stu.request('GET', '/api/notices/cse:3')).status).toBe(404); // 확인 필요 글은 학생에게 없다
  });

  it('종류와 핵심 분야를 고치면 보낸 칸만 사람 판정이 되고 학생에게 바로 보이며, 확인할 것에서 빠진다. 다시 넣어도 남는다(시나리오 3·4)', async () => {
    const r = await ops.request('PUT', '/api/ops/notices/cse:1/verdict', { kind: 'hackathon', fields: { core: ['backend', 'csr-ai'], related: ['qa'] } });
    expect(r.status).toBe(200);
    expect(Object.keys((r.body as { human: object }).human).sort()).toEqual(['fields', 'kind']);
    expect(r.body).toMatchObject({ human: { kind: { value: 'hackathon', by: OPS } }, shown: { kind: 'hackathon', deadline: null, fields: { core: [{ id: 'backend' }, { id: 'csr-ai' }], related: [{ id: 'qa' }] } } });
    const card = (await stu.request('GET', '/api/notices/cse:1')).body;
    expect(card).toMatchObject({ kind: 'hackathon', fields: { core: [{ id: 'backend' }, { id: 'csr-ai' }], related: [{ id: 'qa' }], by: '운영자' } });
    expect(await reviewIds('?checked=false')).toEqual(['cse:3']);
    expect(await reviewIds('?checked=true')).toEqual(['cse:1']);
    const s = await ingester(db.sql)(theFile());
    expect(s.humanKept).toBe(1);
    expect((await stu.request('GET', '/api/notices/cse:1')).body).toMatchObject({ kind: 'hackathon', fields: { by: '운영자' } });
    expect(await reviewIds('?checked=true')).toEqual(['cse:1']); // 이유가 같아 확인 상태가 남는다
  });

  it('맞아요는 값을 두고 확인한 것으로 남긴다. 고친 기록에 누가·언제·칸·앞뒤 값이 있다(시나리오 5·7)', async () => {
    expect((await ops.request('POST', '/api/ops/notices/cse:3/confirm', {})).status).toBe(204);
    expect(await reviewIds('?checked=false')).toEqual(['cse:1']);
    await ops.request('PUT', '/api/ops/notices/cse:1/verdict', { deadline: day(5) });
    const one = (await ops.request('GET', '/api/ops/notices/cse:1')).body as { notice: { closesOn: string }; log: unknown[] };
    expect(one.notice.closesOn).toBe(day(5));
    expect(one.log).toEqual([{ noticeId: 'cse:1', field: 'deadline', action: 'edit', old: null, new: day(5), by: OPS, at: expect.stringMatching(/\+09:00$/) }]);
    const all = (await ops.request('GET', '/api/ops/log')).body as { items: { noticeId: string; action: string }[] };
    expect(all.items.map(x => [x.noticeId, x.action])).toEqual([['cse:1', 'edit'], ['cse:3', 'confirm']]);
  });

  it('확인 필요 글에 공지·종류·마감을 넣으면 열린 공지가 되어 학생 목록에 나온다. isNotice만 보내면 종류가 없어 invalid(시나리오 6)', async () => {
    expect((await ops.request('PUT', '/api/ops/notices/cse:3/verdict', { isNotice: true })).body).toMatchObject({ error: { code: 'invalid', field: 'kind' } });
    const r = await ops.request('PUT', '/api/ops/notices/cse:3/verdict', { isNotice: true, kind: 'edu', deadline: day(3) });
    expect(r.body).toMatchObject({ shown: { isNotice: true, kind: 'edu', deadline: day(3) } });
    const list = (await stu.request('GET', '/api/notices')).body as { items: { id: string }[] };
    expect(list.items.map(x => x.id)).toContain('cse:3');
    const s = await ingester(db.sql)(theFile());
    expect(s.humanKept).toBe(1);
    expect((await db.sql`select is_notice, kind from notices where id = 'cse:3'`)[0]).toEqual({ is_notice: true, kind: 'edu' });
  });

  it('deadline: null은 마감 없음으로 정한 것이고, 마감을 지우면 닫히는 날도 함께 바뀐다', async () => {
    const r = await ops.request('PUT', '/api/ops/notices/cse:2/verdict', { deadline: null });
    expect(r.body).toMatchObject({ human: { deadline: { value: null } }, shown: { deadline: null }, closesOn: '2026-12-01' });
  });

  it('다시 판정은 표시를 남긴다(시나리오 8)', async () => {
    expect((await ops.request('POST', '/api/ops/notices/cse:2/rejudge', {})).status).toBe(204);
    expect((await db.sql`select notice_id, by_operator from rejudge_marks`)).toEqual([{ notice_id: 'cse:2', by_operator: OPS }]);
    expect((await ops.request('POST', '/api/ops/notices/cse:404/rejudge', {})).status).toBe(404);
  });

  it.each([
    [{ fields: { core: ['backend', 'qa', 'frontend'], related: [] } }, 'fields'],
    [{ fields: { core: [], related: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'] } }, 'fields'],
    [{ fields: { core: ['backend'], related: ['backend'] } }, 'fields'],
    [{ fields: { core: ['web-x'], related: [] } }, 'fields'],
    [{ kind: 'party' }, 'kind'],
    [{ deadline: '2026-13-01' }, 'deadline'],
    [{ isNotice: 'yes' }, 'isNotice'],
    [{ score: 1 }, 'score'],
    [{}, 'verdict']
  ])('고치기 거절 %j → invalid(%s)', async (body, field) => {
    expect((await ops.request('PUT', '/api/ops/notices/cse:2/verdict', body)).body).toMatchObject({ error: { code: 'invalid', field } });
    expect((await db.sql`select count(*)::int n from human_verdicts`)[0].n).toBe(0);
  });

  it('넣기가 목록에서 사라진 분야를 사람 판정에서 빼면 고친 기록의 by가 ingest다', async () => {
    await ops.request('PUT', '/api/ops/notices/cse:2/verdict', { fields: { core: ['frontend'], related: ['qa', 'backend'] } });
    await ingester(db.sql, t => { t.fields = t.fields.map(f => (f.id === 'qa' ? { ...f, id: 'qa-new' } : f)); })(file({ ...head, opportunities: [opp(2, { ...later, fields: { core: ['frontend'], related: [] }, fieldRule: 'LLM: m' })], review: [] }));
    const log = ((await ops.request('GET', '/api/ops/log?notice=cse:2')).body as { items: Record<string, unknown>[] }).items;
    expect(log[0]).toMatchObject({ field: 'fields', action: 'edit', old: { core: ['frontend'], related: ['qa', 'backend'] }, new: { core: ['frontend'], related: ['backend'] }, by: 'ingest' });
    expect((await stu.request('GET', '/api/notices/cse:2')).body).toMatchObject({ fields: { core: [{ id: 'frontend' }], related: [{ id: 'backend' }], by: '운영자' } });
  });
});
