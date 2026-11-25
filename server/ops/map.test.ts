import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../test/db.ts';
import { notice } from '../test/notice.ts';
import { createDevStudent, PASSWORD, seedTaxonomy, studentApp } from '../test/student.ts';
import { buildMap, type MapData } from './map.ts';

let db: Awaited<ReturnType<typeof testDb>>;
let ids: string[];
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.sql`truncate students, taxonomies, notices, field_maps, daily_runs cascade`;
  ids = (await seedTaxonomy(db.sql)).fields.map(f => f.id);
  for (const [i, id] of ids.entries()) await db.sql`update fields set vector = ${JSON.stringify(vec(i))}::vector where id = ${id}`;
});
/** i번째 축에 가깝고, 이웃 축에도 조금 걸친 벡터 */
const vec = (i: number, ...more: [number, number][]) => { const v = Array(1024).fill(0) as number[]; v[i] = 1; v[(i + 1) % 80] += 0.4; for (const [j, w] of more) v[j] += w; return v; };
const last = async () => (await db.sql<{ data: MapData }[]>`select data from field_maps order by id desc limit 1`)[0].data;

describe('지도 만들기 (R13)', () => {
  it('같은 자료로 두 번 만들면 좌표까지 같고, 좌표는 0~1이다(SC-009)', async () => {
    for (let no = 1; no <= 20; no++) await notice(db.sql, { no, core: [ids[no]], vector: vec(no) });
    await buildMap(db.sql);
    const a = await last();
    await buildMap(db.sql);
    expect(await last()).toEqual(a);
    expect([...a.fields, ...a.notices].every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)).toBe(true);
    expect(a.fields).toHaveLength(80);
  });

  it('순위와 1위 분야: 첫 핵심이 가장 가까우면 1, 멀면 큰 수, 핵심이 없으면 null', async () => {
    await notice(db.sql, { no: 1, core: [ids[5]], vector: vec(5) });
    await notice(db.sql, { no: 2, core: [ids[60], ids[5]], vector: vec(5) });
    await notice(db.sql, { no: 3, vector: vec(7) });
    await buildMap(db.sql);
    const { notices } = await last();
    expect(notices.map(n => [n.id, n.first])).toEqual([['cse:1', ids[5]], ['cse:2', ids[5]], ['cse:3', ids[7]]]);
    expect(notices[0].rank).toBe(1);
    expect(notices[1].rank).toBeGreaterThan(5);
    expect(notices[2].rank).toBeNull();
  });

  it('공지는 가까운 분야 쪽에 놓인다. 다섯 곳과 차이가 없으면 같은 무게다', async () => {
    await notice(db.sql, { no: 1, core: [ids[10]], vector: vec(10) });
    await notice(db.sql, { no: 2, vector: Array(1024).fill(0).map((_, i) => (i === 900 ? 1 : 0)) }); // 어느 분야와도 같은 거리
    await buildMap(db.sql);
    const { fields, notices } = await last();
    const at = (id: string) => fields.find(f => f.id === id)!;
    const d = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
    const near = fields.toSorted((a, b) => d(a, notices[0]) - d(b, notices[0])).slice(0, 5).map(f => f.id);
    expect(near).toContain(ids[10]);
    const mean = { x: 0, y: 0 };
    for (const id of ids.slice(0, 5)) { mean.x += at(id).x / 5; mean.y += at(id).y / 5; }
    expect(d(mean, notices[1])).toBeLessThan(0.001);
  });

  it('헷갈리는 쌍은 가까운 것부터 10쌍, 빈 곳은 핵심 없는 판정 3건 이상, 안 쓰인 분야, 벡터 없음', async () => {
    await db.sql`update fields set vector = ${JSON.stringify(vec(20, [21, 1]))}::vector where id = ${ids[21]}`; // 20과 21을 겹치게
    for (const no of [1, 2, 3]) await notice(db.sql, { no, vector: vec(40) });
    for (const no of [4, 5]) await notice(db.sql, { no, vector: vec(50) });
    await notice(db.sql, { no: 6, vector: vec(40), judged: false }); // 아직 판정하지 않음
    await notice(db.sql, { no: 7, core: [ids[1]], related: [ids[2]], vector: vec(1) });
    await notice(db.sql, { no: 8 });
    await buildMap(db.sql);
    const m = await last();
    expect(m.pairs).toHaveLength(10);
    expect([m.pairs[0].a, m.pairs[0].b].toSorted()).toEqual([ids[20], ids[21]].toSorted());
    expect(m.empty).toEqual([{ field: ids[40], notices: ['cse:1', 'cse:2', 'cse:3'] }]);
    expect(m.unused).not.toContain(ids[1]);
    expect(m.unused).not.toContain(ids[2]);
    expect(m.unused).toHaveLength(78);
    expect(m.noVector).toBe(1);
  });

  it('내려간 공지·공지 아님·90일 지난 글은 없다. 최근 7개만 남긴다', async () => {
    await notice(db.sql, { no: 1, vector: vec(1), posted: -90 });
    await notice(db.sql, { no: 2, vector: vec(1), posted: -91 });
    await notice(db.sql, { no: 3, vector: vec(1), down: true });
    await notice(db.sql, { no: 4, vector: vec(1), isNotice: false });
    for (let i = 0; i < 9; i++) await buildMap(db.sql);
    expect((await last()).notices.map(n => n.id)).toEqual(['cse:1']);
    expect((await db.sql`select count(*)::int as n from field_maps`)[0].n).toBe(7);
  }, 60_000);

  it('분야가 12개보다 적거나 활성 목록이 없으면 까닭을 던진다', async () => {
    await db.sql`update fields set vector = null where id <> all(${ids.slice(0, 11)})`;
    await expect(buildMap(db.sql)).rejects.toThrow('벡터가 있는 분야가 11개라');
    await db.sql`update taxonomies set active = false`;
    await expect(buildMap(db.sql)).rejects.toThrow('활성 분야 목록이 없어요');
  });

  it('공지 1,000개에서 1분 안에 끝난다(SC-009)', async () => {
    await db.sql`insert into notices (id, source, title, url, posted_on, is_notice, kind, field_state, search_text, file, file_hash, vector)
      select 'cse:' || i, 's', '공지 ' || i, 'https://x', current_date - 1, true, 'job', 'judged', 'x', '{}', 'h',
        (select ('[' || string_agg((random())::text, ',') || ']')::vector from generate_series(1, 1024) where i = i) from generate_series(1, 1000) i`;
    const t0 = Date.now();
    expect(await buildMap(db.sql)).toMatchObject({ notices: 1000 });
    expect(Date.now() - t0).toBeLessThan(60_000);
  }, 90_000);
});

