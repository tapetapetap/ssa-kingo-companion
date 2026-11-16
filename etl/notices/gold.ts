// 표본·라벨러 입력·정답(sample · label-input · gold, contracts/cli.md, data-model 4·5). compare.ts가 하위 명령으로 넘겨 부른다.
// 본문이 든 라벨러 입력·셋째 입력은 저장소 밖에만 쓰고, 저장소의 표본·정답 파일에는 본문 문장을 넣지 않는다(FR-024)
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import type { Taxonomy } from '../taxonomy/taxonomy.ts';
import { KIND_LABEL } from './classify.ts';
import { bodyOf, viewUrl, type NoticeRow } from './cse.ts';
import { decodeCsv, parseGold, readCsv, sampleBySha1, writeCsv, type GoldRow } from './eval.ts';
import { strings, type FieldAnswer } from './fields.ts';
import { clip } from './llm.ts';
import { sameSet } from './score.ts';

export const DEV_GOLD = 'dev-501.csv';
export const SAMPLE_SIZE = 120;
const BATCH = 40;
const SAMPLE_HEAD = ['링크', '게시판', '제목', '게시일', '종류'];
const GOLD_HEAD = ['링크', '제목', 'A 핵심', 'A 관련', 'B 핵심', 'B 관련', '최종 핵심', '최종 관련', '갈림', '메모'];
type GoldCtx = { goldDir: string; cacheDir: string; repoRoot: string };

/** 개발용 정답셋의 기회(스펙 2에서 기회로 라벨한 412건). 판정·표본·지표가 모두 정답셋 순서로 쓴다 */
export function devOpportunities(goldDir: string): GoldRow[] {
  const file = join(goldDir, DEV_GOLD);
  if (!existsSync(file)) throw new Error(`정답셋 파일이 없어요: ${file}`);
  const { gold, errors } = parseGold(readCsv(decodeCsv(readFileSync(file))));
  if (errors.length) throw new Error([`정답셋을 읽지 못했어요 (${errors.length}건):`, ...errors.map(e => `  ${e}`)].join('\n'));
  return gold.filter(g => g.opportunity);
}

export const noOf = (id: string) => Number(id.slice(4));
export const rowOf = (g: Pick<GoldRow, 'id' | 'title' | 'board' | 'postedAt'>): NoticeRow =>
  ({ no: noOf(g.id), title: g.title, board: g.board, postedAt: g.postedAt, pinned: false });
const noFromLink = (link: string) => {
  const m = /[?&]articleNo=(\d+)$/.exec(link);
  if (!m) throw new Error(`글 링크 꼴이 아니에요: ${link}`);
  return Number(m[1]);
};

/** 본문 보관본만 읽는다. 학교 서버는 부르지 않는다(spec FR-027). 없으면 null */
export const cachedBody = async (no: number, cacheDir: string) =>
  (await bodyOf(no, async () => { throw new Error('보관본만 읽어요'); }, cacheDir)).lines;

/** 심볼릭 링크를 푼 경로가 저장소 뿌리 아래인가. 아직 없는 폴더는 있는 조상까지 풀고 나머지를 잇는다 */
export function insideRepo(path: string, root: string): boolean {
  const real = (p: string): string => {
    try {
      return realpathSync(p);
    } catch {
      return dirname(p) === p ? p : join(real(dirname(p)), basename(p));
    }
  };
  const [r, base] = [real(resolve(path)), real(resolve(root))];
  return r === base || r.startsWith(base + sep);
}
const refuseRepo = (dir: string) => {
  console.error(`본문이 들어가서 저장소 안 폴더에는 쓰지 않아요: ${dir}`);
  return 1;
};

/** 몫이 1 미만인 종류에 먼저 1건씩 주고, 남은 자리를 나머지 종류에 큰 나머지 방식으로 나눈다. 같은 나머지는 이름 순서(research R9).
 *  보통의 큰 나머지 방식은 봉사(1건)가 0건이 되어 '종류마다 1건 이상'을 어긴다 */
