// 공지 목록의 필터 창과 정렬 칸(둘째 덩어리)
import { useState } from 'react';
import { BottomSheet } from '@astryxdesign/core/BottomSheet';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList';
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout';
import { Selector } from '@astryxdesign/core/Selector';
import { Heading } from '@astryxdesign/core/Text';
import type { FieldList } from '../api.ts';
import type { useLoad } from '../lib/load.ts';
import { KINDS } from '../lib/notice.ts';
import { show, type Query } from '../screens/Notices.tsx';
import { FieldPicker } from './FieldPicker.tsx';
import { Failed, Loading } from './States.tsx';

const SORTS = [{ value: 'new', label: '새로 올라온 순' }, { value: 'due', label: '마감 가까운 순' }];

export const NoticeSort = ({ query }: { query: Query }) => <Selector label="정렬" isLabelHidden size="lg" options={SORTS} value={query.sort === 'due' ? 'due' : 'new'} onChange={v => show({ ...query, sort: v === 'due' ? 'due' : '' })} />;

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

export const NoticeFilter = ({ isOpen, setOpen, query, fields }: { isOpen: boolean; setOpen: (v: boolean) => void; query: Query; fields: ReturnType<typeof useLoad<FieldList>> }) => (
  <BottomSheet label="필터" isOpen={isOpen} onOpenChange={setOpen} height="tall" padding={5}>
    {isOpen && <Filter query={query} fields={fields} onClose={() => setOpen(false)} />}
  </BottomSheet>
);
