import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildNcs, HEAD, readRows, readShared, saveNcs } from './ncs.ts';
import { checkTaxonomy, COURSE_ROWS, loadTaxonomy, saveTaxonomy } from './taxonomy.ts';

describe('readShared', () => {
  it('<si><t>와 서식 조각(<r><t>)을 이어 읽고, 읽는 법(rPh)은 빼고, 글자 참조를 푼다', () => {
    const xml = '<sst count="5"><si><t>가</t></si><si><r><t>나</t></r><r><rPr><b/></rPr><t xml:space="preserve">다 </t></r></si>'
      + '<si><t>A&amp;B &#44032;</t></si><si><t/></si><si><t>漢</t><rPh sb="0" eb="1"><t>한</t></rPh></si></sst>';
    expect(readShared(xml)).toEqual(['가', '나다 ', 'A&B 가', '', '漢']);
  });
});

describe('readRows', () => {
  it('칸 주소로 A~H만 고른다: 공유 문자열, 바로 쓴 글자, 숫자, 빈 칸', () => {
    const shared = ['대분류코드', '20', '정보통신'];
    const xml = '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="I1" t="s"><v>2</v></c></row>'
      + '<row r="2" spans="1:20"><c r="A2" s="2" t="s"><v>1</v></c><c r="B2" t="s"><v>2</v></c><c r="C2" s="1"/>'
      + '<c r="D2" t="inlineStr"><is><t>정보&lt;기술&gt;</t></is></c><c r="F2"><v>7</v></c><c r="H2" t="s"><v>2</v></c><c r="T2" t="s"><v>0</v></c></row>';
    expect(readRows(xml, shared)).toEqual([
      ['대분류코드', '', '', '', '', '', '', ''],
      ['20', '정보통신', '', '정보<기술>', '', '7', '', '정보통신']
    ]);
  });
});

describe('buildNcs', () => {
  const row = (a: string, c: string, e: string, g: string, small = `소${a}${c}${e}`, detail = `세${a}${c}${e}${g}`) =>
    [a, `대${a}`, c, `중${a}${c}`, e, small, g, detail];
  const map = (code?: string) => Object.fromEntries(COURSE_ROWS.map(r => [r, r === 'security' && code ? [code] : []]));
  const rows = [
    [...HEAD],
    row('20', '01', '02', '02'), row('20', '01', '02', '01'), row('20', '01', '02', '01'), // 같은 세분류가 여러 줄(능력단위마다)
    row('20', '02', '01', '01'),
    row('01', '01', '01', '01')
  ];

  it('묶음은 대·중분류, 분야는 소분류다. 설명은 세분류 이름을 코드 순서로 잇고, 개수를 센다', () => {
    const t = buildNcs(rows, '2026-02', map('200102'));
    expect(t.groups).toEqual([
      { id: 'ncs-01', name: '대01', parent: null }, { id: 'ncs-0101', name: '중0101', parent: 'ncs-01' },
      { id: 'ncs-20', name: '대20', parent: null }, { id: 'ncs-2001', name: '중2001', parent: 'ncs-20' }, { id: 'ncs-2002', name: '중2002', parent: 'ncs-20' }
    ]);
    expect(t.fields.map(f => [f.id, f.name, f.group, f.ncs, f.desc])).toEqual([
      ['ncs-010101', '소010101', 'ncs-0101', '010101', '세01010101'],
      ['ncs-200102', '소200102', 'ncs-2001', '200102', '세20010201, 세20010202'],
      ['ncs-200201', '소200201', 'ncs-2002', '200201', '세20020101']
    ]);
    expect(t.fields.every(f => f.descFrom === 'source' && f.csr.length === 0)).toBe(true);
    expect(t.sourceCounts).toEqual({ major: 2, middle: 3, minor: 3, detail: 4 });
    expect(t).toMatchObject({ id: 'ncs', edition: '2026-02', chosen: null });
    expect(t.courseMap.security).toEqual(['ncs-200102']);
    expect(checkTaxonomy(t)).toEqual([]);
  });

  it('설명은 240자 안에 드는 마지막 이름까지(말줄임표 없음), 첫 이름이 240자를 넘으면 240자에서 자른다', () => {
    const long = (n: number) => '가'.repeat(n);
    const t = buildNcs([
      [...HEAD],
      row('20', '01', '01', '01', '소', long(100)), row('20', '01', '01', '02', '소', long(100)), row('20', '01', '01', '03', '소', long(100)),
      row('20', '01', '02', '01', '둘', long(250))
    ], '2026-02', map());
    expect(t.fields[0].desc).toBe(`${long(100)}, ${long(100)}`);
    expect(t.fields[1].desc).toBe(long(240));
  });

  it('다시 만들어 저장할 때(saveNcs) 기존 ncs.json의 chosen을 옮겨 적는다. 파일이 없으면 null이다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ncs-'));
    saveNcs(buildNcs(rows, '2026-02', map()), dir);
    expect(loadTaxonomy('ncs', dir).chosen).toBeNull();
    const chosen = { date: '2026-11-20', corePrecision: { num: 88, den: 100 }, prompt: '1a2b3c4d', model: 'gemma4:12b' };
    saveTaxonomy({ ...loadTaxonomy('ncs', dir), chosen }, dir);
    saveNcs(buildNcs(rows, '2026-02', map()), dir);
    expect(loadTaxonomy('ncs', dir).chosen).toEqual(chosen);
  });

  it.each<[string, string[][], string]>([
    ['머리줄이 다름', [['대분류', ...HEAD.slice(1)], row('20', '01', '01', '01')], '머리줄이 달라요'],
    ['코드가 두 자리가 아님', [[...HEAD], row('20', '1', '01', '01')], '코드 꼴이 틀린 줄이 있어요: 20 1 01 01'],
    ['같은 코드에 다른 이름', [[...HEAD], row('20', '01', '01', '01'), row('20', '01', '01', '02', '다른 이름')], '소분류 200101의 이름이 둘이에요'],
    ['대응표 코드가 표에 없음', [[...HEAD], row('20', '01', '01', '01')], '교과 지도 대응표의 소분류가 표에 없어요: 209999']
  ])('던진다: %s', (_name, input, message) => {
    expect(() => buildNcs(input, '2026-02', map('209999'))).toThrow(message);
  });
});
