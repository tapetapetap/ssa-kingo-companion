// 진입점: 목록 → 본문 → 판정 → 중복 정리 → 결과 파일. `node etl/notices/run.ts [기준일]` (Node 24 이상)
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify, hostOf, type Judged, type Kind } from './classify.ts';
import { BoardError, bodyOf, CACHE_DIR, listSince, makeGet, SOURCE, viewUrl, type Get, type NoticeRow } from './cse.ts';
import { deadlineOf, readDates, stripDates } from './deadline.ts';
import { fieldGate, findChosen, loadTaxonomy, TAXONOMY_DIR, TAXONOMY_IDS, type Measured, type Taxonomy } from '../taxonomy/taxonomy.ts';
import { makeEmbed } from './embed.ts';
import { countField, FIELD_CACHE_DIR, fieldPart, makeFieldAsk, newStats, type FieldAnswer, type FieldAsk, type FieldStats } from './fields.ts';
import { fromLlm, LLM_LOW, LLM_ROUTE, makeAsk, type Ask, type Gate, type LlmStats } from './llm.ts';
import { createThrottle, type LoadSummary } from './throttle.ts';

export type Opportunity = {
  id: string; title: string; url: string; postedAt: string; host: string | null; kind: Kind;
  deadline: string | null; rule: string; deadlineRule: string | null;
  /** 스펙 3: 고른 안이 85% 이상일 때만, 답을 받은 기회에만 붙는다(data-model 7) */
  fields?: FieldAnswer; fieldRule?: string;
};
export type ReviewItem = { id: string; title: string; url: string; postedAt: string; why: string };
export type Judgement =
  | ({ verdict: 'opportunity' } & Opportunity)
  | ({ verdict: 'review' } & ReviewItem)
  | { verdict: 'not'; id: string; rule: string };
export type ResultFile = { source: string; collectedAt: string; since: string; taxonomy?: { id: string; prompt: string }; opportunities: Opportunity[]; review: ReviewItem[] };
export type Summary = { fetched: number; opportunity: number; not: number; review: number; merged: number; deadlineBlank: number };

export const OUT_FILE = fileURLToPath(new URL('../out/cse-notices.json', import.meta.url));

/** 글 하나를 판정한다. 본문을 받지 못했으면 제목과 상관없이 확인 필요다(FR-027).
 *  LLM 판정(llm)이 있으면 규칙 판정 대신 쓰고, 마감은 그 종류로 다시 정한다(스펙 2 FR-007).
 *  주최는 LLM이 정한 기회도 제목 규칙 값이다(스펙 2 FR-001, 2026-11-10 결정) */
export function judge(row: NoticeRow, lines: string[] | null, llm?: Judged): Judgement {
  const id = `cse:${row.no}`;
  const base = { id, title: row.title, url: viewUrl(row.no), postedAt: row.postedAt };
  if (!lines) return { verdict: 'review', ...base, why: '본문 못 받음' };
  const c = llm ?? classify(row.title, row.board);
  if (c.verdict === 'not') return { verdict: 'not', id, rule: c.rule };
  if (c.verdict === 'review') return { verdict: 'review', ...base, why: c.why };
  const d = deadlineOf(lines, row.title, row.postedAt, c.kind);
  return { verdict: 'opportunity', ...base, host: hostOf(row.title), kind: c.kind, deadline: d?.date ?? null, rule: c.rule, deadlineRule: d?.rule ?? null };
}

/** 규칙으로 판정하고, 보낼 글(route)은 LLM에 한 번에 하나씩 묻는다. lines[i]는 rows[i]의 본문이고 결과도 rows 순서다.
 *  ask가 없으면 규칙만 쓴다. LLM이 실패하거나 서버에 닿지 못한 글은 규칙 결과다(스펙 2 FR-012·FR-013) */
export async function judgeAll(rows: NoticeRow[], lines: (string[] | null)[], ask?: Ask, route = LLM_ROUTE, low = LLM_LOW): Promise<{ judged: Judgement[]; llm: LlmStats | null }> {
  if (!ask) return { judged: rows.map((r, i) => judge(r, lines[i])), llm: null };
  const llm: LlmStats = { model: ask.model, cached: 0, fresh: 0, failed: 0, skipped: 0 };
  const sent = rows.map((r, i) => lines[i] !== null && (route === 'all' || classify(r.title, r.board).verdict === 'review'));
  const total = sent.filter(Boolean).length;
  const judged: Judgement[] = [];
  let asked = 0;
  for (const [i, r] of rows.entries()) {
    const body = lines[i];
    if (!sent[i] || !body) {
      judged.push(judge(r, body));
      continue;
    }
    const o = await ask(r, body);
    if (o === 'down') llm.skipped++;
    else if (o === 'fail') llm.failed++;
    else if (o.cached) llm.cached++;
    else llm.fresh++;
    judged.push(judge(r, body, typeof o === 'object' ? fromLlm(o.answer, o.model ?? ask.model, low) : undefined));
    if (++asked % 20 === 0 || asked === total) console.error(`LLM ${asked}/${total}`);
  }
  return { judged, llm };
}

