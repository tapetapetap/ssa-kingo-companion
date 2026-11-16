// 부하 제한(research R6). 실행 하나에 하나 만들어 실제 LLM·임베딩 요청 앞뒤에만 건다(보관 답·보관 벡터는 쉬지 않는다).
// 요청을 기다린 시간의 1/4을 쉬어 GPU 평균을 80% 아래로, 온도 + 가장 큰 오름폭이 80°C 이상이면 식을 때까지 기다린다.
// 온도를 한 번이라도 못 읽으면 그 실행의 새 요청을 멈춘다. 끄는 설정은 없다(사용자 고정 지시)
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type { Gate } from './llm.ts';
import { readGpu, readTemp, type Gpu } from './sensors.ts';

export type LoadSummary = { requests: number; requestMs: number; gpuAvg: number | null; tempMax: number | null; logFile: string | null; line: string };
/** 시험에서만 바꾼다 */
export type ThrottleDeps = {
  now: () => number; sleep: (ms: number) => Promise<void>; every: (ms: number, fn: () => void) => () => void;
  readTemp: () => Promise<number | null>; readGpu: () => Promise<Gpu | null>; logDir: string; platform: string;
};

const LIMIT_C = 80;
const STEP_MS = 5000; // 온도 대기와 표본 간격
const PER_LINE = 12; // 5초 표본 12개 = 1분
export const LOAD_DIR = fileURLToPath(new URL('../.cache/load', import.meta.url));

const round1 = (x: number) => Math.round(x * 10) / 10;
const top = (xs: number[]) => (xs.length ? Math.max(...xs) : null);

export function createThrottle(d: Partial<ThrottleDeps> = {}): { gate: () => Gate; stop: () => LoadSummary } {
  const deps: ThrottleDeps = {
    now: Date.now,
    sleep: ms => delay(ms),
    // 타이머가 프로세스가 끝나는 것을 막지 않는다
    every: (ms, fn) => { const h = setInterval(fn, ms); h.unref(); return () => { clearInterval(h); }; },
    readTemp: () => readTemp(), readGpu: () => readGpu(), logDir: LOAD_DIR, platform: process.platform, ...d
  };
  let rise = 0; // 이번 실행에서 요청 하나에 오른 가장 큰 폭. 0에서 시작해 max로만 갱신한다
  let broken = false;
  let requests = 0;
  let requestMs = 0;
  let tempMax: number | null = null;
  let gpuSum = 0;
  let gpuCount = 0;
  let logFile: string | null = null;
  let wrote = false; // 5초 표본이 하나도 없던 짧은 실행은 기록 파일이 생기지 않는다
  let stopTimer: (() => void) | null = null;
  let bucket = { n: 0, gpu: [] as number[], temp: [] as number[], gpuTemp: [] as number[] };
  let summary: LoadSummary | null = null;

  const seen = (t: number) => {
    tempMax = tempMax === null ? t : Math.max(tempMax, t);
    bucket.temp.push(t);
  };
  /** 못 읽으면 그 뒤로 센서를 부르지 않는다 */
  const read = async () => {
    const t = broken ? null : await deps.readTemp();
    if (t === null) broken = true;
    else seen(t);
    return t;
  };
  const flush = () => {
    if (!logFile || bucket.n === 0) return;
    const gpu = bucket.gpu.length ? round1(bucket.gpu.reduce((a, b) => a + b, 0) / bucket.gpu.length) : null;
    appendFileSync(logFile, `${JSON.stringify({ at: new Date(deps.now()).toISOString(), gpu, temp: top(bucket.temp), gpuTemp: top(bucket.gpuTemp) })}\n`);
    wrote = true;
    bucket = { n: 0, gpu: [], temp: [], gpuTemp: [] };
  };
  /** 못 읽은 표본은 빼기만 한다. 요청을 멈출지는 before·after의 읽기가 정한다 */
  const sample = async () => {
    const [g, t] = await Promise.all([deps.readGpu(), deps.readTemp()]);
    if (summary) return; // stop() 뒤에 끝난 표본은 버린다
    if (typeof g?.util === 'number') {
      bucket.gpu.push(g.util);
      gpuSum += g.util;
      gpuCount++;
    }
    if (typeof g?.temp === 'number') bucket.gpuTemp.push(g.temp);
    if (t !== null) seen(t);
    if (++bucket.n === PER_LINE) flush();
  };
  /** 첫 실제 요청 앞에서 시작한다: 보관 답만 쓴 실행은 기록 파일을 만들지 않는다 */
  const startLog = () => {
    if (logFile) return;
    mkdirSync(deps.logDir, { recursive: true });
    logFile = join(deps.logDir, `${new Date(deps.now()).toISOString().slice(0, 19).replace(/:/g, '-')}.jsonl`);
    stopTimer = deps.every(STEP_MS, () => { sample().catch(() => {}); }); // 기록을 못 써도 판정은 계속한다
  };

  const gate = (): Gate => {
    let before: number | null = null;
    const g = {
      noTemp: 0, // 이 문에서 온도 때문에 보내지 않은 요청 수
      async before() {
        let t = await read();
        while (t !== null && t + rise >= LIMIT_C) {
          await deps.sleep(STEP_MS);
          t = await read();
        }
        if (t === null) {
          g.noTemp++;
          return false;
        }
        before = t;
        startLog();
        return true;
      },
      async after(ms: number) {
        requests++;
        requestMs += ms;
        const t = await read();
        if (t !== null && before !== null) rise = Math.max(rise, t - before);
        before = null;
        await deps.sleep(ms / 4);
      }
    };
    return g;
  };

  /** 기록을 멈추고 요약을 돌려준다. 두 번째부터는 첫 값을 돌려준다 */
  const stop = (): LoadSummary => {
    if (summary) return summary;
    stopTimer?.();
    flush();
    if (requests === 0) return (summary = { requests: 0, requestMs: 0, gpuAvg: null, tempMax: null, logFile: null, line: '' });
    const gpuAvg = gpuCount ? round1(gpuSum / gpuCount) : null;
    const where = deps.platform === 'linux' ? 'CPU' : '칩';
    const line = `부하: GPU 평균 ${gpuAvg === null ? '-' : `${gpuAvg}%`} · ${where} 최고 ${tempMax === null ? '-' : `${tempMax}°C`}`;
    return (summary = { requests, requestMs: Math.round(requestMs), gpuAvg, tempMax, logFile: wrote ? logFile : null, line });
  };

  return { gate, stop };
}
