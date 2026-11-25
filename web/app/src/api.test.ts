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
