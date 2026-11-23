// 정답셋 후보 내보내기(FR-053, contracts/cli.md): 사람 판정이 하나라도 있는 공지를 CSV로. 정답 라벨이라 저장소 안에는 쓰지 않는다
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { insideRepo } from '../../etl/notices/gold.ts';
import { KIND_LABEL, type Kind } from '../../etl/notices/classify.ts';
import type { Sql } from '../db/sql.ts';
import { kstIso } from '../http.ts';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const HEAD = ['링크', '제목', '게시일', '주최', '기회', '종류', '마감', '핵심 분야', '관련 분야', '고친 칸', '고친 때'];
const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** 쓴 파일 경로와 줄 수. 저장소 안 폴더면 던진다 */
export async function exportGold(sql: Sql, dir: string, repoRoot = REPO): Promise<{ path: string; rows: number }> {
  if (insideRepo(dir, repoRoot)) throw new Error(`정답 라벨이라 저장소 안 폴더에는 쓰지 않아요: ${dir}`);
  const rows = await sql<{ url: string; title: string; posted_on: string; host: string | null; is_notice: boolean; kind: string | null; deadline: string | null; field_state: string; core: string[]; related: string[]; edited: string[]; at: Date }[]>`
    select n.url, n.title, n.posted_on::text, n.host, n.is_notice, n.kind, n.deadline::text, n.field_state,
      array(select field_id from notice_fields nf where nf.notice_id = n.id and level = 'core' order by ord) as core,
      array(select field_id from notice_fields nf where nf.notice_id = n.id and level = 'related' order by ord) as related,
      h.edited, h.at
    from notices n join (select notice_id, array_agg(field order by field) as edited, max(at) as at from human_verdicts group by notice_id) h on h.notice_id = n.id
    order by n.posted_on, n.id`;
  const ids = (judged: boolean, xs: string[]) => (!judged ? '' : xs.length ? xs.join('|') : '-');
  const lines = rows.map(r => {
    const judged = r.field_state === 'judged' || r.field_state === 'human';
    return [r.url, r.title, r.posted_on, r.host ?? '', r.is_notice ? 'O' : 'X', r.kind ? KIND_LABEL[r.kind as Kind] : '', r.deadline ?? '',
      ids(judged, r.core), ids(judged, r.related), r.edited.join('|'), kstIso(r.at)].map(cell).join(',');
  });
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `gold-candidates-${kstIso(new Date()).slice(0, 10)}.csv`);
  writeFileSync(path, [HEAD.map(cell).join(','), ...lines].join('\n') + '\n');
  return { path, rows: rows.length };
}
