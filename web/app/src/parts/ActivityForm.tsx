// 해 온 활동 칸(US3-4, US4-4): 이름 100자·학기·종류·분야 0~2·증빙 주소
import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { MultiSelector } from '@astryxdesign/core/MultiSelector';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { api, ApiError, messageOf, type Activity, type Draft, type FieldList } from '../api.ts';
import { kstToday, termsBefore } from '../lib/date.ts';
import { writingNow } from '../lib/draft.ts';
import { useLoad } from '../lib/load.ts';
import { KINDS } from '../lib/notice.ts';
import { ACTIVITY_FIELDS, ACTIVITY_NAME_CHARS, PROOF_CHARS } from '../lib/values.ts';
import { Failed, Loading } from './States.tsx';

const termName = (t: string) => `${t.slice(0, 4)}년 ${t.slice(5)}학기`;

export function ActivityForm({ draft, id, path, onSaved }: { draft: Partial<Activity> | Draft; id?: number; path: string; onSaved: () => void }) {
  const fields = useLoad(() => api<FieldList>('GET', '/api/fields'), [], 'fields');
  const [d, setD] = useState<{ name: string; term: string; kind: string; fieldIds: string[]; proofUrl: string }>({
    name: draft.name ?? '', term: draft.term ?? '', kind: draft.kind ?? '', fieldIds: draft.fieldIds ?? [], proofUrl: ('proofUrl' in draft && draft.proofUrl) || ''
  });
  const [dirty, setDirty] = useState(false);
  // 로그인이 끊기면 쓰던 활동을 이 화면(path)에 되살린다(R17)
  useEffect(() => {
    writingNow(dirty ? path : null, d);
    return () => writingNow(null);
  }, [dirty, d, path]);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const put = (p: Partial<typeof d>) => {
    setD(was => ({ ...was, ...p }));
    setError(null);
    setDirty(true);
  };
  if (fields.error) return <Failed error={fields.error} retry={fields.reload} />;
  if (!fields.data) return <Loading />;
  const known = d.fieldIds.filter(x => fields.data!.fields.some(f => f.id === x)); // 목록에서 빠진 분야는 세지도 보내지도 않는다
  const status = (field: string) => (error?.field === field ? { type: 'error' as const, message: error.message } : undefined);
  const terms = termsBefore(kstToday(), d.term);
  const save = async () => {
    try {
      const body = { ...d, fieldIds: known, proofUrl: d.proofUrl.trim() || null };
      await api(id ? 'PATCH' : 'POST', id ? `/api/me/activities/${id}` : '/api/me/activities', body);
      onSaved();
    } catch (e) {
      setError({ field: e instanceof ApiError ? String(e.extra.field ?? '') : undefined, message: messageOf(e) });
    }
  };
  return (
    <VStack gap={4}>
      <TextInput label="이름" size="lg" value={d.name} onChange={v => put({ name: v.slice(0, ACTIVITY_NAME_CHARS) })} status={status('name')} />
      <Selector label="학기" size="lg" placeholder="고르기" presentation="adaptive" options={terms.map(t => ({ value: t, label: termName(t) }))} value={d.term || undefined} onChange={v => put({ term: v ?? '' })} status={status('term')} />
      <Selector label="종류" size="lg" placeholder="고르기" presentation="adaptive" options={KINDS.map(([value, label]) => ({ value, label }))} value={d.kind || undefined} onChange={v => put({ kind: v ?? '' })} status={status('kind')} />
      <MultiSelector label={`분야(${ACTIVITY_FIELDS}개까지)`} size="lg" placeholder="고르지 않아도 돼요" presentation="adaptive" hasSearch searchPlaceholder="분야 이름으로 찾기" emptySearchText="맞는 분야가 없어요" triggerDisplay="labels"
        options={fields.data.fields.map(f => ({ value: f.id, label: f.name, disabled: known.length >= ACTIVITY_FIELDS && !known.includes(f.id) }))}
        value={known} onChange={v => put({ fieldIds: v.slice(0, ACTIVITY_FIELDS) })} status={status('fieldIds')} />
      <TextInput label="증빙 주소" description="블로그나 GitHub처럼 해 온 것을 보여 주는 주소예요. 없어도 돼요." size="lg" type="url" inputMode="url" autoCapitalize="off" value={d.proofUrl} onChange={v => put({ proofUrl: v.slice(0, PROOF_CHARS) })} status={status('proofUrl')} />
      {error && !['name', 'term', 'kind', 'fieldIds', 'proofUrl'].includes(error.field ?? '') && <Text color="primary" role="alert">{error.message}</Text>}
      <Button label="저장하기" variant="primary" size="lg" width="100%" isDisabled={!d.name.trim() || !d.term || !d.kind} clickAction={save} />
    </VStack>
  );
}
