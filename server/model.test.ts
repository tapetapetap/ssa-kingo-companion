import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Post } from '../etl/notices/llm.ts';
import { openModel, withModelLock } from './model.ts';
import { testDb } from './test/db.ts';

let db: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });

/** 부하 제한의 가짜 센서·시계(온도는 늘 50°C, 쉬지 않는다) */
const throttle = (temp: number | null = 50) => ({
  readTemp: async () => temp, readGpu: async () => null, sleep: async () => {}, every: () => () => {}, logDir: mkdtempSync(join(tmpdir(), 'load-'))
});
const reply = (o: unknown, status = 200) => ({ status, text: async () => JSON.stringify(o) });
const okPost = (content = '{"pick":1,"reason":"좋아요","cited":[]}', count?: number) =>
  vi.fn<Post>(async () => reply({ message: { content }, ...(count === undefined ? {} : { prompt_eval_count: count }) }));

describe('openModel (research R7, contracts/llm.md)', () => {
  it('chat은 /api/chat에 계약대로 보내고 글을 돌려준다', async () => {
    const post = okPost();
    const m = openModel(db.sql, 'api', { host: 'localhost:9', model: 'm:1', post, throttle: throttle() });
    expect(await m.chat('지시', '재료', { type: 'object' })).toEqual({ text: '{"pick":1,"reason":"좋아요","cited":[]}' });
    const [url, body] = post.mock.calls[0];
    expect(url).toBe('http://localhost:9/api/chat');
    expect(JSON.parse(body)).toEqual({
      model: 'm:1', stream: false, think: false, keep_alive: '10m', options: { temperature: 0, num_ctx: 8192 }, format: { type: 'object' },
      messages: [{ role: 'system', content: '지시' }, { role: 'user', content: '재료' }]
    });
    await m.close();
  });

  it.each<[string, Post, string]>([
    ['2xx 아님', vi.fn<Post>(async () => reply({}, 500)), 'fail'],
    ['404는 못 물음', vi.fn<Post>(async () => reply({}, 404)), 'down'],
    ['연결 실패', vi.fn<Post>(async () => { throw new TypeError('fetch failed'); }), 'down'],
    ['시간 초과', vi.fn<Post>(async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); }), 'fail'],
    ['꼴 틀림', vi.fn<Post>(async () => ({ status: 200, text: async () => 'not json' })), 'fail'],
    ['문맥 95% 이상', okPost('{}', 7783), 'fail']
  ])('실패 구분: %s', async (_name, post, out) => {
    const m = openModel(db.sql, 'api', { post, throttle: throttle() });
    expect(await m.chat('s', 'u', {})).toBe(out);
    await m.close();
  });

  it('온도를 읽지 못하면 보내지 않고 못 물음이고 noTemp를 센다', async () => {
    const post = okPost();
    const m = openModel(db.sql, 'api', { post, throttle: throttle(null) });
    expect(await m.chat('s', 'u', {})).toBe('down');
    expect(post).not.toHaveBeenCalled();
    expect(m.noTemp).toBe(1);
    await m.close();
  });

  it('close()는 요청이 있을 때만, 두 번 불러도 model_bursts에 한 줄 남긴다', async () => {
    await db.sql`delete from model_bursts`;
    const idle = openModel(db.sql, 'daily', { post: okPost(), throttle: throttle() });
    await idle.close();
    expect((await db.sql`select count(*)::int n from model_bursts`)[0].n).toBe(0);
    const m = openModel(db.sql, 'daily', { post: okPost(), throttle: throttle() });
    await m.chat('s', 'u', {});
    await m.close();
    await m.close();
    expect([...(await db.sql`select who, requests from model_bursts`)]).toEqual([{ who: 'daily', requests: 1 }]);
  });

  it('모델 잠금은 한 번에 하나만 들어간다(두 요청이 겹치지 않는다)', async () => {
    let inside = 0;
    let most = 0;
    const work = () => withModelLock(db.sql, async () => {
      inside++;
      most = Math.max(most, inside);
      await new Promise(r => setTimeout(r, 30));
      inside--;
    });
    await Promise.all([work(), work(), work()]);
    expect(most).toBe(1);
  });
});
