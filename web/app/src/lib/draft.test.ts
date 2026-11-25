// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dropOther, stash, take, writingNow } from './draft.ts';

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  writingNow(null);
});

describe('쓰던 글', () => {
  it('끊긴 순간 쓰던 글만 남고, 같은 화면에서 한 번만 꺼낸다', () => {
    stash('a');
    expect(take('/me/prompt')).toBeNull();
    writingNow('/me/prompt', '긴 글');
    stash('a');
    dropOther('a');
    expect(take('/me/activities/new')).toBeNull();
    expect(take('/me/prompt')).toBe('긴 글');
    expect(take('/me/prompt')).toBeNull();
  });
  it('저장한 글은 남지 않고, 다른 학생이면 버린다', () => {
    writingNow('/me/prompt', '긴 글');
    writingNow(null);
    stash('a');
    expect(take('/me/prompt')).toBeNull();
    writingNow('/me/prompt', '긴 글');
    stash('a');
    dropOther('b');
    expect(take('/me/prompt')).toBeNull();
  });
  it('저장소가 막히거나 깨져 있어도 조용하다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('막힘'); });
    writingNow('/me/prompt', '긴 글');
    expect(() => stash('a')).not.toThrow();
    vi.restoreAllMocks();
    sessionStorage.setItem('kingo-draft', '{깨짐');
    expect(take('/me/prompt')).toBeNull();
    expect(() => dropOther('a')).not.toThrow();
  });
});
