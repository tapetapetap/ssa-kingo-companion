// NCS 정보망 DB(대분류별, 2026년 2월 기준) → etl/taxonomy/ncs.json. 한 번 돌리는 스크립트(research R7). `node etl/taxonomy/ncs.ts`
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { USER_AGENT } from '../notices/cse.ts';
import { COURSE_ROWS, saveTaxonomy, TAXONOMY_DIR, type Field, type Group, type Taxonomy } from './taxonomy.ts';

/** 시트마다 첫 줄 A~H(research R7 '파일 모양') */
export const HEAD = ['대분류코드', '대분류코드명', '중분류코드', '중분류코드명', '소분류코드', '소분류코드명', '세분류코드', '세분류코드명'];
const NCS_EDITION = '2026-02';
const FILE_NAME = 'NCS정보망DB(대분류별,2026년2월).xlsx';
const NCS_FILE = fileURLToPath(new URL(`../.cache/ncs/${FILE_NAME}`, import.meta.url));
const SHEETS = Array.from({ length: 24 }, (_, i) => String(i + 1).padStart(2, '0'));
const VIEW = { url: 'https://www.ncs.go.kr/th06/bbs_lib_view.do?libDstinCd=01', body: 'libSeq=20260205111407114' };
const ATTACH = "gfn_file_downloadFile('01','20260205111403008','20260205111403797'";
const DOWNLOAD = { url: 'https://www.ncs.go.kr/common/file/downloadFile.do', body: 'sysDstinCd=01&fileMstky=20260205111403008&filedetlSeq=20260205111403797&downlDstinCd=09' };

/** 교과 지도 줄 → NCS 소분류 코드. 정보통신(20)의 소분류 이름만 보고, 줄 이름과 같은 일을 가리킬 때만 넣었다. 애매하면 넣지 않는다(research R7).
 *  2026-11-17 받은 표: 인공지능 → 인공지능, 보안 → 정보보호. 개인정보보호는 보안의 일부라, 유선·무선통신구축은 설비 공사 직무라 넣지 않았다 */
const NCS_COURSE_MAP: Record<string, string[]> = { ...Object.fromEntries(COURSE_ROWS.map(r => [r, []])), ai: ['200107'], security: ['200106'] };

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
  e[0] !== '#' ? ENTITY[e] ?? m : String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))));
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => unxml(m[1])).join('');

/** 공유 문자열 표. 서식 조각(<r><t>)은 잇고, 읽는 법(<rPh>)은 뺀다 */
export const readShared = (xml: string) => [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => texts(m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')));

const COLS = 'ABCDEFGH';
/** 줄마다 A~H 칸 글자. 칸 주소로 고르고 빈 칸은 빈 글자다 */
export function readRows(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = Array<string>(COLS.length).fill('');
    for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const i = c[1].length === 1 ? COLS.indexOf(c[1]) : -1;
      if (i < 0) continue;
      const [attrs, inner = ''] = [c[2], c[3]];
      const v = /<v>([^<]*)<\/v>/.exec(inner)?.[1];
      cells[i] = /\bt="s"/.test(attrs) ? shared[Number(v)] ?? '' : /\bt="inlineStr"/.test(attrs) ? texts(inner) : unxml(v ?? '');
    }
    rows.push(cells);
  }
  return rows;
}

/** 240자 안에 드는 마지막 이름까지 잇는다. 말줄임표는 붙이지 않고, 첫 이름이 넘으면 그 이름을 자른다(research R7) */
function descOf(names: string[]): string {
  let s = '';
  for (const n of names) {
    const next = s ? `${s}, ${n}` : n;
    if (next.length > 240) break;
    s = next;
  }
  return s || (names[0] ?? '').slice(0, 240);
}

/** 머리줄 + 줄들(A~H) → 2안 목록. 코드는 단계마다 두 자리이고, 같은 코드는 이름이 하나여야 한다 */
export function buildNcs(rows: string[][], edition: string, courseMap: Record<string, string[]> = NCS_COURSE_MAP): Taxonomy {
  const [head, ...body] = rows;
  if (head?.join('\t') !== HEAD.join('\t')) throw new Error(`머리줄이 달라요: ${head?.join(', ') ?? '(없음)'}`);
  const names = new Map<string, string>(); // 코드 경로(대 2자리, 중 4자리, 소 6자리, 세 8자리) → 이름
  for (const [a, an, c, cn, e, en, g, gn] of body) {
    if (![a, c, e, g].every(x => /^\d{2}$/.test(x)) || ![an, cn, en, gn].every(Boolean)) throw new Error(`코드 꼴이 틀린 줄이 있어요: ${[a, c, e, g].join(' ')}`);
    for (const [kind, code, name] of [['대분류', a, an], ['중분류', a + c, cn], ['소분류', a + c + e, en], ['세분류', a + c + e + g, gn]]) {
      const prev = names.get(code);
      if (prev !== undefined && prev !== name) throw new Error(`${kind} ${code}의 이름이 둘이에요: ${prev}, ${name}`);
      names.set(code, name);
    }
  }
  const codes = [...names.keys()].sort(); // '01' < '0101' < '0102' < '02': 위 묶음이 아래 묶음 앞에 온다
  const of = (len: number) => codes.filter(k => k.length === len);
  const nameOf = (k: string) => names.get(k) ?? '';
  const groups: Group[] = codes.filter(k => k.length <= 4).map(k => ({ id: `ncs-${k}`, name: nameOf(k), parent: k.length === 4 ? `ncs-${k.slice(0, 2)}` : null }));
  const fields: Field[] = of(6).map(k => ({
    id: `ncs-${k}`, name: nameOf(k), group: `ncs-${k.slice(0, 4)}`,
    desc: descOf(of(8).filter(d => d.startsWith(k)).map(nameOf)), descFrom: 'source', csr: [], ncs: k
  }));
  const missing = Object.values(courseMap).flat().filter(k => !names.has(k) || k.length !== 6);
  if (missing.length) throw new Error(`교과 지도 대응표의 소분류가 표에 없어요: ${missing.join(', ')}`);
  return {
    id: 'ncs', name: 'NCS 직무 분류(소분류)', edition,
    sources: [{ name: '한국산업인력공단 NCS(ncs.go.kr), NCS 정보망 DB(대분류별, 2026년 2월 기준)', url: 'https://www.ncs.go.kr', license: '공공누리 제1유형(출처표시)' }],
    sourceCounts: { major: of(2).length, middle: of(4).length, minor: of(6).length, detail: of(8).length },
    groups, fields, courseMap: Object.fromEntries(Object.entries(courseMap).map(([row, ks]) => [row, ks.map(k => `ncs-${k}`)])), chosen: null
  };
}

