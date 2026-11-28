import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Gpu } from './sensors.ts';
import { createThrottle, type ThrottleDeps } from './throttle.ts';

/** 가짜 시계·잠·센서. 온도는 읽을 때마다 앞에서 하나씩 꺼낸다(마지막 값은 계속). every는 손으로 돌린다 */
function fake(temps: (number | null)[], gpus: (Gpu | null)[] = [{ util: 50, temp: null }], platform = 'darwin') {
  let clock = Date.parse('2026-11-17T01:00:00.000Z');
  const slept: number[] = [];
  const ticks: (() => void)[] = [];
  const next = <T>(xs: T[]) => (xs.length > 1 ? xs.shift() as T : xs[0]);
  const readTemp = vi.fn(async () => next(temps));
  const readGpu = vi.fn(async () => next(gpus));
  const logDir = mkdtempSync(join(tmpdir(), 'throttle-'));
  const deps: ThrottleDeps = {
    now: () => clock,
    sleep: async ms => { slept.push(ms); clock += ms; },
    every: (_ms, fn) => { ticks.push(fn); return () => { ticks.length = 0; }; },
    readTemp, readGpu, logDir, platform
  };
  /** 5초 표본 n번. 표본은 비동기라 한 번씩 기다린다 */
  const tick = async (n = 1) => {
    for (let i = 0; i < n; i++) {
      for (const f of [...ticks]) f();
      await new Promise(r => setTimeout(r, 0));
    }
  };
  return { deps, slept, ticks, tick, readTemp, logDir };
}
const lines = (file: string | null) => (file ? readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : []);

describe('쉼과 온도 대기 (research R6)', () => {
  it('after(ms)는 ms의 1/4을 쉰다. 실패한 요청 뒤에도 같다', async () => {
    const f = fake([40]);
    const g = createThrottle(f.deps).gate();
    expect(await g.before()).toBe(true);
    await g.after(1000);
    await g.after(8);
    expect(f.slept).toEqual([250, 2]);
  });

  it('온도 + 가장 큰 오름폭 + 여유 2가 80 이상이면 5초마다 다시 읽고, 내려가면 보낸다. 오름폭은 줄지 않는다', async () => {
    // 요청 1: 70 → 75(오름 5). 요청 2: 74+5+2 ≥ 80이라 기다림 → 72 → 보냄 → 60(내려감, 오름폭 그대로). 요청 3: 74 → 기다림 → 70
    const f = fake([70, 75, 74, 72, 60, 74, 70]);
    const g = createThrottle(f.deps).gate();
    expect(await g.before()).toBe(true);
    await g.after(100);
    expect(await g.before()).toBe(true);
    await g.after(100);
    expect(await g.before()).toBe(true);
    expect(f.slept).toEqual([25, 5000, 25, 5000]);
  });

  it('오름폭은 0에서 시작한다: 첫 요청은 77°C면 보내고 78°C면 기다린다(여유 2)', async () => {
    expect(await createThrottle(fake([77]).deps).gate().before()).toBe(true);
    const f = fake([78, 77]);
    expect(await createThrottle(f.deps).gate().before()).toBe(true);
    expect(f.slept).toEqual([5000]);
  });

  it('KINGO_TEMP_LIMIT로 낮출 수 있고 80보다 올리지는 못한다', async () => {
    try {
      process.env.KINGO_TEMP_LIMIT = '70';
      const f = fake([68, 67]);
      expect(await createThrottle(f.deps).gate().before()).toBe(true);
      expect(f.slept).toEqual([5000]);
      process.env.KINGO_TEMP_LIMIT = '90';
      const g = fake([78, 77]);
      expect(await createThrottle(g.deps).gate().before()).toBe(true);
      expect(g.slept).toEqual([5000]);
    } finally { delete process.env.KINGO_TEMP_LIMIT; }
  });
});

