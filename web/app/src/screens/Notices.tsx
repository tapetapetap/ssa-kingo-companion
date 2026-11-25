// 공지 목록(US2, FR-013): 거르기·찾기·정렬은 주소에 남고, 20개씩 이어 불러온다. 뒤로 가기는 받은 쪽을 그대로 보인다
import { useCallback, useEffect, useRef, useState } from 'react';
import { BottomSheet } from '@astryxdesign/core/BottomSheet';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList';
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout';
import { Icon } from '@astryxdesign/core/Icon';
import { List } from '@astryxdesign/core/List';
import { Selector } from '@astryxdesign/core/Selector';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { api, messageOf, type FieldList, type NoticeCard, type Page as Data } from '../api.ts';
import { listEmpty } from '../lib/empty.ts';
import { useLoad } from '../lib/load.ts';
import { kindName, KINDS } from '../lib/notice.ts';
import { SEARCH_WAIT_MS } from '../lib/values.ts';
import { Chip } from '../parts/Chip.tsx';
import { FieldPicker } from '../parts/FieldPicker.tsx';
import { NoticeRow } from '../parts/NoticeCard.tsx';
import { Page } from '../parts/Page.tsx';
import { Empty, Failed, Loading } from '../parts/States.tsx';
import { cut, go, noticesHref, type Route } from '../route.ts';

type Query = Extract<Route, { name: 'notices' }>;
const SORTS = [{ value: 'new', label: '새로 올라온 순' }, { value: 'due', label: '마감 가까운 순' }];
const show = (q: Partial<Query>) => go(noticesHref(q), 'replace');

function Results({ href, plain, onClear }: { href: string; plain: boolean; onClear: () => void }) {
  const url = `/api${href}`;
  const { data, error, reload, set } = useLoad(() => api<Data>('GET', url), [url], url, true);
  const [more, setMore] = useState<'idle' | 'loading' | unknown>('idle');
  const busy = useRef(false);
  const loadMore = useCallback(async () => {
    if (!data?.next || busy.current) return;
    busy.current = true;
    setMore('loading');
    try {
      const p = await api<Data>('GET', `${url}${url.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(data.next)}`);
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
    return <Empty title={none.title} description={none.description} action={none.clear && <Button label="거르기 지우기" size="lg" onClick={onClear} />} />;
  }
  return (
    <VStack gap={3}>
      <List hasDividers density="spacious" edge="flush">{data.items.map((n: NoticeCard) => <NoticeRow key={n.id} notice={n} />)}</List>
      <VStack ref={end} hAlign="center" paddingBlock={4} gap={2}>
        {more === 'loading' ? <Text color="secondary" role="status">더 불러오는 중이에요</Text>
          : more !== 'idle' ? <><Text color="secondary" role="alert">{messageOf(more)}</Text><Button label="다시 불러오기" size="lg" onClick={() => void loadMore()} /></>
            : data.next ? null : <Text color="secondary">여기까지예요</Text>}
      </VStack>
    </VStack>
  );
}

function Filter({ query, fields, onClose }: { query: Query; fields: ReturnType<typeof useLoad<FieldList>>; onClose: () => void }) {
  const [kind, setKind] = useState(query.kind);
  const [field, setField] = useState(query.field);
  return (
    <VStack gap={5}>
      <Heading level={2}>필터</Heading>
      <CheckboxList label="종류" value={kind} onChange={setKind} density="spacious">
        {KINDS.map(([id, name]) => <CheckboxListItem key={id} value={id} label={name} />)}
      </CheckboxList>
      <VStack gap={3}>
        <Heading level={3}>분야</Heading>
        {fields.error ? <Failed error={fields.error} retry={fields.reload} /> : fields.data ? <FieldPicker list={fields.data} value={field} onChange={setField} /> : <Loading />}
      </VStack>
      <HStack gap={2} style={{ position: 'sticky', bottom: 0, backgroundColor: 'var(--color-background-surface)', paddingBlock: 'var(--spacing-3)' }}>
        <StackItem size="fill"><Button label="이대로 보기" variant="primary" size="lg" width="100%" onClick={() => { show({ ...query, kind, field }); onClose(); }} /></StackItem>
        <Button label="모두 지우기" variant="ghost" size="lg" onClick={() => { setKind([]); setField([]); }} />
      </HStack>
    </VStack>
  );
}

export function Notices({ query }: { query: Query }) {
  const href = noticesHref(query); // 주소를 다듬은 것
  const fields = useLoad(() => api<FieldList>('GET', '/api/fields'), [], 'fields');
  const [open, setOpen] = useState(false);
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
          <Button label={n ? `필터 ${n}` : '필터'} size="lg" icon={<Icon icon="funnel" />} onClick={() => setOpen(true)} />
        </HStack>
        <HStack gap={2} wrap="wrap" vAlign="center">
          {query.kind.map(k => <Chip key={k} name={kindName(k) ?? k} onRemove={() => show({ ...query, kind: query.kind.filter(x => x !== k) })} />)}
          {query.field.map(f => <Chip key={f} name={fieldName(f)} onRemove={() => show({ ...query, field: query.field.filter(x => x !== f) })} />)}
          {(n > 0 || query.q) && <Button label="모두 지우기" variant="ghost" size="lg" onClick={clear} />}
          <Selector label="정렬" isLabelHidden size="lg" options={SORTS} value={query.sort === 'due' ? 'due' : 'new'} onChange={v => show({ ...query, sort: v === 'due' ? 'due' : '' })} containerStyle={{ marginInlineStart: 'auto' }} />
        </HStack>
      </VStack>
      <Results key={href} href={href} plain={!n && !query.q} onClear={clear} />
      <BottomSheet label="필터" isOpen={open} onOpenChange={setOpen} height="tall" padding={5}>
        {open && <Filter query={query} fields={fields} onClose={() => setOpen(false)} />}
      </BottomSheet>
    </Page>
  );
}
