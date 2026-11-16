import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validList } from '../taxonomy/fixtures.ts';
import { listChars, saveTaxonomy, TAXONOMY_IDS, type Taxonomy } from '../taxonomy/taxonomy.ts';
import { main } from './compare.ts';

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
