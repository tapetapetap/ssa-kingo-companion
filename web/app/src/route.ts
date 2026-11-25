// 주소 ↔ 화면(contracts/app.md 주소 표). History API로 다루는 작은 모듈이다(research R1)
import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'login' | 'consent' | 'answers' | 'fields'; to: string | null }
  | { name: 'home' | 'me' | 'meFields' | 'meAnswers' | 'prompt' | 'analysis' | 'push' | 'none' }
  | { name: 'notices'; kind: string[]; field: string[]; q: string; sort: string }
  | { name: 'notice'; id: string }
  | { name: 'list'; tab: 'like' | 'later' }
  | { name: 'activity'; id: string | null };

const PLAIN: Record<string, 'home' | 'me' | 'meFields' | 'meAnswers' | 'prompt' | 'analysis' | 'push'> = {
  '/': 'home', '/me': 'me', '/me/fields': 'meFields', '/me/answers': 'meAnswers', '/me/prompt': 'prompt', '/me/analysis': 'analysis', '/me/push': 'push'
};
const START: Record<string, 'login' | 'consent' | 'answers' | 'fields'> = { '/login': 'login', '/start/consent': 'consent', '/start/answers': 'answers', '/start/fields': 'fields' };
const many = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

export function parse(href: string): Route {
  const u = new URL(href, 'http://app');
  const p = u.pathname.length > 1 ? u.pathname.replace(/\/$/, '') : u.pathname;
  const q = u.searchParams;
  if (START[p]) return { name: START[p], to: q.get('to') };
  if (PLAIN[p]) return { name: PLAIN[p] };
  if (p === '/notices') return { name: 'notices', kind: many(q.get('kind')), field: many(q.get('field')), q: q.get('q') ?? '', sort: q.get('sort') ?? '' };
  if (p === '/list') return { name: 'list', tab: q.get('tab') === 'later' ? 'later' : 'like' };
  const m = /^\/(notices|me\/activities)\/([^/]+)$/.exec(p);
  if (!m) return { name: 'none' };
  let id: string;
  try {
    id = decodeURIComponent(m[2]);
  } catch {
    return { name: 'none' };
  }
  return m[1] === 'notices' ? { name: 'notice', id } : { name: 'activity', id: id === 'new' ? null : id };
}

/** 공지 목록의 주소. 비면 칸을 뺀다. 종류·분야 여럿은 쉼표다 */
export function noticesHref(r: { kind?: string[]; field?: string[]; q?: string; sort?: string }): string {
  const q = [['kind', (r.kind ?? []).join(',')], ['field', (r.field ?? []).join(',')], ['q', r.q ?? ''], ['sort', r.sort ?? '']].filter(([, v]) => v);
  return `/notices${q.length ? `?${q.map(([k, v]) => `${k}=${encodeURIComponent(v).replaceAll('%2C', ',')}`).join('&')}` : ''}`;
}

/** 로그인·처음 흐름을 마친 뒤 갈 주소. 앱 안의 주소만 따른다(다른 사이트로 보내지 않게) */
export function safeTo(to: string | null): string {
  if (!to || !/^\/(?![/\\])/.test(to) || /[\\\u0000-\u001f]/.test(to)) return '/';
  const u = new URL(to, 'http://app');
  if (u.origin !== 'http://app' || u.pathname.startsWith('//') || /^\/(login|start|api|ops)(\/|$)/.test(u.pathname)) return '/';
  return u.pathname + u.search;
}

/** 이 주소에 있어도 되는가(contracts/app.md 1). 다르면 가야 할 주소를 준다. next가 null이면 로그인 전이다 */
export function whereTo(next: 'consent' | 'answers' | 'fields' | 'home' | null, href: string): string {
  const r = parse(href);
  const starting = 'to' in r;
  const to = safeTo(starting ? r.to : href);
  if (next === 'home') return starting ? to : href;
  const step = next === null ? '/login' : `/start/${next}`;
  return to === '/' ? step : `${step}?to=${encodeURIComponent(to).replaceAll("'", '%27')}`; // 주소창이 '를 %27로 적는다
}

const subs = new Set<() => void>();
const changed = () => subs.forEach(f => f());
export const here = () => location.pathname + location.search;
export function go(href: string, how: 'push' | 'replace' = 'push') {
  if (href === here()) return;
  const moved = new URL(href, location.href).pathname !== location.pathname;
  // 앱 안에서 온 자리만 app을 단다. 처음 들어온 자리를 바꿔 적은 것은 그대로 둔다(back이 앱 밖으로 나가지 않게)
  if (how === 'push') history.pushState({ app: true }, '', href);
  else history.replaceState(history.state, '', href);
  if (moved) window.scrollTo(0, 0); // 뒤로 가기는 브라우저가 자리를 되살린다
  changed();
}
/** 앱 안에서 온 화면이면 뒤로, 주소로 바로 들어왔으면 윗 화면으로 */
export function back(parent: string) {
  if ((history.state as { app?: boolean } | null)?.app) history.back();
  else go(parent, 'replace');
}
export function useHref(): string {
  return useSyncExternalStore(f => {
    subs.add(f);
    window.addEventListener('popstate', f);
    return () => {
      subs.delete(f);
      window.removeEventListener('popstate', f);
    };
  }, here);
}

/** 같은 출처의 <a>를 앱 안에서 연다. 새 창·내려받기·보조 키는 브라우저에 맡긴다 */
export function onLinkClick(e: MouseEvent) {
  const a = (e.target as Element | null)?.closest?.('a');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if ((a.target && a.target !== '_self') || a.hasAttribute('download') || a.origin !== location.origin || /^\/(api|ops)(\/|$)/.test(a.pathname)) return;
  e.preventDefault();
  go(a.pathname + a.search);
}