describe('요청 도중의 오름 (2026-11-23)', () => {
  it('요청 도중 5초 표본이 더 높으면 그만큼을 오름폭으로 센다(요청 뒤 읽기는 내려갔어도)', async () => {
    // 보내기 전 60 → 도중 표본 70(오름 10) → 요청 뒤 62. 다음 요청: 69+10+2 ≥ 80이라 기다림 → 67 → 보냄
    const f = fake([60, 70, 62, 69, 67]);
    const g = createThrottle(f.deps).gate();
    expect(await g.before()).toBe(true);
    await f.tick();
    await g.after(100);
    expect(await g.before()).toBe(true);
    expect(f.slept).toEqual([25, 5000]);
  });
});

describe('문 둘과 온도 못 읽음', () => {
  it('가장 큰 오름폭은 문들이 함께 쓴다', async () => {
    const f = fake([70, 78, 71, 69]);
    const t = createThrottle(f.deps);
    const [ask, field] = [t.gate(), t.gate()];
    await ask.before();
    await ask.after(40); // 오름 8
    expect(await field.before()).toBe(true); // 71 + 8 + 2 ≥ 80 → 기다림 → 69
    expect(f.slept).toEqual([10, 5000]);
  });

  it('한 번 못 읽으면 그 실행이 끝날 때까지 before()가 false이고, 센서를 다시 부르지 않으며 noTemp는 문마다 센다', async () => {
    const f = fake([null, 70]);
    const t = createThrottle(f.deps);
    const [ask, field] = [t.gate(), t.gate()];
    expect(await ask.before()).toBe(false);
    expect(await field.before()).toBe(false);
    expect(await ask.before()).toBe(false);
    expect([ask.noTemp, field.noTemp]).toEqual([2, 1]);
    expect(f.readTemp).toHaveBeenCalledTimes(1);
  });

  it('요청 뒤(after)에 못 읽어도 그 뒤 before()는 false다', async () => {
    const f = fake([70, null, 60]);
    const g = createThrottle(f.deps).gate();
    expect(await g.before()).toBe(true);
    await g.after(100);
    expect(await g.before()).toBe(false);
    expect(g.noTemp).toBe(1);
    expect(f.slept).toEqual([25]);
  });

  it('기다리는 중에 못 읽으면 보내지 않는다', async () => {
    const g = createThrottle(fake([85, null]).deps).gate();
    expect(await g.before()).toBe(false);
    expect(g.noTemp).toBe(1);
  });
});