/** 자료실 글에서 첨부 이름을 확인한 뒤 받는다. 요청은 1초에 1건이다 */
async function download(file: string) {
  const post = (r: { url: string; body: string }) =>
    fetch(r.url, { method: 'POST', body: new URLSearchParams(r.body), headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(600_000) });
  const page = await (await post(VIEW)).text();
  if (!page.includes(ATTACH) || !page.includes(FILE_NAME)) throw new Error(`자료실 글의 첨부가 ${FILE_NAME}가 아니에요`);
  await sleep(1000);
  const res = await post(DOWNLOAD);
  if (!res.ok) throw new Error(`첨부를 받지 못했어요: 응답 코드 ${res.status}`);
  mkdirSync(dirname(file), { recursive: true });
  // ponytail: 약 200MB를 메모리에 한 번에 받는다. 파일이 크게 늘면 흘려 쓴다
  writeFileSync(`${file}.tmp`, Buffer.from(await res.arrayBuffer()));
  renameSync(`${file}.tmp`, file);
}

const unzip = (file: string, part: string) => execFileSync('unzip', ['-p', file, part], { maxBuffer: 1 << 30 }).toString('utf8');

/** 시트 이름 '01'~'24' → 시트 파일. workbook.xml의 r:id를 rels의 Target으로 잇는다 */
function sheetParts(file: string): [string, string][] {
  const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? '';
  const rels = new Map([...unzip(file, 'xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map(m => [attr(m[0], 'Id'), attr(m[0], 'Target')]));
  const sheets = [...unzip(file, 'xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)].map((m): [string, string] => [attr(m[0], 'name'), `xl/${rels.get(attr(m[0], 'r:id')) ?? ''}`]);
  if (sheets.map(s => s[0]).join() !== SHEETS.join()) throw new Error(`시트가 01~24가 아니에요: ${sheets.map(s => s[0]).join(', ')}`);
  return sheets;
}

/** 시트 XML은 줄바꿈 없는 한 줄이라(1GB가 넘는다) </row>로 끊어 흘려 읽는다 */
async function eachRows(file: string, part: string, shared: string[], onRows: (rows: string[][]) => void) {
  const p = spawn('unzip', ['-p', file, part]);
  const closed = once(p, 'close');
  let buf = '';
  try {
    p.stdout.setEncoding('utf8');
    for await (const chunk of p.stdout) {
      buf += String(chunk);
      const end = buf.lastIndexOf('</row>') + '</row>'.length;
      if (end < '</row>'.length) continue;
      onRows(readRows(buf.slice(0, end), shared));
      buf = buf.slice(end);
    }
    const [code] = await closed;
    if (code !== 0) throw new Error(`${part}을 풀지 못했어요 (unzip ${String(code)})`);
  } finally {
    p.kill();
  }
}

async function main(file = NCS_FILE, outDir = TAXONOMY_DIR): Promise<number> {
  try {
    if (!existsSync(file)) await download(file);
    const shared = readShared(unzip(file, 'xl/sharedStrings.xml'));
    const seen = new Map<string, string[]>(); // 세분류마다 능력단위 줄이 여럿이라 A~H가 같은 줄은 하나만 둔다
    for (const [name, part] of sheetParts(file)) {
      let first = true;
      await eachRows(file, part, shared, rows => {
        for (const r of rows) {
          if (first && r.join('\t') !== HEAD.join('\t')) throw new Error(`시트 ${name}의 머리줄이 달라요: ${r.join(', ')}`);
          if (!first) seen.set(r.join('\t'), r);
          first = false;
        }
      });
      console.error(`시트 ${name} 읽음`);
    }
    const t = buildNcs([HEAD, ...seen.values()], NCS_EDITION);
    saveTaxonomy(t, outDir);
    const c = t.sourceCounts;
    console.log(`대분류 ${c?.major} · 중분류 ${c?.middle} · 소분류 ${c?.minor} · 세분류 ${c?.detail} (기준 ${NCS_EDITION})`);
    return 0;
  } catch (e) {
    console.error(`NCS 분류표를 만들지 못했어요: ${e instanceof Error ? e.message : String(e)}. ncs.json은 그대로예요.`);
    return 1;
  }
}

if (import.meta.main) process.exitCode = await main();
