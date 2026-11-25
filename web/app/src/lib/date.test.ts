import { describe, expect, it } from 'vitest';
import { dday, kstDay, termOf, termsBefore, termSuggestion } from './date.ts';

describe('한국 날짜', () => {
  it('기기 시간대와 상관없이 한국 날짜다(UTC 15:00에 날이 바뀐다)', () => {
    expect(kstDay(new Date('2026-11-25T14:59:59Z'))).toBe('2026-11-25');
    expect(kstDay(new Date('2026-11-25T15:00:00Z'))).toBe('2026-11-26');
  });
  it('D-n', () => {
    expect([null, '2026-11-25', '2026-11-26', '2026-12-25', '2026-11-24'].map(d => dday(d, '2026-11-25'))).toEqual(['마감 없음', '오늘 마감', 'D-1', 'D-30', '마감 지남']);
  });
});

describe('학기', () => {
  it('경계: 3월 1일과 9월 1일에 바뀌고 1~2월은 앞 해의 2학기다', () => {
    expect(['2027-02-28', '2027-03-01', '2027-08-31', '2027-09-01', '2027-01-01'].map(termOf)).toEqual(['2026-2', '2027-1', '2027-1', '2027-2', '2026-2']);
  });
  const a = (grade: number, t: number, day: string) => ({ grade, term: t, answeredAt: `${day}T12:00:00.000+09:00` });
  it('고를 수 있는 학기는 이번 학기부터 거꾸로다', () => {
    expect(termsBefore('2027-01-10').slice(0, 3)).toEqual(['2026-2', '2026-1', '2025-2']);
    expect(termsBefore('2027-03-01', '2015-2').at(-1)).toBe('2015-2');
  });
  it('같은 학기면 제안이 없다', () => {
    expect(termSuggestion(a(3, 2, '2026-11-25'), '2027-02-28')).toBeNull();
  });
  it('학기는 이번 학기, 학년은 새 학년도가 지난 횟수만큼 오르고 4를 넘지 않는다', () => {
    expect(termSuggestion(a(3, 1, '2026-04-01'), '2026-09-01')).toEqual({ grade: 3, term: 2 });
    expect(termSuggestion(a(3, 2, '2026-11-25'), '2027-03-01')).toEqual({ grade: 4, term: 1 });
    expect(termSuggestion(a(1, 2, '2026-11-25'), '2028-04-01')).toEqual({ grade: 3, term: 1 });
    expect(termSuggestion(a(2, 2, '2027-01-15'), '2027-03-02')).toEqual({ grade: 3, term: 1 });
    expect(termSuggestion(a(4, 2, '2026-11-25'), '2029-10-01')).toBeNull();
    expect(termSuggestion(a(4, 2, '2026-11-25'), '2027-03-02')).toEqual({ grade: 4, term: 1 });
  });
});
