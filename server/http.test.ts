import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { health, HttpError, match, parseCookies, type Route } from './http.ts';
import { testApp } from './test/app.ts';

describe('match · parseCookies', () => {
  it('틀의 :이름 자리를 꺼내고, 조각 수나 글자가 다르면 null', () => {
    expect(match('/api/notices/:id', '/api/notices/cse%3A228336')).toEqual({ id: 'cse:228336' });
    expect(match('/api/notices/:id', '/api/notices')).toBeNull();
    expect(match('/api/notices/:id', '/api/notices/')).toBeNull();
    expect(match('/api/notices/:id/action', '/api/notices/1/other')).toBeNull();
    expect(match('/api/notices/:id', '/api/notices/%E0%A4%A')).toBeNull();
  });
  it('쿠키 머리를 이름과 값으로 나눈다', () => {
    expect(parseCookies('a=1; kingo_session=x=y')).toEqual({ a: '1', kingo_session: 'x=y' });
    expect(parseCookies(undefined)).toEqual({});
  });
});

const routes: Route[] = [
  health,
  ['GET', '/api/echo/:id', req => ({ body: { id: req.params.id, q: req.query.get('q') } })],
  ['POST', '/api/echo', req => ({ body: req.body })],
  ['POST', '/api/logout', () => ({ status: 204 })],
  ['GET', '/api/boom', () => { throw new Error('비밀 본문이 든 오류'); }],
  ['GET', '/api/no', () => { throw new HttpError(422, 'invalid', '값이 틀려요', { field: 'grade' }); }]
];

let app: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => { app = await testApp(routes); });
afterAll(async () => { await app.close(); });

describe('HTTP 틀 (contracts/api.md 공통)', () => {
  it('GET /api/health는 { ok: true }', async () => {
    expect(await app.request('GET', '/api/health')).toMatchObject({ status: 200, body: { ok: true } });
  });

  it('경로 자리와 질의를 꺼낸다. 없는 경로·다른 방법은 404 not_found', async () => {
    expect((await app.request('GET', '/api/echo/7?q=a')).body).toEqual({ id: '7', q: 'a' });
    expect(await app.request('GET', '/api/nope')).toMatchObject({ status: 404, body: { error: { code: 'not_found' } } });
    expect((await app.request('DELETE', '/api/echo/7')).status).toBe(404);
  });

  it('상태를 바꾸는 요청은 JSON이고 같은 출처여야 한다. 아니면 403 bad_origin', async () => {
    expect((await app.request('POST', '/api/echo', { a: 1 })).body).toEqual({ a: 1 });
    expect(await app.request('POST', '/api/echo', { a: 1 }, { origin: 'http://evil.example' })).toMatchObject({ status: 403, body: { error: { code: 'bad_origin' } } });
    expect((await app.request('POST', '/api/echo', 'a=1', { 'content-type': 'application/x-www-form-urlencoded' })).status).toBe(403);
    expect((await app.request('POST', '/api/echo', { a: 1 }, { origin: '' })).status).toBe(403);
  });

  it('빈 본문은 {}이고, JSON이 아니거나 64KB를 넘으면 400 bad_request', async () => {
    expect((await app.request('POST', '/api/logout')).status).toBe(204);
    expect((await app.request('POST', '/api/echo')).body).toEqual({});
    expect(await app.request('POST', '/api/echo', '{깨짐')).toMatchObject({ status: 400, body: { error: { code: 'bad_request' } } });
    expect((await app.request('POST', '/api/echo', { s: 'x'.repeat(70_000) })).status).toBe(400);
  });

  it('HttpError는 그 상태와 꼴, 던진 다른 오류는 500 server_error이고 기록에 본문이 없다', async () => {
    expect(await app.request('GET', '/api/no')).toMatchObject({ status: 422, body: { error: { code: 'invalid', message: '값이 틀려요', field: 'grade' } } });
    expect(await app.request('GET', '/api/boom')).toMatchObject({ status: 500, body: { error: { code: 'server_error', message: '잠시 뒤에 다시 해 주세요' } } });
    const logged = app.lines.map(l => JSON.parse(l));
    expect(logged.find(l => l.kind === 'error')).toMatchObject({ route: '/api/boom' });
    expect(logged.find(l => l.kind === 'request' && l.route === '/api/echo/:id')).toMatchObject({ method: 'GET', status: 200 });
    expect(app.lines.join('\n')).not.toContain('"a":1');
  });
});