export function allocate(counts: Map<string, number>, n: number): Map<string, number> {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const small = new Set([...counts].filter(([, c]) => c * n < total).map(([k]) => k));
  const rest = [...counts].filter(([k]) => !small.has(k));
  const seats = n - small.size;
  const restTotal = rest.reduce((a, [, c]) => a + c, 0);
  const share = new Map(rest.map(([k, c]) => [k, Math.floor((seats * c) / restTotal)]));
  let left = seats - [...share.values()].reduce((a, b) => a + b, 0);
  const byRemainder = [...rest].sort(([ka, ca], [kb, cb]) => ((seats * cb) % restTotal) - ((seats * ca) % restTotal) || (ka < kb ? -1 : 1));
  for (const [k] of byRemainder) if (left-- > 0) share.set(k, (share.get(k) ?? 0) + 1);
  return new Map([...counts.keys()].map(k => [k, small.has(k) ? 1 : share.get(k) ?? 0]));
}

/** 기회 412건에서 종류 비율대로 120건. 줄 순서는 종류(많은 순, 같으면 이름 순), 종류 안에서는 sampleBySha1 순서다 */
export function sample(goldDir: string): number {
  const byKind = new Map<string, GoldRow[]>();
  for (const g of devOpportunities(goldDir)) {
    const k = g.kind ? KIND_LABEL[g.kind] : '';
    byKind.set(k, [...(byKind.get(k) ?? []), g]);
  }
  const kinds = [...byKind].sort(([ka, a], [kb, b]) => b.length - a.length || (ka < kb ? -1 : 1));
  const alloc = allocate(new Map(kinds.map(([k, list]) => [k, list.length])), SAMPLE_SIZE);
  const rows = kinds.flatMap(([k, list]) => {
    const byId = new Map(list.map(g => [g.id, g]));
    return sampleBySha1(list.map(g => g.id), alloc.get(k) ?? 0).flatMap(id => {
      const g = byId.get(id);
      return g ? [[viewUrl(noOf(g.id)), g.board, g.title, g.postedAt, k]] : [];
    });
  });
  mkdirSync(join(goldDir, 'fields'), { recursive: true });
  writeFileSync(join(goldDir, 'fields', 'sample.csv'), writeCsv([SAMPLE_HEAD, ...rows]));
  console.log(`표본 ${rows.length}건: ${[...alloc].map(([k, n]) => `${k} ${n}`).join(' · ')}`);
  return 0;
}

export type SampleItem = { no: number; link: string; board: string; title: string; postedAt: string; kind: string };
export function readSample(goldDir: string): SampleItem[] {
  const file = join(goldDir, 'fields', 'sample.csv');
  if (!existsSync(file)) throw new Error(`표본 파일이 없어요: ${file} (compare.ts sample을 먼저 돌려요)`);
  const [head = [], ...rows] = readCsv(decodeCsv(readFileSync(file)));
  if (head.join() !== SAMPLE_HEAD.join()) throw new Error(`표본 파일 머리줄이 달라요: ${file}`);
  return rows.filter(r => r.some(Boolean)).map(([link, board, title, postedAt, kind]) => ({ no: noFromLink(link), link, board, title, postedAt, kind }));
}

/** 표본 120건을 sample.csv 순서로 40건씩 <dir>/<안 id>-<묶음>.jsonl에 쓴다. body는 LLM과 같은 clip 결과다 */
export async function labelInput(t: Taxonomy, dir: string, c: GoldCtx): Promise<number> {
  if (insideRepo(dir, c.repoRoot)) return refuseRepo(dir);
  const items = readSample(c.goldDir);
  const bodies: (string[] | null)[] = [];
  for (const x of items) bodies.push(await cachedBody(x.no, c.cacheDir));
  const missing = items.filter((_, i) => !bodies[i]).map(x => x.no);
  // 라벨이 네트워크 상태에 따라 달라지지 않게 보관본이 하나라도 없으면 쓰지 않는다(eval.ts와 같은 이유)
  if (missing.length) {
    console.error(`본문 보관본이 없는 표본 글이 있어 쓰지 않았어요: ${missing.join(', ')}`);
    return 1;
  }
  mkdirSync(dir, { recursive: true });
  const lines = items.map((x, i) => JSON.stringify({ no: x.no, link: x.link, board: x.board, title: x.title, body: clip(bodies[i] ?? []) }));
  const files: string[] = [];
  for (let i = 0; i < lines.length; i += BATCH) {
    files.push(join(dir, `${t.id}-${i / BATCH + 1}.jsonl`));
    writeFileSync(files[files.length - 1], `${lines.slice(i, i + BATCH).join('\n')}\n`);
  }
  console.log(`라벨러 입력 ${items.length}건: ${files.join(', ')}`);
  return 0;
}

