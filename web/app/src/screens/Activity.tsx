// 해 온 활동 넣기·고치기·지우기(US4-4): 100개까지
import { useState } from 'react';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Text';
import { useToast } from '@astryxdesign/core/Toast';
import { api, messageOf, type Activity as Saved } from '../api.ts';
import { draftOf } from '../lib/draft.ts';
import { useLoad } from '../lib/load.ts';
import { ACTIVITY_COUNT } from '../lib/values.ts';
import { ActivityForm } from '../parts/ActivityForm.tsx';
import { Page } from '../parts/Page.tsx';
import { Empty, Failed, Loading } from '../parts/States.tsx';
import { back } from '../route.ts';

const PARENT = '/me/analysis';

export function Activity({ id }: { id: string | null }) {
  const path = `/me/activities/${id ?? 'new'}`;
  const { data, error, reload } = useLoad(() => api<{ items: Saved[] }>('GET', '/api/me/activities'), [path]);
  const [draft] = useState(() => draftOf<Partial<Saved>>(path)); // 로그인이 끊겨 저장하지 못한 글
  const [asking, setAsking] = useState(false);
  const toast = useToast();
  if (error) return <Page parent={PARENT}><Failed error={error} retry={reload} /></Page>;
  if (!data) return <Page parent={PARENT}><Loading /></Page>;
  const saved = data.items.find(a => String(a.id) === id);
  if (id && !saved) return <Page parent={PARENT}><Empty title="찾을 수 없는 활동이에요" /></Page>;
  if (!id && data.items.length >= ACTIVITY_COUNT) return <Page parent={PARENT}><Empty title={`활동은 ${ACTIVITY_COUNT}개까지 넣을 수 있어요`} description="안 쓰는 활동을 지우면 새로 넣을 수 있어요." /></Page>;
  const done = (said: string) => { toast({ body: said, uniqueID: 'note' }); back(PARENT); };
  const remove = async () => {
    setAsking(false); // 두 번 누르지 않게 먼저 닫는다
    try {
      await api('DELETE', `/api/me/activities/${id}`);
      done('지웠어요');
    } catch (e) {
      toast({ body: messageOf(e), type: 'error', isAutoHide: true });
    }
  };
  return (
    <Page parent={PARENT}>
      <Heading level={1}>{id ? '활동 고치기' : '해 온 활동 넣기'}</Heading>
      <ActivityForm draft={draft ?? saved ?? {}} unsaved={!!draft} id={saved?.id} path={path} onSaved={() => done('저장했어요')} />
      {id && <Button label="활동 지우기" variant="ghost" size="lg" onClick={() => setAsking(true)} />}
      <AlertDialog isOpen={asking} onOpenChange={setAsking} title="이 활동을 지울까요?" description="나의 분석에서도 빠져요." actionLabel="지우기" cancelLabel="그대로 두기" onAction={() => void remove()} />
    </Page>
  );
}
