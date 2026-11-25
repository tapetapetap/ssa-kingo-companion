import { expect, it } from 'vitest';
import { findFields } from './find.ts';

it('띄어쓰기·대소문자·자모 꼴을 가리지 않고 이름으로 찾는다', () => {
  const fs = ['LLM·생성형 AI', '자연어 처리', '백엔드'].map(name => ({ name }));
  expect(findFields(fs, 'llm').map(f => f.name)).toEqual(['LLM·생성형 AI']);
  expect(findFields(fs, '자연어처리').map(f => f.name)).toEqual(['자연어 처리']);
  expect(findFields(fs, ' 생성형 ai '.normalize('NFD')).map(f => f.name)).toEqual(['LLM·생성형 AI']);
  expect(findFields(fs, ' ')).toHaveLength(3);
  expect(findFields(fs, '없음')).toEqual([]);
});