describe('기록과 stop()', () => {
  it('첫 실제 요청 전에는 기록하지 않는다. 요청이 없으면 기록 파일도 줄도 없다', async () => {
    const f = fake([null]);
    const t = createThrottle(f.deps);
    await t.gate().before();
    expect(f.ticks).toHaveLength(0);
    expect(t.stop()).toEqual({ requests: 0, requestMs: 0, gpuAvg: null, tempMax: null, logFile: null, line: '' });
    expect(readdirSync(f.logDir)).toEqual([]);
  });

  it('5초 표본은 1분(12개)마다 한 줄로 모이고 못 읽은 표본은 빠진다. stop()은 남은 묶음도 한 줄로 쓴다', async () => {
    const gpus: (Gpu | null)[] = [...Array.from({ length: 11 }, () => ({ util: 60, temp: null })), null, { util: 90, temp: null }];
    const f = fake([70, 72, 71], gpus);
    const t = createThrottle(f.deps);
    const g = t.gate();
    await g.before();
    expect(f.ticks).toHaveLength(1);
    await g.after(2000);
    await f.tick(13);
    const s = t.stop();
    expect(s.logFile).toBe(join(f.logDir, '2026-11-17T01-00-00.jsonl'));
    const [first, last] = lines(s.logFile);
    expect(first).toMatchObject({ gpu: 60, temp: 72, gpuTemp: null });
    expect(last).toMatchObject({ gpu: 90, temp: 71 });
    expect(lines(s.logFile)).toHaveLength(2);
    expect(s).toMatchObject({ requests: 1, requestMs: 2000, gpuAvg: 62.5, tempMax: 72, line: '부하: GPU 평균 62.5% · 칩 최고 72°C' });
  });

  it('stop()은 두 번 불러도 같은 값이고 기록을 멈춘다', async () => {
    const f = fake([70]);
    const t = createThrottle(f.deps);
    const g = t.gate();
    await g.before();
    await g.after(10);
    const s = t.stop();
    expect(t.stop()).toBe(s);
    expect(f.ticks).toHaveLength(0);
    expect(s.logFile).toBeNull(); // 5초 표본이 하나도 없으면 기록 파일이 생기지 않는다
    expect(readdirSync(f.logDir)).toEqual([]);
  });

  it('같은 초에 시작한 다른 실행이 쓴 기록 파일은 이 실행의 logFile이 아니다', async () => {
    const f = fake([70]);
    const a = createThrottle(f.deps);
    const ga = a.gate();
    await ga.before();
    await ga.after(10);
    await f.tick(1);
    expect(a.stop().logFile).toBe(join(f.logDir, '2026-11-17T01-00-00.jsonl'));
    const b = createThrottle(f.deps); // 같은 시계·폴더라 기록 파일 이름이 같다
    const gb = b.gate();
    await gb.before();
    await gb.after(10);
    expect(b.stop().logFile).toBeNull();
  });

  it('기록 폴더를 만들지 못해도 판정을 깨지 않는다: before()는 보내고 stop()은 던지지 않으며 두 번째부터 첫 값이다', async () => {
    const f = fake([70]);
    const blocker = join(f.logDir, 'file');
    writeFileSync(blocker, '');
    const t = createThrottle({ ...f.deps, logDir: join(blocker, 'load') }); // 파일 아래라 폴더를 만들 수 없다
    const g = t.gate();
    expect(await g.before()).toBe(true);
    await g.after(10);
    await f.tick(13);
    const s = t.stop();
    expect(s).toMatchObject({ requests: 1, logFile: null, line: '부하: GPU 평균 50% · 칩 최고 70°C' });
    expect(t.stop()).toBe(s);
  });

  it('기록 파일에 쓰지 못한 묶음은 버린다: 다음 줄은 그 뒤 표본만 담는다', async () => {
    const gpus: (Gpu | null)[] = [...Array.from({ length: 12 }, () => ({ util: 60, temp: null })), { util: 90, temp: null }];
    const f = fake([70], gpus);
    const file = join(f.logDir, '2026-11-17T01-00-00.jsonl');
    mkdirSync(file); // 기록 파일 자리에 폴더가 있으면 쓰기가 실패한다
    const t = createThrottle(f.deps);
    const g = t.gate();
    await g.before();
    await g.after(10);
    await f.tick(12);
    rmdirSync(file);
    await f.tick(3);
    expect(lines(t.stop().logFile)).toMatchObject([{ gpu: 90 }]);
  });

  it('GPU를 못 읽었으면 GPU 평균 -, 리눅스는 CPU 최고이고 GPU 온도를 기록한다', async () => {
    const mac = fake([70], [null]);
    const tm = createThrottle(mac.deps);
    const gm = tm.gate();
    await gm.before();
    await gm.after(10);
    expect(tm.stop().line).toBe('부하: GPU 평균 - · 칩 최고 70°C');
    const linux = fake([65], [{ util: 40, temp: 71 }], 'linux');
    const tl = createThrottle(linux.deps);
    const gl = tl.gate();
    await gl.before();
    await gl.after(1000);
    await linux.tick(2);
    const s = tl.stop();
    expect(s.line).toBe('부하: GPU 평균 40% · CPU 최고 65°C');
    expect(lines(s.logFile)).toEqual([{ at: '2026-11-17T01:00:00.250Z', gpu: 40, temp: 65, gpuTemp: 71 }]);
  });
});
