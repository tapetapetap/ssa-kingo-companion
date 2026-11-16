// 운영체제별 온도·GPU 읽기(research R18). 부하 제한(throttle.ts)은 readTemp()와 readGpu()만 부른다.
// 모두 관리자 권한 없이 읽힌다. 못 읽으면 null이고 던지지 않는다
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

/** 표준 출력 글자. 명령이 없거나 0이 아닌 종료면 null */
export type Run = (cmd: string, args: string[]) => Promise<string | null>;
export type Gpu = { util: number | null; temp: number | null };
type Opts = { run: Run; sys: string; bin: string; src: string };

const exec = promisify(execFile);
const DEFAULTS: Opts = {
  run: async (cmd, args) => {
    try {
      return (await exec(cmd, args, { timeout: 10_000 })).stdout;
    } catch {
      return null;
    }
  },
  sys: '/sys',
  bin: fileURLToPath(new URL('../.cache/bin/thermal', import.meta.url)),
  src: fileURLToPath(new URL('./thermal.c', import.meta.url))
};

const num = (s: string) => (s.trim() && Number.isFinite(Number(s)) ? Number(s) : null);
export const max = (xs: (number | null)[]) => {
  const ok = xs.filter((x): x is number => x !== null);
  return ok.length ? Math.max(...ok) : null;
};
const entries = (v: unknown): [string, unknown][] => (typeof v === 'object' && v !== null ? Object.entries(v) : []);

/** thermal.c 출력(`이름\t온도` 줄)에서 칩 다이 센서(PMU tdie*)의 최댓값 */
export const parseThermal = (out: string) => max(out.split('\n').filter(l => l.startsWith('PMU tdie')).map(l => num(l.split('\t')[1] ?? '')));
/** ioreg IOAccelerator의 "Device Utilization %"=n */
export const parseIoreg = (out: string) => max([...out.matchAll(/"Device Utilization %"\s*=\s*(\d+)/g)].map(m => Number(m[1])));
/** 커널이 보이는 인텔 CPU 패키지 온도(x86_pkg_temp, 밀리도) */
export const parseZones = (zones: { type: string; temp: string }[]) =>
  max(zones.filter(z => z.type === 'x86_pkg_temp').map(z => num(z.temp)).map(n => (n === null ? null : n / 1000)));
/** lm-sensors `sensors -j`의 coretemp-* 안 Package id N의 temp*_input */
export function parseSensors(json: string): number | null {
  let o: unknown;
  try {
    o = JSON.parse(json);
  } catch {
    return null;
  }
  const temps = entries(o).filter(([chip]) => chip.startsWith('coretemp-'))
    .flatMap(([, v]) => entries(v).filter(([label]) => label.startsWith('Package id')))
    .flatMap(([, s]) => entries(s).filter(([k]) => /^temp\d+_input$/.test(k)).map(([, t]) => (typeof t === 'number' ? t : null)));
  return max(temps);
}
/** nvidia-smi csv 줄마다 `사용률, 온도`. 여러 장이면 둘 다 최댓값이다 */
export function parseNvidiaSmi(out: string): Gpu | null {
  const rows = out.split('\n').filter(l => l.trim()).map(l => l.split(','));
  return rows.length ? { util: max(rows.map(r => num(r[0] ?? ''))), temp: max(rows.map(r => num(r[1] ?? ''))) } : null;
}

const readOr = (file: string) => {
  try {
    return readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
};

/** 맥은 칩 다이 센서 최댓값, 리눅스는 CPU 패키지 온도. 그 밖의 운영체제는 못 읽는 것으로 본다 */
export async function readTemp(platform: string = process.platform, o: Partial<Opts> = {}): Promise<number | null> {
  const { run, sys, bin, src } = { ...DEFAULTS, ...o };
  try {
    if (platform === 'darwin') {
      // 처음 쓸 때와 c 파일을 고쳤을 때만 빌드한다
      if (!existsSync(bin) || statSync(bin).mtimeMs < statSync(src).mtimeMs) {
        mkdirSync(dirname(bin), { recursive: true });
        if ((await run('clang', ['-O2', '-framework', 'IOKit', '-framework', 'CoreFoundation', '-o', bin, src])) === null) return null;
      }
      const out = await run(bin, []);
      return out === null ? null : parseThermal(out);
    }
    if (platform === 'linux') {
      const dir = join(sys, 'class', 'thermal');
      const zones = (existsSync(dir) ? readdirSync(dir) : []).filter(n => n.startsWith('thermal_zone'))
        .map(n => ({ type: readOr(join(dir, n, 'type')), temp: readOr(join(dir, n, 'temp')) }));
      const t = parseZones(zones);
      if (t !== null) return t;
      const out = await run('sensors', ['-j']);
      return out === null ? null : parseSensors(out);
    }
    return null;
  } catch {
    return null;
  }
}

/** GPU 사용률(맥 ioreg, 리눅스 nvidia-smi)과 GPU 온도(리눅스만, 기록에만 쓴다) */
export async function readGpu(platform: string = process.platform, o: Partial<Opts> = {}): Promise<Gpu | null> {
  const { run } = { ...DEFAULTS, ...o };
  if (platform === 'darwin') {
    const out = await run('ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator']);
    const util = out === null ? null : parseIoreg(out);
    return util === null ? null : { util, temp: null };
  }
  if (platform === 'linux') {
    const out = await run('nvidia-smi', ['--query-gpu=utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits']);
    return out === null ? null : parseNvidiaSmi(out);
  }
  return null;
}
