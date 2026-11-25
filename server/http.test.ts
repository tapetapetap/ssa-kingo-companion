import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { brotliCompressSync } from 'node:zlib';
import { connect } from 'node:net';
import { join } from 'node:path';
import { health, HttpError, kstIso, match, parseCookies, type Route } from './http.ts';
import { testApp } from './test/app.ts';

describe('match · parseCookies', () => {
  it('틀의 :이름 자리를 꺼내고, 조각 수나 글자가 다르면 null', () => {
    expect(match('/api/notices/:id', '/api/notices/cse%3A228336')).toEqual({ id: 'cse:228336' });
    expect(match('/api/notices/:id', '/api/notices')).toBeNull();
    expect(match('/api/notices/:id', '/api/notices/')).toBeNull();
    expect(match('/api/notices/:id/action', '/api/notices/1/other')).toBeNull();
    expect(match('/api/notices/:id', '/api/notices/%E0%A4%A')).toBeNull();
  });
  it('때는 한국 시간 +09:00 꼴이다', () => {
    expect(kstIso(new Date('2026-11-19T02:51:53.323Z'))).toBe('2026-11-19T11:51:53.323+09:00');
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

describe('운영자 화면 파일 (contracts/api.md 정적 파일)', () => {
  it('/ops/는 index, 파일은 종류와 함께 로그인 없이 준다. 폴더 밖(..)이나 없는 파일·폴더는 404', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ops-'));
    const dir = join(root, 'dist');
    mkdirSync(join(dir, 'assets'), { recursive: true });
    writeFileSync(join(dir, 'index.html'), '<!doctype html>판정 검토');
    writeFileSync(join(dir, 'assets', 'a.js'), 'x=1');
    writeFileSync(join(root, 'secret.txt'), '비밀');
    const ops = await testApp([], dir);
    expect(await ops.request('GET', '/ops/')).toMatchObject({ status: 200, body: '<!doctype html>판정 검토' });
    const js = await ops.request('GET', '/ops/assets/a.js');
    expect([js.status, js.headers.get('content-type')]).toEqual([200, 'text/javascript; charset=utf-8']);
    expect((await ops.request('GET', '/ops/..%2fsecret.txt')).status).toBe(404);
    expect((await ops.request('GET', '/ops/none.js')).status).toBe(404);
    await ops.close();
    const none = await testApp([], join(root, 'nope'));
    expect((await none.request('GET', '/ops/')).status).toBe(404);
    await none.close();
  });
});

describe('학생 앱 파일 (3단계 research R2)', () => {
  let web: Awaited<ReturnType<typeof testApp>>;
  let root: string;
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'app-'));
    const dir = join(root, 'dist');
    mkdirSync(join(dir, 'assets'), { recursive: true });
    writeFileSync(join(dir, 'index.html'), '<!doctype html>킹고');
    writeFileSync(join(dir, 'assets', 'x.js'), 'x=1');
    writeFileSync(join(dir, 'manifest.webmanifest'), '{}');
    writeFileSync(join(dir, 'sw.js'), '//');
    writeFileSync(join(root, 'package.json'), '비밀');
    writeFileSync(join(root, 'secret'), '비밀');
    mkdirSync(join(root, 'ops'));
    writeFileSync(join(root, 'ops', 'index.html'), '운영');
    web = await testApp(routes, join(root, 'ops'), dir);
  });
  afterAll(async () => { await web.close(); });

  it('/와 앱 안 주소는 index.html이고 CSP·no-cache, 모든 파일에 nosniff', async () => {
    for (const p of ['/', '/notices/cse%3A1', '/me', '/assets', '/%E0%A4%A']) {
      const r = await web.request('GET', p);
      expect([p, r.status, r.body]).toEqual([p, 200, '<!doctype html>킹고']);
      expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(r.headers.get('cache-control')).toBe('no-cache');
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
      expect(r.headers.get('referrer-policy')).toBe('same-origin');
    }
  });

  it('미리 만든 brotli가 있으면 청한 쪽에만 주고 vary를 단다', async () => {
    writeFileSync(join(root, 'dist', 'assets', 'z.js'), 'z=1');
    writeFileSync(join(root, 'dist', 'assets', 'z.js.br'), brotliCompressSync('z=1'));
    const br = await fetch(`${web.base}/assets/z.js`, { headers: { 'accept-encoding': 'gzip, br' } });
    expect([br.headers.get('content-encoding'), br.headers.get('vary'), br.headers.get('content-type'), await br.text()]).toEqual(['br', 'accept-encoding', 'text/javascript; charset=utf-8', 'z=1']);
    const plain = await fetch(`${web.base}/assets/z.js`, { headers: { 'accept-encoding': 'gzip, br;q=0' } });
    expect([plain.headers.get('content-encoding'), plain.headers.get('vary'), await plain.text()]).toEqual([null, 'accept-encoding', 'z=1']);
  });

  it('/assets는 오래 보관하고, 서비스 워커와 manifest는 보관하지 않는다', async () => {
    const js = await web.request('GET', '/assets/x.js');
    expect([js.status, js.headers.get('content-type'), js.headers.get('cache-control')]).toEqual([200, 'text/javascript; charset=utf-8', 'public, max-age=31536000, immutable']);
    expect((await web.request('GET', '/sw.js')).headers.get('cache-control')).toBe('no-cache');
    const m = await web.request('GET', '/manifest.webmanifest');
    expect([m.headers.get('content-type'), m.headers.get('cache-control'), m.headers.get('x-content-type-options')]).toEqual(['application/manifest+json', 'no-cache', 'nosniff']);
  });

  it('없는 파일(확장자 있음)·폴더 밖·없는 API·GET이 아닌 것은 404, /ops/는 그대로', async () => {
    for (const p of ['/assets/y.js', '/x.png', '/../package.json', '/%2e%2e/package.json', '/..%2fpackage.json', '/..%2fsecret', '/assets/..%2f..%2fsecret']) expect([p, (await web.request('GET', p)).status]).toEqual([p, 404]);
    const raw = await new Promise<string>(ok => { const s = connect(Number(new URL(web.base).port), '127.0.0.1', () => s.end('GET // HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')); s.on('data', d => ok(String(d))); });
    expect(raw).toMatch(/^HTTP\/1\.1 404/); // 주소로 읽지 못해도 서버가 죽지 않는다
    expect(await web.request('GET', '/api/nope')).toMatchObject({ status: 404, body: { error: { code: 'not_found' } } });
    expect((await web.request('GET', '/api')).status).toBe(404);
    expect((await web.request('POST', '/')).status).toBe(404);
    expect((await web.request('GET', '/ops/')).body).toBe('운영');
    expect((await web.request('GET', '/api/health')).status).toBe(200);
    expect(web.lines.map(l => JSON.parse(l)).some(l => l.route === '/(앱)' && l.status === 200)).toBe(true);
    const none = await testApp([], undefined, join(root, 'nope'));
    expect((await none.request('GET', '/')).status).toBe(404);
    await none.close();
  });
});
