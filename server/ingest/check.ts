// 결과 파일 검사(research R11): 계약(specs/20261107-193624-cse-notice-opportunities/contracts/cse-notices.schema.json)의 규칙을 손으로 옮긴다.
// 어긋난 곳을 모두 '경로: 이유'로 돌려준다. 빈 배열이면 통과다. 분야 id는 넣을 목록에 있는지도 본다
import type { Taxonomy } from '../../etl/taxonomy/taxonomy.ts';

export const KINDS = ['job', 'lecture', 'hackathon', 'contest', 'edu', 'club', 'volunteer', 'mentoring', 'global', 'scholarship', 'course'] as const;
const SOURCE = 'https://cse.skku.edu/cse/notice.do';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^cse:\d+$/;
const URL_RE = /^https:\/\/cse\.skku\.edu\/cse\/notice\.do\?mode=view&articleNo=\d+$/;
const RULE = /^(제목|게시판|LLM): .+$/;
const DEADLINE_RULE = /^(본문: .+|본문·제목|제목|행사 날: (제목|본문))$/;
const OPP_KEYS = ['id', 'title', 'url', 'postedAt', 'host', 'kind', 'deadline', 'rule', 'deadlineRule'];
const REVIEW_KEYS = ['id', 'title', 'url', 'postedAt', 'why'];

export type ResultOpportunity = {
  id: string; title: string; url: string; postedAt: string; host: string | null; kind: (typeof KINDS)[number];
  deadline: string | null; rule: string; deadlineRule: string | null; fields?: { core: string[]; related: string[] }; fieldRule?: string;
};
export type ResultReview = { id: string; title: string; url: string; postedAt: string; why: string };
export type ResultFile = { source: string; collectedAt: string; since: string; taxonomy?: { id: string; prompt: string }; opportunities: ResultOpportunity[]; review: ResultReview[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
export const isDate = (v: unknown) => isStr(v) && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export function checkResultFile(o: unknown, t: Taxonomy | null): string[] {
  const bad: string[] = [];
  const say = (path: string, why: string) => { bad.push(`${path}: ${why}`); };
  if (!isObj(o)) return ['파일: JSON 객체가 아니에요'];
  for (const k of Object.keys(o)) if (!['source', 'collectedAt', 'since', 'taxonomy', 'opportunities', 'review'].includes(k)) say(k, '모르는 칸이에요');
  if (o.source !== SOURCE) say('source', `${SOURCE}가 아니에요`);
  if (!isStr(o.collectedAt) || Number.isNaN(Date.parse(o.collectedAt)) || !o.collectedAt.includes('T')) say('collectedAt', '때(ISO) 꼴이 아니에요');
  if (!isDate(o.since)) say('since', '날짜 꼴이 아니에요');
  if (o.taxonomy !== undefined) {
    const x = o.taxonomy;
    if (!isObj(x) || Object.keys(x).some(k => k !== 'id' && k !== 'prompt') || !['custom', 'ncs', 'csrankings'].includes(String(x.id)) || !isStr(x.prompt) || !/^[0-9a-f]{8}$/.test(x.prompt)) say('taxonomy', '{ id, prompt } 꼴이 아니에요');
  }
  const known = t ? new Set(t.fields.map(f => f.id)) : null;
  const seen = new Set<string>();
  const common = (x: Record<string, unknown>, p: string) => {
    if (!isStr(x.id) || !ID.test(x.id)) say(`${p}.id`, "'cse:<글 번호>' 꼴이 아니에요");
    else if (seen.has(x.id)) say(`${p}.id`, `${x.id}가 두 번 나와요`);
    else seen.add(x.id);
    if (!isStr(x.title) || !x.title) say(`${p}.title`, '비었어요');
    if (!isStr(x.url) || !URL_RE.test(x.url)) say(`${p}.url`, '공지 주소 꼴이 아니에요');
    if (!isDate(x.postedAt)) say(`${p}.postedAt`, '날짜 꼴이 아니에요');
  };
  if (!Array.isArray(o.opportunities)) say('opportunities', '배열이 아니에요');
  else for (const [i, x] of o.opportunities.entries()) {
    const p = `opportunities[${i}]`;
    if (!isObj(x)) { say(p, '객체가 아니에요'); continue; }
    for (const k of Object.keys(x)) if (![...OPP_KEYS, 'fields', 'fieldRule'].includes(k)) say(`${p}.${k}`, '모르는 칸이에요');
    for (const k of OPP_KEYS) if (!(k in x)) say(`${p}.${k}`, '빠졌어요');
    common(x, p);
    if (x.host !== null && (!isStr(x.host) || !x.host)) say(`${p}.host`, '빈 글자이거나 글자가 아니에요');
    if (!(KINDS as readonly unknown[]).includes(x.kind)) say(`${p}.kind`, `모르는 종류예요: ${String(x.kind)}`);
    if (x.deadline !== null && !isDate(x.deadline)) say(`${p}.deadline`, '날짜나 null이 아니에요');
    if (!isStr(x.rule) || !RULE.test(x.rule)) say(`${p}.rule`, '근거 꼴이 아니에요');
    if (x.deadline === null ? x.deadlineRule !== null : !isStr(x.deadlineRule) || !DEADLINE_RULE.test(x.deadlineRule)) say(`${p}.deadlineRule`, '마감과 마감 근거가 맞지 않아요');
    if (('fields' in x) !== ('fieldRule' in x)) say(`${p}.fields`, 'fields와 fieldRule은 함께 있어야 해요');
    if ('fieldRule' in x && (!isStr(x.fieldRule) || !/^LLM: .+$/.test(x.fieldRule))) say(`${p}.fieldRule`, "'LLM: <모델>' 꼴이 아니에요");
    if ('fields' in x) {
      const f = x.fields;
      const list = (v: unknown, max: number) => Array.isArray(v) && v.length <= max && v.every(isStr) && new Set(v).size === v.length;
      if (!isObj(f) || Object.keys(f).some(k => k !== 'core' && k !== 'related') || !list(f.core, 2) || !list(f.related, 5)) say(`${p}.fields`, '핵심 2개·관련 5개까지, 칸 안 중복 없음이 아니에요');
      else {
        const [core, related] = [f.core as string[], f.related as string[]];
        if (core.some(id => related.includes(id))) say(`${p}.fields`, '핵심과 관련이 겹쳐요');
        if (!o.taxonomy) say(`${p}.fields`, '머리에 taxonomy가 없는데 분야가 있어요');
        for (const [lv, ids] of [['core', core], ['related', related]] as const) for (const [j, id] of ids.entries()) {
          if (known && !known.has(id)) say(`${p}.fields.${lv}[${j}]`, `'${id}'는 분야 목록 ${t?.id}에 없어요`);
        }
      }
    }
  }
  if (!Array.isArray(o.review)) say('review', '배열이 아니에요');
  else for (const [i, x] of o.review.entries()) {
    const p = `review[${i}]`;
    if (!isObj(x)) { say(p, '객체가 아니에요'); continue; }
    for (const k of Object.keys(x)) if (!REVIEW_KEYS.includes(k)) say(`${p}.${k}`, '모르는 칸이에요');
    for (const k of REVIEW_KEYS) if (!(k in x)) say(`${p}.${k}`, '빠졌어요');
    common(x, p);
    if (!isStr(x.why) || !x.why) say(`${p}.why`, '비었어요');
  }
  return bad;
}
