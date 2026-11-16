import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validList } from '../taxonomy/fixtures.ts';
import { listChars, saveTaxonomy, TAXONOMY_IDS, type Taxonomy } from '../taxonomy/taxonomy.ts';
import type { NoticeRow } from './cse.ts';
import { main } from './compare.ts';
import { writeCsv } from './eval.ts';
import type { FieldAsk, FieldOutcome } from './fields.ts';
import type { LoadSummary } from './throttle.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'compare-'));
const quiet = () => ({
  err: vi.spyOn(console, 'error').mockImplementation(() => {}),
  log: vi.spyOn(console, 'log').mockImplementation(() => {})
});
/** 시험용 목록 셋을 임시 폴더에 쓴다. change로 하나를 고칠 수 있다 */
const listDir = (change: (t: Taxonomy) => void = () => {}) => {
  const dir = tmp();
  for (const id of TAXONOMY_IDS) {
    const t = validList(id);
    change(t);
    saveTaxonomy(t, dir);
  }
  return dir;
};
const said = (spy: ReturnType<typeof quiet>['log']) => spy.mock.calls.map(c => String(c[0])).join('\n');

describe('compare.ts 쓰는 법', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it.each([[[]], [['nope']], [['check', 'x']], [['judge']], [['choose', 'custom', 'ncs']]])('%j는 쓰는 법을 내고 2', async args => {
    const { err } = quiet();
    expect(await main(args, {})).toBe(2);
    expect(String(err.mock.calls[0][0])).toMatch(/^쓰는 법: /);
  });
});

describe('check', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('통과하면 안마다 묶음·분야·교과 지도·목록 글자 수를 한 줄씩 내고 0', async () => {
    const { log } = quiet();
    expect(await main(['check'], { taxonomyDir: listDir() })).toBe(0);
    const chars = (id: 'custom' | 'ncs' | 'csrankings') => listChars(validList(id)).toLocaleString('en-US');
    expect(log.mock.calls.map(c => c[0])).toEqual([
      `custom: 묶음 10 · 분야 80 · 교과 지도 1/12 · 목록 ${chars('custom')}자`,
      `ncs: 묶음 2 · 분야 3 · 교과 지도 0/12 · 목록 ${chars('ncs')}자`,
      `csrankings: 묶음 5 · 분야 38 · 교과 지도 1/12 · 목록 ${chars('csrankings')}자`
    ]);
  });

  it('위반이 있으면 모두 표준 오류에 내고 1', async () => {
    const { err, log } = quiet();
    const dir = listDir(t => { if (t.id !== 'custom') t.fields[0].desc = ''; });
    expect(await main(['check'], { taxonomyDir: dir })).toBe(1);
    expect(said(err)).toContain('ncs: ncs-200101의 설명이 비었어요');
    expect(said(err)).toContain('csrankings: ai의 설명이 비었어요');
    expect(log).not.toHaveBeenCalled();
  });

  it('안 파일이 없거나 chosen이 둘이면 1', async () => {
    const { err } = quiet();
    expect(await main(['check'], { taxonomyDir: tmp() })).toBe(1);
    expect(said(err)).toContain('분야 목록 파일이 없어요');
    const chosen = { date: '2026-11-20', corePrecision: { num: 88, den: 100 }, prompt: '1a2b3c4d', model: 'gemma4:12b' };
    expect(await main(['check'], { taxonomyDir: listDir(t => { if (t.id !== 'ncs') t.chosen = chosen; }) })).toBe(1);
    expect(said(err)).toContain('고른 안이 둘 이상이에요: custom, csrankings');
  });
});

// judge: 가짜 정답셋(기회 3건 + 기회 아님 1건), 가짜 본문 보관본(3번은 없음), 가짜 판정기·문·부하 요약
const GOLD_HEAD = ['링크', '게시판', '제목', '게시일', '기회', '종류', '마감', '주최', '확신', '메모'];
const link = (no: number) => `https://cse.skku.edu/cse/notice.do?mode=view&articleNo=${no}`;
/** 정답셋 폴더(dev-501.csv)와 본문 보관본 폴더. 본문은 직접 만든 줄이다 */
function goldAndBodies(opps: number[], nots: number[] = [], noBody: number[] = []) {
  const [goldDir, cacheDir] = [tmp(), tmp()];
  const rows = [...opps.map(no => [link(no), '채용/모집', `제목 ${no}`, '2026-11-01', 'O', '채용', '없음', '', '', '']),
    ...nots.map(no => [link(no), '학사', `제목 ${no}`, '2026-11-01', 'X', '', '', '', '', ''])];
  writeFileSync(join(goldDir, 'dev-501.csv'), writeCsv([GOLD_HEAD, ...rows]));
  for (const no of [...opps, ...nots].filter(n => !noBody.includes(n))) {
    writeFileSync(join(cacheDir, `${no}.html`), `<html><body><div class="fr-view"><p>본문 ${no} 접수 기간 안내</p></div></body></html>`);
  }
  return { goldDir, cacheDir };
}
/** 글 번호별로 정해 둔 결과를 주는 가짜 판정기(없으면 'fail'). 물은 글 번호를 seen에 남긴다 */
const fakeFieldAsk = (outcomes: Record<number, FieldOutcome>, seen: number[] = []) => (t: Taxonomy): FieldAsk =>
  Object.assign(async (r: NoticeRow) => { seen.push(r.no); return outcomes[r.no] ?? 'fail'; }, { model: 'gemma4:12b', version: '1a2b3c4d', taxonomyId: t.id });
