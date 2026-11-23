import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../test/db.ts';
import { notice } from '../test/notice.ts';
import { createDevStudent, PASSWORD, seedTaxonomy, studentApp } from '../test/student.ts';

let db: Awaited<ReturnType<typeof testDb>>;
let app: Awaited<ReturnType<typeof studentApp>>;
let me: number;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
afterEach(async () => { await app.close(); });

type A = { off: boolean; version: number; md: string; lines: { key: string; text: string; source: string; proof: string | null }[]; excluded: { key: string }[] };
const analysis = async () => (await app.request('GET', '/api/me/analysis')).body as A;
const queued = async () => (await db.sql`select cause from repick_queue where student_id = ${me}`).map(r => r.cause);
const clearQueue = () => db.sql`delete from repick_queue`;
const act = (no: number, body: unknown) => app.request('PUT', `/api/notices/cse:${no}/action`, body);

beforeEach(async () => {
  await db.sql`truncate students, taxonomies, notices cascade`;
  await seedTaxonomy(db.sql);
  app = await studentApp(db.sql);
  me = await createDevStudent(db.sql, 'dev1@example.com');
  await app.request('POST', '/api/login', { method: 'dev', email: 'dev1@example.com', password: PASSWORD });
  await app.request('POST', '/api/consent', { version: 'dev-1' });
  await app.request('PUT', '/api/me/answers', { grade: 3, term: 2, goal: 'job' });
  await app.request('PUT', '/api/me/fields', { ids: ['backend', 'qa', 'frontend'] });
});

describe('나에 대한 프롬프트 (US5 시나리오 1·2)', () => {
  it('저장하면 같은 글이 오고 다시 고르기를 건다. 1000자를 넘으면 too_long. 지우면 빈 글', async () => {
    await clearQueue();
    expect((await app.request('PUT', '/api/me/prompt', { body: '평일 저녁만 돼요' })).body).toMatchObject({ body: '평일 저녁만 돼요' });
    expect((await app.request('GET', '/api/me/prompt')).body).toMatchObject({ body: '평일 저녁만 돼요', updatedAt: expect.stringMatching(/\+09:00$/) });
    expect(await queued()).toEqual(['prompt']);
    expect((await app.request('PUT', '/api/me/prompt', { body: '가'.repeat(1001) })).body).toMatchObject({ error: { code: 'too_long', max: 1000 } });
    expect((await app.request('DELETE', '/api/me/prompt')).status).toBe(204);
    expect((await app.request('GET', '/api/me/prompt')).body).toEqual({ body: '', updatedAt: null });
  });
});

