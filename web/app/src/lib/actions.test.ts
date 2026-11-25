import { describe, expect, it } from 'vitest';
import type { Action, NoticeCard } from '../api.ts';
import { again, createActions, type Done, type Want } from './actions.ts';

const n = { id: 'cse:1', action: null as Action | null };
const act = (kind: Action['kind']): Action => ({ kind, revisitOn: null, reason: null, at: 't' });
/** 답을 손으로 주는 서버 */
function server() {
  const calls: { want: Want; ok: (a: Action | null) => void; fail: () => void }[] = [];
  const send = (_: string, want: Want) => new Promise<Done>((resolve, reject) => {
    calls.push({ want, ok: action => resolve({ action, suggestActivity: null }), fail: () => reject(new Error('끊김')) });
  });
  return { calls, send };
}
const tick = () => new Promise(r => setTimeout(r));

describe('카드 행동', () => {
  it('바로 바뀌고, 저장되면 서버 답이 남는다', async () => {
    const s = server();
    const a = createActions(s.send);
    const p = a.set(n, { kind: 'like' });
    expect(a.of(n)?.kind).toBe('like');
    s.calls[0].ok(act('like'));
    expect((await p)?.action?.at).toBe('t');
    expect(a.of(n)).toEqual(act('like'));
  });
  it('실패하면 누르기 전으로 돌아가고 알린다', async () => {
    const s = server();
    const a = createActions(s.send);
    const p = a.set(n, { kind: 'like' });
    s.calls[0].fail();
    await expect(p).rejects.toThrow('끊김');
    expect(a.of(n)).toBeNull();
  });
  it('겹치면 앞 것이 끝난 뒤 마지막 것 하나만 보낸다. 앞 것의 실패는 알리지 않는다', async () => {
    const s = server();
    const a = createActions(s.send);
    const ps = [a.set(n, { kind: 'like' }), a.set(n, null), a.set(n, { kind: 'dislike', reason: 'time' })];
    expect(a.of(n)?.kind).toBe('dislike');
    expect(s.calls).toHaveLength(1);
    s.calls[0].fail();
    expect(await ps[0]).toBeNull();
    expect(await ps[1]).toBeNull();
    await tick();
    expect(s.calls.map(c => c.want?.kind)).toEqual(['like', 'dislike']);
    s.calls[1].ok(act('dislike'));
    expect((await ps[2])?.action?.kind).toBe('dislike');
    expect(s.calls).toHaveLength(2);
  });
  it('앞 것이 성공해도 뒤에 누른 것이 있으면 null이다(되돌린 행동의 제안이 뜨지 않게)', async () => {
    const s = server();
    const a = createActions(s.send);
    const p = a.set(n, { kind: 'dislike', reason: 'done' });
    void a.set(n, null);
    s.calls[0].ok(act('dislike'));
    expect(await p).toBeNull();
  });
  it('뒤의 것이 실패하면 앞에 저장된 것으로 돌아간다', async () => {
    const s = server();
    const a = createActions(s.send);
    const p1 = a.set(n, { kind: 'like' });
    const p2 = a.set(n, null);
    s.calls[0].ok(act('like'));
    await p1;
    await tick();
    s.calls[1].fail();
    await expect(p2).rejects.toThrow();
    expect(a.of(n)?.kind).toBe('like');
  });
  it('새로 받은 카드가 이긴다. 다만 저장 전에 물은 답과 보내는 중인 것은 건드리지 않는다', async () => {
    let t = 0;
    const s = server();
    const a = createActions(s.send, () => t);
    const card = (kind: Action['kind'] | null) => [{ id: 'cse:1', action: kind && act(kind) } as NoticeCard];
    const p = a.set(n, { kind: 'like' });
    a.know(card(null), 5);
    expect(a.of(n)?.kind).toBe('like');
    t = 10;
    s.calls[0].ok(act('like'));
    await p;
    await tick();
    a.know(card(null), 9);
    expect(a.of(n)?.kind).toBe('like');
    a.know(card('later'), 11);
    expect(a.of(n)?.kind).toBe('later');
    a.know(card(null), 12);
    expect(a.of({ id: 'cse:1', action: act('like') })).toBeNull();
    a.forget();
    expect(a.of({ id: 'cse:1', action: act('like') })?.kind).toBe('like');
  });
  it('바뀔 때 알린다. 되돌릴 값은 있던 칸만 보낸다', () => {
    const a = createActions(server().send);
    let seen = 0;
    const off = a.subscribe(() => { seen++; });
    void a.set(n, { kind: 'like' });
    off();
    void a.set(n, null);
    expect(seen).toBe(1);
    const r = { min: '2026-11-30', max: '2026-12-25' };
    const later = (revisitOn: string) => again({ kind: 'later', revisitOn, reason: null, at: 't' }, r);
    expect(later('2026-12-01')).toEqual({ kind: 'later', revisitOn: '2026-12-01' });
    expect([later('2026-11-29'), later('2026-12-31')]).toEqual([{ kind: 'later', revisitOn: '2026-11-30' }, { kind: 'later', revisitOn: '2026-12-25' }]);
    expect(again({ kind: 'dislike', revisitOn: null, reason: 'time', at: 't' }, null)).toEqual({ kind: 'dislike', reason: 'time' });
    expect(again(null, r)).toBeNull();
  });
});
