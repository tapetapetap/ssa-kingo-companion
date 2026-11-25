// 카드 행동 세 개(FR-015): 관심 있어요는 한 번에, 나중에 보기는 날짜, 관심 없음은 이유. 누른 것을 다시 누르면 지운다.
// 닫히거나 내려간 공지는 지우기만 된다
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import type { NoticeCard } from '../api.ts';
import { kstToday } from '../lib/date.ts';
import { laterRange } from '../lib/later.ts';
import { actions, useActions } from '../lib/store.ts';
import { act, openSheet, type Opts } from './ActionHost.tsx';
import { ListIcon } from './icons.tsx';

const KINDS = [['like', '관심 있어요'], ['later', '나중에 보기'], ['dislike', '관심 없음']] as const;

export function ActionBar({ notice, opts, onPicked }: { notice: NoticeCard; opts?: Opts; onPicked?: () => void }) {
  useActions();
  const now = actions.of(notice);
  const noLater = !laterRange(notice.closesOn, kstToday());
  if (!notice.open) return now && <Button label="표시 지우기" size="lg" onClick={() => { onPicked?.(); act(notice, null, opts); }} />;
  const press = (kind: typeof KINDS[number][0]) => {
    if (now?.kind === kind || kind === 'like') {
      onPicked?.();
      act(notice, now?.kind === kind ? null : { kind: 'like' }, opts);
    } else openSheet(kind, notice, opts);
  };
  return (
    <VStack gap={2}>
      <HStack gap={2} wrap="wrap">
        {KINDS.map(([kind, label]) => (
          <Button key={kind} label={label} size="lg" variant={kind === 'dislike' && now?.kind !== 'dislike' ? 'ghost' : 'secondary'} aria-pressed={now?.kind === kind}
            icon={now?.kind === kind ? <Icon icon="check" color="accent" /> : undefined} onClick={() => press(kind)} isDisabled={kind === 'later' && noLater && now?.kind !== 'later'} />
        ))}
      </HStack>
      {noLater && now?.kind !== 'later' && <Text size="sm" color="secondary">오늘 닫히는 공지라 나중에 보기는 쓸 수 없어요.</Text>}
    </VStack>
  );
}

/** 목록 줄과 선반 카드의 작은 행동: 관심 있어요 한 번, 나머지는 창에서 */
export function MiniActions({ notice }: { notice: NoticeCard }) {
  useActions();
  const now = actions.of(notice);
  const liked = now?.kind === 'like';
  return (
    <HStack gap={0}>
      {notice.open && <ToggleButton label="관심 있어요" size="lg" isIconOnly icon={<Icon icon={ListIcon} />} pressedIcon={<Icon icon={ListIcon} color="accent" style={{ fill: 'currentColor' }} />} isPressed={liked} onPressedChange={() => act(notice, liked ? null : { kind: 'like' })} />}
      {(notice.open || now) && <IconButton label="다른 표시" variant="ghost" size="lg" icon={<Icon icon="moreHorizontal" />} onClick={() => openSheet('menu', notice)} />}
    </HStack>
  );
}
