import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Post } from '../../etl/notices/llm.ts';
import { testDb } from '../test/db.ts';
import { axis, notice } from '../test/notice.ts';
import { createDevStudent, PASSWORD, seedTaxonomy, studentApp } from '../test/student.ts';
import { enqueue } from './queue.ts';
import { makeWorker } from './repick.ts';

let db: Awaited<ReturnType<typeof testDb>>;
let app: Awaited<ReturnType<typeof studentApp>>;
let me: number;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
afterEach(async () => { await app.close(); });

type Home = {
  pick: { notice: { id: string }; reason: string; cited: unknown[]; method: string; computedAt: string; repicking: boolean } | null;
  pickEmpty: string | null;
  shelves: Record<'soon' | 'field' | 'similar', { items: { id: string }[]; empty: string | null }>;
};
const home = async () => (await app.request('GET', '/api/home')).body as Home;
const shelfIds = (h: Home) => Object.fromEntries(Object.entries(h.shelves).map(([k, v]) => [k, v.items.map(x => x.id)]));
const throttle = { readTemp: async () => 50, readGpu: async () => null, sleep: async () => {}, every: () => () => {}, logDir: mkdtempSync(join(tmpdir(), 'load-')) };
/** 모델 가짜: 답 글을 그대로 돌려준다 */
const llm = (content: string) => makeWorker(db.sql, { model: { post: (async () => ({ status: 200, text: async () => JSON.stringify({ message: { content } }) })) as Post, throttle } });

beforeEach(async () => {
  await db.sql`truncate students, taxonomies, notices cascade`;
  await seedTaxonomy(db.sql);
  app = await studentApp(db.sql);
  me = await createDevStudent(db.sql, 'dev1@example.com');
  await app.request('POST', '/api/login', { method: 'dev', email: 'dev1@example.com', password: PASSWORD });
  await app.request('POST', '/api/consent', { version: 'dev-1' });
  await app.request('PUT', '/api/me/answers', { grade: 3, term: 2, goal: 'job' });
});
const pickFields = () => app.request('PUT', '/api/me/fields', { ids: ['backend', 'qa', 'csr-ai'] });

