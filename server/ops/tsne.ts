// 정확한 t-SNE(3단계 research R13): 세부 분야 100개쯤이라 O(n²)로 충분하다. 씨앗을 고정해 같은 자료면 같은 자리다
// ponytail: n이 몇백을 넘으면 Barnes-Hut이 필요하다

/** 고정 씨앗 난수(mulberry32) */
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 거리 행렬의 한 줄에서 perplexity에 맞는 조건부 확률(이분 찾기) */
function row(d: number[], i: number, perplexity: number): number[] {
  const want = Math.log(perplexity);
  let [lo, hi, beta] = [0, Infinity, 1];
  let p: number[] = [];
  for (let k = 0; k < 50; k++) {
    p = d.map((x, j) => (j === i ? 0 : Math.exp(-x * beta)));
    const sum = p.reduce((a, b) => a + b, 0) || 1e-12;
    const entropy = Math.log(sum) + (beta * p.reduce((a, b, j) => a + b * d[j], 0)) / sum;
    p = p.map(x => x / sum);
    if (Math.abs(entropy - want) < 1e-5) break;
    if (entropy > want) { lo = beta; beta = hi === Infinity ? beta * 2 : (beta + hi) / 2; } else { hi = beta; beta = (beta + lo) / 2; }
  }
  return p;
}

/** 거리 행렬(0 이상, 대칭) → 2차원 좌표. 거리는 제곱해 쓴다 */
export function tsne(dist: number[][], iterations = 1000): [number, number][] {
  const n = dist.length;
  if (n < 3) return dist.map((_, i) => [i, 0]);
  const perplexity = Math.min(15, (n - 1) / 3);
  const cond = dist.map((d, i) => row(d.map(x => x * x), i, perplexity));
  const p = cond.map((r, i) => r.map((x, j) => Math.max((x + cond[j][i]) / (2 * n), 1e-12)));
  const rnd = random(20261125);
  const y = Array.from({ length: n }, () => [(rnd() - 0.5) * 1e-2, (rnd() - 0.5) * 1e-2]);
  const v = y.map(() => [0, 0]);
  const gain = y.map(() => [1, 1]);
  for (let t = 0; t < iterations; t++) {
    const ex = t < 100 ? 4 : 1;
    const q = y.map((a, i) => y.map((b, j) => (i === j ? 0 : 1 / (1 + (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2))));
    const z = q.reduce((s, r) => s + r.reduce((a, b) => a + b, 0), 0);
    const m = t < 100 ? 0.5 : 0.8;
    const g = y.map((a, i) => {
      let [gx, gy] = [0, 0];
      for (let j = 0; j < n; j++) {
        const w = 4 * (ex * p[i][j] - Math.max(q[i][j] / z, 1e-12)) * q[i][j];
        gx += w * (a[0] - y[j][0]);
        gy += w * (a[1] - y[j][1]);
      }
      return [gx, gy];
    });
    for (let i = 0; i < n; i++) for (const k of [0, 1]) {
      gain[i][k] = Math.max(0.01, Math.sign(g[i][k]) !== Math.sign(v[i][k]) ? gain[i][k] + 0.2 : gain[i][k] * 0.8);
      v[i][k] = m * v[i][k] - 100 * gain[i][k] * g[i][k];
      y[i][k] += v[i][k];
    }
    const mean = [0, 1].map(k => y.reduce((s, a) => s + a[k], 0) / n);
    for (const a of y) for (const k of [0, 1]) a[k] -= mean[k];
  }
  return y.map(a => [a[0], a[1]]);
}
