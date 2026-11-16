import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validList } from '../taxonomy/fixtures.ts';
import { saveTaxonomy, TAXONOMY_IDS } from '../taxonomy/taxonomy.ts';
import { main } from './compare.ts';
import { decodeCsv, readCsv, sampleBySha1, writeCsv } from './eval.ts';
import { allocate } from './gold.ts';
import { clip } from './llm.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'gold-'));
const quiet = () => ({
  err: vi.spyOn(console, 'error').mockImplementation(() => {}),
  log: vi.spyOn(console, 'log').mockImplementation(() => {})
});
const said = (spy: ReturnType<typeof quiet>['err']) => spy.mock.calls.map(c => String(c[0])).join('\n');
const link = (no: number) => `https://cse.skku.edu/cse/notice.do?mode=view&articleNo=${no}`;
const csvAt = (file: string) => readCsv(decodeCsv(readFileSync(file)));
const listDir = () => {
  const dir = tmp();
  for (const id of TAXONOMY_IDS) saveTaxonomy(validList(id), dir);
  return dir;
};
/** 본문 보관본(직접 만든 줄). 첫 줄 뒤에 긴 줄을 둬서 clip이 자른 것이 들어가는지 본다 */
const BODY = (no: number) => `<html><body><div class="fr-view"><p>본문 ${no} 접수 기간 안내</p><p>${'가'.repeat(320)}</p></div></body></html>`;
const LINES = (no: number) => [`본문 ${no} 접수 기간 안내`, '가'.repeat(320)];

// 2026-11-17 개발용 정답셋의 실제 종류 수(research R9)
const COUNTS: [string, number][] = [['채용', 182], ['특강', 88], ['교육·캠프', 53], ['교과', 25], ['대회·공모전', 24], ['장학', 14], ['해커톤', 13], ['멘토링', 6], ['글로벌', 3], ['동아리·학회', 3], ['봉사', 1]];
const ALLOCATED = '채용 53 · 특강 25 · 교육·캠프 15 · 교과 7 · 대회·공모전 7 · 장학 4 · 해커톤 4 · 멘토링 2 · 글로벌 1 · 동아리·학회 1 · 봉사 1';
const GOLD_HEAD = ['링크', '게시판', '제목', '게시일', '기회', '종류', '마감', '주최', '확신', '메모'];

describe('sample (research R9)', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  /** 종류 순서를 섞은 가짜 정답셋(기회 412 + 기회 아님 5) */
  const devGold = () => {
    const dir = tmp();
    let no = 200000;
    const rows = COUNTS.flatMap(([kind, n]) => Array.from({ length: n }, () => [link(++no), '채용/모집', `${kind} 글 ${no}`, '2026-10-01', 'O', kind, '없음', '', '', '']));
    rows.push(...Array.from({ length: 5 }, () => [link(++no), '학사', `안내 ${no}`, '2026-10-01', 'X', '', '', '', '', '']));
    rows.sort((a, b) => (a[0] < b[0] ? 1 : -1));
    writeFileSync(join(dir, 'dev-501.csv'), writeCsv([GOLD_HEAD, ...rows]));
    return { dir, rows };
  };

  it('몫이 1 미만인 종류에 먼저 1건, 남은 자리는 큰 나머지 방식. 실제 종류 수로 R9 배분이 나온다', async () => {
    const { log } = quiet();
    const { dir, rows } = devGold();
    expect(await main(['sample'], { goldDir: dir })).toBe(0);
    expect(String(log.mock.calls[0][0])).toBe(`표본 120건: ${ALLOCATED}`);
    const [head, ...body] = csvAt(join(dir, 'fields', 'sample.csv'));
    expect(head).toEqual(['링크', '게시판', '제목', '게시일', '종류']);
    expect(body).toHaveLength(120);
    // 줄 순서는 배분 표의 종류 순서이고, 종류 안에서는 sampleBySha1 순서다
    const kinds = [...new Set(body.map(r => r[4]))];
    expect(kinds).toEqual(COUNTS.map(c => c[0]));
    const jobIds = rows.filter(r => r[5] === '채용').map(r => `cse:${r[0].split('=').pop()}`);
    expect(body.filter(r => r[4] === '채용').map(r => `cse:${r[0].split('=').pop()}`)).toEqual(sampleBySha1(jobIds, 53));
    expect(body[0]).toEqual(rows.find(r => r[0] === body[0][0])?.filter((_, i) => [0, 1, 2, 3, 5].includes(i)));
  });

  it('같은 입력이면 같은 파일이다', async () => {
    quiet();
    const { dir } = devGold();
    await main(['sample'], { goldDir: dir });
    const first = readFileSync(join(dir, 'fields', 'sample.csv'));
    await main(['sample'], { goldDir: dir });
    expect(readFileSync(join(dir, 'fields', 'sample.csv')).equals(first)).toBe(true);
  });

  it('기회가 0건인 정답셋은 거절한다(eval.ts와 같이). 표본 파일을 쓰지 않고 1이다', async () => {
    const { err } = quiet();
    const dir = tmp();
    writeFileSync(join(dir, 'dev-501.csv'), writeCsv([GOLD_HEAD, [link(1), '학사', '안내 1', '2026-10-01', 'X', '', '', '', '', '']]));
    expect(await main(['sample'], { goldDir: dir })).toBe(1);
    expect(said(err)).toContain(`정답셋에 기회가 없어요: ${join(dir, 'dev-501.csv')}`);
    expect(existsSync(join(dir, 'fields', 'sample.csv'))).toBe(false);
  });

  it('같은 나머지는 종류 이름 순서로 정한다', () => {
    expect([...allocate(new Map([['나', 5], ['가', 5]]), 5)]).toEqual([['나', 2], ['가', 3]]);
    expect([...allocate(new Map(COUNTS), 120)].map(([k, n]) => `${k} ${n}`).join(' · ')).toBe(ALLOCATED);
  });
});

