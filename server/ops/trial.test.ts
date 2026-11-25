import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { viewUrl } from '../../etl/notices/cse.ts';
import { fieldVersion, makeFieldAsk } from '../../etl/notices/fields.ts';
import { makeAsk, modelDir, PROMPT_VERSION, type Post } from '../../etl/notices/llm.ts';
import { writeCsv } from '../../etl/notices/eval.ts';
import { makeEmbed } from '../../etl/notices/embed.ts';
import { validList } from '../../etl/taxonomy/fixtures.ts';
import { saveTaxonomy } from '../../etl/taxonomy/taxonomy.ts';
import { testDb } from '../test/db.ts';
import { seedTaxonomy } from '../test/student.ts';
import { goldVersion, saveGoldVersion } from './conditions.ts';
import { openRequest } from './requests.ts';
import { runTrial, type Metrics, type TrialDeps } from './trial.ts';

let db: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });

const t = validList('custom'); // 80개라 임베딩 후보를 쓴다
const name = (id: string) => t.fields.find(f => f.id === id)!.name;
const FIELD_NOS = [1, 2, 3, 4];
const OPP_NOS = [1, 2, 11, 12];
let d: TrialDeps & Required<Pick<TrialDeps, 'cacheDir' | 'trialDir' | 'llmDir' | 'fieldDir' | 'embedDir'>>;
let asked: { model: string; kind: 'field' | 'opp'; no: number }[];
/** 글마다 낼 분야(핵심 이름)와 기회 여부. 'fail'은 꼴이 틀린 답 */
let reply: (a: { model: string; kind: 'field' | 'opp'; no: number }) => unknown;
let embeds: number;

const vec = (i: number) => Array.from({ length: 1024 }, (_, k) => (k === i ? 1 : 0.001));
const post: Post = async (url, body) => {
  const o = JSON.parse(body) as { model: string; input?: string[]; messages?: { content: string }[]; format?: { properties: object } };
  const ok = (v: unknown) => ({ status: 200, text: async () => JSON.stringify(v) });
  if (url.endsWith('/api/embed')) {
    embeds++;
    // 공지 n은 분야 n과, 분야는 자기 자신과 가깝다
    return ok({ embeddings: o.input!.map(s => { const m = /제목 (\d+)/.exec(s); return vec(m ? Number(m[1]) : t.fields.findIndex(f => s.includes(`> ${f.name}:`))); }) });
  }
  const no = Number(/제목 (\d+)/.exec(o.messages![1].content)![1]);
  const a = { model: o.model, kind: '핵심' in o.format!.properties ? 'field' as const : 'opp' as const, no };
  asked.push(a);
  const r = reply(a);
  if (r === 'down') return { status: 404, text: async () => '' };
  return ok({ message: { content: r === 'fail' ? '꼴이 틀린 답' : JSON.stringify(r) } });
};
const right = (a: { kind: string; no: number }) => (a.kind === 'field' ? { 핵심: [name(t.fields[a.no].id)], 관련: [] } : { 기회: a.no < 10 ? 'O' : 'X', 종류: a.no < 10 ? '채용' : '', 주최: '없음', 확신: '높음' });
const throttle = { readTemp: async () => 50, readGpu: async () => null, sleep: async () => {}, every: () => () => {}, logDir: mkdtempSync(join(tmpdir(), 'load-')) };

