// 표본·라벨러 입력·정답(sample · label-input · gold, contracts/cli.md, data-model 4·5). compare.ts가 하위 명령으로 넘겨 부른다
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bodyOf, type NoticeRow } from './cse.ts';
import { decodeCsv, parseGold, readCsv, type GoldRow } from './eval.ts';

export const DEV_GOLD = 'dev-501.csv';

/** 개발용 정답셋의 기회(스펙 2에서 기회로 라벨한 412건). 판정·표본·지표가 모두 정답셋 순서로 쓴다 */
export function devOpportunities(goldDir: string): GoldRow[] {
  const file = join(goldDir, DEV_GOLD);
  if (!existsSync(file)) throw new Error(`정답셋 파일이 없어요: ${file}`);
  const { gold, errors } = parseGold(readCsv(decodeCsv(readFileSync(file))));
  if (errors.length) throw new Error([`정답셋을 읽지 못했어요 (${errors.length}건):`, ...errors.map(e => `  ${e}`)].join('\n'));
  return gold.filter(g => g.opportunity);
}

export const noOf = (id: string) => Number(id.slice(4));
export const rowOf = (g: Pick<GoldRow, 'id' | 'title' | 'board' | 'postedAt'>): NoticeRow =>
  ({ no: noOf(g.id), title: g.title, board: g.board, postedAt: g.postedAt, pinned: false });

/** 본문 보관본만 읽는다. 학교 서버는 부르지 않는다(spec FR-027). 없으면 null */
export const cachedBody = async (no: number, cacheDir: string) =>
  (await bodyOf(no, async () => { throw new Error('보관본만 읽어요'); }, cacheDir)).lines;
