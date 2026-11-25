// 시험에서 서버를 임시 포트로 띄우고 쿠키를 들고 요청하는 도우미
import type { AddressInfo } from 'node:net';
import { createServer, type Route } from '../http.ts';

export async function testApp(routes: Route[], opsDir?: string, appDir?: string, onError?: () => unknown) {
  const lines: string[] = [];
  const server = createServer(routes, l => { lines.push(l); }, opsDir, appDir, onError);
  await new Promise<void>(ok => { server.listen(0, '127.0.0.1', ok); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const jar = new Map<string, string>();
  const request = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const changes = method !== 'GET';
    const res = await fetch(base + path, {
      method,
      headers: { ...(changes ? { 'content-type': 'application/json', origin: base } : {}), ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const [k, v] = [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)];
      if (/max-age=0/i.test(c)) jar.delete(k);
      else jar.set(k, v);
    }
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: !text ? undefined : res.headers.get('content-type')?.startsWith('application/json') ? JSON.parse(text) as unknown : text };
  };
  return { base, request, lines, jar, close: () => new Promise<void>(ok => { server.close(() => ok()); }) };
}
