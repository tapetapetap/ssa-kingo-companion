// 모델을 바꿔도 앞 판정이 그대로다(FR-055, SC-010): A로 판정 → B로 바꿈 → 매일 작업 → A로 되돌림
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { NoticeRow } from '../../etl/notices/cse.ts';
import { makeFieldAsk, type FieldOutcome } from '../../etl/notices/fields.ts';
import { fromLlm, makeAsk, modelDir, PROMPT_VERSION, type Post } from '../../etl/notices/llm.ts';
import { modelEnv } from '../../etl/notices/run.ts';
import { validList } from '../../etl/taxonomy/fixtures.ts';
import { classifierEnv } from '../model.ts';
import { testDb } from '../test/db.ts';
import { notice } from '../test/notice.ts';
import { seedTaxonomy } from '../test/student.ts';
import { runDaily, type DailyDeps } from './daily.ts';

let db: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });

const ncs = validList('ncs'); // 분야가 적어 임베딩을 부르지 않는다
const [dir, fdir] = [mkdtempSync(join(tmpdir(), 'llm-')), mkdtempSync(join(tmpdir(), 'fields-'))];
let asks: string[];
const post: Post = async (_, body) => {
  const o = JSON.parse(body) as { model: string; format: { properties: object } };
  asks.push(o.model);
  const content = '핵심' in o.format.properties ? '{"핵심":[],"관련":[]}' : '{"기회":"O","종류":"채용","주최":"없음","확신":"높음"}';
  return { status: 200, text: async () => JSON.stringify({ message: { content } }) };
};
/** 분류기가 하는 일: 받은 환경으로 글마다 두 판정을 하고 근거를 모은다 */
async function classify(env: Record<string, string>, nos: number[]) {
  const { older } = modelEnv(env);
  const ask = makeAsk({ model: env.KINGO_LLM_MODEL, dir, post, older: older.map(model => ({ dir, model })) });
  const field = makeFieldAsk({ taxonomy: ncs, embed: async () => 'down', model: env.KINGO_LLM_MODEL, dir: fdir, post, older: older.map(model => ({ dir: fdir, model })) });
  const out: Record<number, [string, string]> = {};
  for (const no of nos) {
    const row: NoticeRow = { no, title: `제목 ${no}`, board: '', postedAt: '2026-11-01', pinned: false };
    const [a, f] = [await ask(row, ['본문']), await field(row, ['본문'])];
    if (typeof a === 'string' || typeof f === 'string') throw new Error('묻지 못함');
    const by = (o: Exclude<FieldOutcome, string>) => `LLM: ${o.model ?? field.model}`;
    out[no] = [(fromLlm(a.answer, a.model ?? ask.model) as { rule: string }).rule, by(f)];
  }
  return out;
}
const both = (m: string): [string, string] => [`LLM: ${m}`, `LLM: ${m}`];

it('앞 공지는 A 그대로, 새 공지와 다시 판정한 공지만 B로 묻는다. 되돌려도 B로 판정한 것은 그대로다', async () => {
  await seedTaxonomy(db.sql);
  const A = 'gemma4:12b';
  const B = 'b:1';
  for (const no of [1, 2]) await notice(db.sql, { no });
  let got: Record<number, [string, string]> = {};
  let nos = [1, 2];
  const deps = (): DailyDeps => ({
    sql: db.sql, mode: 'dev', databaseUrl: '', backupDir: null, now: () => new Date('2026-11-24T09:00:00+09:00'), pollMs: 5, model: () => ({ name: A, chat: async () => 'fail', embed: async () => 'down' as never, noTemp: 0, close: async () => ({}) as never }),
    classifier: async env => { asks = []; got = await classify(env, nos); return { code: 0, stdout: '' }; }, ingestFile: async () => ({ ok: true, summary: {} as never, dryRun: false }),
    // 시험 폴더의 보관 답을 같은 꼴로 지운다
    cachePaths: (no, models) => models.flatMap(m => [join(dir, modelDir(m), PROMPT_VERSION, `${no}.json`), ...readdirSync(join(fdir, modelDir(m)), { recursive: true }).filter(p => String(p).endsWith(`/${no}.json`)).map(p => join(fdir, modelDir(m), String(p)))])
  });
  await runDaily(deps());
  expect(got).toEqual({ 1: both(A), 2: both(A) });

  await db.sql`insert into model_changes (old_model, new_model, by_operator) values (${A}, ${B}, 'ops')`;
  nos = [1, 2, 3];
  await runDaily(deps());
  expect(got).toEqual({ 1: both(A), 2: both(A), 3: both(B) });
  expect(asks).toEqual([B, B]); // 새 공지의 두 판정만 물었다

  await db.sql`insert into rejudge_marks (notice_id, by_operator) values ('cse:2', 'ops')`;
  await runDaily(deps());
  expect(got).toEqual({ 1: both(A), 2: both(B), 3: both(B) });

  await db.sql`insert into model_changes (old_model, new_model, by_operator) values (${B}, ${A}, 'ops')`;
  nos = [1, 2, 3, 4];
  await runDaily(deps());
  expect(got).toEqual({ 1: both(A), 2: both(B), 3: both(B), 4: both(A) });
  expect(asks).toEqual([A, A]);
  expect(await classifierEnv(db.sql)).toMatchObject({ KINGO_LLM_MODEL: A, KINGO_LLM_OLDER: B });
});
