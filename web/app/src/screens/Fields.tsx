// 분야 고르기: 3개 이상
import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { useToast } from '@astryxdesign/core/Toast';
import { api, messageOf, type FieldList } from '../api.ts';
import { useLoad } from '../lib/load.ts';
import { MIN_FIELDS } from '../lib/values.ts';
import { FieldPicker } from '../parts/FieldPicker.tsx';
import { Failed, Loading } from '../parts/States.tsx';
import { Step } from '../parts/Step.tsx';

/** parent가 있으면 '나'에서 고치기 */
export function Fields({ onDone, parent }: { onDone: () => Promise<void>; parent?: string }) {
  const { data, error, reload } = useLoad(async () => {
    const [list, mine] = await Promise.all([api<FieldList>('GET', '/api/fields'), api<{ ids: string[] }>('GET', '/api/me/fields')]);
    return { list, ids: mine.ids };
  }, []);
  const [ids, setIds] = useState<string[]>([]);
  const toast = useToast();
  useEffect(() => { if (data) setIds(data.ids); }, [data]);
  if (error) return <Failed error={error} retry={reload} />;
  if (!data) return <Loading />;
  const names = ids.map(id => data.list.fields.find(f => f.id === id)?.name ?? id);
  const save = async () => {
    try {
      await api('PUT', '/api/me/fields', { ids });
      await onDone();
    } catch (e) {
      toast({ body: messageOf(e), type: 'error' });
    }
  };
  return (
    <Step n={parent ? undefined : 2} parent={parent} title={parent ? '고른 분야' : `관심 분야를 ${MIN_FIELDS}개 이상 골라 주세요`} intro="고른 분야의 공지를 먼저 보여 드려요. 나중에 바꿀 수 있어요."
      note={<><Text weight="semibold">{`${ids.length}개 골랐어요`}</Text><Text size="sm" color="secondary" maxLines={1}>{ids.length < MIN_FIELDS ? `${MIN_FIELDS}개 이상 골라 주세요` : names.join(', ')}</Text></>}
      action={<Button label={parent ? '저장하기' : '다음'} variant="primary" size="lg" isDisabled={ids.length < MIN_FIELDS} clickAction={save} />}>
      <FieldPicker list={data.list} value={ids} onChange={setIds} />
    </Step>
  );
}
