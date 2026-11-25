// 모니터링 메뉴의 틀: 제목, 불러오는 중, 실패
import type { ReactNode } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Heading, Text } from '@astryxdesign/core/Text';
import type { Monitor } from './api.ts';

export type PageProps = { data: Monitor | null; error: string | null; reload: () => Promise<void> };

export function Page({ title, note, actions, data, error, reload, children }: PageProps & { title: string; note?: string; actions?: ReactNode; children: (d: Monitor) => ReactNode }) {
  return (
    <VStack gap={6} padding={6} style={{ maxWidth: 1200, wordBreak: 'keep-all' }}>
      <HStack gap={3} vAlign="center" justify="between">
        <VStack gap={1}><Heading level={1}>{title}</Heading>{note && <Text type="supporting" color="secondary">{note}</Text>}</VStack>
        {actions}
      </HStack>
      {data ? children(data) : error ? <EmptyState title="불러오지 못했어요" description={error} actions={<Button label="다시 불러오기" onClick={() => void reload()} />} /> : <Spinner label="불러오는 중이에요" />}
    </VStack>
  );
}
