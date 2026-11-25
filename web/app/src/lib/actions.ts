// 카드 행동(contracts/app.md 8): 누르면 바로 바꾸고 저장이 실패하면 되돌린다. 같은 공지에 겹치면 앞 것이 끝난 뒤 마지막 것 하나만 보낸다.
// 여러 화면에 있는 같은 공지가 함께 바뀌게 공지 번호로 한 곳에 둔다
import type { Action, Draft, NoticeCard } from '../api.ts';

export type Want = { kind: Action['kind']; revisitOn?: string; reason?: string } | null;
export type Done = { action: Action | null; suggestActivity: Draft | null };
type Job = { want: Want; resolve: (d: Done | null) => void; reject: (e: unknown) => void };
type Entry = { shown: Action | null; saved: Action | null; savedAt: number; running: boolean; next: Job | null };

const guess = (w: Want): Action | null => w && { kind: w.kind, revisitOn: w.revisitOn ?? null, reason: w.reason ?? null, at: null };
/** 되돌릴 때 다시 보낼 것. 다시 볼 날은 서버가 받는 내일~닫히는 날로 맞춘다(이미 지난 날이었으면 내일) */
export function again(a: Action | null, range: { min: string; max: string } | null): Want {
  if (!a) return null;
  const day = a.revisitOn && range ? (a.revisitOn < range.min ? range.min : a.revisitOn > range.max ? range.max : a.revisitOn) : a.revisitOn;
  return { kind: a.kind, ...(day ? { revisitOn: day } : {}), ...(a.reason ? { reason: a.reason } : {}) };
}

export function createActions(send: (id: string, want: Want) => Promise<Done>, now = () => performance.now()) {
  const entries = new Map<string, Entry>();
  const subs = new Set<() => void>();
  let version = 0;
  const changed = () => {
    version++;
    subs.forEach(f => f());
  };
  async function run(id: string, e: Entry) {
    e.running = true;
    while (e.next) {
      const job = e.next;
      e.next = null;
      try {
        const d = await send(id, job.want);
        e.saved = d.action;
        e.savedAt = now();
        job.resolve(e.next ? null : d); // 뒤에 누른 것이 있으면 그것이 답이다
      } catch (err) {
        if (e.next) job.resolve(null);
        else job.reject(err);
      }
      if (!e.next) e.shown = e.saved;
      changed();
    }
    e.running = false;
  }
  return {
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
    version: () => version,
    /** 지금 보일 행동. 이 앱에서 건드리지 않았으면 서버가 준 것 */
    of: (n: Pick<NoticeCard, 'id' | 'action'>): Action | null => entries.get(n.id)?.shown ?? (entries.has(n.id) ? null : n.action),
    /** 저장하면 서버 답, 뒤에 누른 것에 밀리면 null */
    set(n: Pick<NoticeCard, 'id' | 'action'>, want: Want): Promise<Done | null> {
      let e = entries.get(n.id);
      if (!e) entries.set(n.id, e = { shown: n.action, saved: n.action, savedAt: 0, running: false, next: null });
      e.shown = guess(want);
      e.next?.resolve(null);
      const p = new Promise<Done | null>((resolve, reject) => { e.next = { want, resolve, reject }; });
      changed();
      if (!e.running) void run(n.id, e);
      return p;
    },
    /** 서버에서 새로 받은 카드. 다른 기기에서 바꾼 것을 따른다(저장하기 전에 물은 답은 낡아서 무시한다) */
    know(cards: NoticeCard[], askedAt: number) {
      let any = false;
      for (const c of cards) {
        const e = entries.get(c.id);
        if (!e || e.running || askedAt < e.savedAt) continue;
        e.shown = e.saved = c.action;
        any = true;
      }
      if (any) changed();
    },
    forget() {
      entries.clear();
      changed();
    }
  };
}
