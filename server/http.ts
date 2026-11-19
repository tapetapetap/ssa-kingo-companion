// HTTP 틀(research R2, contracts/api.md '공통'): 작은 경로 표, JSON 본문(64KB까지), 쿠키, 같은 출처 확인, 오류 꼴, 요청 기록
import { createServer as createHttp, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { LIMITS } from './limits.ts';
import { logError, logRequest, type Write } from './log.ts';

// 매개변수 속성은 Node의 타입 제거로 돌지 않아 칸을 따로 적는다(research R1)
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly extra: Record<string, unknown>;
  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export type Req = {
  method: string; path: string; params: Record<string, string>; query: URLSearchParams; body: unknown;
  cookies: Record<string, string>; headers: IncomingMessage['headers']; student?: number;
};
export type Res = { status?: number; body?: unknown; headers?: Record<string, string | string[]> };
export type Handler = (req: Req) => Res | Promise<Res>;
export type Route = [method: string, pattern: string, handler: Handler];

/** '/api/notices/:id' 꼴의 틀과 경로를 조각으로 맞춘다. 맞으면 ':이름' 자리 값, 아니면 null */
export function match(pattern: string, path: string): Record<string, string> | null {
  const [p, a] = [pattern.split('/'), path.split('/')];
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (const [i, part] of p.entries()) {
    if (part.startsWith(':')) {
      if (!a[i]) return null;
      try {
        params[part.slice(1)] = decodeURIComponent(a[i]);
      } catch {
        return null;
      }
    } else if (part !== a[i]) return null;
  }
  return params;
}

export const parseCookies = (header = ''): Record<string, string> =>
  Object.fromEntries(header.split(';').map(s => s.trim()).filter(s => s.includes('=')).map(s => [s.slice(0, s.indexOf('=')), s.slice(s.indexOf('=') + 1)]));

const CHANGES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** 같은 출처: Origin의 host(포트 포함)가 요청의 Host와 같다. 문지기 뒤라 스킴은 보지 않는다 */
function sameOrigin(req: IncomingMessage): boolean {
  try {
    return !!req.headers.origin && !!req.headers.host && new URL(req.headers.origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > LIMITS.bodyBytes) throw new HttpError(400, 'bad_request', '요청이 너무 커요');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {}; // 본문이 없는 요청은 {}로 본다
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'bad_request', '요청을 읽지 못했어요');
  }
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}) {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (body === undefined || status === 204) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
}

export const health: Route = ['GET', '/api/health', () => ({ body: { ok: true } })];

export function createServer(routes: Route[], write?: Write): Server {
  return createHttp(async (req, res) => {
    const t0 = performance.now();
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://localhost');
    let route = '(없음)';
    let r: Req | null = null;
    try {
      const found = routes.map(x => [x, match(x[1], url.pathname)] as const).find(([x, p]) => x[0] === method && p);
      if (!found) throw new HttpError(404, 'not_found', '찾을 수 없어요');
      const [[, pattern, handler], params] = found;
      route = pattern;
      if (CHANGES.has(method)) {
        const json = (req.headers['content-type'] ?? '').split(';')[0].trim() === 'application/json';
        if (!json || !sameOrigin(req)) throw new HttpError(403, 'bad_origin', '이 요청은 받지 않아요');
      }
      r = { method, path: url.pathname, params: params ?? {}, query: url.searchParams, body: CHANGES.has(method) ? await readBody(req) : {}, cookies: parseCookies(req.headers.cookie), headers: req.headers };
      const out = await handler(r);
      send(res, out.status ?? 200, out.body, out.headers);
      logRequest({ method, route, status: out.status ?? 200, ms: performance.now() - t0, student: r.student }, write);
    } catch (e) {
      const known = e instanceof HttpError;
      if (!known) logError(route, e, write);
      const err = known ? e : new HttpError(500, 'server_error', '잠시 뒤에 다시 해 주세요');
      send(res, err.status, { error: { code: err.code, message: err.message, ...err.extra } });
      logRequest({ method, route, status: err.status, ms: performance.now() - t0, student: r?.student }, write);
    }
  });
}

/** 계약의 때 꼴: 한국 시간 +09:00이 붙은 ISO 글(contracts/api.md 공통) */
export const kstIso = (d: Date) => `${new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 23)}+09:00`;
