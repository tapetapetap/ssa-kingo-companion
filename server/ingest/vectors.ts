// 넣기의 벡터(research R11): 분류기 보관 벡터를 먼저 읽고, 없으면 1단계 글 규칙으로 만든다. 본문은 보관본에서만 읽고(학교 서버를 부르지 않는다) 돌려주지 않는다
import { EMBED_CACHE_DIR, fieldVectors, noticeVector, readFieldVectors, readNoticeVector, type Embed, type FieldVectors } from '../../etl/notices/embed.ts';
import { CACHE_DIR } from '../../etl/notices/cse.ts';
import { cachedBody } from '../../etl/notices/gold.ts';
import type { Taxonomy } from '../../etl/taxonomy/taxonomy.ts';

export const DIM = 1024;
export type VectorDeps = { embed?: Embed; cacheDir?: string; embedDir?: string; dryRun?: boolean };
/** kept: 보관을 씀, made: 새로 만듦(dryRun이면 만들 수), failed: 못 만듦(본문 없음, 임베딩 실패, 길이가 1024가 아님) */
export type VectorResult = { vector: number[] | null; how: 'kept' | 'made' | 'failed' };

const ok = (v: number[] | null | undefined): v is number[] => Array.isArray(v) && v.length === DIM;

export async function noticeVectorFor(o: { no: number; title: string; postedAt: string }, d: VectorDeps): Promise<VectorResult> {
  const kept = readNoticeVector(o.no, d.embedDir ?? EMBED_CACHE_DIR);
  if (kept) return ok(kept) ? { vector: kept, how: 'kept' } : { vector: null, how: 'failed' };
  if (d.dryRun) return { vector: null, how: 'made' };
  if (!d.embed) return { vector: null, how: 'failed' };
  const lines = await cachedBody(o.no, d.cacheDir ?? CACHE_DIR);
  if (!lines) return { vector: null, how: 'failed' };
  const v = await noticeVector({ no: o.no, title: o.title, board: '', postedAt: o.postedAt, pinned: false }, lines, d.embed, d.embedDir ?? EMBED_CACHE_DIR);
  return typeof v !== 'string' && ok(v) ? { vector: v, how: 'made' } : { vector: null, how: 'failed' };
}

/** 분야 벡터. 보관이 없고 만들지 못하면 null(분야는 벡터 없이 들어간다) */
export async function fieldVectorsFor(t: Taxonomy, d: VectorDeps): Promise<FieldVectors | null> {
  const dir = d.embedDir ?? EMBED_CACHE_DIR;
  const kept = readFieldVectors(t, dir);
  if (kept || d.dryRun || !d.embed) return kept && kept.vectors.every(ok) ? kept : null;
  const r = await fieldVectors(t, d.embed, dir);
  return typeof r !== 'string' && r.vectors.every(ok) ? r : null;
}

export const vectorText = (v: number[]) => `[${v.join(',')}]`;
