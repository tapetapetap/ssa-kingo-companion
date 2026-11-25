import { expect, it } from 'vitest';
import { lineText } from './lineKey.ts';

it('뺀 줄의 열쇠를 읽을 말로 푼다. 지금 있는 줄은 그 글 그대로, 없는 분야는 id를 보이지 않는다', () => {
  const t = (k: string) => lineText(k, x => (x === 'act:7' ? '2026-1 · 동아리' : undefined), id => (id === 'llm' ? 'LLM·생성형 AI' : undefined));
  expect(t('liked:llm')).toBe('관심 있어요가 몰린 분야: LLM·생성형 AI');
  expect(t('disliked:old-field')).toBe('관심 없음이 몰린 분야: 지금 목록에 없는 분야');
  expect(t('flow:act:7+liked:llm')).toBe('컴패니언이 본 흐름 한 줄(근거: 2026-1 · 동아리, 관심 있어요가 몰린 분야: LLM·생성형 AI)');
  expect(t('flow:act:8+ans')).toBe('컴패니언이 본 흐름 한 줄(근거: 지운 활동, 처음 질문 답)');
  expect([t('picked'), t('x:y')]).toEqual(['고른 분야', '지금은 없는 줄']);
});
