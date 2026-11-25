import { describe, expect, it } from 'vitest';
import { tsne } from './tsne.ts';

/** 세 무리: 같은 무리는 0.1, 다른 무리는 1 */
const groups = (n: number) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : i % 3 === j % 3 ? 0.1 + ((i * j) % 7) * 0.005 : 1)));
const d = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('t-SNE (R13)', () => {
  it('같은 입력이면 글자까지 같은 좌표다', () => {
    expect(JSON.stringify(tsne(groups(30)))).toBe(JSON.stringify(tsne(groups(30))));
  });
  it('세 무리가 갈라진다: 가장 가까운 이웃은 같은 무리다', () => {
    const y = tsne(groups(30));
    for (const [i, a] of y.entries()) {
      const near = y.map((b, j) => [j, d(a, b)] as const).filter(([j]) => j !== i).sort((p, q) => p[1] - q[1])[0][0];
      expect(near % 3).toBe(i % 3);
    }
  });
  it('91개를 몇 초 안에 끝내고 값은 모두 유한하다. 거리가 모두 같거나 몇 개뿐이어도 죽지 않는다', () => {
    const t0 = Date.now();
    expect(tsne(groups(91)).flat().every(Number.isFinite)).toBe(true);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(tsne(Array.from({ length: 12 }, (_, i) => Array.from({ length: 12 }, (_, j) => (i === j ? 0 : 1)))).flat().every(Number.isFinite)).toBe(true);
    expect(tsne([[0, 0], [0, 0]])).toHaveLength(2);
    expect(tsne(Array.from({ length: 12 }, () => Array(12).fill(0))).flat().every(Number.isFinite)).toBe(true);
  });
});
