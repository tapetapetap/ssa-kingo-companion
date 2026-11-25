// 나의 분석(US4-3·5·6): 세 칸, 줄 빼기·되살리기, 끄기·켜기, .md
import { useState } from 'react';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { Switch } from '@astryxdesign/core/Switch';
import { Heading, Text } from '@astryxdesign/core/Text';
import { useToast } from '@astryxdesign/core/Toast';
import { api, messageOf, type Analysis as Data, type AnalysisLine, type FieldList } from '../api.ts';
import { kstDay } from '../lib/date.ts';
import { lineText } from '../lib/lineKey.ts';
import { useLoad } from '../lib/load.ts';
import { dayText } from '../lib/notice.ts';
import { Page } from '../parts/Page.tsx';
import { Empty, Failed, Loading } from '../parts/States.tsx';

const SECTIONS = [['done', '해 온 활동'], ['interest', '관심 분야'], ['flow', '컴패니언이 본 흐름']] as const;
const EMPTY = { done: '아직 넣은 활동이 없어요.', interest: '아직 없어요.', flow: '기록이 쌓이면 컴패니언이 흐름을 써요.' };
/** 줄을 고치는 화면. 나머지 줄은 뺄 수 있다 */
const editHref = (key: string) => (key === 'ans' ? '/me/answers' : key === 'picked' ? '/me/fields' : key.startsWith('act:') ? `/me/activities/${key.slice(4)}` : null);

/** 화면에 보이는 글과 같은 md를 파일로 준다 */
function save(md: string) {
  const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'analysis.md' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function Analysis({ onChanged }: { onChanged: () => Promise<void> }) {
  const { data, error, reload, refresh } = useLoad(async () => {
    const [a, f] = await Promise.all([api<Data>('GET', '/api/me/analysis'), api<FieldList>('GET', '/api/fields')]);
    return { a, f };
  }, [], 'analysis');
  const [asking, setAsking] = useState(false);
  const toast = useToast();
  if (error) return <Page parent="/me"><Heading level={1}>나의 분석</Heading><Failed error={error} retry={reload} /></Page>;
  if (!data) return <Page parent="/me"><Heading level={1}>나의 분석</Heading><Loading /></Page>;
  const run = async (f: () => Promise<unknown>, said?: string) => {
    try {
      await f();
      if (!await refresh()) return reload(); // 고쳤는데 새로 받지 못했으면 낡은 줄을 보이지 않는다
      if (said) toast({ body: said, uniqueID: 'note' });
    } catch (e) {
      toast({ body: messageOf(e), type: 'error', isAutoHide: true });
    }
  };
  const turn = (off: boolean) => run(async () => { await api('PUT', '/api/me/analysis/off', { off }); await onChanged(); });
  if (data.a.off) {
    return <Page parent="/me"><Heading level={1}>나의 분석</Heading><Empty title="나의 분석을 꺼 두었어요" description="켜면 기록을 보고 다시 써요." action={<Button label="다시 켜기" variant="primary" size="lg" clickAction={() => turn(false)} />} /></Page>;
  }
  const { lines, excluded, madeAt, md } = data.a;
  const textOf = (key: string) => lines.find(l => l.key === key)?.text;
  const text = (key: string) => lineText(key, textOf, id => data.f.fields.find(f => f.id === id)?.name);
  const line = (l: AnalysisLine) => {
    const edit = editHref(l.key);
    const control = edit ? <Button label="고치기" variant="ghost" size="lg" href={edit} />
      : <Button label="빼기" variant="ghost" size="lg" clickAction={() => run(() => api('PUT', `/api/me/analysis/excluded/${encodeURIComponent(l.key)}`), '분석에서 뺐어요')} />;
    return (
      <ListItem key={l.key} align="start" label={<Text data-server-text>{l.text}</Text>} endContent={control}
        description={l.refs
          ? <HStack gap={1} wrap="wrap" data-server-text>{l.refs.map(r => <Badge key={r} label={<Text size="sm" maxLines={1} hasTruncateTooltip={false}>{`근거: ${text(r)}`}</Text>} />)}</HStack>
          : <Text size="sm" color="secondary">{[l.source, l.proof].filter(Boolean).join(' · ')}</Text>} />
    );
  };
  return (
    <Page parent="/me">
      <VStack gap={2}>
        <Heading level={1}>나의 분석</Heading>
        <Text size="sm" color="secondary">{`${dayText(kstDay(new Date(madeAt)))}에 썼어요. 기록이 바뀌면 다시 써요.`}</Text>
        <Text color="accent" weight="semibold">컴패니언</Text>
        <Text as="p">기록을 보고 정리했어요. 잘못 본 줄은 빼 주세요.</Text>
      </VStack>
      {SECTIONS.map(([id, name]) => {
        const mine = lines.filter(l => l.section === id);
        return (
          <VStack key={id} gap={2} as="section" aria-label={name}>
            <Heading level={2}>{name}</Heading>
            {mine.length ? <List hasDividers edge="flush" density="spacious">{mine.map(line)}</List> : <Text color="secondary">{EMPTY[id]}</Text>}
            {id === 'done' && <Button label="해 온 활동 넣기" size="lg" width="100%" href="/me/activities/new" />}
          </VStack>
        );
      })}
      {excluded.length > 0 && (
        <Collapsible defaultIsOpen={false} trigger={<Text>{`뺀 줄 ${excluded.length}개`}</Text>}>
          <List hasDividers edge="flush" density="spacious">
            {excluded.map(({ key }) => <ListItem key={key} label={<Text data-server-text>{text(key)}</Text>}
              endContent={<Button label="되살리기" variant="ghost" size="lg" clickAction={() => run(() => api('DELETE', `/api/me/analysis/excluded/${encodeURIComponent(key)}`), '되살렸어요')} />} />)}
          </List>
        </Collapsible>
      )}
      <HStack gap={3} vAlign="center" style={{ minHeight: 'var(--size-element-lg)' }}>
        <StackItem size="fill"><Switch label="나의 분석으로 추천받기" description="끄면 나의 분석을 지우고 프롬프트와 고른 분야로만 추천해요." labelPosition="start" labelSpacing="spread" width="100%" value onChange={() => setAsking(true)} /></StackItem>
      </HStack>
      <Button label=".md 파일로 내려받기" size="lg" width="100%" onClick={() => save(md)} />
      <AlertDialog isOpen={asking} onOpenChange={setAsking} title="나의 분석을 끌까요?" description="지금 분석과 뺀 줄이 지워져요. 해 온 활동은 남고, 켜면 다시 써요. 끄기 전에 .md 파일로 받아 둘 수 있어요."
        actionLabel="끄기" cancelLabel="그대로 두기" onAction={() => { setAsking(false); void turn(true); }} />
    </Page>
  );
}
