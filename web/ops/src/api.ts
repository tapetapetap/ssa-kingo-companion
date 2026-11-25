// /api 부르기. 상태를 바꾸는 요청은 JSON 본문과 같은 출처가 있어야 한다(contracts/api.md 공통). 실패는 서버의 { code, message }로 던진다
export class ApiError extends Error {
  readonly code: string;
  readonly field?: string;
  constructor(code: string, message: string, field?: string) {
    super(message);
    this.code = code;
    this.field = field;
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, { method, headers: method === 'GET' ? {} : { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    throw new ApiError('server_error', '잠시 뒤에 다시 해 주세요'); // 문지기가 준 HTML 오류 쪽 같은 것
  }
  if (!res.ok) {
    const err = new ApiError(data?.error?.code ?? 'server_error', data?.error?.message ?? '잠시 뒤에 다시 해 주세요', data?.error?.field);
    // 쓰는 도중 로그인이 끝나거나 운영자에서 빠지면 진입 화면이 그 상태로 바꾼다(main.tsx)
    if (err.code === 'login_required' || err.code === 'forbidden') window.dispatchEvent(new CustomEvent('ops-auth', { detail: err.code }));
    throw err;
  }
  return data as T;
}

type Named = { id: string; name: string };
type NamedFields = { core: Named[]; related: Named[] } | null;
export type OpsNotice = {
  id: string; title: string; url: string; postedOn: string; host: string | null; down: boolean; closesOn: string;
  file: { verdict: 'opportunity' | 'review'; kind: string | null; deadline: string | null; fields: NamedFields; rule: string | null; deadlineRule: string | null; reason: string | null };
  human: Partial<Record<'isNotice' | 'kind' | 'deadline' | 'fields', { value: unknown; by: string; at: string }>>;
  shown: { isNotice: boolean; kind: string | null; deadline: string | null; fields: NamedFields };
};
export type ReviewItem = { notice: OpsNotice; reasons: string[]; checkedAt: string | null; checkedBy: string | null };
export type LogItem = { noticeId: string; field: string | null; action: 'edit' | 'confirm' | 'rejudge'; old: unknown; new: unknown; by: string; at: string };
export type FieldList = { groups: { id: string; name: string }[]; fields: { id: string; name: string; group: string }[] };
export type Step = { ok: boolean; skipped: boolean; seconds: number; error: string | null } & Record<string, unknown>;
export type OpRequest = { id: number; kind: string; model: string | null; by: string; at: string; status: string; done: number; total: number; startedAt: string | null; endedAt: string | null; error: string | null };
export type Monitor = {
  alerts: { kind: string; text: string; since: string; reason: string }[];
  health: { db: boolean; model: { ok: boolean; names: string[] }; lastDaily: { startedAt: string; endedAt: string; failed: string[] } | null };
  today: Record<'fetched' | 'opportunity' | 'not' | 'review' | 'failed', number | null> & { reviewOpen: number };
  load: { gpuAvg: number | null; tempMax: number | null }; editRate: { num: number; den: number }; request: OpRequest | null; dailyRunning: boolean;
  days: { day: string; startedAt: string; seconds: number; steps: Partial<Record<string, Step>>; load: { gpuAvg: number | null; tempMax: number | null; requests: number } }[];
  counts: ({ day: string; server_error: number } & Record<'consented' | 'consented_new' | 'active7' | 'like' | 'later' | 'dislike' | 'push_sent' | 'push_failed' | 'push_devices', number | null>)[];
};
