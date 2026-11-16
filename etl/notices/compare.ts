// 분야 목록 3안 비교 명령(contracts/cli.md). `node etl/notices/compare.ts <check | sample | judge | label-input | gold | score | choose> …`
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COURSE_ROWS, findChosen, isTaxonomyId, listChars, readList, saveTaxonomy, TAXONOMY_DIR, TAXONOMY_IDS, type Taxonomy } from '../taxonomy/taxonomy.ts';
import { CACHE_DIR } from './cse.ts';
import { EMBED_CACHE_DIR, EMBED_K, EMBED_MODEL, makeEmbed, readFieldVectors, readNoticeVector, topCandidates } from './embed.ts';
import { pad } from './eval.ts';
import { countField, FIELD_CACHE_DIR, fieldFolder, fieldPart, fieldVersion, makeFieldAsk, newStats, readFieldAnswer, type FieldAnswer, type FieldAsk } from './fields.ts';
import { cachedBody, devOpportunities, gold, labelInput, noOf, readGoldFile, readSample, rowOf, sample, type GoldLabel } from './gold.ts';
import { DEFAULT_MODEL, modelDir, type Gate } from './llm.ts';
import { passes, pct, pickRun, ratio, scoreTaxonomy, type Ratio, type RunLine, type TaxonomyScore } from './score.ts';
import { createThrottle, type LoadSummary } from './throttle.ts';

/** 시험에서만 바꾼다(모두 선택). 폴더가 없으면 저장소 기본 자리다. fieldAsk·gate·load는 진입 줄이 throttle 하나로 만든다 */
export type CompareDeps = {
  taxonomyDir?: string; goldDir?: string; outFile?: string; llmDir?: string; embedDir?: string; cacheDir?: string; repoRoot?: string;
  fieldAsk?: (t: Taxonomy) => FieldAsk; gate?: Gate; load?: () => LoadSummary; now?: () => Date; model?: string;
};
type Ctx = Required<Omit<CompareDeps, 'fieldAsk' | 'gate' | 'load'>> & Pick<CompareDeps, 'fieldAsk' | 'gate' | 'load'>;

export const COMPARE_FILE = fileURLToPath(new URL('../out/fields-compare.json', import.meta.url));
const ctxOf = (d: CompareDeps): Ctx => ({
  taxonomyDir: TAXONOMY_DIR, goldDir: fileURLToPath(new URL('../gold', import.meta.url)), outFile: COMPARE_FILE, llmDir: FIELD_CACHE_DIR,
  embedDir: EMBED_CACHE_DIR, cacheDir: CACHE_DIR, repoRoot: fileURLToPath(new URL('../..', import.meta.url)),
  now: () => new Date(), model: process.env.KINGO_LLM_MODEL || DEFAULT_MODEL, ...d
});
const NO_LOAD: LoadSummary = { requests: 0, requestMs: 0, gpuAvg: null, tempMax: null, logFile: null, line: '' };

const USAGE = '쓰는 법: node etl/notices/compare.ts check | sample | judge <안> [--limit N] | label-input <안> <폴더> | gold <안> <A.json> <B.json> [<C.json>] | score | choose <안>';
export const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 세 목록을 검사하고 chosen이 많아야 하나인지 본다 */
function check(taxonomyDir: string): number {
  const lists: Taxonomy[] = [];
  const bad: string[] = [];
  for (const id of TAXONOMY_IDS) {
    try {
      lists.push(readList(id, taxonomyDir));
    } catch (e) {
      bad.push(messageOf(e));
    }
  }
  try {
    findChosen(lists);
  } catch (e) {
    bad.push(messageOf(e));
  }
  if (bad.length) {
    console.error(bad.join('\n'));
    return 1;
  }
  for (const t of lists) {
    const rows = COURSE_ROWS.filter(r => t.courseMap[r]?.length).length;
    console.log(`${t.id}: 묶음 ${t.groups.length} · 분야 ${t.fields.length} · 교과 지도 ${rows}/12 · 목록 ${listChars(t).toLocaleString('en-US')}자`);
  }
  return 0;
}

