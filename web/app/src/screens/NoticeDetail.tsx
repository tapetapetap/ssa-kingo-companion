// 공지 자세히(US2, FR-014): 본문은 없고 원문을 새 창으로 연다
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Heading, Text } from '@astryxdesign/core/Text';
import { ApiError, type NoticeCard } from '../api.ts';
import { useLoad } from '../lib/load.ts';
import { withCards } from '../lib/store.ts';
import { byText, kindName } from '../lib/notice.ts';
import { ActionBar } from '../parts/ActionBar.tsx';
import { Due } from '../parts/NoticeCard.tsx';
import { Page } from '../parts/Page.tsx';
import { Empty, Failed, Loading } from '../parts/States.tsx';

const dots = (day: string) => day.replaceAll('-', '.');
const names = (xs: { name: string }[]) => xs.map(x => x.name).join(', ');

export function NoticeDetail({ id }: { id: string }) {
  const { data: n, error, reload } = useLoad(() => withCards<NoticeCard>('GET', `/api/notices/${encodeURIComponent(id)}`, c => [c]), [id], `notice:${id}`);
  if (error) {
    return <Page parent="/notices">{error instanceof ApiError && error.code === 'not_found'
      ? <Empty title="찾을 수 없는 공지예요" action={<Button label="공지 보러 가기" size="lg" href="/notices" />} /> : <Failed error={error} retry={reload} />}</Page>;
  }
  if (!n) return <Page parent="/notices"><Loading /></Page>;
  return (
    <Page parent="/notices">
      <VStack gap={2}>
        <HStack gap={2} vAlign="center">{kindName(n.kind) && <Badge variant="teal" label={kindName(n.kind)} />}<Due notice={n} /></HStack>
        <VStack gap={1} data-server-text>
          <Heading level={1} textWrap="balance">{n.title}</Heading>
          {n.host && <Text color="secondary">{n.host}</Text>}
        </VStack>
        {!n.open && <Text color="secondary">{n.down ? '학교 공지에서 내려간 글이에요. 새로 표시할 수 없어요.' : '신청이 끝난 공지예요. 새로 표시할 수 없어요.'}</Text>}
      </VStack>
      <MetadataList label={{ width: '4em' }}>
        <MetadataListItem label="마감">{n.deadline ? dots(n.deadline) : '마감 없음'}</MetadataListItem>
        <MetadataListItem label="게시">{dots(n.postedOn)}</MetadataListItem>
        {n.fields && n.fields.core.length > 0 && <MetadataListItem label="핵심 분야">{names(n.fields.core)}</MetadataListItem>}
        {n.fields && n.fields.related.length > 0 && <MetadataListItem label="관련 분야">{names(n.fields.related)}</MetadataListItem>}
        <MetadataListItem label="분야 근거">{n.fields && !n.fields.core.length && !n.fields.related.length ? '맞는 분야가 없어요' : n.fields ? <Badge label={byText(n.fields.by)} /> : '아직 분야를 붙이지 않았어요'}</MetadataListItem>
      </MetadataList>
      <Text size="sm" color="secondary">자세한 내용과 신청은 원문에서 확인해 주세요.</Text>
      {/^https?:\/\//.test(n.url) && <Button label="원문 열기" variant="primary" size="lg" width="100%" icon={<Icon icon="externalLink" />} href={n.url} target="_blank" rel="noopener noreferrer" />}
      <ActionBar notice={n} />
    </Page>
  );
}
