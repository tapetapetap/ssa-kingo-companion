// 분야 판정 지표: 비율 꼴과 표시, 실행 기록 고르기, 안 하나의 지표 계산(research R10·R16, data-model 6).
// 타입만 가져온다(taxonomy.ts가 이 파일의 비율 함수를 쓰므로 실행 시 순환이 생기지 않게)
import type { Taxonomy } from '../taxonomy/taxonomy.ts';
import type { FieldAnswer } from './fields.ts';
import type { GoldLabel } from './gold.ts';

/** 비율은 반올림하지 않고 분자·분모로 둔다 */
export type Ratio = { num: number; den: number };
export const ratio = (num: number, den: number): Ratio => ({ num, den });

/** 기준 비교는 정수로 한다(eval.ts와 같은 이유: 17/20이 85%를 넘는다). 분모가 0이면 통과가 아니다 */
export const passes = (r: Ratio) => r.den > 0 && r.num * 100 >= 85 * r.den;

/** 내림이라 미달인 값이 85.0%로 보이지 않는다 */
export const pct = (r: Ratio) => (r.den === 0 ? '해당 없음' : `${(Math.floor((r.num * 1000) / r.den) / 10).toFixed(1)}% (${r.num}/${r.den})`);

/** judge가 실행마다 남기는 줄(data-model 3) */
export type RunLine = {
  start: string; end: string; limit: number | null; total: number; cached: number; fresh: number; failed: number; notAsked: number;
  noTemp: number; empty: number; requests: number; requestMs: number; gpuAvg: number | null; tempMax: number | null; loadLog: string | null;
};

/** 판정 시간·부하로 쓸 줄: limit이 null인 줄 가운데 cached가 가장 작은 줄, 같으면 마지막 줄.
 *  실패를 채운 재실행과 확인 실행은 cached가 커서 첫 전체 실행을 덮지 않는다(research R16) */
export function pickRun(lines: RunLine[]): RunLine | null {
  let best: RunLine | null = null;
  for (const l of lines) if (l.limit === null && (best === null || l.cached <= best.cached)) best = l;
  return best;
}

/** gold는 표본 120건(갈림 O가 없는 정답), answers는 보관 답(없으면 실패), candidates는 표본 글의 후보.
 *  prompt(판정 판)와 listChars는 부르는 쪽이 계산해 넣는다 */
export type ScoreInput = {
  t: Taxonomy; prompt: string; listChars: number; nos: number[]; answers: Map<number, FieldAnswer>; gold: Map<number, GoldLabel>;
  candidates: Map<number, string[]>; docs: Map<number, { link: string; title: string }>; run: RunLine;
};

const EMPTY: FieldAnswer = { core: [], related: [] };
const all = (a: FieldAnswer) => [...a.core, ...a.related]; // 핵심과 관련은 겹치지 않아 합이 곧 합집합이다
const hits = (xs: string[], ys: string[]) => xs.filter(x => ys.includes(x)).length;
export const sameSet = (xs: string[], ys: string[]) => xs.length === ys.length && hits(xs, ys) === xs.length;
const round1 = (x: number) => Math.round(x * 10) / 10;
const pair = (a: FieldAnswer) => ({ core: a.core, related: a.related });