/** 정답셋의 기회 412건(--limit이면 앞 N건)을 본문 보관본으로 판정하고 실행 기록을 한 줄 남긴다(research R16) */
async function judge(t: Taxonomy, limit: number | null, c: Ctx): Promise<number> {
  const ask = c.fieldAsk?.(t);
  if (!ask) throw new Error('judge에는 판정기(fieldAsk)가 있어야 해요');
  const start = c.now();
  const opps = devOpportunities(c.goldDir);
  const picked = limit === null ? opps : opps.slice(0, limit);
  const s = newStats();
  for (const [i, g] of picked.entries()) {
    const row = rowOf(g);
    const lines = await cachedBody(row.no, c.cacheDir);
    countField(s, lines ? await ask(row, lines) : null); // 보관본이 없는 글은 묻지 않고 못 물음이다
    if ((i + 1) % 20 === 0 || i + 1 === picked.length) console.error(`${t.id} 분야 ${i + 1}/${picked.length}`);
  }
  s.noTemp = c.gate?.noTemp ?? 0;
  const load = c.load?.() ?? NO_LOAD;
  const end = c.now();
  const folder = join(c.llmDir, modelDir(ask.model), `${ask.taxonomyId}-${ask.version}`);
  mkdirSync(folder, { recursive: true });
  const run = { start: start.toISOString(), end: end.toISOString(), limit, total: picked.length, ...s, requests: load.requests, requestMs: load.requestMs, gpuAvg: load.gpuAvg, tempMax: load.tempMax, loadLog: load.logFile };
  appendFileSync(join(folder, 'runs.jsonl'), `${JSON.stringify(run)}\n`);
  const asked = s.fresh + s.failed;
  const sec = (end.getTime() - start.getTime()) / 1000;
  const out = [`${t.id} ${fieldPart(s)} · ${asked ? `글당 ${(load.requestMs / asked / 1000).toFixed(1)}초` : '글당 -'} · ${sec < 60 ? `${Math.round(sec)}초` : `${Math.round(sec / 60)}분`}`];
  if (s.noTemp) out.push(`온도를 읽지 못해 ${s.noTemp}건은 묻지 않았어요`);
  if (load.line) out.push(load.line);
  console.log(out.join('\n'));
  return 0;
}

const isRun = (o: unknown): o is RunLine => {
  if (typeof o !== 'object' || o === null) return false;
  const r = o as Record<string, unknown>;
  return typeof r.start === 'string' && typeof r.end === 'string' && (r.limit === null || typeof r.limit === 'number')
    && ['cached', 'fresh', 'failed', 'requests', 'requestMs'].every(k => typeof r[k] === 'number');
};
const readRuns = (file: string): RunLine[] => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : []).flatMap(l => {
  try {
    const o: unknown = JSON.parse(l);
    return isRun(o) ? [o] : [];
  } catch {
    return [];
  }
});

const ROWS: [string, (e: TaxonomyScore) => string][] = [
  ['핵심 정밀도', e => pct(e.metrics.corePrecision)], ['핵심 재현율', e => pct(e.metrics.coreRecall)],
  ['전체 재현율', e => pct(e.metrics.totalRecall)], ['관련 정밀도', e => pct(e.metrics.relatedPrecision)],
  ['후보 적중률(핵심)', e => pct(e.metrics.candidateCore)], ['후보 적중률(전체)', e => pct(e.metrics.candidateAll)],
  ['후보 비율', e => pct(ratio(Math.min(EMBED_K, e.fields), e.fields))], // 분야가 적은 안일수록 적중률이 높게 나와 함께 본다(research R10)
  ['라벨러 일치(같음)', e => pct(e.metrics.agreeExact)], ['라벨러 일치(겹침)', e => pct(e.metrics.agreeOverlap)],
  ['핵심 빈칸', e => pct(e.metrics.blankCore)], ['모두 빈칸', e => pct(e.metrics.blankAll)], ['상위 3 쏠림', e => pct(e.metrics.top3Share)],
  ['안 쓰인 분야', e => pct(e.metrics.unusedShare)], ['실패율', e => pct(e.metrics.failRate)],
  ['글당 시간', e => (e.metrics.secPerAsk === null ? '-' : `${e.metrics.secPerAsk}초`)], ['전체 시간', e => `${e.metrics.wallMinutes}분`],
  ['교과 지도 연결', e => `${e.metrics.courseMapRows}/12`]
];

