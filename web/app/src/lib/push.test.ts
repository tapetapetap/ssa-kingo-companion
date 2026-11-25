// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { drop, pushState, turnOff, turnOn } from './push.ts';

const env = { ios: false, standalone: false, supported: true, permission: 'default', subscribed: false };
const ready = { ready: true, on: false };

describe('알림 상태 (FR-036)', () => {
  it('지원·설치·준비·막힘·꺼짐·켜짐', () => {
    expect(pushState(ready, { ...env, ios: true, supported: false })).toBe('install');
    expect(pushState(ready, { ...env, ios: true, standalone: true })).toBe('off');
    expect(pushState(ready, { ...env, supported: false })).toBe('unsupported');
    expect(pushState({ ready: false, on: false }, env)).toBe('soon');
    expect(pushState(ready, { ...env, permission: 'denied' })).toBe('denied');
    expect(pushState(ready, env)).toBe('off');
    expect(pushState({ ready: true, on: true }, { ...env, permission: 'granted', subscribed: true })).toBe('on');
    // 로그아웃한 기기에 브라우저 구독이 남아 있어도 꺼짐
    expect(pushState(ready, { ...env, permission: 'granted', subscribed: true })).toBe('off');
    expect(pushState({ ready: true, on: true }, { ...env, permission: 'granted' })).toBe('off');
  });
});

describe('켜기와 끄기', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  function browser(permission: string, put = 204) {
    const log: string[] = [];
    const sub = { unsubscribe: async () => { log.push('unsubscribe'); return true; }, toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'p', auth: 'a' } }) };
    let have: typeof sub | null = null;
    const pushManager = { getSubscription: async () => have, subscribe: async (o: { applicationServerKey: string }) => { log.push(`subscribe ${o.applicationServerKey}`); have = sub; return sub; } };
    vi.stubGlobal('Notification', { permission, requestPermission: async () => permission });
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ pushManager }) }, userAgent: '' });
    vi.stubGlobal('fetch', async (p: string, o: { method: string }) => {
      log.push(`${o.method} ${p}`);
      return o.method === 'GET' ? new Response('{"key":"K"}') : new Response(put === 204 ? null : '{"error":{"code":"invalid","message":"x"}}', { status: put });
    });
    return log;
  }
  it('허용하면 구독을 만들어 저장한다', async () => {
    const log = browser('granted');
    expect(await turnOn()).toBe(true);
    expect(log).toEqual(['GET /api/me/push/key', 'subscribe K', 'PUT /api/me/push']);
    await turnOff();
    expect(log.slice(3)).toEqual(['DELETE /api/me/push', 'unsubscribe']);
  });
  it('거절하면 아무것도 하지 않고, 저장이 실패하면 구독을 거둔다', async () => {
    expect(await (browser('denied'), turnOn())).toBe(false);
    const log = browser('granted', 422);
    await expect(turnOn()).rejects.toThrow('x');
    expect(log.at(-1)).toBe('unsubscribe');
  });
  it('지원하지 않는 브라우저에서 거두기는 조용하다', async () => {
    vi.stubGlobal('navigator', { userAgent: '' });
    await expect(drop()).resolves.toBeUndefined();
  });
});