type Label = FieldAnswer & { no: number; note: string };
const isLabel = (v: unknown): v is Label => {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return Number.isInteger(r.no) && !!strings(r.core) && !!strings(r.related) && (r.note === undefined || typeof r.note === 'string');
};
/** 라벨러 출력 [{ no, core, related, note }]. 꼴이 틀리면 이유 글자를 돌려준다 */
function readLabels(name: string, file: string): Label[] | string {
  let o: unknown;
  try {
    o = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return `${name}: JSON 파일을 읽지 못했어요 (${file})`;
  }
  if (!Array.isArray(o) || !o.every(isLabel)) return `${name}: 라벨 배열이 아니에요 ([{ no, core, related, note }])`;
  return o.map(l => ({ ...l, note: l.note ?? '' }));
}

/** research R9의 출력 검사. 위반마다 글 번호와 이유 */
function checkLabels(name: string, labels: Label[], expected: number[], t: Taxonomy, outside: string): string[] {
  const bad: string[] = [];
  const say = (no: number, why: string) => { bad.push(`${name} ${no}: ${why}`); };
  const [want, known, seen] = [new Set(expected), new Set(t.fields.map(f => f.id)), new Set<number>()];
  for (const l of labels) {
    if (!want.has(l.no)) say(l.no, outside);
    if (seen.has(l.no)) say(l.no, '두 번 나와요');
    seen.add(l.no);
    for (const [cell, ids, max] of [['핵심', l.core, 2], ['관련', l.related, 5]] as const) {
      if (new Set(ids).size !== ids.length) say(l.no, `${cell}에 같은 id가 두 번 있어요`);
      if (ids.length > max) say(l.no, `${cell}이 ${ids.length}개예요(${max}개까지)`);
    }
    const both = l.core.filter(id => l.related.includes(id));
    if (both.length) say(l.no, `핵심과 관련에 함께 있어요: ${both.join(', ')}`);
    const unknown = [...l.core, ...l.related].filter(id => !known.has(id));
    if (unknown.length) say(l.no, `목록에 없는 id예요: ${unknown.join(', ')}`);
  }
  for (const no of expected) if (!seen.has(no)) say(no, '빠졌어요');
  return bad;
}

const cell = (ids: string[]) => (ids.length ? ids.join('|') : '-');