/** 세 안의 보관 답·벡터·실행 기록·정답으로 지표를 계산한다. 요청은 보내지 않는다. 무엇이 없으면 모두 내고 1이다 */
function score(c: Ctx): number {
  const lists = TAXONOMY_IDS.map(id => listOf(id, c));
  const nos = devOpportunities(c.goldDir).map(g => noOf(g.id));
  const items = readSample(c.goldDir);
  const docs = new Map(items.map(x => [x.no, { link: x.link, title: x.title }]));
  const problems: string[] = [];
  const entries: TaxonomyScore[] = [];
  for (const t of lists) {
    let labels = new Map<number, GoldLabel>();
    try {
      labels = readGoldFile(t, c.goldDir);
    } catch (e) {
      problems.push(messageOf(e));
    }
    const open = [...labels.values()].filter(l => l.split === 'O').length;
    if (open) problems.push(`${t.id}: 갈림 O가 ${open}건 남았어요(셋째 라벨러의 답으로 gold를 다시 돌려요)`);
    const gold = new Map(items.flatMap(x => { const l = labels.get(x.no); return l ? [[x.no, l] as const] : []; }));
    if (labels.size && gold.size < items.length) problems.push(`${t.id}: 정답 파일에 표본 글 ${items.length - gold.size}건이 없어요`);
    const run = pickRun(readRuns(join(fieldFolder(t, c.model, c.llmDir), 'runs.jsonl')));
    if (!run) problems.push(`${t.id}: 전체 실행 기록이 없어요(judge ${t.id}를 --limit 없이 돌려요)`);
    const all = t.fields.length <= EMBED_K; // 30개 이하면 모두 후보라 벡터를 읽지 않는다
    const fv = all ? null : readFieldVectors(t, EMBED_MODEL, c.embedDir);
    if (!all && !fv) problems.push(`${t.id}: 분야 벡터 파일이 없어요(벡터 보관만 지웠다면 그 안의 답 폴더도 지우고 judge를 다시 돌려요)`);
    if (problems.length || !run) continue;
    const candidates = new Map(items.map(x => {
      const v = fv ? readNoticeVector(EMBED_MODEL, x.no, c.embedDir) : null;
      return [x.no, all ? t.fields.map(f => f.id) : fv && v ? topCandidates(fv, v) : []]; // 공지 벡터가 없는 글은 후보가 없는 것으로 센다
    }));
    const answers = new Map(nos.flatMap(no => { const a = readFieldAnswer(t, c.model, no, c.llmDir); return a ? [[no, a] as [number, FieldAnswer]] : []; }));
    entries.push(scoreTaxonomy({ t, prompt: fieldVersion(t), listChars: listChars(t), nos, answers, gold, candidates, docs, run }));
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    return 1;
  }
  const out = { at: c.now().toISOString(), model: c.model, embed: { model: EMBED_MODEL, k: EMBED_K }, total: nos.length, sample: items.length, taxonomies: entries };
  mkdirSync(dirname(c.outFile), { recursive: true });
  writeFileSync(`${c.outFile}.tmp`, `${JSON.stringify(out, null, 2)}\n`);
  renameSync(`${c.outFile}.tmp`, c.outFile);
  const table = [['지표', ...entries.map(e => e.id)], ...ROWS.map(([name, value]) => [name, ...entries.map(value)])];
  console.log(table.map(r => r.map((cell, i) => pad(cell, i === 0 ? 20 : 22)).join('').trimEnd()).join('\n'));
  return 0;
}

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isRatio = (v: unknown): v is Ratio => typeof v === 'object' && v !== null && Number.isInteger((v as Ratio).num) && Number.isInteger((v as Ratio).den);

