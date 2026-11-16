import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseIoreg, parseNvidiaSmi, parseSensors, parseThermal, parseZones, readGpu, readTemp, type Run } from './sensors.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'sensors-'));
// 2026-11-17 이 맥(Apple M5 Pro)의 thermal 출력 꼴: PMU tdie만 칩 다이다. tdev는 쓰지 않는 값, tcal은 보정값이다
const THERMAL = 'PMU tdie13\t27.7\nPMU tdev4\t-9201.1\nPMU tcal\t51.8\ngas gauge battery\t26.0\nPMU tdie8\t29.7\nPMU tdie1\t28.3\n';
const IOREG = '"PerformanceStatistics" = {"Tiler Utilization %"=3,"Renderer Utilization %"=40,"Device Utilization %"=42,"SplitSceneCount"=0}';
const SENSORS = JSON.stringify({
  'coretemp-isa-0000': { Adapter: 'ISA adapter', 'Package id 0': { temp1_input: 48, temp1_max: 80, temp1_crit: 100 }, 'Core 0': { temp2_input: 61 } },
  'acpitz-acpi-0': { Adapter: 'ACPI interface', temp1: { temp1_input: 27.8 } }
});
const NVIDIA = ['--query-gpu=utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits'];
/** 임시 /sys 아래에 thermal_zone을 만든다 */
const zones = (list: [type: string, milli: string][]) => {
  const sys = tmp();
  list.forEach(([type, temp], i) => {
    const d = join(sys, 'class', 'thermal', `thermal_zone${i}`);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'type'), `${type}\n`);
    writeFileSync(join(d, 'temp'), `${temp}\n`);
  });
  return sys;
};

describe('해석 함수 (research R18)', () => {
  it('parseThermal: PMU tdie 줄의 최댓값이고 다른 센서는 무시한다', () => {
    expect(parseThermal(THERMAL)).toBe(29.7);
    expect(parseThermal('gas gauge battery\t26.0\n')).toBeNull();
    expect(parseThermal('')).toBeNull();
  });

  it('parseIoreg: "Device Utilization %"=n', () => {
    expect(parseIoreg(IOREG)).toBe(42);
    expect(parseIoreg('"Tiler Utilization %"=3')).toBeNull();
  });

  it('parseZones: x86_pkg_temp만 보고 밀리도를 도로 바꾸며 여럿이면 최댓값', () => {
    expect(parseZones([{ type: 'acpitz', temp: '27800' }, { type: 'x86_pkg_temp', temp: '45000' }, { type: 'x86_pkg_temp', temp: '51500' }])).toBe(51.5);
    expect(parseZones([{ type: 'acpitz', temp: '27800' }])).toBeNull();
  });

  it('parseSensors: sensors -j의 coretemp Package id 온도', () => {
    expect(parseSensors(SENSORS)).toBe(48);
    expect(parseSensors('{"acpitz-acpi-0":{"temp1":{"temp1_input":27.8}}}')).toBeNull();
    expect(parseSensors('없음')).toBeNull();
  });

  it('parseNvidiaSmi: 줄마다 사용률, 온도이고 여럿이면 최댓값, N/A·빈 글자는 null', () => {
    expect(parseNvidiaSmi('45, 62\n')).toEqual({ util: 45, temp: 62 });
    expect(parseNvidiaSmi('45, 62\n80, 58\n')).toEqual({ util: 80, temp: 62 });
    expect(parseNvidiaSmi('[N/A], N/A\n')).toEqual({ util: null, temp: null });
    expect(parseNvidiaSmi('')).toBeNull();
  });
});

