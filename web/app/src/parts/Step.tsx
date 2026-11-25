// 처음 흐름 화면의 틀: 진행 막대(처음 질문 둘만), 제목, 본문, 아래에 붙는 막대(주 버튼)
import type { CSSProperties, ReactNode } from 'react';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Heading, Text } from '@astryxdesign/core/Text';
import { BackButton, MENU_HEIGHT } from './Page.tsx';

const bar: CSSProperties = {
  position: 'sticky', bottom: 0, marginInline: 'calc(-1 * var(--spacing-5))', marginBlockStart: 'auto',
  paddingBlock: 'var(--spacing-3) calc(var(--spacing-3) + env(safe-area-inset-bottom))', paddingInline: 'var(--spacing-5)',
  backgroundColor: 'var(--color-background-surface)', borderBlockStart: 'var(--border-width) solid var(--color-border)', zIndex: 1
};

/** parent가 있으면 '나'에서 고치는 화면: 뒤로 가기가 있고 아래 메뉴 위에 막대를 둔다 */
export function Step({ n, parent, title, intro, children, note, action }: { n?: 1 | 2; parent?: string; title: string; intro?: string; children: ReactNode; note?: ReactNode; action: ReactNode }) {
  const wide = useMediaQuery('(min-width: 900px)');
  const menu = parent && !wide ? MENU_HEIGHT : '0px';
  return (
    <VStack gap={6} paddingBlockStart={parent ? 2 : 6} style={{ minHeight: `calc(100dvh - ${menu})` }}>
      <VStack gap={3}>
        {parent && <BackButton parent={parent} />}
        {n && <><Text size="sm">{`처음 질문 ${n}/2`}</Text><ProgressBar label={`처음 질문 둘 중 ${n}번째`} isLabelHidden value={n} max={2} /></>}
        <Heading level={1} textWrap="balance">{title}</Heading>
        {intro && <Text color="secondary" size="sm">{intro}</Text>}
      </VStack>
      {children}
      <HStack style={{ ...bar, bottom: menu, ...(parent && !wide ? { paddingBlockEnd: 'var(--spacing-3)' } : {}) }} gap={3} vAlign="center" justify="between">
        {note && <VStack gap={0} style={{ minWidth: 0 }}>{note}</VStack>}
        <HStack style={{ flex: note ? 'none' : 1 }}>{action}</HStack>
      </HStack>
    </VStack>
  );
}