beforeEach(async () => {
  await db.sql`truncate op_requests, model_trials, model_changes, model_bursts, op_state, taxonomies cascade`;
  await seedTaxonomy(db.sql);
  const root = mkdtempSync(join(tmpdir(), 'trial-'));
  const at = (p: string) => { mkdirSync(join(root, p), { recursive: true }); return join(root, p); };
  saveTaxonomy(t, at('tax'));
  const link = (no: number) => viewUrl(no);
  writeFileSync(join(at('gold'), 'dev-501.csv'), writeCsv([['링크', '게시판', '제목', '게시일', '기회', '종류', '마감', '주최', '확신', '메모'],
    ...OPP_NOS.map(no => [link(no), '채용/모집', `제목 ${no}`, '2026-10-01', no < 10 ? 'O' : 'X', no < 10 ? '채용' : '', no < 10 ? '없음' : '', '', '', ''])]));
  writeFileSync(join(at('gold/fields'), 'sample.csv'), writeCsv([['링크', '게시판', '제목', '게시일', '종류'], ...FIELD_NOS.map(no => [link(no), '채용/모집', `제목 ${no}`, '2026-10-01', '채용'])]));
  writeFileSync(join(at('gold/fields'), 'custom.csv'), writeCsv([['링크', '제목', 'A 핵심', 'A 관련', 'B 핵심', 'B 관련', '최종 핵심', '최종 관련', '갈림', '메모'],
    ...FIELD_NOS.map(no => { const id = t.fields[no].id; return [link(no), `제목 ${no}`, id, '-', id, '-', id, '-', 'X', '']; })]));
  for (const no of [...FIELD_NOS, ...OPP_NOS]) writeFileSync(join(at('cse'), `${no}.html`), `<div class="fr-view"><p>본문 ${no}</p></div>`);
  asked = [];
  embeds = 0;
  reply = right;
  d = {
    sql: db.sql, goldDir: join(root, 'gold'), taxonomyDir: join(root, 'tax'), cacheDir: join(root, 'cse'), trialDir: join(root, 'trial'), llmDir: at('llm'), fieldDir: at('llm-fields'), embedDir: at('embed'),
    stop: async () => null, model: { post, throttle }, installed: async () => ['gemma4:12b', 'b:1', 'bge-m3:latest'].map(n => ({ name: n, size: 1, parameterSize: '1B', family: 'x' }))
  };
});
const request = async (model = 'b:1') => { const r = await openRequest(db.sql, 'model_trial', 'o', model); return { id: String(r.id), model }; };
const trials = async () => db.sql<{ model: string; metrics: Metrics; gold_version: string; field_version: string; prompt_version: string }[]>`select * from model_trials order by id`;
const state = async () => (await db.sql<{ done: number; total: number; requests: number; error: string | null }[]>`select done, total, requests, error from op_requests order by id desc limit 1`)[0];
const files = (dir: string): string[] => readdirSync(dir, { recursive: true, withFileTypes: true }).filter(f => f.isFile()).map(f => join(f.parentPath, f.name)).sort();

