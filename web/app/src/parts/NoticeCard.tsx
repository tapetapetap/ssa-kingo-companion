// 공지 한 건: 목록의 줄과 선반의 카드(FR-014). 제목은 두 줄에서 자른다
import { Badge } from '@astryxdesign/core/Badge';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { ListItem } from '@astryxdesign/core/List';
import { Text } from '@astryxdesign/core/Text';
import type { NoticeCard as Notice } from '../api.ts';
import { kstToday } from '../lib/date.ts';
import { actionText, due, kindName } from '../lib/notice.ts';

export const hrefOf = (n: Pick<Notice, 'id'>) => `/notices/${encodeURIComponent(n.id)}`;

export function Due({ notice }: { notice: Notice }) {
  const d = due(notice, kstToday());
  return d.urgent ? <Badge variant="warning" label={d.text} /> : <Text size="sm" color="secondary">{d.text}</Text>;
}

const core = (n: Notice) => n.fields?.core.map(f => f.name).join(', ') ?? '';

function Lines({ notice, about }: { notice: Notice; about: string }) {
  const action = actionText(notice.action);
  return (
    <VStack gap={0.5}>
      <VStack data-server-text>
        {about && <Text size="sm" color="secondary">{about}</Text>}
        {core(notice) && <Text size="sm" color="secondary">{core(notice)}</Text>}
      </VStack>
      {action && <Text size="sm" color="accent" weight="semibold">{action}</Text>}
    </VStack>
  );
}

export function NoticeRow({ notice }: { notice: Notice }) {
  return (
    <ListItem href={hrefOf(notice)} label={<Text maxLines={2} hasTruncateTooltip={false} data-server-text>{notice.title}</Text>}
      description={<Lines notice={notice} about={[notice.host, kindName(notice.kind)].filter(Boolean).join(' · ')} />} endContent={<Due notice={notice} />} />
  );
}

export function ShelfCard({ notice }: { notice: Notice }) {
  return (
    <ClickableCard label={notice.title} href={hrefOf(notice)} width={248} height="100%" padding={4}>
      <VStack gap={2}>
        <HStack justify="between" vAlign="center" gap={2}><Text size="sm" color="secondary">{kindName(notice.kind) ?? '공지'}</Text><Due notice={notice} /></HStack>
        <Text weight="semibold" maxLines={2} hasTruncateTooltip={false} data-server-text>{notice.title}</Text>
        <Lines notice={notice} about={notice.host ?? ''} />
      </VStack>
    </ClickableCard>
  );
}