describe('나의 분석 (US5)', () => {
  it('직접 넣은 활동을 넣으면 줄이 생기고 판이 오르고 다시 고른다. 고치고 지우면 따라 바뀐다 (시나리오 3)', async () => {
    const v0 = (await analysis()).version;
    await clearQueue();
    const r = await app.request('POST', '/api/me/activities', { name: '교내 해커톤', term: '2025-2', kind: 'contest', fieldIds: ['backend'] });
    expect(r.status).toBe(201);
    const id = (r.body as { id: number }).id;
    const a = await analysis();
    expect(a.version).toBe(v0 + 1);
    expect(a.lines[0]).toEqual({ key: `act:${id}`, section: 'done', text: '2025-2 · 교내 해커톤 · 대회·공모전 · 백엔드', source: '직접 입력', proof: '증빙 없음' });
    expect(await queued()).toEqual(['analysis']);
    await app.request('PATCH', `/api/me/activities/${id}`, { proofUrl: 'https://github.com/x' });
    expect((await analysis()).lines[0]).toMatchObject({ proof: '증빙 링크' });
    expect((await app.request('DELETE', `/api/me/activities/${id}`)).status).toBe(204);
    expect((await analysis()).md).toContain('## 해 온 활동\n- 아직 없어요.');
  });

  it('활동 검사: 이름 100자, 학기 꼴, 종류, 분야 3개·없는 분야, 증빙 주소, 100개, 남의 활동은 not_found', async () => {
    const post = (b: Record<string, unknown>) => app.request('POST', '/api/me/activities', { name: 'x', term: '2025-1', kind: 'edu', fieldIds: [], ...b });
    expect((await post({ name: '가'.repeat(101) })).body).toMatchObject({ error: { code: 'too_long', field: 'name' } });
    expect((await post({ term: '2025-3' })).body).toMatchObject({ error: { code: 'invalid', field: 'term' } });
    expect((await post({ kind: 'party' })).body).toMatchObject({ error: { code: 'invalid', field: 'kind' } });
    expect((await post({ fieldIds: ['backend', 'qa', 'frontend'] })).body).toMatchObject({ error: { code: 'invalid', field: 'fieldIds' } });
    expect((await post({ fieldIds: ['nope'] })).body).toMatchObject({ error: { code: 'invalid', field: 'fieldIds' } });
    expect((await post({ proofUrl: 'ftp://x' })).body).toMatchObject({ error: { code: 'invalid', field: 'proofUrl' } });
    expect((await post({ proofUrl: `https://${'a'.repeat(500)}` })).body).toMatchObject({ error: { code: 'too_long', field: 'proofUrl' } });
    for (let i = 0; i < 100; i++) await db.sql`insert into activities (student_id, name, term, kind) values (${me}, ${`a${i}`}, '2025-1', 'edu')`;
    expect((await post({})).body).toMatchObject({ error: { code: 'limit_reached' } });
    const other = await createDevStudent(db.sql, 'dev2@example.com');
    const [o] = await db.sql`insert into activities (student_id, name, term, kind) values (${other}, 'x', '2025-1', 'edu') returning id`;
    expect((await app.request('PATCH', `/api/me/activities/${o.id}`, { name: 'y' })).status).toBe(404);
    expect((await app.request('DELETE', `/api/me/activities/${o.id}`)).status).toBe(404);
  });

  it('관심 없음 두 번이면 몰린 분야 줄이 생기고, 한 번이면 없다 (시나리오 4). 같은 몰림에 한 번 더 눌러도 판은 그대로 (시나리오 5)', async () => {
    for (const no of [1, 2, 3]) await notice(db.sql, { no, core: ['frontend'] });
    await act(1, { kind: 'dislike', reason: 'field' });
    expect((await analysis()).lines.map(l => l.key)).not.toContain('disliked:frontend');
    await act(2, { kind: 'dislike', reason: 'hard' });
    const a = await analysis();
    expect(a.lines.find(l => l.key === 'disliked:frontend')).toMatchObject({ text: '관심 없음이 몰린 분야: 프론트엔드', source: '앱 기록' });
    await clearQueue();
    await act(3, { kind: 'dislike', reason: 'field' });
    expect((await analysis()).version).toBe(a.version);
    expect(await queued()).toEqual([]);
  });

  it('몰린 분야 줄을 빼면 md에서 빠지고 판이 오르고, 되살리면 돌아온다. 카드 행동은 그대로. 처음 답·고른 분야·활동은 못 뺀다 (시나리오 6)', async () => {
    for (const no of [1, 2]) await notice(db.sql, { no, core: ['frontend'] });
    await act(1, { kind: 'dislike', reason: 'field' });
    await act(2, { kind: 'dislike', reason: 'field' });
    const v = (await analysis()).version;
    expect((await app.request('PUT', '/api/me/analysis/excluded/disliked:frontend', {})).status).toBe(204);
    const a = await analysis();
    expect([a.version, a.md.includes('관심 없음이 몰린 분야'), a.excluded]).toEqual([v + 1, false, [{ key: 'disliked:frontend' }]]);
    expect((await db.sql`select count(*)::int n from actions`)[0].n).toBe(2);
    await app.request('DELETE', '/api/me/analysis/excluded/disliked:frontend');
    expect((await analysis()).md).toContain('관심 없음이 몰린 분야: 프론트엔드');
    for (const key of ['ans', 'picked', 'act:1']) expect((await app.request('PUT', `/api/me/analysis/excluded/${key}`, {})).body).toMatchObject({ error: { code: 'invalid' } });
    expect((await app.request('PUT', '/api/me/analysis/excluded/liked:llm', {})).status).toBe(404);
  });

  it('끄면 분석과 뺀 줄이 지워지고 analysis.md·줄 빼기는 analysis_off. 켜면 새로 만든다 (시나리오 9·10)', async () => {
    const md = await app.request('GET', '/api/me/analysis.md');
    expect([md.status, md.body, md.headers.get('content-type')]).toEqual([200, (await analysis()).md, 'text/markdown; charset=utf-8']);
    await db.sql`insert into excluded_lines (student_id, line_key) values (${me}, 'liked:llm')`;
    expect((await app.request('PUT', '/api/me/analysis/off', { off: true })).status).toBe(204);
    expect(await analysis()).toEqual({ off: true });
    expect((await db.sql`select (select count(*) from analyses)::int a, (select count(*) from excluded_lines)::int e`)[0]).toEqual({ a: 0, e: 0 });
    expect((await app.request('GET', '/api/me/analysis.md')).body).toMatchObject({ error: { code: 'analysis_off' } });
    expect((await app.request('PUT', '/api/me/analysis/excluded/liked:llm', {})).status).toBe(409);
    await app.request('PUT', '/api/me/analysis/off', { off: false });
    expect(await analysis()).toMatchObject({ off: false, version: 1, md: expect.stringContaining('처음 답: 3학년 2학기, 취업') });
  });

  it('관심 있어요가 30일 밖으로 밀리면 읽을 때 몰린 분야 줄이 빠진다', async () => {
    for (const no of [1, 2]) await notice(db.sql, { no, core: ['csr-nlp'] });
    await act(1, { kind: 'like' });
    await act(2, { kind: 'like' });
    expect((await analysis()).lines.map(l => l.key)).toContain('liked:csr-nlp');
    await db.sql`update actions set at = now() - interval '40 days'`;
    expect((await analysis()).lines.map(l => l.key)).not.toContain('liked:csr-nlp');
  });

  it('같은 재료면 같은 판이 오르지 않는다 (SC-013)', async () => {
    const a = await analysis();
    await app.request('PUT', '/api/me/answers', { grade: 3, term: 2, goal: 'job' });
    expect(await analysis()).toMatchObject({ version: a.version, md: a.md });
  });
});
