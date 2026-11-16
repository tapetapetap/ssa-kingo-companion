import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { validList } from '../taxonomy/fixtures.ts';
import type { Taxonomy } from '../taxonomy/taxonomy.ts';
import type { NoticeRow } from './cse.ts';
import { CANDIDATE_RULE, type Embed } from './embed.ts';
import {
  countField, fieldPart, fieldParts, fieldVersion, makeFieldAsk, newStats, parseFieldAnswer, readFieldAnswer, schemaFor, systemFor, type FieldAnswer, type FieldOutcome
} from './fields.ts';
import { modelDir, PROMPT_PARTS, versionOf, type Post } from './llm.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'fields-'));
const row = (no: number): NoticeRow => ({ no, title: '[가나다] 드론 영상 분석 대회 참가자 모집', board: '행사/세미나', postedAt: '2026-11-01', pinned: false });
const BODY = ['드론으로 찍은 영상에서 사람을 찾는 모델을 겨뤄요'];
/** 이름이 겹친 분야가 있는 시험용 목록: ncs-200101과 ncs-200103의 이름이 같다 */
const dupList = () => {
  const t = validList('ncs');
  t.groups.push({ id: 'ncs-2002', name: '통신기술', parent: 'ncs-20' });
  t.fields[2] = { ...t.fields[2], name: t.fields[0].name, group: 'ncs-2002' };
  return t;
};
const answer = (core: string[], related: string[] = []) => JSON.stringify({ 핵심: core, 관련: related });
const reply = (content: string, n?: number) => ({ status: 200, text: async () => JSON.stringify({ message: { content }, ...(n === undefined ? {} : { prompt_eval_count: n }) }) });
const postOf = (...contents: string[]) => vi.fn<Post>(async () => reply(contents.length > 1 ? contents.shift()! : contents[0], 1200));
/** 분야 글에 '채움'이 있으면 공지와 같은 쪽 벡터라 후보가 된다(가짜 임베딩, 직접 만든 값) */
const embedOf = (fields: 'ok' | 'fail' | 'down' = 'ok', notice: 'ok' | 'fail' | 'down' = 'ok') => vi.fn(async (texts: string[]) => {
  const isField = texts[0].includes(' > ');
  const out = isField ? fields : notice;
  return out !== 'ok' ? out : texts.map(s => (!isField || s.includes('채움') ? [1, 0] : [0, 1]));
}) satisfies Embed;

describe('지시문과 스키마 (contracts/field-llm.md)', () => {
  it('지시문에는 후보만 묶음 순서대로 "## 묶음 경로"와 "- 이름: 설명" 줄로 들어간다', () => {
    const t = validList('ncs');
    const text = systemFor(t, ['ncs-200103', 'ncs-200101']);
    expect(text.endsWith('## 정보통신 › 정보기술\n- 정보기술전략·계획: 세분류 0가, 세분류 0나\n- 정보기술운영: 세분류 2가, 세분류 2나')).toBe(true);
    expect(text).not.toContain('정보기술개발');
    expect(text.startsWith(fieldParts(t).system)).toBe(true);
  });

  it('이름이 겹친 분야는 목록 줄과 enum 모두 "이름 (묶음 이름)"이다', () => {
    const t = dupList();
    const ids = t.fields.map(f => f.id);
    expect(systemFor(t, ids)).toContain('- 정보기술전략·계획 (통신기술): ');
    expect(schemaFor(t, ids)).toEqual({
      type: 'object',
      properties: {
        핵심: { type: 'array', items: { enum: ['정보기술전략·계획 (정보기술)', '정보기술개발', '정보기술전략·계획 (통신기술)'] }, maxItems: 2 },
        관련: { type: 'array', items: { enum: ['정보기술전략·계획 (정보기술)', '정보기술개발', '정보기술전략·계획 (통신기술)'] }, maxItems: 5 }
      },
      required: ['핵심', '관련']
    });
  });
});