/** 안 하나의 지표(data-model 6 taxonomies의 한 칸, research R10). 맞은 비율은 표본을 모두 합쳐(micro) 센다 */
export function scoreTaxonomy(x: ScoreInput) {
  const sample = [...x.gold.keys()].sort((a, b) => a - b);
  const s = { cp: 0, cpd: 0, crd: 0, tr: 0, trd: 0, rp: 0, rpd: 0, cc: 0, ca: 0, exact: 0, overlap: 0 };
  for (const no of sample) {
    const g = x.gold.get(no);
    if (!g) continue;
    const [llm, gold, cand] = [x.answers.get(no) ?? EMPTY, g.final ?? EMPTY, x.candidates.get(no) ?? []];
    s.cp += hits(llm.core, gold.core);
    s.cpd += llm.core.length;
    s.crd += gold.core.length;
    s.tr += hits(all(llm), all(gold));
    s.trd += all(gold).length;
    s.rp += hits(llm.related, all(gold));
    s.rpd += llm.related.length;
    s.cc += hits(gold.core, cand);
    s.ca += hits(all(gold), cand);
    if (sameSet(g.a.core, g.b.core)) s.exact++;
    // 둘 다 핵심을 비운 글은 두 비율 모두에 맞음이다
    if ((!g.a.core.length && !g.b.core.length) || hits(g.a.core, g.b.core) > 0) s.overlap++;
  }

  let [blankCore, blankAll, failed] = [0, 0, 0];
  const coreCount = new Map<string, number>();
  const used = new Set<string>();
  for (const no of x.nos) {
    const a = x.answers.get(no);
    if (!a) {
      failed++;
      continue;
    }
    if (!a.core.length) blankCore++;
    if (!all(a).length) blankAll++;
    for (const id of a.core) coreCount.set(id, (coreCount.get(id) ?? 0) + 1);
    for (const id of all(a)) used.add(id);
  }
  const ranked = [...coreCount].sort(([ia, a], [ib, b]) => b - a || (ia < ib ? -1 : 1));
  const coreTotal = ranked.reduce((n, [, c]) => n + c, 0);
  const unusedIds = x.t.fields.filter(f => !used.has(f.id)).map(f => f.id);
  const asked = x.run.fresh + x.run.failed;
  const doc = (no: number) => x.docs.get(no) ?? { link: '', title: '' };

  return {
    id: x.t.id, name: x.t.name, edition: x.t.edition, prompt: x.prompt, groups: x.t.groups.length, fields: x.t.fields.length, listChars: x.listChars,
    run: { start: x.run.start, end: x.run.end, cached: x.run.cached, fresh: x.run.fresh, failed: x.run.failed, requests: x.run.requests, gpuAvg: x.run.gpuAvg, tempMax: x.run.tempMax },
    metrics: {
      corePrecision: ratio(s.cp, s.cpd), coreRecall: ratio(s.cp, s.crd), totalRecall: ratio(s.tr, s.trd), relatedPrecision: ratio(s.rp, s.rpd),
      candidateCore: ratio(s.cc, s.crd), candidateAll: ratio(s.ca, s.trd),
      agreeExact: ratio(s.exact, sample.length), agreeOverlap: ratio(s.overlap, sample.length),
      blankCore: ratio(blankCore, x.nos.length), blankAll: ratio(blankAll, x.nos.length),
      top3Share: ratio(ranked.slice(0, 3).reduce((n, [, c]) => n + c, 0), coreTotal),
      unused: unusedIds.length, unusedShare: ratio(unusedIds.length, x.t.fields.length),
      failRate: ratio(failed, x.nos.length),
      secPerAsk: asked ? round1(x.run.requestMs / asked / 1000) : null,
      wallMinutes: round1((Date.parse(x.run.end) - Date.parse(x.run.start)) / 60_000),
      courseMapRows: Object.values(x.t.courseMap).filter(v => v.length).length
    },
    top: ranked.slice(0, 10).map(([field, count]) => ({ field, count })),
    unusedIds,
    misses: sample.filter(no => !sameSet((x.answers.get(no) ?? EMPTY).core, (x.gold.get(no)?.final ?? EMPTY).core)).slice(0, 10)
      .map(no => ({ ...doc(no), llm: pair(x.answers.get(no) ?? EMPTY), gold: pair(x.gold.get(no)?.final ?? EMPTY) })),
    splits: {
      count: sample.filter(no => x.gold.get(no)?.split === 'C').length,
      examples: sample.filter(no => x.gold.get(no)?.split === 'C').slice(0, 10).map(no => {
        const g = x.gold.get(no);
        return { ...doc(no), a: pair(g?.a ?? EMPTY), b: pair(g?.b ?? EMPTY) };
      })
    }
  };
}
export type TaxonomyScore = ReturnType<typeof scoreTaxonomy>;
