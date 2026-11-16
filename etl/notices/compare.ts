// 분야 목록 3안 비교 명령(contracts/cli.md). `node etl/notices/compare.ts <check | sample | judge | label-input | gold | score | choose> …`
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COURSE_ROWS, findChosen, isTaxonomyId, listChars, readList, TAXONOMY_DIR, TAXONOMY_IDS, type Taxonomy } from '../taxonomy/taxonomy.ts';
import { CACHE_DIR } from './cse.ts';
import { EMBED_CACHE_DIR, makeEmbed } from './embed.ts';
import { countField, FIELD_CACHE_DIR, fieldPart, makeFieldAsk, newStats, type FieldAsk } from './fields.ts';
import { cachedBody, devOpportunities, rowOf } from './gold.ts';
import { DEFAULT_MODEL, modelDir, type Gate } from './llm.ts';
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
