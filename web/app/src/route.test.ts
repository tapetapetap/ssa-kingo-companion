import { describe, expect, it } from 'vitest';
import { noticesHref, parse, safeTo, whereTo } from './route.ts';

describe('주소 → 화면', () => {
  it('표의 주소를 읽는다. 끝 빗금은 무시하고 없는 주소는 none', () => {
    expect(parse('/')).toEqual({ name: 'home' });
    expect(parse('/me/')).toEqual({ name: 'me' });
    expect(parse('/notices/cse%3A228336')).toEqual({ name: 'notice', id: 'cse:228336' });
    expect(parse('/list?tab=later')).toEqual({ name: 'list', tab: 'later' });
    expect(parse('/list?tab=x')).toEqual({ name: 'list', tab: 'like' });
    expect(parse('/me/activities/new')).toEqual({ name: 'activity', id: null });
    expect(parse('/me/activities/7')).toEqual({ name: 'activity', id: '7' });
    expect(parse('/login?to=%2Flist')).toEqual({ name: 'login', to: '/list' });
    for (const p of ['/없음', '/notices/a/b', '/notices/%E0%A4%A', '/me/x', '/constructor']) expect(parse(p)).toEqual({ name: 'none' });
  });
  it('거르기 주소는 왕복해도 같다', () => {
    const r = { kind: ['job', 'hackathon'], field: ['llm'], q: '해커톤 & 2,0', sort: 'deadline' };
    expect(noticesHref(r)).toMatch(/^\/notices\?kind=job,hackathon&field=llm&q=/);
    expect(parse(noticesHref(r))).toEqual({ name: 'notices', ...r });
    expect(noticesHref({})).toBe('/notices');
  });
});

describe('safeTo', () => {
  it('앱 안 주소만 따른다', () => {
    expect(safeTo('/notices?kind=job')).toBe('/notices?kind=job');
    for (const bad of [null, '', 'notices', '//evil.com', '/\\evil.com', '/a\\b', '/\t/evil.com', 'https://evil.com', 'javascript:alert(1)', '/login', '/login?to=/me', '/start/consent', '/api/me', '/ops/', '/x/../login']) expect([bad, safeTo(bad)]).toEqual([bad, '/']);
    expect(safeTo('/loginx')).toBe('/loginx');
  });
});

describe('whereTo', () => {
  it('로그인 전이면 로그인으로, 하던 주소를 들고 간다', () => {
    expect(whereTo(null, '/notices?kind=job')).toBe('/login?to=%2Fnotices%3Fkind%3Djob');
    expect(whereTo(null, '/')).toBe('/login');
    expect(whereTo(null, '/login?to=%2Flist')).toBe('/login?to=%2Flist');
    expect(whereTo(null, '/start/fields?to=%2Flist')).toBe('/login?to=%2Flist');
  });
  it('다음 할 일이 남으면 그 걸음이고, 마치면 하던 주소', () => {
    expect(whereTo('consent', '/login?to=%2Flist')).toBe('/start/consent?to=%2Flist');
    expect(whereTo('answers', '/start/consent')).toBe('/start/answers');
    expect(whereTo('answers', '/start/fields')).toBe('/start/answers');
    expect(whereTo('consent', '/me/prompt')).toBe('/start/consent?to=%2Fme%2Fprompt');
    expect(whereTo('home', '/start/fields?to=%2Flist')).toBe('/list');
    expect(whereTo('home', '/login')).toBe('/');
    expect(whereTo('home', '/start/consent?to=%2F%2Fevil.com')).toBe('/');
    expect(whereTo('home', '/notices/cse%3A1')).toBe('/notices/cse%3A1');
  });
  it('가야 할 주소에서는 제자리다(끝없이 돌지 않는다)', () => {
    for (const next of [null, 'consent', 'answers', 'fields', 'home'] as const) for (const href of ['/', '/list?tab=later', '/login?to=%2Fme', '/start/answers?to=//x']) {
      const once = whereTo(next, href);
      expect(whereTo(next, once)).toBe(once);
    }
  });
});
