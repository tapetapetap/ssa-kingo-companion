// 학생 앱의 틀: 들어올 때 규칙(contracts/app.md 1·2), 네 메뉴, 화면 고르기
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import { StrictMode, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Link } from '@astryxdesign/core/Link';
import koKR from '@astryxdesign/core/locales/ko-KR.generated.js';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { Text } from '@astryxdesign/core/Text';
import { Theme } from '@astryxdesign/core/theme';
import { api, ApiError, type Me } from './api.ts';
import { forget } from './lib/load.ts';
import { HomeIcon, ListIcon, MeIcon, NoticeIcon } from './parts/icons.tsx';
import { Empty, Failed, Loading } from './parts/States.tsx';
import { go, onLinkClick, parse, placeOf, useHref, whereTo, type Route } from './route.ts';
import { Answers } from './screens/Answers.tsx';
import { Consent } from './screens/Consent.tsx';
import { Fields } from './screens/Fields.tsx';
import { Home } from './screens/Home.tsx';
import { Login } from './screens/Login.tsx';
import { NoticeDetail } from './screens/NoticeDetail.tsx';
import { Notices } from './screens/Notices.tsx';
import { kingo } from './theme.ts';

const MENU = [
  { href: '/', label: '홈', icon: HomeIcon, names: ['home'] },
  { href: '/notices', label: '공지', icon: NoticeIcon, names: ['notices', 'notice'] },
  { href: '/list', label: '내 목록', icon: ListIcon, names: ['list'] },
  { href: '/me', label: '나', icon: MeIcon, names: ['me', 'meFields', 'meAnswers', 'prompt', 'analysis', 'activity', 'push'] }
];
const TITLE: Record<Route['name'], string> = {
  login: '로그인', consent: '동의', answers: '처음 질문', fields: '분야 고르기', home: '홈', notices: '공지', notice: '공지', list: '내 목록', me: '나',
  meFields: '고른 분야', meAnswers: '처음 질문', prompt: '나에 대한 프롬프트', analysis: '나의 분석', activity: '활동', push: '알림', none: '없는 화면'
};

