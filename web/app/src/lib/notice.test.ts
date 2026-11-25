import { describe, expect, it } from 'vitest';
import { actionText, byText, due, kindName } from './notice.ts';

describe('공지 글', () => {
  const d = (deadline: string | null, open = true, down = false) => due({ deadline, open, down }, '2026-11-25');
  it('마감: 오늘~3일은 급하고, 닫힘·내려감을 나눈다', () => {
    expect(d('2026-11-25')).toEqual({ text: '오늘 마감', urgent: true });
    expect(d('2026-11-28')).toEqual({ text: 'D-3', urgent: true });
    expect(d('2026-11-29')).toEqual({ text: 'D-4', urgent: false });
    expect(d('2026-12-25')).toEqual({ text: 'D-30', urgent: false });
    expect(d(null)).toEqual({ text: '마감 없음', urgent: false });
    expect(d('2026-11-24', false)).toEqual({ text: '마감 지남', urgent: false });
    expect(d(null, false)).toEqual({ text: '닫힘', urgent: false });
    expect(d('2026-12-25', false, true)).toEqual({ text: '내려감', urgent: false });
  });
  it('종류·행동·분야 근거', () => {
    expect([kindName('job'), kindName('new-kind'), kindName(null)]).toEqual(['채용', 'new-kind', null]);
    expect(actionText({ kind: 'later', revisitOn: '2026-12-01', reason: null, at: null })).toBe('12월 1일에 다시 보기');
    expect([byText('LLM: m'), byText('운영자'), byText(null)]).toEqual(['AI 추정', '운영자 확인', 'AI 추정']);
  });
});