describe('parseFieldAnswer: 답 정리', () => {
  const t = validList('csrankings');
  const ids = ['ai', 'vision', 'mlmining', 'nlp', 'inforet', 'arch', 'comm', 'backend'];
  it.each<[string, string, FieldAnswer | null]>([
    ['정상', answer(['컴퓨터 비전'], ['인공지능', '백엔드']), { core: ['vision'], related: ['ai', 'backend'] }],
    ['코드 블록', `\`\`\`json\n${answer([], ['인공지능'])}\n\`\`\``, { core: [], related: ['ai'] }],
    ['둘 다 빔(분야 없음)', answer([]), { core: [], related: [] }],
    ['같은 이름은 한 번만', answer(['인공지능', '인공지능'], ['머신러닝', '머신러닝']), { core: ['ai'], related: ['mlmining'] }],
    ['겹치면 핵심에만', answer(['인공지능'], ['인공지능', '머신러닝']), { core: ['ai'], related: ['mlmining'] }],
    ['넘치면 앞에서부터', answer(['인공지능', '컴퓨터 비전', '머신러닝'], ['자연어 처리', '웹·정보 검색', '컴퓨터 구조', '컴퓨터 네트워크', '백엔드', '머신러닝']),
      { core: ['ai', 'vision'], related: ['nlp', 'inforet', 'arch', 'comm', 'backend'] }],
    ['후보 밖 이름(목록 안이어도)', answer(['프론트엔드']), null],
    ['목록 밖 이름', answer(['양자']), null],
    ['칸이 배열이 아님', JSON.stringify({ 핵심: '인공지능', 관련: [] }), null],
    ['칸이 빠짐', JSON.stringify({ 핵심: [] }), null],
    ['JSON이 아님', '인공지능입니다', null]
  ])('%s', (_name, text, expected) => {
    expect(parseFieldAnswer(text, t, ids)).toEqual(expected);
  });
});

describe('판정 판', () => {
  it('재료는 지시문 틀·사용자 틀·스키마 틀·think·options·자르기 기준·목록·후보 규칙이고, 하나만 바뀌어도 바뀐다', () => {
    const t = validList('custom');
    const parts = fieldParts(t);
    expect(Object.keys(parts).sort()).toEqual(['candidates', 'key', 'limits', 'options', 'schema', 'system', 'taxonomy', 'think', 'user']);
    expect(parts).toMatchObject({ user: PROMPT_PARTS.user, limits: PROMPT_PARTS.limits, key: PROMPT_PARTS.key, think: false, options: { temperature: 0, num_ctx: 32768 }, candidates: CANDIDATE_RULE });
    expect(parts.schema).toEqual(schemaFor(t, []));
    expect(fieldVersion(t)).toBe(versionOf(parts));
    const changed = (change: (x: Taxonomy) => void) => { const x = validList('custom'); change(x); return fieldVersion(x); };
    expect(changed(x => { x.fields[0].desc += '.'; })).not.toBe(fieldVersion(t));
    expect(changed(x => { x.groups[0].name += '.'; })).not.toBe(fieldVersion(t));
    expect(versionOf({ ...parts, candidates: { ...CANDIDATE_RULE, k: 31 } })).not.toBe(fieldVersion(t));
    expect(versionOf({ ...parts, candidates: { ...CANDIDATE_RULE, model: 'nomic-embed-text' } })).not.toBe(fieldVersion(t));
    // 고른 표시·목록 판은 판정 판을 바꾸지 않는다(choose가 chosen을 써도 판이 그대로다)
    expect(changed(x => { x.chosen = { date: '2026-11-20', corePrecision: { num: 1, den: 1 }, prompt: '1a2b3c4d', model: 'm' }; x.edition = '2026-12-01'; })).toBe(fieldVersion(t));
  });
});