// 한글이 낱말 중간에서 끊기지 않게 하되 긴 영어·주소는 넘치지 않게 끊는다
const page: CSSProperties = { minHeight: '100dvh', backgroundColor: 'var(--color-background-body)', color: 'var(--color-text-primary)', wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const column: CSSProperties = { width: '100%', maxWidth: 600, marginInline: 'auto', paddingInline: 'var(--spacing-5)', outline: 'none' };
const surface: CSSProperties = { backgroundColor: 'var(--color-background-surface)' };
const bottom: CSSProperties = { ...surface, position: 'fixed', insetInline: 0, bottom: 0, zIndex: 2, borderBlockStart: 'var(--border-width) solid var(--color-border)', paddingBlockEnd: 'env(safe-area-inset-bottom)' };
const side: CSSProperties = { ...surface, position: 'sticky', top: 0, height: '100dvh', width: 208, flex: 'none', padding: 'var(--spacing-4)', borderInlineEnd: 'var(--border-width) solid var(--color-border)' };

function Menu({ name, wide }: { name: Route['name']; wide: boolean }) {
  return (
    <nav aria-label="메뉴" style={wide ? side : bottom}>
      {wide && <VStack paddingBlock={4} paddingInline={3}><Text weight="semibold">킹고 컴패니언</Text></VStack>}
      <HStack as="ul" style={{ listStyle: 'none', margin: 0, padding: 0, flexDirection: wide ? 'column' : 'row' }}>
        {MENU.map(m => {
          const on = m.names.includes(name);
          return (
            <li key={m.href} style={{ flex: 1 }}>
              <Link href={m.href} isStandalone color={on ? 'accent' : 'secondary'} aria-current={on ? 'page' : undefined} style={{ display: 'block' }}>
                <HStack gap={wide ? 3 : 0.5} hAlign={wide ? 'start' : 'center'} vAlign="center" paddingInline={wide ? 3 : 0}
                  style={{ flexDirection: wide ? 'row' : 'column', minHeight: 48, ...(wide ? {} : { justifyContent: 'center' }) }}>
                  <Icon icon={m.icon} size="lg" />
                  <Text size={wide ? 'base' : 'sm'} color="inherit" weight={on ? 'semibold' : 'normal'}>{m.label}</Text>
                </HStack>
              </Link>
            </li>
          );
        })}
      </HStack>
    </nav>
  );
}

function screen(r: Route, href: string, done: () => Promise<void>): ReactNode {
  switch (r.name) {
    case 'login': return <Login onDone={done} />;
    case 'consent': return <Consent onDone={done} />;
    case 'answers': return <Answers onDone={done} />;
    case 'fields': return <Fields onDone={done} />;
    case 'none': return <Empty title="없는 화면이에요" action={<Button label="홈으로" size="lg" href="/" />} />;
    case 'home': return <Home />;
    case 'notices': return <Notices query={r} href={href} />;
    case 'notice': return <NoticeDetail key={r.id} id={r.id} />;
    default: return <Empty title={TITLE[r.name]} description="준비하고 있어요." />; // 다음 PR들이 화면으로 바꾼다
  }
}

function App() {
  const href = useHref();
  // undefined: 아직 모름, null: 로그인 전
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const wide = useMediaQuery('(min-width: 900px)');
  const main = useRef<HTMLElement>(null);
  const tag = useRef('');

  const check = useCallback(async () => {
    setError(null);
    try {
      const now = await api<Me>('GET', '/api/me');
      if (tag.current !== now.tag) forget();
      tag.current = now.tag;
      setMe(now);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'login_required') setMe(null);
      else setError(e);
    }
  }, []);
  useEffect(() => { void check(); }, [check]);
  useEffect(() => {
    const on = (e: Event) => setMe(m => ((e as CustomEvent<string>).detail === 'login_required' ? null : m && { ...m, next: 'consent' }));
    window.addEventListener('app-auth', on);
    document.addEventListener('click', onLinkClick);
    return () => {
      window.removeEventListener('app-auth', on);
      document.removeEventListener('click', onLinkClick);
    };
  }, []);

  const target = me === undefined ? href : whereTo(me?.next ?? null, href);
  useEffect(() => { if (target !== href) go(target, 'replace'); }, [target, href]);
  const route = parse(href);
  const shown = me !== undefined && target === href;
  const place = `${route.name}${'id' in route ? route.id : ''}`; // 거르기처럼 같은 화면의 주소 바뀜은 세지 않는다
  useEffect(() => {
    document.title = `${TITLE[route.name]} · 킹고 컴패니언`;
    if (shown) main.current?.focus({ preventScroll: true });
  }, [place, shown, route.name]);
  useLayoutEffect(() => { if (shown) window.scrollTo(0, placeOf(href)); }, [place, shown]); // 뒤로 왔으면 떠날 때의 자리

  const menu = shown && !('to' in route);
  const body = error ? <Failed error={error} retry={() => void check()} /> : shown ? screen(route, href, check) : <Loading />;
  return (
    <HStack style={page} vAlign="stretch">
      {menu && wide && <Menu name={route.name} wide />}
      <main ref={main} tabIndex={-1} style={{ ...column, paddingBlockEnd: menu && !wide ? 'calc(64px + env(safe-area-inset-bottom))' : 0 }}>{body}</main>
      {menu && !wide && <Menu name={route.name} wide={false} />}
    </HStack>
  );
}

// 컴포넌트 안의 글(찾기, 지우기 등)을 한국어로
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <InternationalizationProvider locale="ko-KR" messages={{ 'ko-KR': koKR }}>
      <Theme theme={kingo}><App /></Theme>
    </InternationalizationProvider>
  </StrictMode>
);