const newestFirst = (a: { id: string }, b: { id: string }) => Number(b.id.slice(4)) - Number(a.id.slice(4));

/** 판정을 결과 파일과 요약으로. 날짜 표기만 다르고 마감이 같은 기회(다시 올린 공지)는 최근 글 하나만 남긴다 */
export function buildResult(judged: Judgement[], opts: { since: string; collectedAt: string; fetched: number }): { file: ResultFile; summary: Summary } {
  const all: Opportunity[] = [];
  const review: ReviewItem[] = [];
  let not = 0;
  for (const j of judged) {
    if (j.verdict === 'not') not++;
    else if (j.verdict === 'review') { const { verdict: _, ...r } = j; review.push(r); }
    else { const { verdict: _, ...o } = j; all.push(o); }
  }
  // ponytail: 제목에서 날짜와 빈칸을 뺀 글자 + 마감이 같으면 같은 공지로 본다. 다른 공지가 합쳐지는 일이 정답셋에서 보이면 열쇠를 좁힌다
  const seen = new Set<string>();
  const opportunities = all.sort(newestFirst).filter(o => {
    if (!o.deadline) return true;
    // 날짜를 지운 자리의 빈칸은 표기마다 달라서('채용 (~9/21월…)'·'채용(~9/21(월)…)') 열쇠에서 뺀다
    const key = `${stripDates(o.title).replace(/\s+/g, '')}|${o.deadline}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    file: { source: SOURCE, collectedAt: opts.collectedAt, since: opts.since, opportunities, review: review.sort(newestFirst) },
    summary: {
      fetched: opts.fetched, opportunity: opportunities.length, not, review: review.length,
      merged: all.length - opportunities.length, deadlineBlank: opportunities.filter(o => !o.deadline).length
    }
  };
}

export const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const llmPart = (l: LlmStats) => `LLM 판정 ${l.cached + l.fresh}(보관 ${l.cached} · 새로 ${l.fresh} · 실패 ${l.failed})`;

/** 요약에 붙는 줄(스펙 3 contracts/cli.md). llmNoTemp·fieldNoTemp는 기회 판정 문·분야 판정 문의 noTemp, field는 분야 판정 줄이나 넣지 않은 이유, load는 부하 줄 */
type SummaryExtra = { llmNoTemp?: number; fieldNoTemp?: number; field?: string; load?: string };

/** LLM을 썼으면 끝에 LLM 수를 붙이고, 서버에 닿지 못해 규칙만 쓴 글(K)이 있으면 다음 줄에 알린다(스펙 2 FR-012·FR-016).
 *  K에서는 온도 때문에 묻지 않은 글을 빼고 따로 알린다. 그 수는 보내지 않은 요청 수라 한 글이 두 번 셀 수 있다 */
export function formatSummary(s: Summary, llm?: LlmStats | null, x: SummaryExtra = {}): string {
  const line = `새 글 ${s.fetched} · 기회 ${s.opportunity} · 기회 아님 ${s.not} · 확인 필요 ${s.review} · 합친 중복 ${s.merged} · 마감 빈칸 ${s.deadlineBlank}`;
  const lines = [llm ? `${line} · ${llmPart(llm)}` : line];
  const k = (llm?.skipped ?? 0) - (x.llmNoTemp ?? 0);
  if (llm && k > 0) lines.push(`LLM에 연결하지 못해 ${k}건은 규칙만 썼어요 (${llm.model})`);
  const n = (x.llmNoTemp ?? 0) + (x.fieldNoTemp ?? 0);
  if (n) lines.push(`온도를 읽지 못해 ${n}건은 묻지 않았어요`);
  for (const l of [x.field, x.load]) if (l) lines.push(l);
  return lines.join('\n');
}

/** 기준일 안 글과 그 본문. fetched는 이번에 새로 받아 보관한 본문 수다 */
export async function collect(since: string, get: Get, dir = CACHE_DIR) {
  const rows = await listSince(since, get);
  console.error(`목록 ${rows.length}건 (기준일 ${since})`);
  const bodies = new Map<number, string[] | null>();
  let tried = 0;
  let regionless = 0;
  let fetched = 0;
  const fresh = new Set<number>(); // 이번에 새로 받은 글 번호
  for (const [i, r] of rows.entries()) {
    const b = await bodyOf(r.no, get, dir);
    if (b.fetched || !b.lines) tried++; // 보관함에 없어서 서버에 물은 글
    if (b.fetched && !b.lines) regionless++;
    if (b.fetched && b.lines) {
      fetched++;
      fresh.add(r.no);
    }
    bodies.set(r.no, b.lines);
    if ((i + 1) % 20 === 0 || i + 1 === rows.length) console.error(`본문 ${i + 1}/${rows.length}`);
  }
  // 한 건은 그 글 탓일 수 있지만, 새로 물은 본문이 두 건 이상인데 하나도 못 얻었으면 게시판 모양이나 연결이 문제다(FR-026).
  // 그대로 쓰면 이전 결과가 '본문 못 받음'뿐인 파일로 바뀐다
  // ponytail: 본문 영역이 영영 없는 글은 보관하지 않아 실행마다 다시 묻는다. 그런 글이 기간 안에 두 건 넘게 있으면 새 글이 없는 날 멈춘다. 생기면 보관함에 빈 표시를 남긴다
  // ponytail: 다 받은 뒤에 판단해서 구조가 바뀐 날에는 새 글 수만큼 헛요청이 간다. 90일치(약 150건)라 그대로 둔다
  if (tried >= 2 && fetched === 0) {
    throw new BoardError(regionless
      ? `게시판 구조가 바뀐 것 같아요: 새로 받은 본문 ${regionless}건에서 본문 영역을 못 찾았어요.`
      : `본문을 하나도 받지 못했어요 (${tried}건 모두 실패).`);
  }
  return { rows, bodies, fetched, fresh };
}

/** 새로 받은 글의 판정 수. judged는 rows와 같은 차례다 */
function countNew(rows: NoticeRow[], judged: Judgement[], fresh: Set<number>) {
  const n = { opportunity: 0, not: 0, review: 0 };
  for (const [i, r] of rows.entries()) if (fresh.has(r.no)) n[judged[i].verdict]++;
  return n;
}

/** 반쪽 파일이 남지 않게 .tmp에 다 쓴 뒤 이름을 바꾼다(같은 폴더 안 이름 바꾸기는 한 번에 일어난다) */
export function writeResult(path: string, file: object) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, `${JSON.stringify(file, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
}

/** 달력에 있는 YYYY-MM-DD인가('2026-02-30'은 아니다) */
export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && readDates(s, s)[0] === s;

/** 컴퓨터 날짜 YYYY-MM-DD. toISOString은 UTC라 자정 무렵 하루가 어긋난다 */
export const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 컴퓨터 날짜로 n일 전 */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDay(d);
}

/** gate는 기회 판정 ask를 만든 문(noTemp를 읽는다), field는 분야 판정기와 그 문 또는 넣지 않은 이유, load는 throttle의 stop(요약을 찍을 때 부른다).
 *  없으면 스펙 2와 같다 */
export type RunExtra = { gate?: Gate; field?: { ask: FieldAsk; gate?: Gate } | { reason: string }; load?: () => LoadSummary; json?: boolean };

/** buildResult가 남긴 기회마다 분야를 묻고 data-model 7의 칸을 더한다. 답을 받지 못한 기회(실패·못 물음)는 fields가 없다 */
async function addFields(file: ResultFile, rows: Map<number, NoticeRow>, bodies: Map<number, string[] | null>, ask: FieldAsk) {
  const stats = newStats();
  const opportunities: Opportunity[] = [];
  for (const [i, o] of file.opportunities.entries()) {
    const no = Number(o.id.slice(4));
    const [row, lines] = [rows.get(no), bodies.get(no)];
    const r = row && lines ? await ask(row, lines) : null;
    countField(stats, r);
    opportunities.push(typeof r === 'object' && r !== null ? { ...o, fields: r.answer, fieldRule: `LLM: ${r.model ?? ask.model}` } : o);
    if ((i + 1) % 20 === 0 || i + 1 === file.opportunities.length) console.error(`분야 ${i + 1}/${file.opportunities.length}`);
  }
  const { opportunities: _, review, ...head } = file;
  return { file: { ...head, taxonomy: { id: ask.taxonomyId, prompt: ask.version }, opportunities, review }, stats };
}

/** 종료 코드를 돌려준다: 0 성공, 1 게시판 문제(결과 파일은 그대로), 2 잘못된 인자(contracts/cli.md).
 *  ask와 x는 바깥에서 넣는다. 실제 LLM과 부하 제한은 아래 import.meta.main 줄에서만 만들어 검사가 Ollama·센서를 부르지 않는다 */
export async function main(args: string[], get: Get, out = OUT_FILE, dir = CACHE_DIR, ask?: Ask, x: RunExtra = {}): Promise<number> {
  const arg = args[0];
  if (args.length > 1 || (arg !== undefined && !isDay(arg))) {
    console.error(`기준일은 YYYY-MM-DD 꼴로 주세요: ${args.join(' ')}`);
    return 2;
  }
  const since = arg ?? daysAgo(90);
  try {
    const { rows, bodies, fetched, fresh } = await collect(since, get, dir);
    const { judged, llm } = await judgeAll(rows, rows.map(r => bodies.get(r.no) ?? null), ask);
    const built = buildResult(judged, { since, collectedAt: new Date().toISOString(), fetched });
    writeResult(out, built.file); // 분야 단계가 던져도 기회 결과는 남게 먼저 쓴다
    const f = x.field && 'ask' in x.field ? x.field : null;
    let field = x.field && 'reason' in x.field ? x.field.reason : undefined;
    let fieldStats: FieldStats | null = null;
    if (f) {
      try {
        const added = await addFields(built.file, new Map(rows.map(r => [r.no, r])), bodies, f.ask);
        writeResult(out, added.file);
        fieldStats = added.stats;
        field = fieldPart(added.stats);
      } catch (e) {
        field = `분야 판정을 마치지 못해 분야를 넣지 않았어요 (${messageOf(e)})`;
      }
    }
    console.log(formatSummary(built.summary, llm, { llmNoTemp: x.gate?.noTemp, fieldNoTemp: f?.gate?.noTemp, field, load: x.load?.().line }));
    // 매일 작업이 읽는 숫자(3단계 research R10). 글이나 본문은 없다
    if (x.json) console.log(`요약JSON: ${JSON.stringify({ ...built.summary, new: countNew(rows, judged, fresh), llm, field: fieldStats, fieldReason: fieldStats ? null : field ?? null })}`);
    return 0;
  } catch (e) {
    if (!(e instanceof BoardError)) throw e;
    console.error(`${e.message} 이전 결과는 그대로예요.`);
    return 1;
  }
}

/** 고른 안이 있으면 분야 판정기를 만들고 결과 파일에 넣어도 되는지 본다(스펙 3 research R12).
 *  목록 파일을 읽지 못하면 이유만 돌려줘 공지 수집은 그대로 돌고, 고른 안이 둘 이상일 때만 던진다(contracts/cli.md) */
export function chosenField(t: { gate: () => Gate }, dir = TAXONOMY_DIR, x: { older?: string[]; measured?: Measured | null } = {}): RunExtra['field'] {
  let lists: Taxonomy[];
  try {
    lists = TAXONOMY_IDS.map(id => loadTaxonomy(id, dir));
  } catch (e) {
    return { reason: `분야 목록을 읽지 못해 분야를 넣지 않았어요 (${messageOf(e)})` };
  }
  const chosen = findChosen(lists);
  if (!chosen) return undefined;
  const gate = t.gate(); // 같은 throttle의 새 문: 분야 판정의 noTemp를 따로 센다
  const ask = makeFieldAsk({ taxonomy: chosen, embed: makeEmbed({ gate }), gate, older: (x.older ?? []).map(model => ({ dir: FIELD_CACHE_DIR, model })) });
  const ok = fieldGate(chosen, ask.version, ask.model, x.measured);
  return 'ok' in ok ? { ask, gate } : { reason: ok.reason };
}

/** 매일 작업이 넘긴 앞 모델들과 지금 모델을 잰 값(3단계 research R14). 손으로 돌리면 둘 다 없어 지금과 같다. 꼴이 틀리면 없는 것으로 본다 */
export function modelEnv(env: Record<string, string | undefined>): { older: string[]; measured: Measured | null } {
  let m: Partial<Measured> = {};
  try {
    m = JSON.parse(env.KINGO_FIELD_MEASURED ?? 'null') ?? {};
  } catch { /* 없는 것으로 본다 */ }
  const ok = typeof m.prompt === 'string' && typeof m.model === 'string' && Number.isInteger(m.num) && Number.isInteger(m.den);
  return { older: (env.KINGO_LLM_OLDER ?? '').split(',').map(s => s.trim()).filter(Boolean), measured: ok ? m as Measured : null };
}

// 경로에 심볼릭 링크가 있어도 진입점을 알아본다(process.argv[1]과 import.meta.url 비교는 링크를 다르게 풀어 조용히 아무것도 안 한다).
// 부하 제한은 실행 하나에 하나이고, main이 어떻게 끝나든 멈춘다(스펙 3 research R6)
if (import.meta.main) {
  const t = createThrottle();
  try {
    const gate = t.gate();
    const swap = modelEnv(process.env);
    let field: RunExtra['field'] | null = null;
    try {
      field = chosenField(t, TAXONOMY_DIR, swap);
    } catch (e) {
      console.error(messageOf(e));
    }
    process.exitCode = field === null ? 1 : await main(process.argv.slice(2), makeGet(), OUT_FILE, CACHE_DIR, makeAsk({ gate, older: swap.older.map(model => ({ dir: LLM_CACHE_DIR, model })) }), { gate, field, load: t.stop, json: process.env.KINGO_RUN_JSON === '1' });
  } finally {
    t.stop();
  }
}
