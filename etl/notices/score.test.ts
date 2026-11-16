import { describe, expect, it } from 'vitest';
import { passes, pct, ratio } from './score.ts';

describe('ratio · passes · pct (research R10)', () => {
  it('기준은 정수로 비교한다: 84/100은 미달, 85/100은 통과', () => {
    expect(ratio(84, 100)).toEqual({ num: 84, den: 100 });
    expect(passes(ratio(84, 100))).toBe(false);
    expect(passes(ratio(85, 100))).toBe(true);
    expect(passes(ratio(17, 20), 85)).toBe(true);
    expect(passes(ratio(0, 0))).toBe(false);
  });

  it('표시는 소수 첫째 자리까지 내림하고 분자·분모를 붙인다. 분모가 0이면 해당 없음', () => {
    expect(pct(ratio(147, 173))).toBe('84.9% (147/173)');
    expect(pct(ratio(85, 100))).toBe('85.0% (85/100)');
    expect(pct(ratio(2, 3))).toBe('66.6% (2/3)');
    expect(pct(ratio(0, 0))).toBe('해당 없음');
  });
});