const loadOf = (s: Partial<LoadSummary> = {}) => () => ({ requests: 0, requestMs: 0, gpuAvg: null, tempMax: null, logFile: null, line: '', ...s });
const clock = (...isos: string[]) => { const ds = isos.map(i => new Date(i)); return () => (ds.length > 1 ? ds.shift()! : ds[0]); };
const kept = (core: string[], cached = true): FieldOutcome => ({ answer: { core, related: [] }, cached });

describe('judge', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('기회만 묻고 보관본이 없는 글은 판정기를 부르지 않는다. 요약·실행 기록을 남긴다', async () => {
    const { log } = quiet();
    const { goldDir, cacheDir } = goldAndBodies([1, 2, 3], [4], [3]);
    const [llmDir, seen] = [tmp(), [] as number[]];
    const deps = {
      taxonomyDir: listDir(), goldDir, cacheDir, llmDir, fieldAsk: fakeFieldAsk({ 1: kept(['csr-ai']), 2: kept([], false) }, seen),
      gate: { before: async () => true, after: async () => {}, noTemp: 1 },
      load: loadOf({ requests: 2, requestMs: 3000, gpuAvg: 51.5, tempMax: 62.3, logFile: '/tmp/load.jsonl', line: '부하: GPU 평균 51.5% · 칩 최고 62.3°C' }),
      now: clock('2026-11-17T01:00:00.000Z', '2026-11-17T01:00:40.000Z')
    };
    expect(await main(['judge', 'custom'], deps)).toBe(0);
    expect(seen).toEqual([1, 2]);
    expect(said(log)).toBe('custom 분야 판정 3(보관 1 · 새로 1 · 실패 0 · 못 물음 1 · 분야 없음 1) · 글당 3.0초 · 40초\n온도를 읽지 못해 1건은 묻지 않았어요\n부하: GPU 평균 51.5% · 칩 최고 62.3°C');
    const runs = readFileSync(join(llmDir, 'gemma4_12b', 'custom-1a2b3c4d', 'runs.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    expect(runs).toEqual([{
      start: '2026-11-17T01:00:00.000Z', end: '2026-11-17T01:00:40.000Z', limit: null, total: 3, cached: 1, fresh: 1, failed: 0, notAsked: 1,
      noTemp: 1, empty: 1, requests: 2, requestMs: 3000, gpuAvg: 51.5, tempMax: 62.3, loadLog: '/tmp/load.jsonl'
    }]);
  });

  it('--limit N은 정답셋 순서로 앞 N건이고, 실행 기록의 limit이 N이다. 새로·실패가 없으면 글당 -이고 1분이 넘으면 분이다', async () => {
    const { log } = quiet();
    const { goldDir, cacheDir } = goldAndBodies([1, 2, 3]);
    const llmDir = tmp();
    const deps = { taxonomyDir: listDir(), goldDir, cacheDir, llmDir, fieldAsk: fakeFieldAsk({ 1: kept([]), 2: kept([]) }), now: clock('2026-11-17T01:00:00.000Z', '2026-11-17T01:31:10.000Z') };
    expect(await main(['judge', 'custom', '--limit', '2'], deps)).toBe(0);
    expect(said(log)).toBe('custom 분야 판정 2(보관 2 · 새로 0 · 실패 0 · 못 물음 0 · 분야 없음 2) · 글당 - · 31분');
    expect(JSON.parse(readFileSync(join(llmDir, 'gemma4_12b', 'custom-1a2b3c4d', 'runs.jsonl'), 'utf8'))).toMatchObject({ limit: 2, total: 2, requests: 0, gpuAvg: null, loadLog: null });
  });

  it('모두 실패나 못 물음이어도 기록을 쓰고 0으로 끝난다', async () => {
    const { log } = quiet();
    const { goldDir, cacheDir } = goldAndBodies([1, 2, 3]);
    const deps = { taxonomyDir: listDir(), goldDir, cacheDir, llmDir: tmp(), fieldAsk: fakeFieldAsk({ 1: 'down', 2: 'down' }), load: loadOf({ requests: 1, requestMs: 500 }), now: clock('2026-11-17T01:00:00.000Z') };
    expect(await main(['judge', 'custom'], deps)).toBe(0);
    expect(said(log)).toBe('custom 분야 판정 3(보관 0 · 새로 0 · 실패 1 · 못 물음 2 · 분야 없음 0) · 글당 0.5초 · 0초');
  });

  it('목록 검사를 통과하지 못하거나 없는 안이면 1, 쓰는 법이 틀리면 2다', async () => {
    const { err } = quiet();
    const { goldDir, cacheDir } = goldAndBodies([1]);
    const deps = { goldDir, cacheDir, llmDir: tmp(), fieldAsk: fakeFieldAsk({}) };
    expect(await main(['judge', 'custom'], { ...deps, taxonomyDir: listDir(t => { t.fields[0].desc = ''; }) })).toBe(1);
    expect(said(err)).toContain('custom: csr-ai의 설명이 비었어요');
    expect(await main(['judge', 'nope'], { ...deps, taxonomyDir: listDir() })).toBe(1);
    for (const args of [['judge', 'custom', '--limit'], ['judge', 'custom', '--limit', '0'], ['judge', 'custom', '5']]) {
      expect(await main(args, { ...deps, taxonomyDir: listDir() })).toBe(2);
    }
  });
});