describe('readTemp · readGpu: linux (학교 데스크톱)', () => {
  it('thermal_zone 가운데 x86_pkg_temp를 읽고 sensors는 부르지 않는다', async () => {
    const run = vi.fn<Run>(async () => null);
    expect(await readTemp('linux', { sys: zones([['acpitz', '27800'], ['x86_pkg_temp', '45000']]), run })).toBe(45);
    expect(run).not.toHaveBeenCalled();
  });

  it('그 영역이 없으면 sensors -j, 둘 다 없으면 null이다', async () => {
    const run: Run = async (cmd, args) => (cmd === 'sensors' && args.join(' ') === '-j' ? SENSORS : null);
    expect(await readTemp('linux', { sys: zones([['acpitz', '27800']]), run })).toBe(48);
    expect(await readTemp('linux', { sys: tmp(), run: async () => null })).toBeNull();
  });

  it('GPU는 nvidia-smi이고 실패면 null이다', async () => {
    const run = vi.fn<Run>(async () => '37, 55\n');
    expect(await readGpu('linux', { run })).toEqual({ util: 37, temp: 55 });
    expect(run).toHaveBeenCalledWith('nvidia-smi', NVIDIA);
    expect(await readGpu('linux', { run: async () => null })).toBeNull();
  });

  it('맥·리눅스 밖의 운영체제는 못 읽는 것으로 본다', async () => {
    const run = vi.fn<Run>(async () => THERMAL);
    expect(await readTemp('win32', { run })).toBeNull();
    expect(await readGpu('win32', { run })).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});

describe('readTemp · readGpu: darwin (이 맥)', () => {
  /** 수정 시각을 정한 가짜 c 파일과 실행 파일 */
  const files = (srcAt: number, binAt: number | null) => {
    const d = tmp();
    const [src, bin] = [join(d, 'thermal.c'), join(d, 'bin', 'thermal')];
    writeFileSync(src, '// c');
    utimesSync(src, srcAt, srcAt);
    if (binAt !== null) {
      mkdirSync(dirname(bin));
      writeFileSync(bin, '');
      utimesSync(bin, binAt, binAt);
    }
    return { src, bin };
  };
  const CLANG = (bin: string, src: string) => ['clang', ['-O2', '-framework', 'IOKit', '-framework', 'CoreFoundation', '-o', bin, src]];

  it('실행 파일이 c 파일보다 새로우면 빌드하지 않고 그 출력을 읽는다', async () => {
    const { src, bin } = files(1000, 2000);
    const run = vi.fn<Run>(async cmd => (cmd === bin ? THERMAL : null));
    expect(await readTemp('darwin', { run, bin, src })).toBe(29.7);
    expect(run.mock.calls).toEqual([[bin, []]]);
  });

  it.each([['없으면', null], ['c 파일보다 오래됐으면', 500]] as const)('실행 파일이 %s 폴더를 만들고 clang으로 빌드한 뒤 읽는다', async (_name, binAt) => {
    const { src, bin } = files(1000, binAt);
    const run = vi.fn<Run>(async cmd => (cmd === 'clang' ? '' : cmd === bin ? THERMAL : null));
    expect(await readTemp('darwin', { run, bin, src })).toBe(29.7);
    expect(run.mock.calls).toEqual([CLANG(bin, src), [bin, []]]);
    expect(existsSync(dirname(bin))).toBe(true);
  });

  it('빌드가 실패하면 null이고 실행 파일을 부르지 않는다', async () => {
    const { src, bin } = files(1000, null);
    const run = vi.fn<Run>(async () => null);
    expect(await readTemp('darwin', { run, bin, src })).toBeNull();
    expect(run.mock.calls).toEqual([CLANG(bin, src)]);
  });

  it('GPU는 ioreg의 사용률이고 GPU 온도는 없다(칩 다이 온도에 든다). 실패면 null', async () => {
    const run = vi.fn<Run>(async () => IOREG);
    expect(await readGpu('darwin', { run })).toEqual({ util: 42, temp: null });
    expect(run).toHaveBeenCalledWith('ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator']);
    expect(await readGpu('darwin', { run: async () => null })).toBeNull();
  });
});
