import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SWE } from '../../src/data/courses/swe.ts';
import { JOBS, validList } from './fixtures.ts';
import {
  checkTaxonomy, fieldGate, findChosen, groupPath, labelsOf, listChars, loadTaxonomy, readList, TAXONOMY_IDS,
  type Chosen, type Taxonomy, type TaxonomyId
} from './taxonomy.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'taxonomy-'));
const save = (dir: string, t: unknown, id = 'custom') => writeFileSync(join(dir, `${id}.json`), JSON.stringify(t));
const broken = (id: TaxonomyId, change: (t: Taxonomy) => void) => {
  const t = validList(id);
  change(t);
  return checkTaxonomy(t);
};

describe('checkTaxonomy (data-model 1 검사 규칙)', () => {
  it.each(TAXONOMY_IDS)('시험용 목록 %s는 위반이 없다', id => {
    expect(checkTaxonomy(validList(id))).toEqual([]);
  });

  it.each<[string, TaxonomyId, (t: Taxonomy) => void, string]>([
    ['id 겹침', 'custom', t => { t.fields[1].id = t.fields[0].id; }, 'custom: id가 겹쳐요: csr-ai'],
    ['묶음 id와 분야 id 겹침', 'custom', t => { t.fields[0].id = 'g-a0'; }, 'custom: id가 겹쳐요: g-a0'],
    ['없는 묶음', 'custom', t => { t.fields[0].group = 'g-zz'; }, 'custom: csr-ai의 묶음 g-zz가 없어요'],
    ['없는 위 묶음', 'ncs', t => { t.groups[1].parent = 'ncs-99'; }, 'ncs: ncs-2001의 위 묶음 ncs-99가 없어요'],
    ['빈 설명', 'custom', t => { t.fields[0].desc = ' '; }, 'custom: csr-ai의 설명이 비었어요'],
    ['241자 설명', 'custom', t => { t.fields[0].desc = '가'.repeat(241); }, 'custom: csr-ai의 설명이 240자를 넘어요(241자)'],
    ['종류 이름과 같은 분야', 'custom', t => { t.fields[0].name = '대회·공모전'; }, 'custom: csr-ai의 이름이 분류기 종류(대회·공모전)와 같아요'],
    ['모르는 CSRankings 키', 'custom', t => { t.fields[80 - 1].csr = ['robot']; }, 'custom: fill-41의 csr에 모르는 키가 있어요: robot'],
    ['courseMap 키 11개', 'custom', t => { delete t.courseMap.graphics; }, 'custom: courseMap 키가 교과 지도 12줄과 달라요(빠짐: graphics)'],
    ['courseMap 남는 키', 'custom', t => { t.courseMap.base = []; }, 'custom: courseMap 키가 교과 지도 12줄과 달라요(남음: base)'],
    ['courseMap 없는 분야 id', 'custom', t => { t.courseMap.ai = ['nope']; }, 'custom: courseMap.ai에 없는 분야가 있어요: nope'],
    ['1안 큰 분야 9개', 'custom', t => { t.groups[9].parent = 'g-a0'; }, 'custom: 큰 분야가 9개예요(10~15개)'],
    ['1안 분야 79개', 'custom', t => { t.fields.pop(); }, 'custom: 분야가 79개예요(80~120개)'],
    ['1안 CSRankings 키 빠짐', 'custom', t => { t.fields[20].csr = []; }, 'custom: CSRankings 키가 어느 분야의 csr에도 없어요: bio'],
    ['2안 분야 수 ≠ sourceCounts.minor', 'ncs', t => { t.sourceCounts = { major: 1, middle: 1, minor: 4, detail: 6 }; }, 'ncs: 분야 3개가 sourceCounts.minor 4와 달라요'],
    ['2안 NCS 코드 없음', 'ncs', t => { t.fields[0].ncs = null; }, 'ncs: ncs-200101에 NCS 코드가 없어요'],
    ['2안 새로 쓴 설명', 'ncs', t => { t.fields[0].descFrom = 'made'; }, 'ncs: ncs-200101의 설명이 분류표 글자(source)가 아니에요'],
    ['3안 연구 분야 desc가 괄호로 시작하지 않음', 'csrankings', t => { t.fields[0].desc = '사람처럼 생각하는 프로그램'; }, "csrankings: ai의 설명이 '('로 시작하지 않아요"],
    ['3안 연구 분야 묶음이 CSRankings 묶음과 다름', 'csrankings', t => { t.fields[0].group = 'g-systems'; }, 'csrankings: ai의 묶음이 g-ai가 아니에요'],
    ['3안 연구 분야 키 하나 빠짐', 'csrankings', t => { t.fields.splice(1, 1); }, 'csrankings: 연구 분야가 26개예요(CSRankings 키마다 하나, 27개)'],
    ['3안 직무가 g-job 밖', 'csrankings', t => { t.fields[27].group = 'g-ai'; }, 'csrankings: 직무 backend가 g-job에 없어요'],
    ['chosen 꼴', 'custom', t => { t.chosen = { date: '어제', corePrecision: { num: 3, den: 2 }, prompt: 'zz', model: '' }; }, 'custom: chosen 꼴이 틀려요(date, corePrecision, prompt, model)']
  ])('위반: %s', (_name, id, change, message) => {
    expect(broken(id, change)).toContain(message);
  });

  it('위반을 모두 모은다', () => {
    expect(broken('custom', t => { t.fields[0].desc = ''; t.fields[1].group = 'g-zz'; })).toHaveLength(2);
  });
});