describe('홈 (US3)', () => {
  it('분야 고르기 전에는 가장 추천이 없다(fields_not_done)', async () => {
    await notice(db.sql, { no: 1 });
    expect(await home()).toMatchObject({ pick: null, pickEmpty: 'fields_not_done' });
  });

  it('열린 공지가 없으면 no_open_notices, 선반도 비어 있다', async () => {
    await pickFields();
    const h = await home();
    expect(h).toMatchObject({ pick: null, pickEmpty: 'no_open_notices' });
    expect(h.shelves.soon).toEqual({ items: [], empty: 'no_open_notices' });
  });

  it('규칙 1위가 바로 가장 추천이 되고 다시 고르기를 건다. 선반은 가장 추천을 빼고 채운다', async () => {
    await notice(db.sql, { no: 1, kind: 'job', core: ['backend'], deadline: 3 }); // 40 + 20 + 8
    await notice(db.sql, { no: 2, kind: 'lecture', core: ['qa'], deadline: 5, posted: -2 }); // 40 + 20 + 6
    await notice(db.sql, { no: 3, kind: 'course', deadline: 30 });
    await pickFields();
    const h = await home();
    expect(h.pick).toMatchObject({ notice: { id: 'cse:1' }, reason: '고른 분야와 맞고 진로 목표에 맞는 종류예요', cited: [], method: '규칙', repicking: true });
    expect(h.pick!.computedAt).toMatch(/\+09:00$/);
    expect(shelfIds(h)).toEqual({ soon: ['cse:2'], field: [], similar: [] });
    expect(h.shelves.similar.empty).toBe('no_likes');
    expect(JSON.stringify(h)).not.toMatch(/score/);
  });

  it('가장 추천에 관심 있어요를 누르면 홈을 열 때 바로 다른 공지로 바뀌고, 관심 있어요 공지와 비슷한 공지가 선반에 나온다', async () => {
    await notice(db.sql, { no: 1, core: ['backend'], vector: axis(0) });
    await notice(db.sql, { no: 2, core: ['qa'], vector: axis(0), posted: -20 });
    await notice(db.sql, { no: 3, kind: 'course', vector: axis(1), posted: -20 });
    await pickFields();
    expect((await home()).pick!.notice.id).toBe('cse:1');
    await app.request('PUT', '/api/notices/cse:1/action', { kind: 'like' });
    const h = await home();
    expect(h.pick!.notice.id).toBe('cse:2');
    expect(h.shelves.similar.items.map(x => x.id)).toEqual(['cse:3']); // cse:2는 가장 추천이라 빠진다
  });

  it('일꾼은 LLM 답을 쓰고 줄을 비운다. 답이 검사에 걸리면 규칙 1위와 규칙 문장이다', async () => {
    await notice(db.sql, { no: 1, core: ['backend'] });
    await notice(db.sql, { no: 2, core: ['qa'], posted: -3 });
    await pickFields();
    const w = llm(JSON.stringify({ pick: 2, reason: 'QA를 골랐으니 잘 맞아요', cited: [] }));
    expect(await w.step()).toBe(me);
    expect(await w.step()).toBeNull();
    const h = await home();
    expect(h.pick).toMatchObject({ notice: { id: 'cse:2' }, reason: 'QA를 골랐으니 잘 맞아요', method: expect.stringMatching(/^LLM: /), repicking: false });
    expect((await db.sql`select prompt_version from picks`)[0].prompt_version).toMatch(/^[0-9a-f]{8}$/);
    expect((await db.sql`select who, requests from model_bursts`)[0]).toEqual({ who: 'api', requests: 1 });

    await enqueue(db.sql, me, 'daily');
    await llm(JSON.stringify({ pick: 2, reason: '11월 30일까지라 서둘러요', cited: [] })).step();
    expect((await home()).pick).toMatchObject({ notice: { id: 'cse:1' }, reason: '고른 분야와 맞고 진로 목표에 맞는 종류예요', method: '규칙' });
  });

  it('계산 중에 다시 걸리면 줄에 남아 한 번 더 고른다(research R9)', async () => {
    await notice(db.sql, { no: 1, core: ['backend'] });
    await pickFields();
    const w = makeWorker(db.sql, { noModel: true, analysisOf: async () => { await enqueue(db.sql, me, 'prompt'); return null; } });
    await w.step();
    expect((await db.sql`select cause from repick_queue`).map(r => r.cause)).toEqual(['prompt']);
  });

  it('처음 답·분야를 바꾸거나 가장 추천에 행동하면 줄에 넣고, 다른 공지 행동은 넣지 않는다', async () => {
    await notice(db.sql, { no: 1, core: ['backend'] });
    await notice(db.sql, { no: 2 });
    await pickFields();
    await makeWorker(db.sql, { noModel: true }).step();
    const queued = async () => (await db.sql`select cause from repick_queue`).map(r => r.cause);
    expect(await queued()).toEqual([]);
    await app.request('PUT', '/api/notices/cse:2/action', { kind: 'like' });
    expect(await queued()).toEqual([]);
    await app.request('PUT', '/api/notices/cse:1/action', { kind: 'later', revisitOn: (await db.sql`select (now() at time zone 'Asia/Seoul')::date + 1 as d`)[0].d.toISOString().slice(0, 10) });
    expect(await queued()).toEqual(['action']);
    await app.request('PUT', '/api/me/answers', { grade: 4, term: 1, goal: 'grad' });
    expect(await queued()).toEqual(['answers']);
  });
  it('열린 공지에 분야가 붙은 것이 없으면 관심 분야 선반은 no_field_verdicts. 운영자가 넣은 분야는 점수를 받는다', async () => {
    await notice(db.sql, { no: 1, judged: false, posted: -2 });
    await notice(db.sql, { no: 2, judged: false });
    await pickFields();
    expect((await home()).shelves.field).toEqual({ items: [], empty: 'no_field_verdicts' });
    await db.sql`update notices set field_state = 'human' where id = 'cse:1'`;
    await db.sql`insert into notice_fields (notice_id, field_id, level, ord) values ('cse:1', 'backend', 'core', 0)`;
    await db.sql`delete from picks`;
    expect((await home()).pick!.notice.id).toBe('cse:1');
  });

  it('다시 볼 날이 된 나중에 보기 공지는 가장 추천으로 그대로 둔다', async () => {
    await notice(db.sql, { no: 1, core: ['backend'] });
    await pickFields();
    await home();
    await db.sql`insert into actions (student_id, notice_id, kind, revisit_on) values (${me}, 'cse:1', 'later', (now() at time zone 'Asia/Seoul')::date)`;
    expect((await home()).pick!.notice.id).toBe('cse:1');
  });

  it('모델이 없으면(연결 실패) 규칙 1위이고, 계산이 던지면 행이 남는다', async () => {
    await notice(db.sql, { no: 1, core: ['backend'] });
    await pickFields();
    const down = makeWorker(db.sql, { model: { post: (async () => { throw new TypeError('fetch failed'); }) as Post, throttle } });
    await down.step();
    expect((await home()).pick).toMatchObject({ method: '규칙' });
    await enqueue(db.sql, me, 'daily');
    await makeWorker(db.sql, { noModel: true, analysisOf: async () => { throw new Error('boom'); } }).step();
    expect((await db.sql`select cause from repick_queue`).map(r => r.cause)).toEqual(['daily']);
  });

  it('프롬프트 벡터가 비어 있으면 그 학생 차례에 채운다', async () => {
    await notice(db.sql, { no: 1, core: ['backend'] });
    await pickFields();
    await db.sql`insert into prompts (student_id, body) values (${me}, '백엔드 인턴을 찾고 있어요')`;
    const post = (async (url: string) => ({
      status: 200,
      text: async () => JSON.stringify(url.endsWith('/api/embed') ? { embeddings: [axis(2)] } : { message: { content: JSON.stringify({ pick: 1, reason: '프롬프트와 맞아요', cited: ['prompt'] }) } })
    })) as Post;
    await makeWorker(db.sql, { model: { post, throttle } }).step();
    expect((await db.sql`select vector is not null as v from prompts`)[0].v).toBe(true);
    expect((await db.sql`select cited from picks`)[0].cited).toEqual([{ key: 'prompt' }]);
  });
  it('계속 실패하는 학생은 줄 맨 뒤로 가 다른 학생을 막지 않는다', async () => {
    await notice(db.sql, { no: 1, core: ['backend'] });
    await pickFields();
    const other = await createDevStudent(db.sql, 'dev2@example.com');
    await enqueue(db.sql, other, 'daily');
    const w = makeWorker(db.sql, { noModel: true, analysisOf: async (_sql, id) => { if (id === me) throw new Error('boom'); return null; } });
    expect([await w.step(), await w.step()]).toEqual([me, other]);
  });

  it('일꾼이 행을 집은 뒤 홈이 바로 바꾼 가장 추천은 덮지 않는다', async () => {
    await notice(db.sql, { no: 1, core: ['backend'] });
    await notice(db.sql, { no: 2, core: ['qa'], posted: -3 });
    await pickFields();
    const w = makeWorker(db.sql, { noModel: true, analysisOf: async () => {
      await db.sql`update picks set notice_id = 'cse:2', reason = '홈이 바꿈', computed_at = clock_timestamp() where student_id = ${me}`;
      return null;
    } });
    await home(); // 규칙 1위를 picks에 둔다
    await w.step();
    expect((await db.sql`select reason from picks`)[0].reason).toBe('홈이 바꿈');
  });
  it('관심 없음이 몰린 분야가 핵심인 공지는 고른 분야여도 뒤에 서고, 그 줄을 빼면 다시 앞에 선다 (FR-033, T065)', async () => {
    await notice(db.sql, { no: 1, core: ['backend'] });
    await notice(db.sql, { no: 2, kind: 'hackathon', posted: -5 });
    for (const no of [3, 4]) await notice(db.sql, { no, core: ['backend'], deadline: 30 });
    await pickFields();
    await app.request('PUT', '/api/notices/cse:3/action', { kind: 'dislike', reason: 'field' });
    await app.request('PUT', '/api/notices/cse:4/action', { kind: 'dislike', reason: 'hard' });
    await makeWorker(db.sql, { noModel: true }).step();
    expect((await home()).pick!.notice.id).toBe('cse:2');
    await app.request('PUT', '/api/me/analysis/excluded/disliked:backend', {});
    await makeWorker(db.sql, { noModel: true }).step();
    expect((await home()).pick!.notice.id).toBe('cse:1');
  });

  it('LLM에는 나의 분석 줄을 넣고, 참고한 줄을 빼면 홈의 참고한 줄에서 바로 빠진다 (US5 시나리오 6)', async () => {
    for (const no of [1, 2, 3]) await notice(db.sql, { no, core: ['csr-nlp'] });
    await pickFields();
    await app.request('PUT', '/api/notices/cse:2/action', { kind: 'like' });
    await app.request('PUT', '/api/notices/cse:3/action', { kind: 'like' });
    let seen = '';
    const post = (async (_u: string, body: string) => {
      seen = JSON.parse(body).messages[1].content;
      return { status: 200, text: async () => JSON.stringify({ message: { content: JSON.stringify({ pick: 1, reason: 'LLM을 꾸준히 봐요', cited: ['liked:csr-nlp'] }) } }) };
    }) as Post;
    await makeWorker(db.sql, { model: { post, throttle } }).step();
    expect(seen).toContain('[liked:csr-nlp] 관심 있어요가 몰린 분야: 연구 자연어 처리');
    expect((await home()).pick).toMatchObject({ notice: { id: 'cse:1' }, cited: [{ key: 'liked:csr-nlp' }] });
    await app.request('PUT', '/api/me/analysis/excluded/liked:csr-nlp', {});
    expect((await home()).pick).toMatchObject({ cited: [], repicking: true });
  });
});
