import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from '../db/sql.ts';
import { testDb } from '../test/db.ts';
import { createDevStudent, PASSWORD, seedTaxonomy, studentApp } from '../test/student.ts';

let db: Awaited<ReturnType<typeof testDb>>;
let app: Awaited<ReturnType<typeof studentApp>>;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
afterEach(async () => { await app.close(); });

/** 오늘(한국)에서 d일 뒤의 날짜 */
const day = (d: number) => new Date(Date.now() + 9 * 3600_000 + d * 86400_000).toISOString().slice(0, 10);
type N = { no: number; title?: string; host?: string | null; kind?: string; posted?: number; deadline?: number | null; isNotice?: boolean; down?: boolean; core?: string[]; related?: string[]; judged?: boolean };
async function notice(sql: Sql, n: N) {
  const title = n.title ?? `공지 ${n.no}`;
  const host = n.host === undefined ? '가나다' : n.host;
  await sql`insert into notices (id, source, title, url, posted_on, host, is_notice, kind, deadline, field_state, field_rule, search_text, down, file, file_hash)
    values (${`cse:${n.no}`}, 'src', ${title}, ${`https://x/${n.no}`}, ${day(n.posted ?? -1)}, ${host}, ${n.isNotice ?? true}, ${n.kind ?? 'job'},
      ${n.deadline === null ? null : day(n.deadline ?? 10)}, ${n.judged === false ? 'off' : 'judged'}, 'LLM: m', ${`${title}${host ?? ''}`.toLowerCase().replace(/\s+/g, '')}, ${n.down ?? false}, '{}', 'h')`;
  for (const [level, ids] of [['core', n.core ?? []], ['related', n.related ?? []]] as const) {
    for (const [i, id] of ids.entries()) await sql`insert into notice_fields (notice_id, field_id, level, ord) values (${`cse:${n.no}`}, ${id}, ${level}, ${i})`;
  }
}
const ids = (r: { body: unknown }) => (r.body as { items: { id: string }[] }).items.map(x => x.id);

beforeEach(async () => {
  await db.sql`truncate students, taxonomies, notices cascade`;
  await seedTaxonomy(db.sql);
  app = await studentApp(db.sql);
  await createDevStudent(db.sql, 'dev1@example.com');
  await app.request('POST', '/api/login', { method: 'dev', email: 'dev1@example.com', password: PASSWORD });
  await app.request('POST', '/api/consent', { version: 'dev-1' });
});

describe('공지 목록 (US4, FR-021·022)', () => {
  it('열린 공지만 새로 올라온 순으로 주고, 종류·분야(핵심이나 관련)로 거른다. 점수 칸은 없다', async () => {
    await notice(db.sql, { no: 1, kind: 'job', posted: -3, core: ['backend'] });
    await notice(db.sql, { no: 2, kind: 'hackathon', posted: -1, related: ['backend'] });
    await notice(db.sql, { no: 3, kind: 'lecture', posted: -2 });
    await notice(db.sql, { no: 4, deadline: -1 }); // 닫힘
    await notice(db.sql, { no: 5, down: true });
    await notice(db.sql, { no: 6, isNotice: false });
    await notice(db.sql, { no: 7, deadline: null, posted: -40 }); // 마감 없음 + 30일 지남 → 닫힘
    expect(ids(await app.request('GET', '/api/notices'))).toEqual(['cse:2', 'cse:3', 'cse:1']);
    expect(ids(await app.request('GET', '/api/notices?kind=job,lecture'))).toEqual(['cse:3', 'cse:1']);
    expect(ids(await app.request('GET', '/api/notices?field=backend'))).toEqual(['cse:2', 'cse:1']);
    const first = (await app.request('GET', '/api/notices')).body as { items: Record<string, unknown>[] };
    expect(first.items[2]).toMatchObject({ id: 'cse:1', open: true, down: false, fields: { core: [{ id: 'backend', name: '백엔드' }], related: [], by: 'LLM: m' }, action: null });
    expect(JSON.stringify(first)).not.toMatch(/score|similar/);
  });

  it('찾기는 제목·주최에서 띄어쓰기·대소문자 없이 찾고, 없으면 no_match, 열린 공지가 없으면 no_open_notices. 50자를 넘으면 too_long', async () => {
    expect((await app.request('GET', '/api/notices')).body).toMatchObject({ items: [], empty: 'no_open_notices' });
    await notice(db.sql, { no: 1, title: '2026 겨울 해커 톤', host: 'SKKU' });
    await notice(db.sql, { no: 2, title: '인턴 모집', host: 'Toss' });
    expect(ids(await app.request('GET', `/api/notices?q=${encodeURIComponent('해커톤')}`))).toEqual(['cse:1']);
    expect(ids(await app.request('GET', '/api/notices?q=toss'))).toEqual(['cse:2']);
    expect((await app.request('GET', '/api/notices?q=%25')).body).toMatchObject({ items: [], empty: 'no_match' });
    expect((await app.request('GET', `/api/notices?q=${'가'.repeat(51)}`)).body).toMatchObject({ error: { code: 'too_long', max: 50 } });
    expect((await app.request('GET', '/api/notices?kind=party')).body).toMatchObject({ error: { code: 'invalid', field: 'kind' } });
    expect((await app.request('GET', '/api/notices?sort=x')).body).toMatchObject({ error: { code: 'invalid', field: 'sort' } });
  });

  it('마감 가까운 순은 마감 없는 공지가 맨 뒤이고, 20개씩 나눠 준다', async () => {
    await notice(db.sql, { no: 1, deadline: 5 });
    await notice(db.sql, { no: 2, deadline: null });
    await notice(db.sql, { no: 3, deadline: 2 });
    expect(ids(await app.request('GET', '/api/notices?sort=due'))).toEqual(['cse:3', 'cse:1', 'cse:2']);
    for (let no = 10; no < 35; no++) await notice(db.sql, { no });
    const p1 = (await app.request('GET', '/api/notices')).body as { items: unknown[]; next: string };
    expect(p1.items).toHaveLength(20);
    const p2 = (await app.request('GET', `/api/notices?cursor=${p1.next}`)).body as { items: unknown[]; next: string | null };
    expect([p2.items.length, p2.next]).toEqual([8, null]);
  });
});

describe('카드 행동과 내 목록 (US4, FR-025~027)', () => {
  beforeEach(async () => {
    await notice(db.sql, { no: 1, title: '[가나다] 백엔드 인턴', deadline: 10, core: ['backend', 'qa'] });
    await notice(db.sql, { no: 2, deadline: 10 });
  });
  const act = (no: number, body: unknown) => app.request('PUT', `/api/notices/cse:${no}/action`, body);

  it('관심 있어요는 내 목록에 있고, 행동 지우기로 빠진다. 새 행동은 앞 행동을 바꾼다', async () => {
    expect((await act(1, { kind: 'like' })).body).toMatchObject({ action: { kind: 'like', revisitOn: null, reason: null }, suggestActivity: null });
    expect((await app.request('GET', '/api/me/list')).body).toMatchObject({ items: [{ notice: { id: 'cse:1', deadline: day(10) }, flags: [] }] });
    await act(1, { kind: 'dislike', reason: 'field' });
    expect((await app.request('GET', '/api/me/list')).body).toEqual({ items: [] });
    expect(ids(await app.request('GET', '/api/notices'))).toEqual(['cse:2']);
    expect((await app.request('DELETE', '/api/notices/cse:1/action')).status).toBe(204);
    expect(ids(await app.request('GET', '/api/notices'))).toEqual(['cse:2', 'cse:1']);
  });

  it('나중에 보기: 다시 볼 날 전에는 목록에 없고, 그날이 되면 다시 나오고 내 목록에 다시 볼 날 표시가 붙는다. 마감이 당겨지면 바로 나온다', async () => {
    await act(1, { kind: 'later', revisitOn: day(3) });
    expect(ids(await app.request('GET', '/api/notices'))).toEqual(['cse:2']);
    expect((await app.request('GET', '/api/me/list')).body).toMatchObject({ items: [{ notice: { action: { kind: 'later', revisitOn: day(3) } }, flags: [] }] });
    await db.sql`update actions set revisit_on = ${day(0)}`;
    expect(ids(await app.request('GET', '/api/notices'))).toEqual(['cse:2', 'cse:1']);
    expect((await app.request('GET', '/api/me/list')).body).toMatchObject({ items: [{ flags: ['revisit_due'] }] });
    await db.sql`update actions set revisit_on = ${day(5)}`;
    await db.sql`update notices set deadline = ${day(4)} where id = 'cse:1'`;
    expect(ids(await app.request('GET', '/api/notices'))).toEqual(['cse:2', 'cse:1']);
  });

  it.each<[string, unknown, string]>([
    ['다시 볼 날이 오늘', { kind: 'later', revisitOn: day(0) }, 'revisitOn'],
    ['다시 볼 날이 닫히는 날 뒤', { kind: 'later', revisitOn: day(11) }, 'revisitOn'],
    ['다시 볼 날 없음', { kind: 'later' }, 'revisitOn'],
    ['관심 있어요에 다시 볼 날', { kind: 'like', revisitOn: day(3) }, 'revisitOn'],
    ['관심 있어요에 이유', { kind: 'like', reason: 'time' }, 'reason'],
    ['모르는 이유', { kind: 'dislike', reason: 'boring' }, 'reason'],
    ['모르는 행동', { kind: 'save' }, 'kind']
  ])('거절: %s', async (_name, body, field) => {
    expect((await act(1, body)).body).toMatchObject({ error: { code: 'invalid', field } });
  });

  it('이미 해 봤어요면 직접 넣은 활동 초안을 준다', async () => {
    const r = (await act(1, { kind: 'dislike', reason: 'done' })).body as { suggestActivity: Record<string, unknown> };
    expect(r.suggestActivity).toMatchObject({ name: '[가나다] 백엔드 인턴', kind: 'job', fieldIds: ['backend', 'qa'] });
    expect(r.suggestActivity.term).toMatch(/^\d{4}-[12]$/);
  });

  it('닫히거나 내려간 공지: 새 행동은 invalid, 자세히·내 목록은 표시와 함께 준다. 행동이 없는 공지 아닌 글은 not_found', async () => {
    await act(1, { kind: 'like' });
    await act(2, { kind: 'like' });
    await db.sql`update notices set deadline = ${day(-1)} where id = 'cse:1'`;
    await db.sql`update notices set is_notice = false where id = 'cse:2'`;
    expect((await act(1, { kind: 'later', revisitOn: day(1) })).body).toMatchObject({ error: { code: 'invalid', field: 'kind' } });
    expect((await app.request('GET', '/api/notices/cse:1')).body).toMatchObject({ id: 'cse:1', open: false, down: false });
    const list = ((await app.request('GET', '/api/me/list')).body as { items: { notice: { id: string }; flags: string[] }[] }).items;
    expect(Object.fromEntries(list.map(x => [x.notice.id, x.flags]))).toEqual({ 'cse:1': ['closed'], 'cse:2': ['down'] });
    await notice(db.sql, { no: 3, isNotice: false });
    expect((await app.request('GET', '/api/notices/cse:3')).status).toBe(404);
    expect((await app.request('GET', '/api/notices/cse:99')).status).toBe(404);
  });

  it('동의 전에는 행동을 남기지 않는다. 다른 학생의 행동은 보이지 않는다', async () => {
    await act(1, { kind: 'like' });
    await createDevStudent(db.sql, 'dev2@example.com');
    await app.request('POST', '/api/login', { method: 'dev', email: 'dev2@example.com', password: PASSWORD });
    expect((await app.request('GET', '/api/me/list')).body).toEqual({ items: [] });
    expect((await app.request('GET', '/api/notices/cse:1')).body).toMatchObject({ action: null });
    expect((await act(1, { kind: 'like' })).body).toMatchObject({ error: { code: 'consent_required' } });
  });
});