describe('모델 재기 (R15)', () => {
  it('지금 모델을 먼저 재고 후보를 잰다. 값은 1단계와 같은 셈이고 조건과 함께 남는다', async () => {
    // 후보는 2번을 틀리고(관련 분야를 핵심으로), 12번을 기회로 잘못, 1번을 놓친다
    reply = a => (a.model !== 'b:1' ? right(a) : a.kind === 'field' && a.no === 2 ? { 핵심: [name(t.fields[3].id)], 관련: [name(t.fields[2].id)] } : a.kind === 'opp' && a.no === 12 ? { 기회: 'O', 종류: '특강', 주최: '없음', 확신: '높음' }
      : a.kind === 'opp' && a.no === 1 ? { 기회: 'X', 종류: '', 주최: '없음', 확신: '높음' } : right(a));
    const r = await request();
    expect(await runTrial(d, r)).toBe('done');
    const [a, b] = await trials();
    expect([a.model, b.model]).toEqual(['gemma4:12b', 'b:1']);
    expect(a.metrics).toMatchObject({ corePrecision: { num: 4, den: 4 }, coreRecall: { num: 4, den: 4 }, oppRight: { num: 4, den: 4 }, oppMissed: { num: 0, den: 2 }, fieldSample: 4, oppSample: 4, failed: 0 });
    // 2번의 핵심은 그 공지와 가까운 3위 안이 아니라 굳히면 관련으로 내려간다
    expect(b.metrics).toMatchObject({ corePrecision: { num: 3, den: 3 }, coreRecall: { num: 3, den: 4 }, relatedPrecision: { num: 1, den: 2 }, oppRight: { num: 2, den: 4 }, oppMissed: { num: 1, den: 2 } });
    expect(b.metrics.secPerAsk).not.toBeNull();
    expect(b).toMatchObject({ gold_version: goldVersion(d.goldDir, 'custom'), field_version: fieldVersion(t), prompt_version: PROMPT_VERSION });
    expect(await state()).toMatchObject({ done: 16, total: 16, requests: 0 });
    expect((await db.sql`select distinct who from model_bursts`).map(x => x.who)).toEqual(['trial']);
    expect(JSON.stringify(await trials())).not.toContain('제목');
    // 같은 조건으로 잰 지금 모델은 다시 재지 않는다
    await db.sql`update op_requests set status = 'done'`;
    asked = [];
    await runTrial(d, await request('b:1'));
    expect(asked).toEqual([]); // 후보도 이미 답한 글은 다시 묻지 않는다
    expect((await trials()).at(-1)!.metrics).toMatchObject({ corePrecision: { num: 3, den: 3 }, secPerAsk: null, gpuAvg: null, tempMax: null });
  });

  it('밤 시간이 끝나면 멈추고 다음에 이어서 한다. 답한 글은 다시 묻지 않고 부하는 더해진다', async () => {
    await db.sql`insert into model_changes (old_model, new_model, by_operator) values ('gemma4:12b', 'b:1', 'o')`; // 지금 모델을 잰다
    const r = await request('b:1');
    let n = 0;
    expect(await runTrial({ ...d, stop: async () => (++n > 3 ? 'night' : null) }, r)).toBe('night');
    expect(await state()).toMatchObject({ done: 3, total: 8, error: '밤 시간이 끝나 멈췄어요. 다음 밤에 이어서 재요' });
    const first = (await state()).requests;
    expect(first).toBeGreaterThan(0);
    expect(await trials()).toHaveLength(0);
    const before = asked.length;
    expect(await runTrial(d, r)).toBe('done');
    expect(asked.length).toBe(8);
    expect(before).toBe(3);
    expect(await state()).toMatchObject({ done: 8, error: null });
    expect(await trials()).toHaveLength(1);
    expect(await runTrial({ ...d, stop: async () => 'daily' }, await (async () => { await db.sql`update op_requests set status = 'done'`; return request('gemma4:12b'); })())).toBe('daily');
  });

  it('지금 모델은 분류기가 받은 답을 읽기만 하고, 어떤 재기도 분류기 폴더에 쓰지 않는다(FR-052)', async () => {
    const throttleless = { post, gate: undefined };
    const embed = makeEmbed({ post });
    await makeAsk({ model: 'gemma4:12b', dir: d.llmDir, ...throttleless })({ no: 1, title: '제목 1', board: '', postedAt: '2026-10-01', pinned: false }, ['본문 1']);
    await makeFieldAsk({ taxonomy: t, embed, model: 'gemma4:12b', dir: d.fieldDir, embedDir: d.embedDir, post })({ no: 1, title: '제목 1', board: '', postedAt: '2026-10-01', pinned: false }, ['본문 1']);
    const before = [d.llmDir, d.fieldDir, d.embedDir].map(files);
    asked = [];
    await runTrial(d, await request());
    expect(asked.filter(a => a.model === 'gemma4:12b' && a.no === 1)).toEqual([]);
    expect([d.llmDir, d.fieldDir, d.embedDir].map(files)).toEqual(before);
    expect(files(d.trialDir).some(f => f.includes(modelDir('b:1')))).toBe(true);
    // 바꾼 뒤 지금 모델을 다시 재도 분류기 폴더는 그대로다(SC-010)
    await db.sql`insert into model_changes (old_model, new_model, by_operator) values ('gemma4:12b', 'b:1', 'o')`;
    await db.sql`update op_requests set status = 'done'`;
    await db.sql`truncate model_trials cascade`;
    rmSync(d.trialDir, { recursive: true });
    await runTrial(d, await request('b:1'));
    expect([d.llmDir, d.fieldDir, d.embedDir].map(files)).toEqual(before);
  });

  it('꼴이 틀린 답은 한 번 더 묻고, 남은 것이 5%를 넘으면 결과를 내지 않는다', async () => {
    await db.sql`insert into model_changes (old_model, new_model, by_operator) values ('gemma4:12b', 'b:1', 'o')`;
    const tries = new Map<string, number>();
    reply = a => { const k = `${a.kind}${a.no}`; tries.set(k, (tries.get(k) ?? 0) + 1); return k === 'field2' && tries.get(k) === 1 ? 'fail' : right(a); };
    await runTrial(d, await request('b:1'));
    expect((await trials())[0].metrics).toMatchObject({ failed: 0, corePrecision: { num: 4, den: 4 } });
    await db.sql`update op_requests set status = 'done'`;
    rmSync(d.trialDir, { recursive: true });
    reply = a => (a.kind === 'field' && a.no === 2 ? 'fail' : right(a));
    await expect(runTrial(d, await request('b:1'))).rejects.toThrow('답을 받지 못한 글이 8건 가운데 1건');
    expect(await trials()).toHaveLength(1);
  });

  it('서버에 닿지 못하면 멈추고, 모델이 없으면 실패한다', async () => {
    reply = () => 'down';
    const r = await request('gemma4:12b');
    expect(await runTrial(d, r)).toBe('down');
    expect(await runTrial({ ...d, installed: async () => { throw new Error('닿지 못함'); } }, r)).toBe('down');
    const only = (...ns: string[]) => ({ ...d, installed: async () => ns.map(n => ({ name: n, size: 1, parameterSize: '1B', family: 'x' })) });
    await expect(runTrial(only('bge-m3:latest'), r)).rejects.toThrow('gemma4:12b 모델이 모델 서버에 없어요');
    await expect(runTrial(only('gemma4:12b'), r)).rejects.toThrow('bge-m3 임베딩 모델이 모델 서버에 없어요');
  });

  it('지금 모델을 재지 못해도 후보는 재고, 까닭이 남는다', async () => {
    reply = a => (a.model === 'b:1' ? right(a) : 'down');
    const r = await request();
    expect(await runTrial({ ...d, installed: async () => ['b:1', 'bge-m3:latest'].map(n => ({ name: n, size: 1, parameterSize: '1B', family: 'x' })) }, r)).toBe('done');
    expect((await trials()).map(t => t.model)).toEqual(['b:1']);
    expect(await state()).toMatchObject({ done: 16, total: 16, error: '지금 모델은 재지 못했어요(gemma4:12b 모델이 모델 서버에 없어요)' });
  });

  it('글 하나마다 모델 잠금을 놓는다(잠금 안에서 잠그지 않아 멈추지 않는다)', async () => {
    await db.sql`insert into model_changes (old_model, new_model, by_operator) values ('gemma4:12b', 'b:1', 'o')`;
    let free = 0;
    const stop = async () => {
      const [{ ok }] = await db.sql<{ ok: boolean }[]>`select pg_try_advisory_xact_lock(hashtext('kingo:model:' || current_schema())) as ok`;
      if (ok) free++;
      return null;
    };
    await runTrial({ ...d, stop }, await request('b:1'));
    expect(free).toBe(8);
  });

  it('정답셋이나 본문이 없으면 까닭과 함께 실패한다. 정답셋 판은 파일이 바뀌면 달라진다', async () => {
    await saveGoldVersion(db.sql, d.goldDir, d.taxonomyDir);
    const v = (await db.sql`select value from op_state where key = 'gold_version'`)[0].value;
    expect(v).toMatch(/^[0-9a-f]{8}$/);
    rmSync(join(d.cacheDir, '3.html'));
    await expect(runTrial(d, await request('gemma4:12b'))).rejects.toThrow('본문 보관본이 1건 없어요');
    const file = join(d.goldDir, 'fields', 'custom.csv');
    writeFileSync(file, readFileSync(file, 'utf8').replace('"X"', '"C"'));
    await saveGoldVersion(db.sql, d.goldDir, d.taxonomyDir);
    expect((await db.sql`select value from op_state where key = 'gold_version'`)[0].value).not.toBe(v);
    rmSync(join(d.goldDir, 'dev-501.csv'));
    await saveGoldVersion(db.sql, d.goldDir, d.taxonomyDir);
    expect(await db.sql`select 1 from op_state where key = 'gold_version'`).toHaveLength(0);
    await db.sql`update op_requests set status = 'done'`;
    await expect(runTrial(d, await request('gemma4:12b'))).rejects.toThrow('정답셋이 없어요');
    // 꼴이 틀린 파일의 글은 오류 글에 나오지 않는다(FR-053)
    const dev = join(d.goldDir, 'dev-501.csv');
    writeFileSync(dev, writeCsv([['링크', '게시판', '제목', '게시일', '기회', '종류', '마감', '주최', '확신', '메모'], ['비밀 라벨', '', '', '', 'O', '', '', '', '', '']]));
    const e = await runTrial(d, { id: '1', model: 'gemma4:12b' }).catch((x: Error) => x.message);
    expect(e).toMatch(/정답셋/);
    expect(e).not.toContain('비밀');
    rmSync(dev);
    // 다음 회차의 정답이 생기면 그것을 쓴다
    mkdirSync(dev); // 읽지 못하는 파일이 있어도 던지지 않는다(한 번 더 돌리기를 막지 않게)
    await saveGoldVersion(db.sql, d.goldDir, d.taxonomyDir);
    rmSync(dev, { recursive: true });
    cpSync(file, join(d.goldDir, 'fields', 'custom-2.csv'));
    expect(goldVersion(d.goldDir, 'custom')).toBeNull();
  });
});
