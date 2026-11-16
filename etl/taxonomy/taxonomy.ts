// 분야 목록(안): 타입, 파일 읽기·꼴 검사, 규칙 검사, LLM용 이름, 고른 안(data-model 1, research R12).
// 2단계 백엔드와 3단계 앱도 읽는 자료라 분류기(etl/notices) 밖에 둔다
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSR_AREAS } from '../../src/data/courses/csrankings.ts';
import { KIND_LABEL } from '../notices/classify.ts';
import { passes, pct, type Ratio } from '../notices/score.ts';

export const TAXONOMY_IDS = ['custom', 'ncs', 'csrankings'] as const;
export type TaxonomyId = (typeof TAXONOMY_IDS)[number];
export const isTaxonomyId = (s: string): s is TaxonomyId => (TAXONOMY_IDS as readonly string[]).includes(s);
/** 교과 지도 분야 줄 12개(기초·경험 제외). 키는 src/data/courses/swe.ts의 id */
export const COURSE_ROWS = ['ai', 'ml', 'vision', 'arch', 'os', 'network', 'security', 'db', 'pl', 'se', 'theory', 'graphics'] as const;
export const TAXONOMY_DIR = fileURLToPath(new URL('.', import.meta.url));

export type Group = { id: string; name: string; parent: string | null };
export type Field = { id: string; name: string; group: string; desc: string; descFrom: 'made' | 'source'; csr: string[]; ncs: string | null };
export type Chosen = { date: string; corePrecision: Ratio; prompt: string; model: string };
export type Taxonomy = {
  id: TaxonomyId; name: string; edition: string;
  sources: { name: string; url: string; license: string }[];
  sourceCounts: { major: number; middle: number; minor: number; detail: number } | null;
  groups: Group[]; fields: Field[];
  /** 교과 지도 줄 → 분야 id. 빈 배열은 '없음'이다. 키가 12줄과 같은지는 checkTaxonomy가 본다 */
  courseMap: Record<string, string[]>;
  chosen: Chosen | null;
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const every = (v: unknown, ok: (x: unknown) => boolean) => Array.isArray(v) && v.every(ok);

/** 칸과 값의 타입만 본다. 값의 규칙은 checkTaxonomy가 본다 */
function shapeError(o: unknown, id: TaxonomyId): string | null {
  if (!isObj(o)) return 'JSON 객체가 아니에요';
  if (o.id !== id) return `id가 ${id}이 아니에요`;
  if (!isStr(o.name) || !isStr(o.edition)) return 'name·edition 꼴이 틀려요';
  if (!every(o.sources, s => isObj(s) && isStr(s.name) && isStr(s.url) && isStr(s.license))) return 'sources 꼴이 틀려요';
  const c = o.sourceCounts;
  if (c !== null && !(isObj(c) && isNum(c.major) && isNum(c.middle) && isNum(c.minor) && isNum(c.detail))) return 'sourceCounts 꼴이 틀려요';
  if (!every(o.groups, g => isObj(g) && isStr(g.id) && isStr(g.name) && (g.parent === null || isStr(g.parent)))) return 'groups 꼴이 틀려요';
  const fieldOk = (f: unknown) => isObj(f) && isStr(f.id) && isStr(f.name) && isStr(f.group) && isStr(f.desc)
    && (f.descFrom === 'made' || f.descFrom === 'source') && every(f.csr, isStr) && (f.ncs === null || isStr(f.ncs));
  if (!every(o.fields, fieldOk)) return 'fields 꼴이 틀려요';
  if (!isObj(o.courseMap) || !Object.values(o.courseMap).every(v => every(v, isStr))) return 'courseMap 꼴이 틀려요';
  const ch = o.chosen;
  const cp = isObj(ch) ? ch.corePrecision : null;
  if (ch !== null && !(isObj(ch) && isObj(cp) && isNum(cp.num) && isNum(cp.den) && isStr(ch.date) && isStr(ch.prompt) && isStr(ch.model))) return 'chosen 꼴이 틀려요';
  return null;
}

/** 파일 꼴을 검사한 뒤에만 타입을 붙인다. 없거나 꼴이 틀리면 이유를 담아 던진다 */
export function loadTaxonomy(id: TaxonomyId, dir = TAXONOMY_DIR): Taxonomy {
  const file = join(dir, `${id}.json`);
  if (!existsSync(file)) throw new Error(`분야 목록 파일이 없어요: ${file}`);
  let o: unknown;
  try {
    o = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`분야 목록 파일이 JSON이 아니에요: ${file}`);
  }
  const bad = shapeError(o, id);
  if (bad) throw new Error(`분야 목록 파일 ${file}: ${bad}`);
  return o as Taxonomy;
}

