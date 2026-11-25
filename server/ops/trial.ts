// 모델 재기(FR-052·053, 3단계 research R15): 정답셋의 분야 표본과 기회 표본을 후보 모델로 판정해 1단계와 같은 방법으로 잰다.
// 새 답은 언제나 trial 폴더에만 쓴다. 분류기 보관 폴더에는 쓰지 않는다(바꾼 뒤 앞 판정이 뒤집히지 않게)
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE_DIR, type NoticeRow } from '../../etl/notices/cse.ts';
import { EMBED_CACHE_DIR, EMBED_MODEL } from '../../etl/notices/embed.ts';
import { decodeCsv, parseGold, readCsv, sampleBySha1, score, type GoldRow } from '../../etl/notices/eval.ts';
import { FIELD_CACHE_DIR, fieldVersion, makeFieldAsk, type FieldAnswer } from '../../etl/notices/fields.ts';
import { cachedBody, noOf, readGoldFile, readSample, rowOf, type GoldLabel } from '../../etl/notices/gold.ts';
import { LLM_CACHE_DIR, makeAsk, modelDir, PROMPT_VERSION, type Ask, type LlmOutcome, type Outcome } from '../../etl/notices/llm.ts';
import { judgeAll } from '../../etl/notices/run.ts';
import { scoreTaxonomy, type Ratio } from '../../etl/notices/score.ts';
import type { Taxonomy } from '../../etl/taxonomy/taxonomy.ts';
import type { Sql } from '../db/sql.ts';
import { LIMITS } from '../limits.ts';
import { hideSecrets } from '../log.ts';
import { currentModel, installedModels, openUnlocked, withModelLock, type Installed, type ModelDeps } from '../model.ts';
import { activeTaxonomy, goldVersion, latestRound, TRIAL_VERSION } from './conditions.ts';

export const TRIAL_DIR = fileURLToPath(new URL('../../etl/.cache/trial', import.meta.url));
export type Metrics = {
  corePrecision: Ratio; coreRecall: Ratio; relatedPrecision: Ratio; oppRight: Ratio; oppMissed: Ratio;
  fieldSample: number; oppSample: number; failed: number; secPerAsk: number | null; gpuAvg: number | null; tempMax: number | null;
};
export type TrialDeps = {
  sql: Sql; goldDir: string;
  /** 글과 글 사이에서 본다: 밤 시간이 끝났거나(night) 매일 작업 요청이 기다리면(daily) 물러난다 */
  stop: () => Promise<'night' | 'daily' | null>;
  cacheDir?: string; trialDir?: string; llmDir?: string; fieldDir?: string; embedDir?: string; taxonomyDir?: string; model?: ModelDeps;
  installed?: () => Promise<Installed[]>;
};
/** 재는 동안 멈춤(이어 하기)과 실패를 나눈다 */
class Pause extends Error {
  readonly why: 'night' | 'daily' | 'down';
  constructor(why: 'night' | 'daily' | 'down', message: string) {
    super(message);
    this.why = why;
  }
}

type Gold = { t: Taxonomy; fieldItems: NoticeRow[]; labels: Map<number, GoldLabel>; opp: GoldRow[]; bodies: Map<number, string[]>; version: string };

/** 파일 꼴이 틀리면 오류 글에 파일 속 글이 섞일 수 있어, DB와 화면에는 정한 글만 둔다(FR-053) */
function readable<T>(read: () => T): T {
  try {
    return read();
  } catch {
    throw new Error('정답셋 파일을 읽지 못했어요. 서버 컴퓨터에서 파일 꼴을 확인해 주세요');
  }
}

