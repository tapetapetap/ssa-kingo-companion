// 나(US4-1·7): 고칠 수 있는 것의 길, 로그아웃, 계정 지우기(두 번 확인)
import { useState } from 'react';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { VStack } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { Heading, Text } from '@astryxdesign/core/Text';
import { useToast } from '@astryxdesign/core/Toast';
import { api, messageOf, type Answers, type FieldList, type Me as Data } from '../api.ts';
import { useLoad } from '../lib/load.ts';
import { gradeText, goalText } from '../lib/notice.ts';
import { Page } from '../parts/Page.tsx';
import { Failed, Loading } from '../parts/States.tsx';

export function Me({ me, onSignedOut }: { me: Data; onSignedOut: () => void }) {
  const { data, error, reload } = useLoad(async () => {
    const [list, mine, answers, prompt] = await Promise.all([api<FieldList>('GET', '/api/fields'), api<{ ids: string[] }>('GET', '/api/me/fields'), api<Answers>('GET', '/api/me/answers'), api<{ body: string }>('GET', '/api/me/prompt')]);
    return { fields: mine.ids.map(id => list.fields.find(f => f.id === id)?.name).filter(Boolean).join(', '), answers, prompt: prompt.body };
  }, [], 'me');
  const [asking, setAsking] = useState<0 | 1 | 2>(0);
  const toast = useToast();
  if (error) return <Page><Heading level={1}>나</Heading><Failed error={error} retry={reload} /></Page>;
  if (!data) return <Page><Heading level={1}>나</Heading><Loading /></Page>;
  const run = async (f: () => Promise<unknown>) => {
    try {
      await f();
      onSignedOut();
    } catch (e) {
      toast({ body: messageOf(e), type: 'error', isAutoHide: true });
    }
  };
  const rows: [string, string, string][] = [
    ['/me/fields', '고른 분야', data.fields],
    ['/me/prompt', '나에 대한 프롬프트', data.prompt || '아직 쓰지 않았어요'],
    ['/me/analysis', '나의 분석', me.analysisOff ? '꺼 두었어요' : '기록을 보고 컴패니언이 정리해요'],
    ['/me/push', '알림', '마감 전에 알려 드려요'],
    ['/me/answers', '처음 질문', `${gradeText(data.answers.grade)} ${data.answers.term}학기, ${goalText(data.answers.goal)}`]
  ];
  return (
    <Page>
      <VStack gap={1}><Heading level={1}>나</Heading><Text size="sm" color="secondary" data-server-text>{me.dept}</Text></VStack>
      <List hasDividers edge="flush" density="spacious">
        {rows.map(([href, label, now]) => <ListItem key={href} href={href} label={label} description={<Text size="sm" color="secondary" maxLines={2} hasTruncateTooltip={false} data-server-text>{now}</Text>} endContent={<Icon icon="chevronRight" color="secondary" />} />)}
      </List>
      <VStack gap={2}>
        <Button label="로그아웃" size="lg" width="100%" clickAction={() => run(() => api('POST', '/api/logout'))} />
        <Button label="계정 지우기" variant="ghost" size="lg" width="100%" onClick={() => setAsking(1)} />
      </VStack>
      <AlertDialog isOpen={asking === 1} onOpenChange={o => { if (!o) setAsking(a => (a === 1 ? 0 : a)); }} title="계정을 지울까요?" actionLabel="다음" cancelLabel="그만두기"
        description="처음 질문 답, 고른 분야, 프롬프트, 나의 분석, 활동, 내 목록이 바로 지워져요. 백업에서는 7일 뒤에 사라져요." onAction={() => setAsking(2)} />
      <AlertDialog isOpen={asking === 2} onOpenChange={o => { if (!o) setAsking(0); }} title="마지막으로 확인할게요" actionLabel="모두 지우기" cancelLabel="그만두기"
        description="지우면 되살릴 수 없어요." onAction={() => { setAsking(0); void run(() => api('DELETE', '/api/me', { confirm: true })); }} />
    </Page>
  );
}
