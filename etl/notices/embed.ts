// 임베딩 후보(research R17): 분야와 공지를 bge-m3 벡터로 만들어 공지마다 가까운 분야 30개를 고른다.
// 벡터는 이 컴퓨터에만 보관하고(etl/.cache/embed), 2단계 DB·추천이 다시 쓴다. 본문 글자는 보관하지 않는다
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupPath, type Field, type Taxonomy } from '../taxonomy/taxonomy.ts';
import type { NoticeRow } from './cse.ts';
import { fetchPost, keep, modelDir, ollamaBase, postOnce, readJson, sha8, type Gate, type Post } from './llm.ts';

/** 바꾸면 판정 판이 바뀐다(CANDIDATE_RULE) */
export const EMBED_MODEL = 'bge-m3';
export const EMBED_K = 30;
const NOTICE_CHARS = 1500;
const BATCH = 32;
export const EMBED_CACHE_DIR = fileURLToPath(new URL('../.cache/embed', import.meta.url));
/** 판정 판 재료(contracts/field-llm.md '판정 판') */
export const CANDIDATE_RULE = { model: EMBED_MODEL, k: EMBED_K, field: '묶음 > 이름: 설명', notice: '제목 + 본문 앞 1500자', pick: '코사인 상위 k, k개 이하면 모두' };

export type Embed = (texts: string[]) => Promise<number[][] | 'fail' | 'down'>;
export type FieldVectors = { ids: string[]; vectors: number[][] };

const isVector = (v: unknown): v is number[] => Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'number' && Number.isFinite(x));
/** 글 수만큼, 차원이 같고 0이 아닌 수 배열 */
const isVectors = (v: unknown, n: number): v is number[][] =>
  Array.isArray(v) && v.length === n && v.every(isVector) && v.every(x => x.length === (v[0] as number[]).length);

export const fieldText = (t: Taxonomy, f: Field) => `${groupPath(t, f.group)} > ${f.name}: ${f.desc}`;
export function noticeText(row: NoticeRow, lines: string[]): string {
  const body = lines.join('\n').slice(0, NOTICE_CHARS);
  return body ? `${row.title}\n${body}` : row.title;
}

/** 실패 구분은 makeChat과 같다: 시간 초과·2xx 아님·꼴 틀림은 fail, 연결 실패·404는 down(그 뒤로 부르지 않음), 부하 제한이 막으면 down(잠그지 않음) */
export function makeEmbed(o: { host?: string; post?: Post; gate?: Gate } = {}): Embed {
  const base = ollamaBase(o.host ?? process.env.OLLAMA_HOST);
  const post = o.post ?? fetchPost;
  let down = false;
  return async texts => {
    if (down) return 'down';
    const res = await postOnce(post, `${base}/api/embed`, JSON.stringify({ model: EMBED_MODEL, input: texts, truncate: true, keep_alive: '10m' }), o.gate);
    if (res === 'down') down = true;
    if (typeof res === 'string') return res === 'fail' ? 'fail' : 'down';
    try {
      const v = (JSON.parse(res.text) as { embeddings?: unknown }).embeddings;
      return isVectors(v, texts.length) ? v : 'fail';
    } catch {
      return 'fail';
    }
  };
}

/** 목록 sha: [id, 분야 글] 목록의 sha1 앞 8자. 설명 한 글자가 바뀌어도 바뀐다 */
const listSha = (t: Taxonomy) => sha8(JSON.stringify(t.fields.map(f => [f.id, fieldText(t, f)])));
const fieldFile = (t: Taxonomy, dir: string, sha = listSha(t)) => join(dir, modelDir(EMBED_MODEL), `${t.id}-${sha}.json`);
const noticeFile = (no: number, dir: string) => join(dir, modelDir(EMBED_MODEL), 'notices', `${no}.json`);

/** 보관한 분야 벡터. 파일 이름에 목록 sha가 들어 설명이 바뀌면 다른 파일이다. ids가 지금 목록과 다르면 null */
export function readFieldVectors(t: Taxonomy, dir = EMBED_CACHE_DIR): FieldVectors | null {
  const o = readJson(fieldFile(t, dir));
  const ids = t.fields.map(f => f.id);
  if (!o || JSON.stringify(o.ids) !== JSON.stringify(ids) || !isVectors(o.vectors, ids.length)) return null;
  return { ids, vectors: o.vectors };
}

/** 보관이 없으면 한 요청에 32개씩 받는다. 하나라도 실패하면 그 결과이고 보관하지 않는다 */
export async function fieldVectors(t: Taxonomy, embed: Embed, dir = EMBED_CACHE_DIR): Promise<FieldVectors | 'fail' | 'down'> {
  const kept = readFieldVectors(t, dir);
  if (kept) return kept;
  const texts = t.fields.map(f => fieldText(t, f));
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const r = await embed(texts.slice(i, i + BATCH));
    if (r === 'fail' || r === 'down') return r;
    vectors.push(...r);
  }
  const ids = t.fields.map(f => f.id);
  const sha = listSha(t);
  keep(fieldFile(t, dir, sha), { model: EMBED_MODEL, taxonomy: t.id, sha, at: new Date().toISOString(), ids, vectors });
  return { ids, vectors };
}

/** 보관한 공지 벡터. score가 요청 없이 후보를 다시 셀 때 쓴다(본문이 없어 글 sha는 보지 않는다) */
export function readNoticeVector(no: number, dir = EMBED_CACHE_DIR): number[] | null {
  const o = readJson(noticeFile(no, dir));
  return o && isVector(o.vector) ? o.vector : null;
}

/** 세 안이 함께 쓴다. 글 sha가 같으면 보관한 벡터이고, 글이 바뀌었으면 다시 받는다 */
export async function noticeVector(row: NoticeRow, lines: string[], embed: Embed, dir = EMBED_CACHE_DIR): Promise<number[] | 'fail' | 'down'> {
  const sha = sha8(noticeText(row, lines));
  const file = noticeFile(row.no, dir);
  const o = readJson(file);
  if (o && o.sha === sha && isVector(o.vector)) return o.vector;
  const r = await embed([noticeText(row, lines)]);
  if (r === 'fail' || r === 'down') return r;
  keep(file, { model: EMBED_MODEL, sha, at: new Date().toISOString(), vector: r[0] });
  return r[0];
}

const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

/** 코사인 유사도 상위 k개를 목록 순서로. 같은 점수는 목록 앞이 먼저다. k개 이하면 모두 */
export function topCandidates(fv: FieldVectors, vector: number[], k = EMBED_K): string[] {
  const n = norm(vector);
  const score = fv.vectors.map(v => v.reduce((s, x, i) => s + x * (vector[i] ?? 0), 0) / (norm(v) * n || 1)); // bge-m3는 길이 1로 나오지만 길이로 나눈다
  return score.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, k).map(x => x.i).sort((a, b) => a - b).map(i => fv.ids[i]);
}
