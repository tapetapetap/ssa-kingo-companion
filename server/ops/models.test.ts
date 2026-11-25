import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fieldVersion } from '../../etl/notices/fields.ts';
import { PROMPT_VERSION } from '../../etl/notices/llm.ts';
import { validList } from '../../etl/taxonomy/fixtures.ts';
import { saveTaxonomy } from '../../etl/taxonomy/taxonomy.ts';
import { currentModel, olderModels, classifierEnv, type Installed } from '../model.ts';
import { testDb } from '../test/db.ts';
import { createDevStudent, PASSWORD, seedTaxonomy, studentApp } from '../test/student.ts';
import { TRIAL_VERSION } from './conditions.ts';
import { isCandidate } from './models.ts';

let db: Awaited<ReturnType<typeof testDb>>;
let app: Awaited<ReturnType<typeof studentApp>>;
const FIRST = 'gemma4:12b';
const t = validList('custom');
const chosen = (over: object = {}) => ({ date: '2026-11-24', corePrecision: { num: 27, den: 31 }, prompt: fieldVersion(t), model: FIRST, ...over });
const model = (name: string, o: Partial<Installed> = {}): Installed => ({ name, size: 8e9, parameterSize: '12B', family: 'gemma', ...o });
let installed: () => Promise<Installed[]>;
let dir: string;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.sql`truncate students, op_requests, model_trials, model_changes, op_state, taxonomies cascade`;
  await seedTaxonomy(db.sql);
  await db.sql`insert into op_state (key, value) values ('gold_version', 'gold0001')`;
  dir = mkdtempSync(join(tmpdir(), 'tax-'));
  saveTaxonomy({ ...t, chosen: chosen() }, dir);
  installed = async () => [model(FIRST), model('b:1'), model('bge-m3:latest', { family: 'bert', parameterSize: '566M' }), model('nosize', { parameterSize: null })];
  app = await studentApp(db.sql, { operators: new Map([['dev:ops@example.com', 'operator']]), models: () => installed(), taxonomyDir: dir });
  await createDevStudent(db.sql, 'ops@example.com');
  await app.request('POST', '/api/login', { method: 'dev', email: 'ops@example.com', password: PASSWORD });
});
afterEach(async () => { await app.close(); });
const get = async () => (await app.request('GET', '/api/ops/models')).body as Record<string, never> & { trials: { id: number; stale: boolean; passes: boolean }[] };
const trial = async (num: number, den: number, o: Record<string, unknown> = {}) => {
  const v = { model: 'b:1', taxonomy_id: 'custom', field_version: fieldVersion(t), prompt_version: PROMPT_VERSION, gold_version: 'gold0001', trial_version: TRIAL_VERSION, metrics: { corePrecision: { num, den } }, started_at: new Date(), ...o };
  return Number((await db.sql`insert into model_trials ${db.sql(v as never)} returning id`)[0].id);
};
const change = (trialId: unknown) => app.request('POST', '/api/ops/models/current', { trialId });