/** 정답셋과 본문을 읽는다. 모자라면 까닭을 던진다(라벨과 본문은 이 프로세스 밖으로 나가지 않는다) */
async function readGold(d: TrialDeps): Promise<Gold> {
  const t = await activeTaxonomy(d.sql, d.taxonomyDir);
  if (!t) throw new Error('활성 분야 목록이 없어요');
  const round = latestRound(d.goldDir, t.id);
  const version = goldVersion(d.goldDir, t.id);
  if (!round || !version) throw new Error('정답셋이 없어요');
  const sample = readable(() => readSample(d.goldDir, round));
  const labels = readable(() => readGoldFile(t, d.goldDir, round));
  if (sample.some(x => !labels.get(x.no)?.final)) throw new Error(`${round}회차 정답에 정하지 않은 글이 있어요`);
  const { gold, errors } = readable(() => parseGold(readCsv(decodeCsv(readFileSync(join(d.goldDir, 'dev-501.csv'))))));
  if (errors.length) throw new Error(`기회 정답셋을 읽지 못했어요(${errors.length}건)`);
  const pick = new Set(sampleBySha1(gold.map(g => g.id), LIMITS.trialOppSample));
  const opp = gold.filter(g => pick.has(g.id));
  const bodies = new Map<number, string[]>();
  const nos = readable(() => [...new Set([...sample.map(x => x.no), ...opp.map(g => noOf(g.id))])]);
  for (const no of nos) {
    const lines = await cachedBody(no, d.cacheDir ?? CACHE_DIR);
    if (lines) bodies.set(no, lines);
  }
  if (bodies.size < nos.length) throw new Error(`본문 보관본이 ${nos.length - bodies.size}건 없어요`);
  return { t, fieldItems: sample.map(x => ({ no: x.no, title: x.title, board: x.board, postedAt: x.postedAt, pinned: false })), labels, opp, bodies, version };
}

/** 분류기가 만들어 둔 벡터를 trial 폴더로 옮겨 둔다(분류기 폴더에는 쓰지 않으려고) */
function copyVectors(g: Gold, from: string, to: string) {
  const dir = modelDir(EMBED_MODEL);
  const copy = (rel: string) => {
    const [a, b] = [join(from, dir, rel), join(to, dir, rel)];
    if (!existsSync(a) || existsSync(b)) return;
    mkdirSync(dirname(b), { recursive: true });
    cpSync(a, b);
  };
  for (const r of g.fieldItems) copy(join('notices', `${r.no}.json`));
  if (existsSync(join(from, dir))) cpSync(join(from, dir), join(to, dir), { recursive: true, force: false, filter: p => !p.includes(`${join(dir, 'notices')}`) });
}

