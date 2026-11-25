// 공지 목록(US2, FR-013): 거르기·찾기·정렬은 주소에 남고, 20개씩 이어 불러온다. 뒤로 가기는 받은 쪽을 그대로 보인다
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout';
import { Icon } from '@astryxdesign/core/Icon';
import { List } from '@astryxdesign/core/List';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { api, messageOf, type FieldList, type Page as Data } from '../api.ts';
import { listEmpty } from '../lib/empty.ts';
import { useLoad } from '../lib/load.ts';
import { kindName } from '../lib/notice.ts';
import { SEARCH_WAIT_MS } from '../lib/values.ts';
import { hidden, useActions, withCards } from '../lib/store.ts';
import { Chip } from '../parts/Chip.tsx';
import { NoticeRow } from '../parts/NoticeCard.tsx';
import { Page } from '../parts/Page.tsx';
import { part, useNeedRest } from '../parts/Rest.tsx';
import { Empty, Failed, Loading } from '../parts/States.tsx';
import { cut, go, noticesHref, type Route } from '../route.ts';

export type Query = Extract<Route, { name: 'notices' }>;
const NoticeFilter = part('NoticeFilter', { waiting: null, failed: null });
// 첫 화면을 늦추지 않게 먼저 청하지 않는다. 오기 전까지 같은 크기의 단추를 둔다
const sortText = <Button label="정렬" size="lg" isDisabled />;
const NoticeSort = part('NoticeSort', { waiting: sortText, failed: sortText, ask: false });
export const show = (q: Partial<Query>) => go(noticesHref(q), 'replace');

function Results({ href, plain, onClear }: { href: string; plain: boolean; onClear: () => void }) {
  const url = `/api${href}`;
  const { data, error, reload, set } = useLoad(() => withCards<Data>('GET', url, d => d.items), [url], url, true);
  useActions();
  const [more, setMore] = useState<'idle' | 'loading' | unknown>('idle');
  const busy = useRef(false);
  const loadMore = useCallback(async () => {
    if (!data?.next || busy.current) return;
    busy.current = true;
    setMore('loading');
    try {
      const p = await withCards<Data>('GET', `${url}${url.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(data.next)}`, d => d.items);
      // 사이에 새 공지가 올라오면 쪽이 밀려 같은 공지가 다시 올 수 있다
      const have = new Set(data.items.map(n => n.id));
      set({ ...p, items: [...data.items, ...p.items.filter(n => !have.has(n.id))] });
      setMore('idle');
    } catch (e) {
      setMore(e);
    } finally {
      busy.current = false;
    }
  }, [data, url, set]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!end.current || more !== 'idle') return;
    const o = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) void loadMore(); }, { rootMargin: '400px' });
    o.observe(end.current);
    return () => o.disconnect();
  }, [loadMore, more]);

  if (error) return <Failed error={error} retry={reload} />;
  if (!data) return <Loading />;
  if (!data.items.length) {
    const none = listEmpty(data.empty === 'no_match' && plain ? 'all_seen' : data.empty);
    return <Empty title={none.title} description={none.description} action={none.clear && <Button label="필터 지우기" size="lg" onClick={onClear} />} />;
  }
  return (
    <VStack gap={3}>
      <List hasDividers density="spacious" edge="flush">{data.items.filter(n => !hidden(n)).map(n => <NoticeRow key={n.id} notice={n} />)}</List>
      <VStack ref={end} hAlign="center" paddingBlock={4} gap={2}>
        {more === 'loading' ? <Text color="secondary" role="status">더 불러오는 중이에요</Text>
          : more !== 'idle' ? <><Text color="secondary" role="alert">{messageOf(more)}</Text><Button label="다시 불러오기" size="lg" onClick={() => void loadMore()} /></>
            : data.next ? null : <Text color="secondary">여기까지예요</Text>}
      </VStack>
    </VStack>
  );
}

export function Notices({ query }: { query: Query }) {
  const href = noticesHref(query); // 주소를 다듬은 것
  const fields = useLoad(() => api<FieldList>('GET', '/api/fields'), [], 'fields');
  const [open, setOpen] = useState(false);
  const needRest = useNeedRest();
  const [opened, setOpened] = useState(false); // 한 번 연 뒤에는 닫힘 움직임이 보이게 남긴다
  const [q, setQ] = useState(query.q);
  useEffect(() => { setQ(query.q); }, [query.q]);
  const latest = useRef(query);
  latest.current = query;
  useEffect(() => {
    if (q === latest.current.q) return;
    const t = setTimeout(() => show({ ...latest.current, q }), SEARCH_WAIT_MS);
    return () => clearTimeout(t);
  }, [q]);
  const n = query.kind.length + query.field.length;
  const clear = () => { setQ(''); show({ sort: query.sort }); };
  const fieldName = (id: string) => fields.data?.fields.find(f => f.id === id)?.name ?? '고른 분야';
  return (
    <Page>
      <Heading level={1}>공지</Heading>
      <VStack gap={3}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <StackItem size="fill" style={{ minWidth: 'min(12rem, 100%)' }}><TextInput label="공지 찾기" isLabelHidden placeholder="제목이나 주최로 찾기" type="search" startIcon="search" size="lg" value={q} onChange={v => setQ(cut(v))} /></StackItem>
          <Button label={n ? `필터 ${n}` : '필터'} size="lg" icon={<Icon icon="funnel" />} clickAction={async () => { if (!await needRest()) return; setOpened(true); setOpen(true); }} />
        </HStack>
        <HStack gap={2} wrap="wrap" vAlign="center">
          {query.kind.map(k => <Chip key={k} name={kindName(k) ?? k} onRemove={() => show({ ...query, kind: query.kind.filter(x => x !== k) })} />)}
          {query.field.map(f => <Chip key={f} name={fieldName(f)} onRemove={() => show({ ...query, field: query.field.filter(x => x !== f) })} />)}
          {(n > 0 || query.q) && <Button label="모두 지우기" variant="ghost" size="lg" onClick={clear} />}
          {/* 정렬 칸은 첫 화면 뒤에 온다. 자리는 같은 크기로 둔다 */}
          <HStack style={{ marginInlineStart: 'auto' }}><NoticeSort query={query} /></HStack>
        </HStack>
      </VStack>
      <Results key={href} href={href} plain={!n && !query.q} onClear={clear} />
      {opened && <NoticeFilter isOpen={open} setOpen={setOpen} query={query} fields={fields} />}
    </Page>
  );
}