describe('LLM용 이름 · 글자 수 · 묶음 경로', () => {
  it('이름이 겹치면 이름 (묶음 이름)이고, 그래도 겹치면 위반이다', () => {
    const t = validList('custom');
    t.fields[1].name = t.fields[0].name; // 0은 g-a0, 1은 g-a1
    expect(labelsOf(t).nameOf.get(t.fields[1].id)).toBe(`${t.fields[0].name} (묶음 1)`);
    expect(labelsOf(t).idOf.get(`${t.fields[0].name} (묶음 0)`)).toBe(t.fields[0].id);
    expect(checkTaxonomy(t)).toEqual([]);
    t.fields[9].name = t.fields[0].name; // 9도 g-a0
    expect(checkTaxonomy(t)).toContain(`custom: LLM용 이름이 겹쳐요: ${t.fields[0].name} (묶음 0)`);
  });

  it('목록 글자 수는 묶음 이름 + 분야 이름 + 설명이고, 묶음 경로는 위에서부터 › 로 잇는다', () => {
    const t = validList('ncs');
    const chars = '정보통신정보기술'.length + t.fields.reduce((n, f) => n + f.name.length + f.desc.length, 0);
    expect(listChars(t)).toBe(chars);
    expect(groupPath(t, 'ncs-2001')).toBe('정보통신 › 정보기술');
    expect(groupPath(validList('custom'), 'g-a3')).toBe('묶음 3');
  });
});

describe('loadTaxonomy · readList', () => {
  it('꼴이 맞는 파일을 읽는다', () => {
    const dir = tmp();
    save(dir, validList('custom'));
    expect(loadTaxonomy('custom', dir)).toEqual(validList('custom'));
  });

  it.each<[string, unknown, string]>([
    ['파일 없음', null, '분야 목록 파일이 없어요'],
    ['id가 다름', { ...validList('ncs') }, 'id가 custom이 아니에요'],
    ['fields 꼴', { ...validList('custom'), fields: [{ id: 'x' }] }, 'fields 꼴이 틀려요'],
    ['chosen 꼴', { ...validList('custom'), chosen: { date: '2026-11-20' } }, 'chosen 꼴이 틀려요']
  ])('던진다: %s', (_name, content, reason) => {
    const dir = tmp();
    if (content !== null) save(dir, content);
    expect(() => loadTaxonomy('custom', dir)).toThrow(reason);
  });

  it('readList는 검사 위반을 모두 담아 던진다', () => {
    const dir = tmp();
    save(dir, { ...validList('custom'), fields: validList('custom').fields.slice(0, 79) });
    expect(() => readList('custom', dir)).toThrow('custom: 분야가 79개예요(80~120개)');
    save(dir, validList('custom'));
    expect(readList('custom', dir).fields).toHaveLength(80);
  });
});

