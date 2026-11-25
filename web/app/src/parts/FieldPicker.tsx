// 분야 고르기(FR-011): 큰 묶음을 누르면 세부 분야와 한 줄 설명이 열린다. 찾으면 맞는 세부 분야만 보인다
import { useMemo, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Icon } from '@astryxdesign/core/Icon';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import type { FieldList } from '../api.ts';
import { findFields } from '../lib/find.ts';

export function FieldPicker({ list, value, onChange }: { list: FieldList; value: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const top = new Map<string, string>(); // 묶음 → 가장 위 묶음
    for (const g of list.groups) top.set(g.id, g.parent ? top.get(g.parent) ?? g.parent : g.id); // 목록은 위 묶음이 먼저다
    return list.groups.filter(g => !g.parent).map(g => ({ ...g, fields: list.fields.filter(f => top.get(f.group) === g.id) }));
  }, [list]);
  const byId = new Map(list.fields.map(f => [f.id, f]));
  const found = findFields(list.fields, q);
  const rows = (fields: FieldList['fields'], label: string) => (
    <VStack data-server-text>
      <CheckboxList label={label} isLabelHidden value={value} onChange={onChange} density="spacious">
        {fields.map(f => <CheckboxListItem key={f.id} value={f.id} label={f.name} description={<Text size="sm">{f.desc}</Text>} align="first-line" />)}
      </CheckboxList>
    </VStack>
  );
  return (
    <VStack gap={4}>
      <TextInput label="분야 찾기" isLabelHidden placeholder="분야 이름으로 찾기" size="lg" type="search" startIcon="search" value={q} onChange={setQ} />
      {value.length > 0 && (
        <HStack gap={2} wrap="wrap" role="group" aria-label="고른 분야">
          {value.map(id => {
            const name = byId.get(id)?.name ?? id;
            return <Button key={id} size="lg" label={`${name} 빼기`} endContent={<Icon icon="close" size="sm" />} onClick={() => onChange(value.filter(x => x !== id))}>{name}</Button>;
          })}
        </HStack>
      )}
      {q.trim() ? (found.length ? rows(found, '찾은 분야') : <Text color="secondary">맞는 분야가 없어요. 다른 말로 찾아 보세요.</Text>) : groups.map(g => {
        const n = g.fields.filter(f => value.includes(f.id)).length;
        return (
          <Collapsible key={g.id} defaultIsOpen={false} trigger={<HStack gap={2} vAlign="center"><Text type="large">{g.name}</Text>{n > 0 && <Text size="sm" color="accent">{`${n}개 고름`}</Text>}</HStack>}>
            {rows(g.fields, g.name)}
          </Collapsible>
        );
      })}
    </VStack>
  );
}
