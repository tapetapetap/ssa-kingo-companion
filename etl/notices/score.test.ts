import { describe, expect, it } from 'vitest';
import { validList } from '../taxonomy/fixtures.ts';
import type { FieldAnswer } from './fields.ts';
import type { GoldLabel } from './gold.ts';
import { passes, pct, pickRun, ratio, scoreTaxonomy, type RunLine, type ScoreInput } from './score.ts';

describe('ratio · passes · pct (research R10)', () => {
  it('기준은 정수로 비교한다: 84/100은 미달, 85/100은 통과', () => {
    expect(ratio(84, 100)).toEqual({ num: 84, den: 100 });
    expect(passes(ratio(84, 100))).toBe(false);
    expect(passes(ratio(85, 100))).toBe(true);
    expect(passes(ratio(17, 20))).toBe(true);
    expect(passes(ratio(0, 0))).toBe(false);
  });

  it('표시는 소수 첫째 자리까지 내림하고 분자·분모를 붙인다. 분모가 0이면 해당 없음', () => {
    expect(pct(ratio(147, 173))).toBe('84.9% (147/173)');
    expect(pct(ratio(85, 100))).toBe('85.0% (85/100)');
    expect(pct(ratio(2, 3))).toBe('66.6% (2/3)');
    expect(pct(ratio(0, 0))).toBe('해당 없음');
  });
});

const line = (o: Partial<RunLine>): RunLine => ({
  start: '2026-11-17T01:00:00.000Z', end: '2026-11-17T01:31:12.000Z', limit: null, total: 6, cached: 0, fresh: 3, failed: 1, notAsked: 0,
  noTemp: 0, empty: 1, requests: 8, requestMs: 10000, gpuAvg: 75.8, tempMax: 76.9, loadLog: null, ...o
});

describe('pickRun (research R16)', () => {
  it('limit이 null인 줄 가운데 cached가 가장 작은 줄, 같으면 마지막 줄이다', () => {
    const first = line({ cached: 0, end: '2026-11-17T02:00:00.000Z' });
    const last = line({ cached: 0, end: '2026-11-17T03:00:00.000Z' });
    expect(pickRun([line({ limit: 5, cached: 0 }), line({ cached: 3 }), first, last, line({ cached: 400 })])).toBe(last);
  });

  it('못 물은 글이 있거나 total이 0인 줄은 cached가 작아도 고르지 않는다', () => {
    const ok = line({ cached: 5 });
    expect(pickRun([ok, line({ cached: 0, notAsked: 3 }), line({ cached: 0, total: 0, fresh: 0, failed: 0 })])).toBe(ok);
    expect(pickRun([line({ notAsked: 1 })])).toBeNull();
  });

  it('--limit 줄만 있거나 줄이 없으면 null이다', () => {
    expect(pickRun([line({ limit: 5 })])).toBeNull();
    expect(pickRun([])).toBeNull();
  });
});