describe('findChosen · fieldGate (research R12)', () => {
  const chosen = (num: number, den = 100): Chosen => ({ date: '2026-11-20', corePrecision: { num, den }, prompt: '1a2b3c4d', model: 'gemma4:12b' });
  const pick = (id: TaxonomyId, c: Chosen | null) => ({ ...validList(id), chosen: c });

  it('고른 안이 없으면 null, 하나면 그 안, 둘 이상이면 던진다', () => {
    expect(findChosen(TAXONOMY_IDS.map(validList))).toBeNull();
    expect(findChosen([pick('custom', null), pick('ncs', chosen(88))])?.id).toBe('ncs');
    expect(() => findChosen([pick('custom', chosen(88)), pick('ncs', chosen(90)), pick('csrankings', null)])).toThrow('고른 안이 둘 이상이에요: custom, ncs');
  });

  it('판정 판 → 모델 → 정밀도 순으로 처음 걸린 이유 하나를 낸다', () => {
    const t = { ...pick('custom', chosen(88)), chosen: chosen(88) };
    expect(fieldGate(t, '1a2b3c4d', 'gemma4:12b')).toEqual({ ok: true });
    expect(fieldGate(t, '5e6f7a8b', 'qwen:7b')).toEqual({ reason: '고른 안 custom을 고른 뒤 판정 판이 바뀌어(1a2b3c4d → 5e6f7a8b) 분야를 넣지 않았어요. 다시 재고 고르세요' });
    expect(fieldGate(t, '1a2b3c4d', 'qwen:7b')).toEqual({ reason: '고른 안 custom은 gemma4:12b로 쟀는데 지금 모델은 qwen:7b이라 분야를 넣지 않았어요' });
    const low = { ...t, chosen: chosen(84) };
    expect(fieldGate(low, '1a2b3c4d', 'gemma4:12b')).toEqual({ reason: '고른 안 custom의 핵심 정밀도 84.0% (84/100) < 85%라 분야를 넣지 않았어요' });
    expect(fieldGate({ ...t, chosen: chosen(85) }, '1a2b3c4d', 'gemma4:12b')).toEqual({ ok: true });
  });
});

// T010: 저장소의 세 목록 파일. 파일이 없으면 loadTaxonomy가 던져 실패한다(CI도 이 파일들로 검사한다)
describe('저장소 목록 파일', () => {
  const lists = TAXONOMY_IDS.map(id => loadTaxonomy(id));

  it.each(TAXONOMY_IDS)('%s.json은 꼴과 규칙을 통과한다', id => {
    expect(checkTaxonomy(loadTaxonomy(id))).toEqual([]);
  });

  it('고른 안은 많아야 하나다', () => {
    expect(() => findChosen(lists)).not.toThrow();
  });

  it('1안·3안의 직무는 research R8 표 그대로이고 두 안이 같다(임베딩 글이 같아야 한다)', () => {
    const jobs = (t: Taxonomy) => t.fields.filter(f => f.group === 'g-job');
    const [custom, , csr] = lists;
    expect(jobs(custom).map(f => [f.id, f.name])).toEqual(JOBS);
    expect(jobs(csr)).toEqual(jobs(custom));
    expect(custom.groups.find(g => g.id === 'g-job')?.name).toBe(csr.groups.find(g => g.id === 'g-job')?.name);
  });

  it('1안·3안의 courseMap은 csr과 교과 지도 줄의 areas가 겹치는 분야다(research R8)', () => {
    for (const t of [lists[0], lists[2]]) {
      for (const row of SWE.fields.filter(r => r.layer === 'field')) {
        expect(t.courseMap[row.id]).toEqual(t.fields.filter(f => f.csr.some(k => (row.areas as string[]).includes(k))).map(f => f.id));
      }
    }
  });
});
