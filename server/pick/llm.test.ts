import { describe, expect, it } from 'vitest';
import { checkPick, pickMaterial, pickSchema, PICK_VERSION, type Material } from './llm.ts';

const ans = (o: Record<string, unknown>) => JSON.stringify({ pick: 1, reason: '고른 분야와 맞아요', cited: [], ...o });

describe('가장 추천 답 검사 (contracts/llm.md 표)', () => {
  it('맞는 답은 0부터의 번호와 이유, 참고한 줄을 준다', () => {
    expect(checkPick(ans({ pick: 2, reason: ' 백엔드를 해 왔어요 ', cited: ['act:1', 'prompt'] }), 3, ['act:1'], true))
      .toEqual({ index: 1, reason: '백엔드를 해 왔어요', cited: ['act:1', 'prompt'] });
  });
  it.each<[string, string]>([
    ['JSON 아님', '고를게요'],
    ['칸 빠짐', JSON.stringify({ pick: 1, reason: 'x' })],
    ['타입 다름', ans({ pick: '1' })],
    ['후보 밖(0)', ans({ pick: 0 })],
    ['후보 밖(수보다 큼)', ans({ pick: 4 })],
    ['이유 빔', ans({ reason: '   ' })],
    ['이유 61자', ans({ reason: '가'.repeat(61) })],
    ['날짜 11월 20일', ans({ reason: '11월 20일까지예요' })],
    ['날짜 11/20', ans({ reason: '11/20 마감이에요' })],
    ['요일', ans({ reason: '금요일에 열려요' })],
    ['남은 날 수', ans({ reason: '3일 남았어요' })],
    ['내일', ans({ reason: '내일 시작해요' })],
    ['오늘', ans({ reason: '오늘 꼭 보세요' })],
    ['없는 줄 키', ans({ cited: ['act:9'] })],
    ['프롬프트를 안 넣었는데 prompt', ans({ cited: ['prompt'] })],
    ['같은 키 두 번', ans({ cited: ['act:1', 'act:1'] })],
    ['4개', ans({ cited: ['act:1', 'act:2', 'act:3', 'act:4'] })]
  ])('거절: %s', (_name, text) => {
    expect(checkPick(text, 3, ['act:1', 'act:2', 'act:3', 'act:4'], false)).toBeNull();
  });
});

describe('재료 글', () => {
  const m: Material = {
    cands: [{ title: '해커톤', host: null, kind: 'hackathon', deadline: null, coreNames: [] }, { title: '인턴', host: '가나다', kind: 'job', deadline: '2026-11-30', coreNames: ['백엔드'] }],
    grade: 3, term: 2, goal: 'job', pickedNames: ['백엔드', 'QA·테스트'], prompt: null, lines: null
  };
  it('후보 줄과 처음 답·고른 분야를 쓰고, 프롬프트·분석이 없으면 그 칸을 넣지 않는다', () => {
    expect(pickMaterial(m)).toBe([
      '## 후보', '1. 해커톤 | 주최: 없음 | 종류: 해커톤 | 마감: 없음 | 분야: 없음', '2. 인턴 | 주최: 가나다 | 종류: 채용 | 마감: 2026-11-30 | 분야: 백엔드',
      '## 처음 답', '3학년 2학기, 취업', '## 고른 분야', '백엔드, QA·테스트', '## 참고한 줄로 댈 수 있는 키', '없음(cited는 빈 배열)'
    ].join('\n'));
  });
  it('프롬프트와 분석 줄이 있으면 그 칸을 더한다', () => {
    const t = pickMaterial({ ...m, prompt: '대학원 갈래요', lines: [{ key: 'act:1', text: '2025-2 · 해커톤' }] });
    expect(t.endsWith('## 나에 대한 프롬프트\n대학원 갈래요\n## 나의 분석\n[act:1] 2025-2 · 해커톤\n## 참고한 줄로 댈 수 있는 키\nprompt, act:1')).toBe(true);
  });
  it('지시문 판은 8자 해시다', () => {
    expect(PICK_VERSION).toMatch(/^[0-9a-f]{8}$/);
  });
  it('스키마가 참고한 줄을 댈 수 있는 키로 막는다(T089)', () => {
    expect(pickSchema(3, ['ans', 'act:1']).properties.cited).toEqual({ type: 'array', items: { type: 'string', enum: ['ans', 'act:1'] }, maxItems: 3 });
    expect(pickSchema(3, []).properties.cited).toEqual({ type: 'array', items: { type: 'string' }, maxItems: 0 });
  });
});
