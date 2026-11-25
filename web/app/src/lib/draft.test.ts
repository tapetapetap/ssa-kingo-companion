// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clear, draftOf, dropOther, stash, writingNow } from './draft.ts';

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  writingNow(null);
});

describe('쓰던 글', () => {
  it('끊긴 순간 쓰던 글만 남고, 같은 화면에서 되살린 뒤 지운다', () => {
    stash('a');
    expect(draftOf('/me/prompt')).toBeNull();
    writingNow('/me/prompt', '긴 글');
    expect(stash('a')).toBe('/me/prompt');
    dropOther('a');
    expect(draftOf('/me/activities/new')).toBeNull();
    expect(draftOf('/me/prompt')).toBe('긴 글');
    clear('/me/activities/new');
    expect(draftOf('/me/prompt')).toBe('긴 글');
    clear('/me/prompt');
    expect(draftOf('/me/prompt')).toBeNull();
  });
  it('저장한 글은 남지 않고, 다른 학생이면 버린다', () => {
    writingNow('/me/prompt', '긴 글');
    writingNow(null);
    stash('a');
    expect(draftOf('/me/prompt')).toBeNull();
    writingNow('/me/prompt', '긴 글');
    stash('a');
    dropOther('b');
    expect(draftOf('/me/prompt')).toBeNull();
  });
  it('저장소가 막히거나 깨져 있어도 조용하다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('막힘'); });
    writingNow('/me/prompt', '긴 글');
    expect(() => stash('a')).not.toThrow();
    vi.restoreAllMocks();
    sessionStorage.setItem('kingo-draft', '{깨짐');
    expect(draftOf('/me/prompt')).toBeNull();
    expect(() => dropOther('a')).not.toThrow();
  });
});