/** A·B를 검사해 정답 파일을 쓴다. C가 없으면 갈린 글은 갈림 O·최종 빈칸이고 셋째 입력을 A.json 옆에 쓴다. C가 있으면 최종을 채운다 */
export async function gold(t: Taxonomy, aFile: string, bFile: string, cFile: string | undefined, c: GoldCtx): Promise<number> {
  const dir = dirname(resolve(aFile));
  if (insideRepo(dir, c.repoRoot)) return refuseRepo(dir);
  const items = readSample(c.goldDir);
  const nos = items.map(x => x.no);
  const [A, B] = [readLabels('A', aFile), readLabels('B', bFile)];
  if (typeof A === 'string' || typeof B === 'string') {
    console.error([A, B].filter(x => typeof x === 'string').join('\n'));
    return 1;
  }
  const bad = [...checkLabels('A', A, nos, t, '표본에 없는 글이에요'), ...checkLabels('B', B, nos, t, '표본에 없는 글이에요')];
  if (bad.length) {
    console.error(bad.join('\n'));
    return 1;
  }
  const [am, bm] = [new Map(A.map(l => [l.no, l])), new Map(B.map(l => [l.no, l]))];
  const split = nos.filter(no => {
    const [a, b] = [am.get(no), bm.get(no)];
    return !a || !b || !sameSet(a.core, b.core) || !sameSet(a.related, b.related);
  });
  let C: Map<number, Label> | null = null;
  if (cFile) {
    const Cl = readLabels('C', cFile);
    const badC = typeof Cl === 'string' ? [Cl] : checkLabels('C', Cl, split, t, '갈린 글이 아니에요');
    if (typeof Cl === 'string' || badC.length) {
      console.error(badC.join('\n'));
      return 1;
    }
    C = new Map(Cl.map(l => [l.no, l]));
  } else {
    const pick = (l: Label | undefined) => ({ core: l?.core ?? [], related: l?.related ?? [], note: l?.note ?? '' });
    const lines: string[] = [];
    const missing: number[] = [];
    for (const x of items.filter(i => split.includes(i.no))) {
      const body = await cachedBody(x.no, c.cacheDir);
      if (body) lines.push(JSON.stringify({ no: x.no, link: x.link, board: x.board, title: x.title, body: clip(body), a: pick(am.get(x.no)), b: pick(bm.get(x.no)) }));
      else missing.push(x.no);
    }
    if (missing.length) {
      console.error(`셋째 입력에 넣을 본문 보관본이 없어 쓰지 않았어요: ${missing.join(', ')}`);
      return 1;
    }
    writeFileSync(join(dir, `${t.id}-split.jsonl`), lines.map(l => `${l}\n`).join(''));
  }
  const rows = items.map(x => {
    const [a, b] = [am.get(x.no), bm.get(x.no)];
    const isSplit = split.includes(x.no);
    const fin = isSplit ? C?.get(x.no) : a;
    return [x.link, x.title, cell(a?.core ?? []), cell(a?.related ?? []), cell(b?.core ?? []), cell(b?.related ?? []),
      fin ? cell(fin.core) : '', fin ? cell(fin.related) : '', isSplit ? (C ? 'C' : 'O') : 'X', isSplit ? fin?.note ?? '' : ''];
  });
  mkdirSync(join(c.goldDir, 'fields'), { recursive: true });
  writeFileSync(join(c.goldDir, 'fields', `${t.id}.csv`), writeCsv([GOLD_HEAD, ...rows]));
  console.log(C ? `갈림 ${split.length}건 · 셋째가 정함` : `갈림 ${split.length}건`);
  return 0;
}

/** 정답 한 줄. final이 null이면 아직 안 정함(갈림 O)이다 */
export type GoldLabel = { a: FieldAnswer; b: FieldAnswer; final: FieldAnswer | null; split: 'X' | 'O' | 'C' };
const isMark = (s: string): s is GoldLabel['split'] => s === 'X' || s === 'O' || s === 'C';

/** score가 읽는다. '-'는 분야 없음, 빈칸은 안 정함이다. 목록 밖 id나 꼴이 틀린 줄은 던진다 */
export function readGoldFile(t: Taxonomy, goldDir: string): Map<number, GoldLabel> {
  const file = join(goldDir, 'fields', `${t.id}.csv`);
  if (!existsSync(file)) throw new Error(`${t.id}: 정답 파일이 없어요 (${file})`);
  const [head = [], ...rows] = readCsv(decodeCsv(readFileSync(file)));
  if (head.join() !== GOLD_HEAD.join()) throw new Error(`${t.id}: 정답 파일 머리줄이 달라요 (${file})`);
  const known = new Set(t.fields.map(f => f.id));
  const ids = (s: string) => (s === '' ? null : s === '-' ? [] : s.split('|'));
  const pair = (core: string, related: string) => {
    const [x, y] = [ids(core), ids(related)];
    return x && y ? { core: x, related: y } : null;
  };
  const out = new Map<number, GoldLabel>();
  for (const [link, , ac, ar, bc, br, fc, fr, mark] of rows.filter(r => r.some(Boolean))) {
    const no = noFromLink(link);
    const [a, b, final] = [pair(ac, ar), pair(bc, br), pair(fc, fr)];
    const all = [a, b, final].flatMap(p => (p ? [...p.core, ...p.related] : []));
    if (!a || !b || !isMark(mark) || (mark !== 'O') !== (final !== null) || !all.every(id => known.has(id))) throw new Error(`${t.id}: 정답 파일의 ${no}번 줄 꼴이 틀려요 (${file})`);
    out.set(no, { a, b, final, split: mark });
  }
  return out;
}
