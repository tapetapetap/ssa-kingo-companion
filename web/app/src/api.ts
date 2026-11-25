// /api 부르기. 상태를 바꾸는 요청은 JSON 본문과 같은 출처가 있어야 한다(2단계 contracts/api.md 공통). 실패는 서버의 { code, message }로 던진다
export class ApiError extends Error {
  readonly code: string;
  readonly extra: Record<string, unknown>;
  constructor(code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

declare global { interface Window { boot?: Map<string, Promise<Response | null>> } }
const BOOT_MS = 30_000;
const asked = new Set<string>();
let changed = false;
/** boot.js가 먼저 청한 답은 앱이 그 주소를 처음 청할 때만, 시작하고 잠깐만 쓴다. 둘째부터나 무언가 바꾼 뒤(로그인 등)에는 언제나 새로 부른다
 *  (다른 탭에서 다른 학생이 들어왔는지 다시 묻는 요청이 옛 답을 받으면 안 된다) */
async function early(method: string, path: string): Promise<Response | null> {
  if (method !== 'GET') changed = true;
  if (changed || asked.has(path)) return null;
  asked.add(path);
  const res = performance.now() < BOOT_MS ? await window.boot?.get(path) : null;
  return res?.ok ? res : null;
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  let text: string;
  try {
    res = await early(method, path) ?? await fetch(path, { method, headers: method === 'GET' ? {} : { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
    text = await res.text();
  } catch {
    throw new ApiError('offline', '인터넷에 연결되지 않았어요');
  }
  let data;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    throw new ApiError('server_error', '잠시 뒤에 다시 해 주세요'); // 문지기가 준 HTML 오류 쪽 같은 것
  }
  if (!res.ok) {
    const { code = 'unknown', message = '새로 고쳐 주세요', ...extra } = data?.error ?? {};
    // 어느 화면에서든 로그인이 끊기거나 동의가 다시 필요하면 그 걸음으로 간다(main.tsx, contracts/app.md 2)
    if (code === 'login_required' || code === 'consent_required') window.dispatchEvent(new CustomEvent('app-auth', { detail: code }));
    throw new ApiError(code, message, extra);
  }
  return data as T;
}

/** 던져진 것의 화면 글 */
export const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : '잠시 뒤에 다시 해 주세요');

export type Next = 'consent' | 'answers' | 'fields' | 'home';
export type Me = { dept: string; next: Next; analysisOff: boolean; tag: string; push: { ready: boolean; on: boolean } };
export type Answers = { grade: number; term: number; goal: string; answeredAt: string };
export type FieldList = { groups: { id: string; name: string; parent: string | null }[]; fields: { id: string; name: string; group: string; desc: string }[] };
type Named = { id: string; name: string };
export type Action = { kind: 'like' | 'later' | 'dislike'; revisitOn: string | null; reason: string | null; at: string | null };
export type NoticeCard = {
  id: string; title: string; host: string | null; kind: string | null; postedOn: string; deadline: string | null; closesOn: string;
  open: boolean; down: boolean; fields: { core: Named[]; related: Named[]; by: string | null } | null; url: string; action: Action | null;
};
export type Shelf = { items: NoticeCard[]; empty: string | null };
export type Home = {
  pick: { notice: NoticeCard; reason: string; cited: { key: string; text?: string }[]; method: string; computedAt: string; repicking: boolean } | null;
  pickEmpty: string | null; shelves: Record<'soon' | 'field' | 'similar', Shelf>;
};
export type Page = { items: NoticeCard[]; next: string | null; empty: string | null };
export type Draft = { name: string; term: string; kind: string | null; fieldIds: string[] };
export type Activity = { id: number; name: string; term: string; kind: string; fieldIds: string[]; proofUrl: string | null };
export type ListItem = { notice: NoticeCard; flags: ('revisit_due' | 'closed' | 'down')[] };
export type AnalysisLine = { key: string; section: 'done' | 'interest' | 'flow'; text: string; source: string; proof: string | null; refs?: string[] };
export type Analysis = { off: true } | { off: false; version: number; madeAt: string; md: string; lines: AnalysisLine[]; excluded: { key: string }[] };