/** 반쪽 파일이 남지 않게 .tmp에 다 쓴 뒤 이름을 바꾼다 */
export function saveTaxonomy(t: Taxonomy, dir = TAXONOMY_DIR) {
  const file = join(dir, `${t.id}.json`);
  writeFileSync(`${file}.tmp`, `${JSON.stringify(t, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
}

/** LLM에게 줄 이름. 안 안에서 이름이 겹치면 '이름 (묶음 이름)'이다(research R3) */
export function labelsOf(t: Taxonomy): { idOf: Map<string, string>; nameOf: Map<string, string> } {
  const groupName = new Map(t.groups.map(g => [g.id, g.name]));
  const count = new Map<string, number>();
  for (const f of t.fields) count.set(f.name, (count.get(f.name) ?? 0) + 1);
  const nameOf = new Map(t.fields.map(f => [f.id, (count.get(f.name) ?? 0) > 1 ? `${f.name} (${groupName.get(f.group) ?? f.group})` : f.name]));
  return { idOf: new Map([...nameOf].map(([id, name]) => [name, id])), nameOf };
}

/** 묶음 이름 + 분야 이름 + 설명 글자 수. 지시문에는 그중 후보 30개만 들어간다 */
export const listChars = (t: Taxonomy) => [...t.groups.map(g => g.name), ...t.fields.flatMap(f => [f.name, f.desc])].reduce((n, s) => n + s.length, 0);

/** 묶음과 그 위 묶음 이름을 위에서부터 ' › '로 잇는다(2안 '정보통신 › 정보기술') */
export function groupPath(t: Taxonomy, groupId: string): string {
  const byId = new Map(t.groups.map(g => [g.id, g]));
  const names: string[] = [];
  // 묶음 수만큼만 올라간다: 위 묶음이 돌고 돌아도 멈춘다
  for (let g = byId.get(groupId); g && names.length < t.groups.length; g = g.parent === null ? undefined : byId.get(g.parent)) names.unshift(g.name);
  return names.join(' › ');
}

const twice = <T>(xs: T[]) => [...new Set(xs.filter((x, i) => xs.indexOf(x) !== i))];

/** 규칙 위반 문장을 모두 모은다(data-model 1 검사 규칙). 빈 배열이면 통과다 */
export function checkTaxonomy(t: Taxonomy): string[] {
  const bad: string[] = [];
  const say = (m: string) => { bad.push(`${t.id}: ${m}`); };
  for (const id of twice([...t.groups.map(g => g.id), ...t.fields.map(f => f.id)])) say(`id가 겹쳐요: ${id}`);
  const groupIds = new Set(t.groups.map(g => g.id));
  for (const g of t.groups) if (g.parent !== null && !groupIds.has(g.parent)) say(`${g.id}의 위 묶음 ${g.parent}가 없어요`);
  const csrKeys = new Set<string>(CSR_AREAS.map(a => a.id));
  for (const f of t.fields) {
    if (!groupIds.has(f.group)) say(`${f.id}의 묶음 ${f.group}가 없어요`);
    if (!f.desc.trim()) say(`${f.id}의 설명이 비었어요`);
    else if (f.desc.length > 240) say(`${f.id}의 설명이 240자를 넘어요(${f.desc.length}자)`);
    if (Object.values(KIND_LABEL).includes(f.name)) say(`${f.id}의 이름이 분류기 종류(${f.name})와 같아요`);
    const unknown = f.csr.filter(k => !csrKeys.has(k));
    if (unknown.length) say(`${f.id}의 csr에 모르는 키가 있어요: ${unknown.join(', ')}`);
  }
  for (const name of twice([...labelsOf(t).nameOf.values()])) say(`LLM용 이름이 겹쳐요: ${name}`);

  const keys = Object.keys(t.courseMap);
  const missing = COURSE_ROWS.filter(r => !keys.includes(r));
  const extra = keys.filter(k => !(COURSE_ROWS as readonly string[]).includes(k));
  if (missing.length || extra.length) {
    say(`courseMap 키가 교과 지도 12줄과 달라요(${[missing.length ? `빠짐: ${missing.join(', ')}` : '', extra.length ? `남음: ${extra.join(', ')}` : ''].filter(Boolean).join(' · ')})`);
  }
  const fieldIds = new Set(t.fields.map(f => f.id));
  for (const [row, list] of Object.entries(t.courseMap)) {
    const none = list.filter(id => !fieldIds.has(id));
    if (none.length) say(`courseMap.${row}에 없는 분야가 있어요: ${none.join(', ')}`);
  }

  const used = t.fields.flatMap(f => f.csr);
  const notUsed = CSR_AREAS.filter(a => !used.includes(a.id)).map(a => a.id);
  if (t.id === 'custom') {
    const top = t.groups.filter(g => g.parent === null).length;
    if (top < 10 || top > 15) say(`큰 분야가 ${top}개예요(10~15개)`);
    if (t.fields.length < 80 || t.fields.length > 120) say(`분야가 ${t.fields.length}개예요(80~120개)`);
  }
  if ((t.id === 'custom' || t.id === 'csrankings') && notUsed.length) say(`CSRankings 키가 어느 분야의 csr에도 없어요: ${notUsed.join(', ')}`);
  if (t.id === 'ncs') {
    if (t.fields.length !== t.sourceCounts?.minor) say(`분야 ${t.fields.length}개가 sourceCounts.minor ${t.sourceCounts?.minor ?? '(없음)'}와 달라요`);
    for (const f of t.fields) {
      if (!f.ncs) say(`${f.id}에 NCS 코드가 없어요`);
      if (f.descFrom !== 'source') say(`${f.id}의 설명이 분류표 글자(source)가 아니에요`);
    }
  }
  if (t.id === 'csrankings') {
    const research = t.fields.filter(f => f.csr.length > 0);
    const groupOf = new Map<string, string>(CSR_AREAS.map(a => [a.id, a.group]));
    if (research.length !== CSR_AREAS.length) say(`연구 분야가 ${research.length}개예요(CSRankings 키마다 하나, ${CSR_AREAS.length}개)`);
    for (const k of twice(used)) say(`CSRankings 키 ${k}가 두 분야에 있어요`);
    for (const f of research) {
      if (f.csr.length !== 1) say(`${f.id}의 csr은 키 하나여야 해요`);
      if (!f.desc.startsWith('(')) say(`${f.id}의 설명이 '('로 시작하지 않아요`);
      const g = groupOf.get(f.csr[0]);
      if (g && f.group !== `g-${g}`) say(`${f.id}의 묶음이 g-${g}가 아니에요`);
    }
    const jobs = t.fields.filter(f => f.csr.length === 0);
    if (jobs.length < 10 || jobs.length > 15) say(`직무가 ${jobs.length}개예요(10~15개)`);
    for (const f of jobs) if (f.group !== 'g-job') say(`직무 ${f.id}가 g-job에 없어요`);
  }

  const c = t.chosen;
  if (c) {
    const { num, den } = c.corePrecision;
    const wrong = [
      !/^\d{4}-\d{2}-\d{2}$/.test(c.date) && 'date',
      !(Number.isInteger(num) && Number.isInteger(den) && den > 0 && num >= 0 && num <= den) && 'corePrecision',
      !/^[0-9a-f]{8}$/.test(c.prompt) && 'prompt',
      !c.model && 'model'
    ].filter(Boolean);
    if (wrong.length) say(`chosen 꼴이 틀려요(${wrong.join(', ')})`);
  }
  return bad;
}

/** 읽고 검사한다. 위반이 있으면 모두 담아 던진다(compare.ts·gold.ts 하위 명령이 목록을 읽는 길) */
export function readList(id: TaxonomyId, dir = TAXONOMY_DIR): Taxonomy {
  const t = loadTaxonomy(id, dir);
  const bad = checkTaxonomy(t);
  if (bad.length) throw new Error(bad.join('\n'));
  return t;
}

type ChosenTaxonomy = Taxonomy & { chosen: Chosen };

/** chosen이 있는 안 하나. 많아야 하나라서 둘 이상이면 던진다 */
export function findChosen(list: Taxonomy[]): ChosenTaxonomy | null {
  const picked = list.filter((t): t is ChosenTaxonomy => t.chosen !== null);
  if (picked.length > 1) throw new Error(`고른 안이 둘 이상이에요: ${picked.map(t => t.id).join(', ')}`);
  return picked[0] ?? null;
}

/** 결과 파일에 분야를 넣어도 되는가. 판정 판 → 모델 → 정밀도 순으로 처음 걸린 이유 하나를 낸다(research R12) */
export function fieldGate(t: ChosenTaxonomy, version: string, model: string): { ok: true } | { reason: string } {
  const c = t.chosen;
  if (c.prompt !== version) return { reason: `고른 안 ${t.id}을 고른 뒤 판정 판이 바뀌어(${c.prompt} → ${version}) 분야를 넣지 않았어요. 다시 재고 고르세요` };
  if (c.model !== model) return { reason: `고른 안 ${t.id}은 ${c.model}로 쟀는데 지금 모델은 ${model}이라 분야를 넣지 않았어요` };
  if (!passes(c.corePrecision)) return { reason: `고른 안 ${t.id}의 핵심 정밀도 ${pct(c.corePrecision)} < 85%라 분야를 넣지 않았어요` };
  return { ok: true };
}