/** 표본 120건(1001~1120)과 그 본문 보관본. noBody의 글은 보관본이 없다 */
function sampled(noBody: number[] = []) {
  const [goldDir, cacheDir] = [tmp(), tmp()];
  const nos = Array.from({ length: 120 }, (_, i) => 1001 + i);
  mkdirSync(join(goldDir, 'fields'));
  writeFileSync(join(goldDir, 'fields', 'sample.csv'), writeCsv([['링크', '게시판', '제목', '게시일', '종류'], ...nos.map(no => [link(no), '채용/모집', `제목 ${no}`, '2026-10-01', '채용'])]));
  for (const no of nos.filter(n => !noBody.includes(n))) writeFileSync(join(cacheDir, `${no}.html`), BODY(no));
  return { goldDir, cacheDir, nos, taxonomyDir: listDir(), repoRoot: tmp() };
}

describe('label-input', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('표본 120건을 40건씩 세 묶음으로 쓰고 body는 clip 결과다', async () => {
    quiet();
    const s = sampled();
    const out = join(tmp(), 'labels');
    expect(await main(['label-input', 'csrankings', out], s)).toBe(0);
    expect(readdirSync(out).sort()).toEqual(['csrankings-1.jsonl', 'csrankings-2.jsonl', 'csrankings-3.jsonl']);
    const first = readFileSync(join(out, 'csrankings-1.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    expect(first).toHaveLength(40);
    expect(first[0]).toEqual({ no: 1001, link: link(1001), board: '채용/모집', title: '제목 1001', body: clip(LINES(1001)) });
    expect(JSON.parse(readFileSync(join(out, 'csrankings-3.jsonl'), 'utf8').trim().split('\n')[39]).no).toBe(1120);
  });

  it('저장소 안 폴더(심볼릭 링크를 풀어도)면 아무것도 쓰지 않고 1이다', async () => {
    const { err } = quiet();
    const s = sampled();
    mkdirSync(join(s.repoRoot, 'inside'));
    const ln = join(tmp(), 'ln');
    symlinkSync(join(s.repoRoot, 'inside'), ln);
    for (const dir of [join(s.repoRoot, 'labels'), join(ln, 'labels')]) {
      expect(await main(['label-input', 'custom', dir], s)).toBe(1);
      expect(existsSync(dir)).toBe(false);
    }
    expect(said(err)).toContain('저장소 안 폴더에는 쓰지 않아요');
  });

  it('대소문자만 다르게 적은 저장소 안 경로도 거절한다(macOS APFS는 대소문자를 가리지 않는다)', async ctx => {
    const { err } = quiet();
    const s = sampled();
    const root = join(s.repoRoot, 'Repo');
    mkdirSync(root);
    if (!existsSync(join(s.repoRoot, 'repo'))) ctx.skip(); // 대소문자를 가리는 파일 시스템(리눅스)에서는 다른 폴더라 저장소 밖이 맞다
    const dir = join(s.repoRoot, 'repo', 'labels');
    expect(await main(['label-input', 'custom', dir], { ...s, repoRoot: root })).toBe(1);
    expect(said(err)).toContain('저장소 안 폴더에는 쓰지 않아요');
    expect(existsSync(dir)).toBe(false);
  });

  it('본문 보관본이 없는 표본 글이 있으면 그 번호를 내고 아무것도 쓰지 않고 1이다', async () => {
    const { err } = quiet();
    const out = join(tmp(), 'labels');
    expect(await main(['label-input', 'custom', out], sampled([1007]))).toBe(1);
    expect(said(err)).toContain('1007');
    expect(existsSync(out)).toBe(false);
  });
});

describe('gold', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  type L = { no: number; core: string[]; related: string[]; note: string };
  const A = (nos: number[]): L[] => nos.map(no => ({ no, core: ['ai'], related: ['backend'], note: '' }));
  /** B는 1001(핵심이 다름)과 1002(분야 없음)만 A와 갈린다 */
  const B = (nos: number[]): L[] => A(nos).map(l => (l.no === 1001 ? { ...l, core: ['vision'], related: [], note: 'b의 이유' } : l.no === 1002 ? { ...l, core: [], related: [] } : l));
  const C: L[] = [{ no: 1001, core: ['vision'], related: ['ai'], note: '비전이 중심' }, { no: 1002, core: [], related: [], note: '분야와 상관없는 안내' }];
  const write = (dir: string, name: string, v: unknown) => { writeFileSync(join(dir, name), JSON.stringify(v)); return join(dir, name); };
  const row = (rows: string[][], no: number) => rows.find(r => r[0] === link(no));

  it('C 없이: CSV를 쓰고 갈린 글은 O·최종 빈칸, 같은 글은 X·최종 = A. 갈린 글만 셋째 입력으로 쓴다', async () => {
    const { log } = quiet();
    const s = sampled();
    const dir = tmp();
    expect(await main(['gold', 'csrankings', write(dir, 'a.json', A(s.nos)), write(dir, 'b.json', B(s.nos))], s)).toBe(0);
    expect(String(log.mock.calls[0][0])).toBe('갈림 2건');
    const [head, ...rows] = csvAt(join(s.goldDir, 'fields', 'csrankings.csv'));
    expect(head).toEqual(['링크', '제목', 'A 핵심', 'A 관련', 'B 핵심', 'B 관련', '최종 핵심', '최종 관련', '갈림', '메모']);
    expect(rows).toHaveLength(120);
    expect(row(rows, 1001)).toEqual([link(1001), '제목 1001', 'ai', 'backend', 'vision', '-', '', '', 'O', '']);
    expect(row(rows, 1003)).toEqual([link(1003), '제목 1003', 'ai', 'backend', 'ai', 'backend', 'ai', 'backend', 'X', '']);
    const split = readFileSync(join(dir, 'csrankings-split.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    expect(split.map(x => x.no)).toEqual([1001, 1002]);
    expect(split[0]).toEqual({
      no: 1001, link: link(1001), board: '채용/모집', title: '제목 1001', body: clip(LINES(1001)),
      a: { core: ['ai'], related: ['backend'], note: '' }, b: { core: ['vision'], related: [], note: 'b의 이유' }
    });
  });

  it('C가 있으면 갈린 글의 최종을 채우고 갈림을 C로 바꾼다. 분야 없음은 -이고 메모는 C의 note다', async () => {
    quiet();
    const s = sampled();
    const dir = tmp();
    const args = ['gold', 'csrankings', write(dir, 'a.json', A(s.nos)), write(dir, 'b.json', B(s.nos))];
    expect(await main([...args, write(dir, 'c.json', C)], s)).toBe(0);
    const rows = csvAt(join(s.goldDir, 'fields', 'csrankings.csv'));
    expect(row(rows, 1001)?.slice(6)).toEqual(['vision', 'ai', 'C', '비전이 중심']);
    expect(row(rows, 1002)?.slice(6)).toEqual(['-', '-', 'C', '분야와 상관없는 안내']);
    expect(rows.filter(r => r[8] === 'O')).toHaveLength(0);
  });

  it('C에 빠진 글이나 남는 글이 있으면 1이다', async () => {
    const { err } = quiet();
    const s = sampled();
    const dir = tmp();
    const args = ['gold', 'csrankings', write(dir, 'a.json', A(s.nos)), write(dir, 'b.json', B(s.nos))];
    expect(await main([...args, write(dir, 'c.json', C.slice(0, 1))], s)).toBe(1);
    expect(said(err)).toContain('C 1002: 빠졌어요');
    expect(await main([...args, write(dir, 'c2.json', [...C, { no: 1005, core: [], related: [], note: '' }])], s)).toBe(1);
    expect(said(err)).toContain('C 1005: 갈린 글이 아니에요');
  });

  it.each<[string, (l: L[]) => unknown, string]>([
    ['표본 글 빠짐', l => l.slice(1), 'A 1001: 빠졌어요'],
    ['표본 밖 글', l => [...l, { no: 9, core: [], related: [], note: '' }], 'A 9: 표본에 없는 글이에요'],
    ['같은 글 두 번', l => [...l, l[0]], 'A 1001: 두 번 나와요'],
    ['칸 안 id 중복', l => [{ ...l[0], core: ['ai', 'ai'] }, ...l.slice(1)], 'A 1001: 핵심에 같은 id가 두 번 있어요'],
    ['목록 밖 id', l => [{ ...l[0], related: ['quantum'] }, ...l.slice(1)], 'A 1001: 목록에 없는 id예요: quantum'],
    ['핵심 3개', l => [{ ...l[0], core: ['ai', 'vision', 'nlp'] }, ...l.slice(1)], 'A 1001: 핵심이 3개예요(2개까지)'],
    ['관련 6개', l => [{ ...l[0], related: ['vision', 'nlp', 'arch', 'comm', 'sec', 'mod'] }, ...l.slice(1)], 'A 1001: 관련이 6개예요(5개까지)'],
    ['겹침', l => [{ ...l[0], related: ['ai'] }, ...l.slice(1)], 'A 1001: 핵심과 관련에 함께 있어요: ai'],
    ['꼴 틀림', () => ({ no: 1 }), 'A: 라벨 배열이 아니에요']
  ])('A·B 출력 검사: %s면 글 번호와 이유를 내고 1이며 CSV를 쓰지 않는다', async (_name, change, message) => {
    const { err } = quiet();
    const s = sampled();
    const dir = tmp();
    expect(await main(['gold', 'csrankings', write(dir, 'a.json', change(A(s.nos))), write(dir, 'b.json', B(s.nos))], s)).toBe(1);
    expect(said(err)).toContain(message);
    expect(existsSync(join(s.goldDir, 'fields', 'csrankings.csv'))).toBe(false);
  });

  it('A.json의 폴더가 저장소 안이면 읽기 전에 1이다. 셋째 입력에 넣을 본문이 없으면 1이다', async () => {
    const { err } = quiet();
    const s = sampled([1002]);
    expect(await main(['gold', 'csrankings', join(s.repoRoot, 'a.json'), join(s.repoRoot, 'b.json')], s)).toBe(1);
    expect(said(err)).toContain('저장소 안 폴더에는 쓰지 않아요');
    const dir = tmp();
    expect(await main(['gold', 'csrankings', write(dir, 'a.json', A(s.nos)), write(dir, 'b.json', B(s.nos))], s)).toBe(1);
    expect(said(err)).toContain('1002');
    expect(existsSync(join(s.goldDir, 'fields', 'csrankings.csv'))).toBe(false);
  });
});
