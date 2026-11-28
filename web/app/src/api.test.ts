// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api.ts';

const answer = (status: number, body: string) => vi.stubGlobal('fetch', vi.fn(async () => new Response(status === 204 ? null : body, { status })));
const fail = async () => {
  try {
    await api('GET', '/api/x');
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('실패하지 않았다');
};
afterEach(() => { vi.unstubAllGlobals(); });

describe('api', () => {
  it('바꾸는 요청은 JSON 본문을 보내고 204는 undefined', async () => {
    answer(204, '');
    expect(await api('POST', '/api/logout')).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith('/api/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  });
  it('서버의 오류 글과 덧붙은 칸을 그대로 준다', async () => {
    answer(403, '{"error":{"code":"locked","message":"잠겼어요","until":"2026-11-25T15:20:00.000+09:00"}}');
    expect(await fail()).toMatchObject({ code: 'locked', message: '잠겼어요', extra: { until: '2026-11-25T15:20:00.000+09:00' } });
  });
  describe('boot.js가 먼저 받은 답(SC-002)', () => {
    const fresh = async () => { vi.resetModules(); return (await import('./api.ts')).api; };
    const boot = (body: string | null, status = 200) => { window.boot = new Map([['/api/me', Promise.resolve(body === null ? null : new Response(body, { status }))]]); };
    it('처음 한 번만 쓰고, 실패한 답은 쓰지 않는다', async () => {
      answer(200, '"새로"');
      let call = await fresh();
      boot('"먼저"');
      expect([await call('GET', '/api/me'), await call('GET', '/api/me')]).toEqual(['먼저', '새로']);
      for (const [body, status] of [['{"error":{"code":"login_required"}}', 401], [null, 200]] as const) {
        call = await fresh();
        boot(body, status);
        expect(await call('GET', '/api/me')).toBe('새로');
      }
    });
    it('boot.js가 앱보다 늦게 돌았거나 무언가 바꾼 뒤, 시작하고 오래되면 쓰지 않는다', async () => {
      answer(200, '"새로"');
      let call = await fresh();
      window.boot = undefined;
      await call('GET', '/api/me');
      boot('"옛"'); // 늦게 온 답이 남아도 둘째 요청은 새로 부른다
      expect(await call('GET', '/api/me')).toBe('새로');
      call = await fresh();
      window.boot = new Map([['/api/me', Promise.resolve(new Response('1'))], ['/api/home', Promise.resolve(new Response('"앞 학생의 홈"'))]]);
      await call('GET', '/api/me');
      await call('GET', '/api/me'); // 다른 탭에서 바뀌었는지 다시 본 뒤
      expect(await call('GET', '/api/home')).toBe('새로');
      call = await fresh();
      boot('"앞 학생"');
      await call('POST', '/api/login');
      expect(await call('GET', '/api/me')).toBe('새로');
      call = await fresh();
      boot('"옛"');
      vi.spyOn(performance, 'now').mockReturnValue(31_000);
      expect(await call('GET', '/api/me')).toBe('새로');
      vi.restoreAllMocks();
    });
  });
  it('HTML 오류 쪽, 끊긴 연결, 모르는 꼴', async () => {
    answer(502, '<html>bad gateway</html>');
    expect(await fail()).toMatchObject({ code: 'server_error', message: '잠시 뒤에 다시 해 주세요' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await fail()).toMatchObject({ code: 'offline', message: '인터넷에 연결되지 않았어요' });
    answer(418, '{"error":{"code":"teapot"}}');
    expect(await fail()).toMatchObject({ code: 'teapot', message: '새로 고쳐 주세요' });
    answer(500, '{}');
    expect(await fail()).toMatchObject({ code: 'unknown', message: '새로 고쳐 주세요' });
  });
  it('로그인 끊김과 동의 필요만 앱 사건으로 알린다', async () => {
    const seen: string[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent<string>).detail);
    window.addEventListener('app-auth', on);
    for (const code of ['login_required', 'consent_required', 'bad_login']) {
      answer(401, JSON.stringify({ error: { code, message: 'x' } }));
      await fail();
    }
    window.removeEventListener('app-auth', on);
    expect(seen).toEqual(['login_required', 'consent_required']);
  });
});