describe('makeFieldAsk', () => {
  it('분야가 30개 이하면 임베딩 없이 모두 후보이고, 보관은 <모델>/<안 id>-<판정 판>/<번호>.json이다', async () => {
    const [dir, embed] = [tmp(), embedOf()];
    const small = validList('ncs');
    const post = postOf(answer(['정보기술개발']));
    const ask = makeFieldAsk({ taxonomy: small, embed, model: 'm:1', dir, post });
    expect([ask.model, ask.version, ask.taxonomyId]).toEqual(['m:1', fieldVersion(small), 'ncs']);
    expect(await ask(row(7), BODY)).toEqual({ answer: { core: ['ncs-200102'], related: [] }, cached: false });
    expect(embed).not.toHaveBeenCalled();
    const kept = JSON.parse(readFileSync(join(dir, modelDir('m:1'), `ncs-${fieldVersion(small)}`, '7.json'), 'utf8'));
    expect(kept).toMatchObject({ model: 'm:1', taxonomy: 'ncs', prompt: fieldVersion(small), promptTokens: 1200, answer: { core: ['ncs-200102'], related: [] } });
    const body = JSON.parse(post.mock.calls[0][1]);
    expect(body).toMatchObject({ model: 'm:1', options: { num_ctx: 32768 }, format: schemaFor(small, small.fields.map(f => f.id)) });
    expect(body.messages[1].content).toContain('제목: [가나다] 드론 영상 분석 대회 참가자 모집');
  });

  it('보관이 있으면 LLM도 임베딩도 부르지 않는다', async () => {
    const dir = tmp();
    await makeFieldAsk({ taxonomy: validList('custom'), embed: embedOf(), dir, embedDir: tmp(), post: postOf(answer(['채움 1'])) })(row(7), BODY);
    const [embed, post] = [embedOf(), postOf(answer([]))];
    expect(await makeFieldAsk({ taxonomy: validList('custom'), embed, dir, post })(row(7), BODY)).toMatchObject({ cached: true });
    expect(embed).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('분야가 30개를 넘으면 임베딩이 고른 후보 30개만 지시문에 들어가고, 후보 밖 답은 실패다', async () => {
    const t = validList('custom'); // 80개 중 채움 42개가 공지와 가깝다
    const post = postOf(answer(['백엔드']), answer(['채움 3'], ['채움 29']));
    const ask = makeFieldAsk({ taxonomy: t, embed: embedOf(), dir: tmp(), embedDir: tmp(), post });
    expect(await ask(row(1), BODY)).toBe('fail');
    const system: string = JSON.parse(post.mock.calls[0][1]).messages[0].content;
    expect(system.split('\n').filter(l => l.startsWith('- 채움 '))).toHaveLength(30);
    expect(system).not.toContain('- 채움 30:');
    expect(system).not.toContain('- 백엔드:');
    expect(await ask(row(2), BODY)).toEqual({ answer: { core: ['fill-3'], related: ['fill-29'] }, cached: false });
  });

  it.each(['fail', 'down'] as const)('공지 벡터가 %s면 LLM에 묻지 않고 그 결과다', async out => {
    const post = postOf(answer([]));
    const ask = makeFieldAsk({ taxonomy: validList('custom'), embed: embedOf('ok', out), dir: tmp(), embedDir: tmp(), post });
    expect(await ask(row(1), BODY)).toBe(out);
    expect(post).not.toHaveBeenCalled();
  });

  it('분야 벡터는 판정기 하나에 한 번 갖춘다. 성공과 fail은 기억하고 down은 기억하지 않는다', async () => {
    const ok = embedOf();
    const ask = makeFieldAsk({ taxonomy: validList('custom'), embed: ok, dir: tmp(), embedDir: tmp(), post: postOf(answer([])) });
    await ask(row(1), BODY);
    await ask(row(2), BODY);
    expect(ok.mock.calls.filter(c => c[0][0].includes(' > '))).toHaveLength(3); // 80개를 32개씩 한 번만
    for (const [out, calls] of [['fail', 1], ['down', 2]] as const) {
      const embed = embedOf(out);
      const failing = makeFieldAsk({ taxonomy: validList('custom'), embed, dir: tmp(), embedDir: tmp(), post: postOf(answer([])) });
      expect(await failing(row(1), BODY)).toBe(out);
      expect(await failing(row(2), BODY)).toBe(out);
      expect(embed).toHaveBeenCalledTimes(calls);
    }
  });
});

describe('readFieldAnswer · 셈', () => {
  it('makeFieldAsk가 쓴 파일을 요청 없이 읽는다. 꼴 틀림·목록 밖 id·다른 판이면 null이다', async () => {
    const [dir, t] = [tmp(), validList('ncs')];
    await makeFieldAsk({ taxonomy: t, embed: embedOf(), model: 'm', dir, post: postOf(answer(['정보기술운영'])) })(row(5), BODY);
    expect(readFieldAnswer(t, 'm', 5, dir)).toEqual({ core: ['ncs-200103'], related: [] });
    expect(readFieldAnswer(t, 'm', 6, dir)).toBeNull();
    expect(readFieldAnswer(t, 'other', 5, dir)).toBeNull();
    const changed = validList('ncs');
    changed.fields[0].desc += '.';
    expect(readFieldAnswer(changed, 'm', 5, dir)).toBeNull();
    const folder = join(dir, 'm', `ncs-${fieldVersion(t)}`);
    mkdirSync(folder, { recursive: true });
    for (const [no, a] of [[8, { core: ['nope'], related: [] }], [9, { core: ['ncs-200101', 'ncs-200102', 'ncs-200103'], related: [] }], [10, { core: 'x' }]] as const) {
      writeFileSync(join(folder, `${no}.json`), JSON.stringify({ answer: a }));
      expect(readFieldAnswer(t, 'm', no, dir)).toBeNull();
    }
  });

  it('셈과 요약 조각: 못 물음은 down과 본문 없음, 분야 없음은 둘 다 빈 답이다', () => {
    const s = newStats();
    const outs: (FieldOutcome | null)[] = [{ answer: { core: [], related: [] }, cached: true }, { answer: { core: ['a'], related: [] }, cached: false }, 'fail', 'down', null];
    for (const o of outs) countField(s, o);
    expect(s).toEqual({ cached: 1, fresh: 1, failed: 1, notAsked: 2, noTemp: 0, empty: 1 });
    expect(fieldPart(s)).toBe('분야 판정 5(보관 1 · 새로 1 · 실패 1 · 못 물음 2 · 분야 없음 1)');
  });
});
