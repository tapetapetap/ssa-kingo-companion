// 분야 목록 3안 비교 명령(contracts/cli.md). `node etl/notices/compare.ts <check | sample | judge | label-input | gold | score | choose> …`
import { COURSE_ROWS, findChosen, listChars, readList, TAXONOMY_DIR, TAXONOMY_IDS, type Taxonomy } from '../taxonomy/taxonomy.ts';

/** 시험에서만 바꾼다. 없으면 저장소 기본 자리다 */
export type CompareDeps = { taxonomyDir?: string };

const USAGE = '쓰는 법: node etl/notices/compare.ts check | sample | judge <안> [--limit N] | label-input <안> <폴더> | gold <안> <A.json> <B.json> [<C.json>] | score | choose <안>';
export const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 세 목록을 검사하고 chosen이 많아야 하나인지 본다 */
function check(taxonomyDir: string): number {
  const lists: Taxonomy[] = [];
  const bad: string[] = [];
  for (const id of TAXONOMY_IDS) {
    try {
      lists.push(readList(id, taxonomyDir));
    } catch (e) {
      bad.push(messageOf(e));
    }
  }
  try {
    findChosen(lists);
  } catch (e) {
    bad.push(messageOf(e));
  }
  if (bad.length) {
    console.error(bad.join('\n'));
    return 1;
  }
  for (const t of lists) {
    const rows = COURSE_ROWS.filter(r => t.courseMap[r]?.length).length;
    console.log(`${t.id}: 묶음 ${t.groups.length} · 분야 ${t.fields.length} · 교과 지도 ${rows}/12 · 목록 ${listChars(t).toLocaleString('en-US')}자`);
  }
  return 0;
}

/** 종료 코드: 0 성공, 1 실행 실패·거절, 2 쓰는 법 틀림 */
export async function main(args: string[], deps: CompareDeps = {}): Promise<number> {
  const [cmd, ...rest] = args;
  const taxonomyDir = deps.taxonomyDir ?? TAXONOMY_DIR;
  if (cmd === 'check' && rest.length === 0) return check(taxonomyDir);
  console.error(USAGE);
  return 2;
}

// 경로에 심볼릭 링크가 있어도 진입점을 알아본다(run.ts와 같은 이유)
if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
