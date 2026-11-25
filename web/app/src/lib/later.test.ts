import { expect, it } from 'vitest';
import { laterRange } from './later.ts';

it('기본 3일 뒤, 닫히는 날이 앞서면 닫히는 날, 오늘 닫히면 없음', () => {
  expect(laterRange('2026-12-25', '2026-11-29')).toEqual({ min: '2026-11-30', max: '2026-12-25', value: '2026-12-02' });
  expect(laterRange('2026-12-02', '2026-11-29')?.value).toBe('2026-12-02');
  expect(laterRange('2026-12-01', '2026-11-29')?.value).toBe('2026-12-01');
  expect(laterRange('2026-11-30', '2026-11-29')).toEqual({ min: '2026-11-30', max: '2026-11-30', value: '2026-11-30' });
  expect(laterRange('2026-11-29', '2026-11-29')).toBeNull();
  expect(laterRange('2026-11-28', '2026-11-29')).toBeNull();
});
