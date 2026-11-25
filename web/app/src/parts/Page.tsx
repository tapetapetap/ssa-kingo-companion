// 하위 화면의 머리: 뒤로 가기
import type { ReactNode } from 'react';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Icon } from '@astryxdesign/core/Icon';
import { VStack } from '@astryxdesign/core/Layout';
import { back } from '../route.ts';

/** 아래 메뉴 막대의 높이(안전 영역 포함) */
export const MENU_HEIGHT = 'calc(3rem + 1px + env(safe-area-inset-bottom))';

export const BackButton = ({ parent }: { parent: string }) => (
  <IconButton label="뒤로" variant="ghost" size="lg" icon={<Icon icon="chevronLeft" />} onClick={() => back(parent)} style={{ alignSelf: 'start', marginInlineStart: 'calc(-1 * var(--spacing-3))' }} />
);

export const Page = ({ parent, children }: { parent?: string; children: ReactNode }) => (
  <VStack gap={5} paddingBlockStart={parent ? 2 : 6} paddingBlockEnd={6}>
    {parent && <BackButton parent={parent} />}
    {children}
  </VStack>
);
