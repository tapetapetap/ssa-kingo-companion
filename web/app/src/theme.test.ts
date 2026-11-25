import { describe, expect, it } from 'vitest';
import { COLORS } from './theme.ts';

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

describe('대비 4.5:1(contracts/design.md 확인 기준)', () => {
  it('밝음·어두움의 글자와 바탕', () => {
    const c = COLORS as Record<string, [string, string]>;
    for (const mode of [0, 1]) {
      expect(ratio(c['--color-on-accent'][mode], c['--color-accent'][mode])).toBeGreaterThanOrEqual(4.5);
      for (const t of ['primary', 'secondary', 'accent', 'error', 'warning', 'success']) for (const bg of ['body', 'card']) {
        expect([t, bg, mode, ratio(c[`--color-text-${t}`][mode], c[`--color-background-${bg}`][mode]) >= 4.5]).toEqual([t, bg, mode, true]);
      }
    }
  });
});