/** 모델 하나를 잰다. 이미 답한 글은 trial 폴더에서 읽어 다시 묻지 않는다 */
async function measure(d: TrialDeps, g: Gold, requestId: string, model: string, isCurrent: boolean, tick: () => Promise<void>): Promise<void> {
  const { sql } = d;
  const trial = d.trialDir ?? TRIAL_DIR;
  copyVectors(g, d.embedDir ?? EMBED_CACHE_DIR, join(trial, 'embed'));
  const [{ started_at }] = await sql<{ started_at: Date }[]>`select coalesce(started_at, now()) as started_at from op_requests where id = ${requestId}`;
  const m = openUnlocked(sql, 'trial', d.model);
  let counted = false; // 부하는 한 번만 더한다
  try {
    // 지금 모델은 분류기가 이미 받은 답을 읽기만 한다
    const ask = makeAsk({ model, host: d.model?.host, dir: join(trial, 'llm'), post: d.model?.post, gate: m.gate, older: isCurrent ? [{ dir: d.llmDir ?? LLM_CACHE_DIR, model }] : [] });
    const fieldAsk = makeFieldAsk({ taxonomy: g.t, embed: m.embed, model, host: d.model?.host, dir: join(trial, 'fields'), embedDir: join(trial, 'embed'), post: d.model?.post, gate: m.gate, older: isCurrent ? [{ dir: d.fieldDir ?? FIELD_CACHE_DIR, model }] : [] });
    const fields = new Map<number, FieldAnswer>();
    const opps = new Map<number, LlmOutcome>();
    type Job = { row: NoticeRow; run: () => Promise<Outcome<unknown>>; keep: (o: Outcome<unknown>) => void };
    const jobs: Job[] = [
      ...g.fieldItems.map((row): Job => ({ row, run: () => fieldAsk(row, g.bodies.get(row.no)!), keep: o => { if (typeof o === 'object') fields.set(row.no, o.answer as FieldAnswer); } })),
      ...g.opp.map((x): Job => { const row = rowOf(x); return { row, run: () => ask(row, g.bodies.get(row.no)!), keep: o => { opps.set(row.no, o as LlmOutcome); } }; })
    ];
    const one = async (j: Job): Promise<boolean> => {
      const why = await d.stop();
      if (why) throw new Pause(why, why === 'night' ? '밤 시간이 끝나 멈췄어요. 다음 밤에 이어서 재요' : '매일 작업을 먼저 돌려요');
      const o = await withModelLock(sql, j.run); // 글 하나마다 놓아 학생의 다시 고르기를 막지 않는다
      if (o === 'down') {
        const names = await (d.installed ?? (() => installedModels(d.model?.host)))().then(ms => ms.map(x => x.name), () => null);
        if (names && !names.some(n => n.split(':')[0] === EMBED_MODEL)) throw new Error(`${EMBED_MODEL} 임베딩 모델이 모델 서버에 없어요`);
        if (names && !names.includes(model)) throw new Error(`${model} 모델이 모델 서버에 없어요`);
        throw new Pause('down', '모델 서버에 닿지 못했거나 온도를 읽지 못했어요. 다음에 이어서 재요');
      }
      j.keep(o);
      return o !== 'fail';
    };
    const failed: Job[] = [];
    for (const j of jobs) {
      if (!await one(j)) failed.push(j);
      await tick();
    }
    // 답을 못 준 글은 한 번 더 묻는다
    let left = 0;
    for (const j of failed) if (!await one(j)) left++;
    if (left * 100 > jobs.length * LIMITS.trialFailPercent) throw new Error(`답을 받지 못한 글이 ${jobs.length}건 가운데 ${left}건이라 결과를 내지 않았어요`);

    counted = true;
    await addLoad(sql, requestId, await m.close());
    const [r] = await sql<{ requests: number; request_ms: string; gpu_ms: number; gpu_known_ms: string; temp_max: number | null }[]>`select requests, request_ms, gpu_ms, gpu_known_ms, temp_max from op_requests where id = ${requestId}`;
    const metrics: Metrics = {
      ...fieldMetrics(g, fields), ...await oppMetrics(g, opps, model), fieldSample: g.fieldItems.length, oppSample: g.opp.length, failed: left,
      secPerAsk: r.requests ? Math.round(Number(r.request_ms) / r.requests / 100) / 10 : null,
      gpuAvg: Number(r.gpu_known_ms) ? Math.round((r.gpu_ms / Number(r.gpu_known_ms)) * 10) / 10 : null, tempMax: r.temp_max
    };
    await sql.begin(async tx => {
      await tx`insert into model_trials (request_id, model, taxonomy_id, field_version, prompt_version, gold_version, trial_version, metrics, started_at)
        values (${requestId}, ${model}, ${g.t.id}, ${fieldVersion(g.t)}, ${PROMPT_VERSION}, ${g.version}, ${TRIAL_VERSION}, ${tx.json(metrics as never)}, ${started_at})`;
      await tx`update op_requests set requests = 0, request_ms = 0, gpu_ms = 0, gpu_known_ms = 0, temp_max = null where id = ${requestId}`;
    });
  } catch (e) {
    const load = await m.close();
    if (!counted) await addLoad(sql, requestId, load);
    throw e;
  }
}

/** 여러 밤의 부하를 요청에 더한다. 닫을 때 한 번만 부른다 */
async function addLoad(sql: Sql, requestId: string, s: { requests: number; requestMs: number; gpuAvg: number | null; tempMax: number | null }) {
  if (!s.requests) return;
  await sql`update op_requests set requests = requests + ${s.requests}, request_ms = request_ms + ${Math.round(s.requestMs)}, gpu_ms = gpu_ms + ${s.gpuAvg === null ? 0 : s.gpuAvg * s.requestMs},
    gpu_known_ms = gpu_known_ms + ${s.gpuAvg === null ? 0 : Math.round(s.requestMs)}, temp_max = greatest(temp_max, ${s.tempMax}) where id = ${requestId}`;
}