describe('모델 (contracts/api.md)', () => {
  it('바꾼 기록이 없으면 처음 모델이고, 후보에서 임베딩 모델과 크기 정보가 없는 것을 뺀다', async () => {
    expect(await get()).toMatchObject({
      current: { model: FIRST, since: null, by: null, trial: null }, initial: { model: FIRST, num: 27, den: 31, usable: true }, serverOk: true, goldReady: true,
      installed: [{ name: FIRST, size: 8e9, parameterSize: '12B' }, { name: 'b:1' }], request: null, trials: [], changes: []
    });
    expect([model('x', { family: 'xlm-roberta-bert' }), model('bge-m3'), model('x', { parameterSize: null })].map(isCandidate)).toEqual([false, false, false]);
    installed = async () => { throw new Error('닿지 못함'); };
    expect(await get()).toMatchObject({ serverOk: false, installed: [], current: { model: FIRST }, initial: { usable: false } });
  });

  it('85%는 분수로 본다: 84.9%는 trial_low, 85.0%는 바뀐다(SC-010). 바꾼 사람과 때가 남는다', async () => {
    const low = await trial(849, 1000);
    const ok = await trial(17, 20);
    expect((await get()).trials.map(x => [x.id, x.passes])).toEqual([[ok, true], [low, false]]);
    expect(await change(low)).toMatchObject({ status: 422, body: { error: { code: 'trial_low' } } });
    expect(await change(ok)).toMatchObject({ status: 200, body: { current: { model: 'b:1', by: 'ops@example.com', trial: { id: ok } } } });
    expect(await currentModel(db.sql)).toBe('b:1');
    expect((await get()).changes).toMatchObject([{ old: FIRST, new: 'b:1', by: 'ops@example.com' }]);
    expect(await change(ok)).toMatchObject({ status: 422, body: { error: { code: 'invalid', message: '이미 지금 모델이에요' } } });
    expect(await change(await trial(0, 0))).toMatchObject({ body: { error: { code: 'trial_low' } } });
  });

  it('잰 뒤 지시문·분야 목록·정답셋·재는 방법이 바뀌었으면 trial_stale이고, 정답셋 판을 모르면 모두 낡았다', async () => {
    for (const o of [{ field_version: 'x' }, { prompt_version: 'x' }, { gold_version: 'x' }, { trial_version: 0 }, { taxonomy_id: 'ncs' }]) {
      expect([o, (await change(await trial(99, 100, o))).body]).toMatchObject([o, { error: { code: 'trial_stale' } }]);
    }
    const ok = await trial(99, 100);
    expect((await get()).trials[0]).toMatchObject({ id: ok, stale: false });
    await db.sql`truncate op_state`;
    expect((await get()).trials.every(x => x.stale)).toBe(true);
    expect((await change(ok)).body).toMatchObject({ error: { code: 'trial_stale' } });
    expect(await get()).toMatchObject({ goldReady: false });
  });

  it('처음 모델로 되돌린다: 고른 기록이 지금 판과 같고 설치돼 있을 때만. 앞 모델은 최근 것부터 남는다', async () => {
    await change(await trial(99, 100));
    expect(await change('initial')).toMatchObject({ status: 200, body: { current: { model: FIRST, trial: null } } });
    expect(await olderModels(db.sql)).toEqual(['b:1']);
    expect(await classifierEnv(db.sql)).toEqual({ KINGO_LLM_MODEL: FIRST, KINGO_LLM_OLDER: 'b:1' });
    await change(await trial(30, 34, { model: 'b:1' }));
    expect(await classifierEnv(db.sql)).toEqual({ KINGO_LLM_MODEL: 'b:1', KINGO_LLM_OLDER: FIRST, KINGO_FIELD_MEASURED: JSON.stringify({ prompt: fieldVersion(t), model: 'b:1', num: 30, den: 34 }) });
    saveTaxonomy({ ...t, chosen: chosen({ prompt: '00000000' }) }, dir);
    expect((await change('initial')).body).toMatchObject({ error: { code: 'trial_stale' } });
    saveTaxonomy({ ...t, chosen: null }, dir);
    expect((await change('initial')).body).toMatchObject({ error: { code: 'invalid' } });
  });

  it('설치되지 않은 모델은 재지도 바꾸지도 못한다. 없는 결과도 거절', async () => {
    expect((await app.request('POST', '/api/ops/models/trial', { model: 'none' })).body).toMatchObject({ error: { code: 'invalid', field: 'model' } });
    expect((await app.request('POST', '/api/ops/models/trial', { model: 'bge-m3:latest' })).status).toBe(422);
    expect((await change(await trial(99, 100, { model: 'gone' }))).body).toMatchObject({ error: { code: 'invalid', field: 'trialId' } });
    for (const id of [999, 'x', null, 1.5, '1']) expect([id, (await change(id)).status]).toEqual([id, 422]);
  });

  it('재기 요청: 하나만 열리고, 기다리거나 멈춘 것은 취소하고, 도는 중이면 취소하지 못한다', async () => {
    const ask = (m = 'b:1') => app.request('POST', '/api/ops/models/trial', { model: m });
    expect(await ask()).toMatchObject({ status: 202, body: { request: { kind: 'model_trial', model: 'b:1', status: 'waiting' } } });
    expect((await ask(FIRST)).body).toMatchObject({ error: { code: 'already' } });
    const cancel = () => app.request('POST', '/api/ops/models/trial/cancel');
    await db.sql`update op_requests set status = 'running'`;
    expect(await cancel()).toMatchObject({ status: 409, body: { error: { code: 'running' } } });
    await db.sql`update op_requests set status = 'paused'`;
    expect((await cancel()).status).toBe(204);
    expect(await get()).toMatchObject({ request: { status: 'canceled' } });
    expect((await cancel()).status).toBe(422);
    expect((await ask(FIRST)).status).toBe(202); // 지금 모델도 다시 잴 수 있다
  });

  it('운영자만 부른다', async () => {
    await createDevStudent(db.sql, 'a@example.com');
    await app.request('POST', '/api/login', { method: 'dev', email: 'a@example.com', password: PASSWORD });
    for (const [m, p] of [['GET', ''], ['POST', '/trial'], ['POST', '/trial/cancel'], ['POST', '/current']] as const) expect((await app.request(m, `/api/ops/models${p}`)).status).toBe(403);
  });
});
