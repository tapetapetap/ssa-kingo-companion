// 모델 요청(research R7, contracts/llm.md): 부하 제한 하나와 chat·embed를 묶어 준다. 요청은 모델 잠금 안에서 한 번에 하나만 간다
import { makeEmbed, type Embed } from '../etl/notices/embed.ts';
import { DEFAULT_MODEL, fetchPost, ollamaBase, postOnce, type Post } from '../etl/notices/llm.ts';
import { createThrottle, type LoadSummary, type ThrottleDeps } from '../etl/notices/throttle.ts';
import type { Sql } from './db/sql.ts';

export const MODEL_OPTIONS = { temperature: 0, num_ctx: 8192 };
export type Who = 'api' | 'daily' | 'ingest';
export type ChatOut = { text: string } | 'fail' | 'down';
export type Chat = (system: string, user: string, schema: object) => Promise<ChatOut>;
export type Model = { name: string; chat: Chat; embed: Embed; readonly noTemp: number; close: () => Promise<LoadSummary> };
export type ModelDeps = { host?: string; model?: string; post?: Post; throttle?: Partial<ThrottleDeps> };

/** 프로세스 사이 모델 잠금. 연결 하나를 따로 잡아 세션 잠금을 걸고 놓는다. 키는 스키마 이름으로 만든다(시험 파일끼리 막지 않게) */
export async function withModelLock<T>(sql: Sql, fn: () => Promise<T>): Promise<T> {
  const conn = await sql.reserve();
  try {
    await conn`select pg_advisory_lock(hashtext('kingo:model:' || current_schema()))`;
    try {
      return await fn();
    } finally {
      await conn`select pg_advisory_unlock(hashtext('kingo:model:' || current_schema()))`;
    }
  } finally {
    conn.release();
  }
}

export type Installed = { name: string; size: number; parameterSize: string | null; family: string };
/** 모델 서버에 설치된 모델(FR-042·FR-051). 3초 안에 답이 없으면 던진다 */
export async function installedModels(host?: string): Promise<Installed[]> {
  const res = await fetch(`${ollamaBase(host ?? process.env.OLLAMA_HOST)}/api/tags`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error('모델 서버의 답이 실패예요');
  const { models = [] } = await res.json() as { models?: { name: string; size?: number; details?: { family?: string; parameter_size?: string } }[] };
  return models.map(m => ({ name: m.name, size: m.size ?? 0, parameterSize: m.details?.parameter_size || null, family: m.details?.family ?? '' }));
}

/** 부하 제한 하나를 연다. close()는 요약을 model_bursts에 한 줄 남긴다(요청이 0이면 남기지 않는다) */
export function openModel(sql: Sql, who: Who, d: ModelDeps = {}): Model {
  const name = d.model ?? (process.env.KINGO_LLM_MODEL || DEFAULT_MODEL);
  const base = ollamaBase(d.host ?? process.env.OLLAMA_HOST);
  const post = d.post ?? fetchPost;
  const throttle = createThrottle(d.throttle);
  const gate = throttle.gate();
  const started = new Date();
  let closed: Promise<LoadSummary> | null = null; // 두 번 닫아도 기록은 한 줄
  const rawEmbed = makeEmbed({ host: d.host, post, gate });
  const chat: Chat = (system, user, schema) => withModelLock(sql, async () => {
    const body = JSON.stringify({
      model: name, stream: false, think: false, keep_alive: '10m', options: MODEL_OPTIONS, format: schema,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    });
    const res = await postOnce(post, `${base}/api/chat`, body, gate);
    if (res === 'closed' || res === 'down') return 'down';
    if (res === 'fail') return 'fail';
    try {
      const r = JSON.parse(res.text) as { message?: { content?: unknown }; prompt_eval_count?: unknown };
      if (typeof r.message?.content !== 'string') return 'fail';
      if (typeof r.prompt_eval_count === 'number' && r.prompt_eval_count * 100 >= 95 * MODEL_OPTIONS.num_ctx) return 'fail'; // 재료가 잘렸을 수 있다
      return { text: r.message.content };
    } catch {
      return 'fail';
    }
  });
  const embed: Embed = texts => withModelLock(sql, () => rawEmbed(texts));
  return {
    name, chat, embed,
    get noTemp() { return gate.noTemp; },
    close: () => (closed ??= (async () => {
      const s = throttle.stop();
      if (!s.requests) return s;
      await sql`insert into model_bursts (who, started_at, ended_at, requests, request_ms, gpu_avg, temp_max)
        values (${who}, ${started}, ${new Date()}, ${s.requests}, ${s.requestMs}, ${s.gpuAvg}, ${s.tempMax})`;
      return s;
    })())
  };
}