/** 사람이 보고서를 보고 고른 안을 목록 파일에 적는다. 정밀도와 상관없이 적고, 85% 기준은 출력만 한다(research R12) */
function choose(t: Taxonomy, c: Ctx): number {
  const lists = TAXONOMY_IDS.map(id => listOf(id, c)); // 다른 안의 chosen을 지우려면 셋 다 읽어야 한다
  if (!existsSync(c.outFile)) throw new Error(`비교 결과 파일이 없어요: ${c.outFile} (score를 먼저 돌려요)`);
  // score가 쓴 파일이라 꼴은 그대로 믿고, 고르기에 쓰는 칸만 확인한다
  const r = JSON.parse(readFileSync(c.outFile, 'utf8')) as { model?: string; taxonomies?: { id?: string; prompt?: string; metrics?: { corePrecision?: unknown } }[] };
  const e = r.taxonomies?.find(x => x.id === t.id);
  const cp = e?.metrics?.corePrecision;
  if (!e || typeof e.prompt !== 'string' || !isRatio(cp)) throw new Error(`비교 결과에 ${t.id}의 지표가 없어요 (${c.outFile})`);
  const version = fieldVersion(t);
  if (e.prompt !== version) throw new Error(`${t.id}을 잰 뒤 판정 판이 바뀌었어요(${e.prompt} → ${version}). judge와 score를 다시 돌려요`);
  if (r.model !== c.model) throw new Error(`${t.id}은 ${String(r.model)}로 쟀는데 지금 모델은 ${c.model}이에요`);
  if (cp.den === 0) throw new Error(`${t.id}의 핵심 정밀도 분모가 0이라 고를 수 없어요`);
  for (const x of lists) {
    if (x.id === t.id) saveTaxonomy({ ...x, chosen: { date: localDay(c.now()), corePrecision: { num: cp.num, den: cp.den }, prompt: version, model: c.model } }, c.taxonomyDir);
    else if (x.chosen) saveTaxonomy({ ...x, chosen: null }, c.taxonomyDir);
  }
  console.log(`${t.id} 고름 · 핵심 정밀도 ${pct(cp)} · ${passes(cp) ? '85% 기준 통과' : '85% 기준 미달: 결과 파일에 분야를 넣지 않아요'}`);
  return 0;
}

/** 안 id를 확인하고 목록을 읽어 검사한다. 위반은 던진다(main이 1로 끝낸다) */
function listOf(id: string, c: Ctx): Taxonomy {
  if (!isTaxonomyId(id)) throw new Error(`없는 안이에요: ${id} (${TAXONOMY_IDS.join(', ')})`);
  return readList(id, c.taxonomyDir);
}

/** 종료 코드: 0 성공, 1 실행 실패·거절, 2 쓰는 법 틀림 */
export async function main(args: string[], deps: CompareDeps = {}): Promise<number> {
  const c = ctxOf(deps);
  const [cmd, ...rest] = args;
  const pick = (): Promise<number> | number | null => {
    if (cmd === 'check' && rest.length === 0) return check(c.taxonomyDir);
    const limited = rest.length === 3 && rest[1] === '--limit' && /^[1-9]\d*$/.test(rest[2]);
    if (cmd === 'judge' && (rest.length === 1 || limited)) return judge(listOf(rest[0], c), limited ? Number(rest[2]) : null, c);
    if (cmd === 'sample' && rest.length === 0) return sample(c.goldDir);
    if (cmd === 'label-input' && rest.length === 2) return labelInput(listOf(rest[0], c), rest[1], c);
    if (cmd === 'gold' && (rest.length === 3 || rest.length === 4)) return gold(listOf(rest[0], c), rest[1], rest[2], rest[3], c);
    if (cmd === 'score' && rest.length === 0) return score(c);
    if (cmd === 'choose' && rest.length === 1) return choose(listOf(rest[0], c), c);
    return null;
  };
  try {
    const run = pick();
    if (run === null) {
      console.error(USAGE);
      return 2;
    }
    return await run;
  } catch (e) {
    console.error(messageOf(e));
    return 1;
  }
}

// 경로에 심볼릭 링크가 있어도 진입점을 알아본다(run.ts와 같은 이유). 실행 하나에 throttle 하나, 문 하나다(research R6)
if (import.meta.main) {
  const t = createThrottle();
  try {
    const gate = t.gate();
    const embed = makeEmbed({ gate });
    process.exitCode = await main(process.argv.slice(2), { fieldAsk: tx => makeFieldAsk({ taxonomy: tx, embed, gate }), gate, load: t.stop });
  } finally {
    t.stop();
  }
}