describe('GET /api/ops/map', () => {
  it('이름과 제목을 붙이고, 그 뒤 내려간 공지는 뺀다. 낡은 지도는 stale, 없으면 까닭', async () => {
    const app = await studentApp(db.sql, { operators: new Map([['dev:ops@example.com', 'operator']]) });
    await createDevStudent(db.sql, 'ops@example.com');
    await app.request('POST', '/api/login', { method: 'dev', email: 'ops@example.com', password: PASSWORD });
    const get = async () => (await app.request('GET', '/api/ops/map')).body as Record<string, never>;
    expect(await get()).toEqual({ at: null, reason: '아직 매일 작업이 돌지 않았어요' });
    await db.sql`insert into daily_runs (started_at, ended_at, steps, load) values (now() - interval '2 hours', now(), '{"map":{"ok":false,"error":"벡터가 있는 분야가 0개라 지도를 만들지 못했어요"}}', '{}')`;
    expect(await get()).toEqual({ at: null, reason: '벡터가 있는 분야가 0개라 지도를 만들지 못했어요' });
    for (const no of [1, 2, 3, 4]) await notice(db.sql, { no, title: `제목 ${no}`, vector: vec(3), core: no === 1 ? [ids[3]] : [] });
    await db.sql`insert into review_items (notice_id, reasons) values ('cse:1', array['no_deadline'])`;
    await buildMap(db.sql);
    await db.sql`update notices set down = true where id = 'cse:4'`;
    const m = await get();
    expect(m).toMatchObject({ stale: false, noVector: 0 });
    expect((m.notices as unknown as { id: string }[]).map(n => n.id)).toEqual(['cse:1', 'cse:2', 'cse:3']);
    expect((m.notices as unknown[])[0]).toMatchObject({ title: '제목 1', kind: 'job', source: 'src', core: [ids[3]], rank: 1, first: ids[3], review: true });
    expect((m.fields as unknown[])[0]).toMatchObject({ id: ids[0], groupName: '묶음 0' });
    expect(m.empty).toEqual([{ field: ids[3], notices: ['cse:2', 'cse:3'] }]);
    await db.sql`insert into daily_runs (started_at, ended_at, steps, load) values (now() + interval '1 minute', now(), '{}', '{}')`;
    expect((await get()).stale).toBe(true);
    await app.request('POST', '/api/logout');
    expect((await app.request('GET', '/api/ops/map')).status).toBe(401);
    await app.close();
  });
});