describe('scoreTaxonomy (손으로 센 값)', () => {
  const t = validList('csrankings'); // 분야 38개, courseMap은 vision 줄 하나
  const ans = (core: string[], related: string[] = []): FieldAnswer => ({ core, related });
  const g = (final: FieldAnswer, a: FieldAnswer = final, b: FieldAnswer = final): GoldLabel =>
    ({ a, b, final, split: JSON.stringify(a) === JSON.stringify(b) ? 'X' : 'C' });
  const doc = (no: number) => ({ link: `https://cse.skku.edu/cse/notice.do?mode=view&articleNo=${no}`, title: `제목 ${no}` });
  // 412건 자리는 1~6, 표본은 1~4. 4번은 보관 답이 없다(412건에서는 실패, 표본에서는 빈 답)
  const input: ScoreInput = {
    t, prompt: '1a2b3c4d', listChars: 999, nos: [1, 2, 3, 4, 5, 6],
    answers: new Map([[1, ans(['ai'], ['nlp'])], [2, ans(['vision', 'ai'])], [3, ans([], ['backend'])], [5, ans(['ai'])], [6, ans([])]]),
    gold: new Map([
      [1, g(ans(['ai'], ['vision']))],
      [2, g(ans(['vision'], ['mlmining']), ans(['vision']), ans(['ai']))],
      [3, g(ans([]))],
      [4, g(ans(['nlp']), ans(['nlp']), ans(['nlp', 'ai']))]
    ]),
    candidates: new Map([[1, ['ai', 'nlp']], [2, ['ai', 'mlmining']], [3, []], [4, ['nlp']]]),
    docs: new Map([1, 2, 3, 4].map(no => [no, doc(no)])),
    run: line({})
  };
  const out = scoreTaxonomy(input);

  it('머리 칸과 고른 실행 줄', () => {
    expect(out).toMatchObject({ id: 'csrankings', name: t.name, edition: t.edition, prompt: '1a2b3c4d', groups: 5, fields: 38, listChars: 999 });
    expect(out.run).toEqual({ start: '2026-11-17T01:00:00.000Z', end: '2026-11-17T01:31:12.000Z', cached: 0, fresh: 3, failed: 1, requests: 8, gpuAvg: 75.8, tempMax: 76.9 });
  });

  it('맞은 비율 넷과 후보 적중률 둘은 표본을 모두 합쳐(micro) 센다', () => {
    expect(out.metrics).toMatchObject({
      corePrecision: ratio(2, 3), coreRecall: ratio(2, 3), totalRecall: ratio(2, 5), relatedPrecision: ratio(0, 2),
      candidateCore: ratio(2, 3), candidateAll: ratio(3, 5)
    });
  });

  it('라벨러 일치도: 둘 다 빈 핵심은 두 비율 모두 맞음이다', () => {
    expect(out.metrics).toMatchObject({ agreeExact: ratio(2, 4), agreeOverlap: ratio(3, 4) });
  });

  it('412건 지표: 빈칸 둘, 상위 3 쏠림, 안 쓰인 분야, 실패율, 시간, 교과 지도 연결', () => {
    expect(out.metrics).toMatchObject({
      blankCore: ratio(2, 6), blankAll: ratio(1, 6), top3Share: ratio(4, 4), unused: 34, unusedShare: ratio(34, 38),
      failRate: ratio(1, 6), secPerAsk: 2.5, wallMinutes: 31.2, courseMapRows: 1
    });
    expect(out.unusedIds).toHaveLength(34);
    expect(out.unusedIds).not.toContain('backend');
    expect(out.top).toEqual([{ field: 'ai', count: 3 }, { field: 'vision', count: 1 }]);
  });

  it('갈린 예: LLM 핵심과 정답 핵심이 다른 표본 글, 라벨러가 갈린 글(C). 제목과 링크만 담는다', () => {
    expect(out.misses).toEqual([
      { ...doc(2), llm: ans(['vision', 'ai']), gold: ans(['vision'], ['mlmining']) },
      { ...doc(4), llm: ans([]), gold: ans(['nlp']) }
    ]);
    expect(out.splits).toEqual({ count: 2, examples: [{ ...doc(2), a: ans(['vision']), b: ans(['ai']) }, { ...doc(4), a: ans(['nlp']), b: ans(['nlp', 'ai']) }] });
  });

  it('top은 10개(같은 수는 id 순), misses·splits 예는 글 번호 순으로 10건까지. 새로·실패가 없으면 글당 시간은 null', () => {
    const ids = ['vision', 'ai', 'nlp', 'mlmining', 'inforet', 'arch', 'comm', 'sec', 'mod', 'da', 'bed', 'hpc'];
    const nos = ids.map((_, i) => 12 - i); // 12 → 1
    const many = scoreTaxonomy({
      ...input, nos,
      answers: new Map(nos.map((no, i) => [no, ans([ids[i]])])),
      gold: new Map(nos.map(no => [no, g(ans(['backend']), ans(['backend']), ans(['frontend']))])),
      candidates: new Map(), docs: new Map(nos.map(no => [no, doc(no)])), run: line({ fresh: 0, failed: 0 })
    });
    expect(many.top.map(x => x.field)).toEqual(['ai', 'arch', 'bed', 'comm', 'da', 'hpc', 'inforet', 'mlmining', 'mod', 'nlp']);
    expect(many.misses.map(m => m.link.split('=').pop())).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(many.splits.count).toBe(12);
    expect(many.splits.examples).toHaveLength(10);
    expect(many.metrics.secPerAsk).toBeNull();
    expect(many.metrics.candidateCore).toEqual(ratio(0, 12)); // 후보가 없는 글은 적중 0
  });
});
