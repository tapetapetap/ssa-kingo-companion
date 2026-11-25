// 하위 화면의 머리: 뒤로 가기
import type { ReactNode } from 'react';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Icon } from '@astryxdesign/core/Icon';
import { VStack } from '@astryxdesign/core/Layout';
import { back } from '../route.ts';

export const Page = ({ parent, children }: { parent?: string; children: ReactNode }) => (
  <VStack gap={5} paddingBlockStart={parent ? 2 : 6} paddingBlockEnd={6}>
    {parent && <IconButton label="뒤로" variant="ghost" size="lg" icon={<Icon icon="chevronLeft" />} onClick={() => back(parent)} style={{ alignSelf: 'start', marginInlineStart: 'calc(-1 * var(--spacing-3))' }} />}
    {children}
  </VStack>
);
