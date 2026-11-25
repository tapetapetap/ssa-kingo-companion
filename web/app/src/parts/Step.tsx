// 처음 흐름 화면의 틀: 진행 막대(처음 질문 둘만), 제목, 본문, 아래에 붙는 막대(주 버튼)
import type { CSSProperties, ReactNode } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Heading, Text } from '@astryxdesign/core/Text';

const bar: CSSProperties = {
  position: 'sticky', bottom: 0, marginInline: 'calc(-1 * var(--spacing-5))', marginBlockStart: 'auto',
  paddingBlock: 'var(--spacing-3) calc(var(--spacing-3) + env(safe-area-inset-bottom))', paddingInline: 'var(--spacing-5)',
  backgroundColor: 'var(--color-background-surface)', borderBlockStart: 'var(--border-width) solid var(--color-border)', zIndex: 1
};

export function Step({ n, title, intro, children, note, action }: { n?: 1 | 2; title: string; intro?: string; children: ReactNode; note?: ReactNode; action: ReactNode }) {
  return (
    <VStack gap={6} paddingBlockStart={6} style={{ minHeight: '100dvh' }}>
      <VStack gap={3}>
        {n && <><Text size="sm">{`처음 질문 ${n}/2`}</Text><ProgressBar label={`처음 질문 둘 중 ${n}번째`} isLabelHidden value={n} max={2} /></>}
        <Heading level={1} textWrap="balance">{title}</Heading>
        {intro && <Text color="secondary" size="sm">{intro}</Text>}
      </VStack>
      {children}
      <HStack style={bar} gap={3} vAlign="center" justify="between">
        {note && <VStack gap={0} style={{ minWidth: 0 }}>{note}</VStack>}
        <HStack style={{ flex: note ? 'none' : 1 }}>{action}</HStack>
      </HStack>
    </VStack>
  );
}