/** 1단계와 같은 셈(scoreTaxonomy). 답이 없는 글은 빈 답으로 센다 */
function fieldMetrics(g: Gold, answers: Map<number, FieldAnswer>) {
  const nos = g.fieldItems.map(r => r.no);
  const gold = new Map(nos.map(no => [no, g.labels.get(no)!]));
  const run = { start: '', end: '', limit: null, total: nos.length, cached: 0, fresh: 0, failed: 0, notAsked: 0, noTemp: 0, empty: 0, requests: 0, requestMs: 0, gpuAvg: null, tempMax: null, loadLog: null };
  const { metrics: m } = scoreTaxonomy({ t: g.t, prompt: fieldVersion(g.t), listChars: 0, nos, answers, gold, candidates: new Map(), docs: new Map(), run });
  return { corePrecision: m.corePrecision, coreRecall: m.coreRecall, relatedPrecision: m.relatedPrecision };
}

/** 스펙 2와 같은 셈(eval.score). LLM이 답을 못 준 글은 규칙 판정으로 센다 */
async function oppMetrics(g: Gold, outcomes: Map<number, LlmOutcome>, model: string) {
  const replay: Ask = Object.assign(async (row: NoticeRow) => outcomes.get(row.no) ?? ('fail' as const), { model });
  const { judged } = await judgeAll(g.opp.map(rowOf), g.opp.map(x => g.bodies.get(noOf(x.id))!), replay);
  const ms = score(g.opp, judged);
  const of = (name: string): Ratio => { const m = ms.find(x => x.name === name)!; return { num: m.num, den: m.den }; };
  return { oppRight: of('기회 여부'), oppMissed: of('기회 놓침') };
}

/** 요청 하나를 잰다. 지금 모델의 값이 같은 조건으로 없으면 먼저 잰다. 멈추면 까닭을 주고 다음에 이어서 한다 */
export async function runTrial(d: TrialDeps, request: { id: string; model: string }): Promise<'done' | 'night' | 'daily' | 'down'> {
  const { sql } = d;
  const g = await readGold(d);
  const now = await currentModel(sql);
  const measured = async (model: string) => (await sql`select 1 from model_trials where model = ${model} and taxonomy_id = ${g.t.id} and field_version = ${fieldVersion(g.t)}
    and prompt_version = ${PROMPT_VERSION} and gold_version = ${g.version} and trial_version = ${TRIAL_VERSION}`).length > 0;
  const mine = async (model: string) => (await sql`select 1 from model_trials where request_id = ${request.id} and model = ${model}`).length > 0;
  const todo = [...(request.model !== now && !await measured(now) ? [now] : []), ...(await mine(request.model) ? [] : [request.model])];
  const each = g.fieldItems.length + g.opp.length;
  const before = request.model !== now && await mine(now) ? each : 0; // 이 요청에서 이미 잰 지금 모델
  await sql`update op_requests set total = ${before + todo.length * each}, done = ${before}, error = null where id = ${request.id}`;
  try {
    for (const model of todo) {
      await sql`update op_requests set done = ${before + todo.indexOf(model) * each} where id = ${request.id}`;
      try {
        await measure(d, g, request.id, model, model === now, async () => { await sql`update op_requests set done = done + 1 where id = ${request.id}`; });
      } catch (e) {
        // 지금 모델을 재지 못해도(지워짐, 답이 자꾸 틀림) 후보는 잰다. 바꿀 모델이 가장 필요한 때다
        if (e instanceof Pause || model === request.model) throw e;
        await sql`update op_requests set done = ${before + (todo.indexOf(model) + 1) * each}, error = ${`지금 모델은 재지 못했어요(${hideSecrets((e as Error).message)})`},
          requests = 0, request_ms = 0, gpu_ms = 0, gpu_known_ms = 0, temp_max = null where id = ${request.id}`;
      }
    }
    return 'done';
  } catch (e) {
    if (!(e instanceof Pause)) throw e;
    await sql`update op_requests set error = ${e.message} where id = ${request.id}`;
    return e.why;
  }
}
