import { describe, expect, it } from 'vitest';
import { message, type Item } from './message.ts';

const item = (n: number, kind: Item['kind'], title = `공지 ${n}`): Item => ({ noticeId: `cse:${n}`, title, kind });
const DAY = '2026-11-27';

describe('알림 글 (R8)', () => {
  it('하나면 제목과 종류, 그 공지로', () => {
    expect(message([item(1, 'due3', '제5회 AI 해커톤')], DAY)).toEqual({ title: '제5회 AI 해커톤', body: '3일 뒤 마감', url: '/notices/cse%3A1', tag: 'kingo-2026-11-27' });
    expect(message([item(1, 'due0')], DAY).body).toBe('오늘 마감');
    expect(message([item(1, 'revisit')], DAY).body).toBe('다시 볼 날이에요');
  });
  it('둘 이상이면 종류별 개수와 제목, 내 목록으로. 순서는 오늘 → 3일 뒤 → 다시 볼 날', () => {
    const m = message([item(1, 'revisit'), item(2, 'due3'), item(3, 'due0'), item(4, 'due3')], DAY);
    expect(m).toEqual({ title: '오늘 마감 1개, 3일 뒤 마감 2개, 다시 볼 공지 1개', body: '공지 3\n공지 2\n공지 4\n외 1개', url: '/list', tag: 'kingo-2026-11-27' });
    expect(message([item(1, 'due0'), item(2, 'due0')], DAY).body).toBe('공지 1\n공지 2');
  });
  it('제목은 40자에서 자르고(이모지를 반으로 자르지 않는다) 가장 커도 4KB를 넘지 않는다', () => {
    expect(message([item(1, 'due0', '가'.repeat(40))], DAY).title).toBe('가'.repeat(40));
    expect(message([item(1, 'due0', '😀'.repeat(41))], DAY).title).toBe(`${'😀'.repeat(40)}…`);
    const big = message(Array.from({ length: 99 }, (_, i) => item(i, 'due0', '😀'.repeat(500))), DAY);
    expect(Buffer.byteLength(JSON.stringify(big))).toBeLessThan(4096);
  });
});
