// 서비스 워커 파일을 읽어 가짜 전역으로 돌린다
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';

const code = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://kingo.example';
type Handler = (e: Record<string, unknown>) => void;
let on: Record<string, Handler>;
let shown: { title: string; o: Record<string, unknown> }[];
let opened: string[];
let windows: { focus: () => Promise<void>; postMessage: (m: unknown) => void }[];
let store: Map<string, Response>;
let net: (path: string) => Response;

const path = (k: string | { url: string }) => new URL(typeof k === 'string' ? k : k.url, ORIGIN).pathname;
beforeEach(() => {
  on = {};
  shown = [];
  opened = [];
  windows = [];
  store = new Map();
  net = p => new Response(p === '/' || !p.startsWith('/assets/') ? '<script src="/assets/a1.js"></script><link href="/assets/a1.css">' : p);
  const cache = {
    match: async (k: string) => store.get(path(k))?.clone(), add: async (k: string) => { store.set(path(k), net(path(k))); }, put: async (k: string, r: Response) => { store.set(path(k), r); },
    keys: async () => [...store.keys()].map(p => ({ url: ORIGIN + p })), delete: async (k: { url: string }) => store.delete(path(k))
  };
  const self = {
    location: { origin: ORIGIN }, skipWaiting: async () => {}, addEventListener: (t: string, f: Handler) => { on[t] = f; },
    registration: { showNotification: async (title: string, o: Record<string, unknown>) => { shown.push({ title, o }); } },
    clients: { claim: async () => {}, matchAll: async () => windows, openWindow: async (u: string) => { opened.push(u); } }
  };
  new Function('self', 'caches', 'fetch', code)(self, { open: async () => cache, keys: async () => ['kingo-shell-1'], delete: async () => true, match: cache.match }, async (r: string | { url: string }) => net(path(r)));
});
const fire = async (type: string, e: Record<string, unknown> = {}) => {
  const waits: Promise<unknown>[] = [];
  let answer: Promise<Response> | undefined;
  on[type]({ ...e, waitUntil: (p: Promise<unknown>) => { waits.push(p); }, respondWith: (p: Promise<Response>) => { answer = p; } });
  const res = answer && await answer.catch(() => 'fail' as const);
  await Promise.all(waits);
  return res;
};
const push = (data: unknown) => fire('push', { data: { json: () => { if (data === 'bad') throw new Error('꼴'); return data; } } });
const nav = (p: string) => fire('fetch', { request: { method: 'GET', mode: 'navigate', url: ORIGIN + p } });

describe('서비스 워커 (R3)', () => {
  it('설치하면 껍데기와 그 파일만 담고, 새 판이면 안 쓰는 파일을 지운다', async () => {
    await fire('install');
    expect([...store.keys()].toSorted()).toEqual(['/assets/a1.css', '/assets/a1.js', '/index.html']);
    net = p => new Response(p.startsWith('/assets/') ? p : '<script src="/assets/b2.js"></script>');
    await nav('/notices');
    expect([...store.keys()].toSorted()).toEqual(['/assets/b2.js', '/index.html']);
  });
  it('오프라인이면 담아 둔 껍데기를 연다. 앱이 아닌 답으로는 껍데기를 바꾸지 않는다', async () => {
    await fire('install');
    net = () => new Response('점검 중이에요');
    await nav('/');
    net = () => { throw new TypeError('끊김'); };
    expect(await (await nav('/notices/cse%3A1') as Response).text()).toContain('/assets/a1.js');
  });
  it('API와 운영자 화면, 다른 출처, GET이 아닌 것은 건드리지 않는다', async () => {
    for (const [url, method] of [[`${ORIGIN}/api/home`, 'GET'], [`${ORIGIN}/ops/`, 'GET'], ['https://other.example/assets/x.js', 'GET'], [`${ORIGIN}/`, 'POST']]) {
      expect(await fire('fetch', { request: { method, mode: 'cors', url } })).toBeUndefined();
    }
    expect([...store.keys()]).toEqual([]);
  });
  it('알림을 띄운다. 꼴이 틀려도 기본 글로 띄운다', async () => {
    await push({ title: '제5회 AI 해커톤', body: '3일 뒤 마감', url: '/notices/cse%3A1', tag: 'kingo-2026-11-27' });
    expect(shown[0]).toMatchObject({ title: '제5회 AI 해커톤', o: { body: '3일 뒤 마감', tag: 'kingo-2026-11-27', data: { url: '/notices/cse%3A1' } } });
    for (const bad of ['bad', null, {}, { title: 1, body: 'x' }]) await push(bad);
    expect(shown.slice(1).every(n => n.title === '킹고 컴패니언' && (n.o.data as { url: string }).url === '/list')).toBe(true);
    expect(shown).toHaveLength(5);
    await fire('push', { data: null });
    expect(shown).toHaveLength(6);
  });
  it('누르면 열린 창에서 그 화면으로, 없으면 새 창. 앱 밖 주소는 따르지 않는다', async () => {
    const click = (url: unknown) => fire('notificationclick', { notification: { close: () => {}, data: { url } } });
    await click('/notices/cse%3A1');
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', '/..//evil.example', undefined]) await click(bad);
    expect(opened).toEqual(['/notices/cse%3A1', '/list', '/list', '/list', '/list', '/list']);
    const got: unknown[] = [];
    windows = [{ focus: async () => { got.push('focus'); }, postMessage: m => { got.push(m); } }];
    await click('/list');
    expect(got).toEqual(['focus', { kind: 'open', url: '/list' }]);
  });
});
