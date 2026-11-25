// 운영자 화면의 틀(3단계 FR-041·FR-044): 왼쪽 메뉴와 실패 띠. 메뉴는 주소(?menu=)에 남는다
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { api, type Monitor as Data } from './api.ts';
import { Console } from './Console.tsx';
import { Daily } from './Daily.tsx';
import { EmbedMap } from './EmbedMap.tsx';
import { Collect, Overview } from './Monitor.tsx';
import { Service } from './Service.tsx';
import { when } from './format.ts';

const MENU = [['review', '판정 검토'], ['overview', '개요'], ['collect', '수집과 판정'], ['daily', '매일 작업'], ['service', '서비스 지표'], ['map', '임베딩 지도']] as const;
type Menu = typeof MENU[number][0];
const param = (k: string) => new URLSearchParams(location.search).get(k);
const menuNow = (): Menu => MENU.find(([id]) => id === param('menu'))?.[0] ?? 'review';

export function Shell({ onLogout }: { onLogout: () => void }) {
  const [menu, setMenu] = useState<Menu>(menuNow);
  const [notice, setNotice] = useState(() => param('notice'));
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = useRef(location.search);
  const load = useCallback(async () => {
    try {
      setData(await api<Data>('GET', '/api/ops/monitor'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  // 띠는 어느 메뉴에서든 보인다. 1분마다 새로 본다
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load, menu]);
  useEffect(() => {
    // 뒤로 가기도 저장하지 않은 값이 있으면 묻는다(이미 앞 주소로 왔으니 지금 주소를 다시 얹어 두고)
    const on = () => {
      const show = () => { setMenu(menuNow()); setNotice(param('notice')); };
      if (!dirty) return show();
      history.pushState(null, '', url.current);
      setPending(() => () => { setDirty(false); window.addEventListener('popstate', show, { once: true }); history.back(); });
    };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, [dirty]);
  useEffect(() => { url.current = location.search; }, [menu, notice]);
  /** 판정 검토에 저장하지 않은 값이 있으면 묻고 간다 */
  const go = (next: Menu, id?: string) => {
    if (next === menu && (id ?? null) === notice) return;
    const move = () => {
      setDirty(false);
      history.pushState(null, '', `?${new URLSearchParams({ menu: next, ...(id ? { notice: id } : {}) })}`);
      setMenu(next);
      setNotice(id ?? null);
    };
    if (dirty) setPending(() => move);
    else move();
  };
  const page = { data, error, reload: load };
  return (
    <AppShell height="fill" variant="section"
      banner={data && data.alerts.length > 0 ? (
        <VStack gap={0}>{data.alerts.map(a => <Banner key={a.kind} container="section" status="error" title={a.text} description={`${when(a.since)}부터. ${a.reason}`} />)}</VStack>
      ) : undefined}
      sideNav={
        <SideNav header={<SideNavHeading heading="킹고 운영" />} footer={<Button label="나가기" variant="ghost" size="sm" onClick={onLogout} />}>
          <SideNavSection title="메뉴" isHeaderHidden>
            {MENU.map(([id, label]) => <SideNavItem key={id} label={label} isSelected={menu === id} onClick={() => go(id)} />)}
          </SideNavSection>
        </SideNav>
      }>
      {menu === 'review' ? <Console key={notice ?? ''} first={notice} onDirty={setDirty} />
        : menu === 'overview' ? <Overview {...page} /> : menu === 'collect' ? <Collect {...page} /> : menu === 'daily' ? <Daily {...page} /> : menu === 'map' ? <EmbedMap onReview={id => go('review', id)} /> : <Service {...page} />}
      <AlertDialog isOpen={!!pending} onOpenChange={o => { if (!o) setPending(null); }} title="저장하지 않은 값이 있어요" description="다른 화면으로 가면 고친 값이 사라져요."
        actionLabel="버리고 가기" cancelLabel="계속 고치기" onAction={() => { pending?.(); setPending(null); }} />
    </AppShell>
  );
}
