import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validList } from '../../etl/taxonomy/fixtures.ts';
import { file, opp, review } from '../test/result.ts';
import { checkResultFile } from './check.ts';

const t = validList('custom');
const withFields = (f: unknown) => file({ taxonomy: { id: 'custom', prompt: '1a2b3c4d' }, opportunities: [opp(1, { fields: f, fieldRule: 'LLM: gemma4:12b' })] });

describe('checkResultFile (결과 파일 계약)', () => {
  it('맞는 파일과 저장소의 실제 결과 파일은 통과한다', () => {
    expect(checkResultFile(file(), t)).toEqual([]);
    expect(checkResultFile(withFields({ core: ['backend'], related: ['csr-ai'] }), t)).toEqual([]);
    expect(checkResultFile(JSON.parse(readFileSync(new URL('../../etl/out/cse-notices.json', import.meta.url), 'utf8')), t)).toEqual([]);
  });

  it.each<[string, unknown, string]>([
    ['객체 아님', [], '파일: JSON 객체가 아니에요'],
    ['모르는 머리 칸', file({ extra: 1 }), 'extra: 모르는 칸이에요'],
    ['출처', file({ source: 'x' }), 'source:'],
    ['수집 때', file({ collectedAt: '2026-11-10' }), 'collectedAt:'],
    ['기준일', file({ since: '2026-13-40' }), 'since:'],
    ['분야 목록 머리', file({ taxonomy: { id: 'x', prompt: '1' } }), 'taxonomy:'],
    ['필수 칸 빠짐', file({ opportunities: [{ ...opp(1), rule: undefined }].map(({ rule: _, ...x }) => x) }), 'opportunities[0].rule: 빠졌어요'],
    ['id 꼴', file({ opportunities: [opp(1, { id: 'x:1' })] }), 'opportunities[0].id:'],
    ['같은 id 두 번', file({ review: [review(1)], opportunities: [opp(1)] }), 'review[0].id: cse:1가 두 번 나와요'],
    ['주소 꼴', file({ opportunities: [opp(1, { url: 'http://x' })] }), 'opportunities[0].url:'],
    ['종류', file({ opportunities: [opp(1, { kind: 'party' })] }), '모르는 종류예요: party'],
    ['근거 꼴', file({ opportunities: [opp(1, { rule: '느낌' })] }), 'opportunities[0].rule:'],
    ['마감 없음인데 마감 근거', file({ opportunities: [opp(1, { deadline: null })] }), 'deadlineRule'],
    ['분야만 있고 근거 없음', file({ taxonomy: { id: 'custom', prompt: '1a2b3c4d' }, opportunities: [opp(1, { fields: { core: [], related: [] } })] }), 'fields와 fieldRule은 함께'],
    ['핵심 3개', withFields({ core: ['backend', 'frontend', 'qa'], related: [] }), '핵심 2개·관련 5개까지'],
    ['겹침', withFields({ core: ['backend'], related: ['backend'] }), '핵심과 관련이 겹쳐요'],
    ['목록에 없는 분야', withFields({ core: ['web-x'], related: [] }), "opportunities[0].fields.core[0]: 'web-x'는 분야 목록 custom에 없어요"],
    ['머리 없이 분야', file({ opportunities: [opp(1, { fields: { core: [], related: [] }, fieldRule: 'LLM: m' })] }), '머리에 taxonomy가 없는데'],
    ['확인 필요 이유 빔', file({ review: [{ ...review(3), why: '' }] }), 'review[0].why: 비었어요']
  ])('거절: %s', (_name, input, message) => {
    expect(checkResultFile(input, t).join('\n')).toContain(message);
  });
});
