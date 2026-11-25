// 홈(US2, FR-012): 가장 추천 하나와 선반 셋. 다시 고르는 중이면 5초 뒤 한 번 다시 부른다
import { useEffect, useRef } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Carousel } from '@astryxdesign/core/Carousel';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { api, type Home as Data, type Shelf } from '../api.ts';
import { homeEmpty } from '../lib/empty.ts';
import { useLoad } from '../lib/load.ts';
import { actionText, kindName } from '../lib/notice.ts';
import { HOME_REFRESH_MS } from '../lib/values.ts';
import { Due, hrefOf, ShelfCard } from '../parts/NoticeCard.tsx';
import { Page } from '../parts/Page.tsx';
import { Empty, Failed, Loading } from '../parts/States.tsx';

const SHELVES = [['soon', '마감 임박', '/notices?sort=due'], ['field', '관심 분야 새 공지', null], ['similar', '비슷한 공지', null]] as const;
const today = () => new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Seoul' }).format(new Date());

function Pick({ pick }: { pick: NonNullable<Data['pick']> }) {
  const n = pick.notice;
  const action = actionText(n.action);
  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text color="accent" weight="semibold">컴패니언</Text>
          <Text size="sm" color="secondary">{pick.method.startsWith('LLM') ? 'AI가 골랐어요' : '규칙으로 골랐어요'}</Text>
          {pick.repicking && <Text size="sm" color="secondary" role="status">다시 고르는 중이에요</Text>}
        </HStack>
        <Text as="p" data-server-text>{pick.reason}</Text>
      </VStack>
      <Card padding={4}>
        <VStack gap={3}>
          <HStack gap={2} vAlign="center">{kindName(n.kind) && <Badge variant="teal" label={kindName(n.kind)} />}<Due notice={n} /></HStack>
          <VStack gap={1} data-server-text>
            <Heading level={1} textWrap="balance" maxLines={4} hasTruncateTooltip={false}>{n.title}</Heading>
            {n.host && <Text size="sm" color="secondary">{n.host}</Text>}
            {n.fields && n.fields.core.length > 0 && <Text size="sm" color="secondary">{n.fields.core.map(f => f.name).join(', ')}</Text>}
          </VStack>
          {action && <Text size="sm" color="accent" weight="semibold">{action}</Text>}
          {pick.cited.length > 0 && (
            <Collapsible defaultIsOpen={false} trigger={<Text>이걸 보고 골랐어요</Text>}>
              <VStack as="ul" gap={1} style={{ margin: 0, paddingInlineStart: 'var(--spacing-5)', listStyle: 'disc' }} data-server-text>
                {pick.cited.map(c => <li key={c.key}><Text size="sm" color="secondary">{c.key === 'prompt' ? '나에 대한 프롬프트' : c.text}</Text></li>)}
              </VStack>
            </Collapsible>
          )}
          <Button label="자세히 보기" variant="primary" size="lg" width="100%" href={hrefOf(n)} />
        </VStack>
      </Card>
    </VStack>
  );
}

function ShelfRow({ name, more, shelf }: { name: string; more: string | null; shelf: Shelf }) {
  const mouse = useMediaQuery('(pointer: fine)'); // 손가락은 밀어서 넘긴다
  return (
    <VStack gap={3} as="section" aria-label={name}>
      <HStack justify="between" vAlign="center"><Heading level={2}>{name}</Heading>{more && <Button label="더 보기" variant="ghost" size="lg" href={more} />}</HStack>
      {/* 좌우 여백까지 써서 넘길 것이 더 있음을 보인다 */}
      <Carousel aria-label={name} gap={3} hasEdgeFade={false} hasButtons={mouse} padding={5} style={{ marginInline: 'calc(-1 * var(--spacing-5))', width: 'calc(100% + 2 * var(--spacing-5))', maxWidth: 'none' }}>
        {shelf.items.map(n => <ShelfCard key={n.id} notice={n} />)}
      </Carousel>
    </VStack>
  );
}

export function Home() {
  const { data, error, reload, refresh } = useLoad(() => api<Data>('GET', '/api/home'), [], 'home');
  const asked = useRef(false);
  const repicking = data?.pick?.repicking ?? false;
  useEffect(() => {
    if (!repicking || asked.current) return;
    const t = setTimeout(() => { asked.current = true; void refresh(); }, HOME_REFRESH_MS);
    return () => clearTimeout(t);
  }, [repicking, refresh]);
  if (error) return <Failed error={error} retry={reload} />;
  if (!data) return <Loading />;
  const none = homeEmpty(data.pickEmpty);
  const shelves = SHELVES.filter(([id]) => data.shelves[id].items.length > 0);
  return (
    <Page>
      <Text size="sm" color="secondary">{today()}</Text>
      {data.pick ? <Pick pick={data.pick} /> : <Empty title={none.title} description={none.description} action={none.link && <Button label={none.link.label} size="lg" href={none.link.href} />} />}
      {shelves.length ? shelves.map(([id, name, more]) => <ShelfRow key={id} name={name} more={more} shelf={data.shelves[id]} />)
        : <Text color="secondary">지금 보여 줄 선반이 없어요</Text>}
    </Page>
  );
}
