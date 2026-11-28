// 카드 행동의 창들의 화면(ActionHost가 처음 열 때 받는다)
import { useState } from 'react';
import { BottomSheet } from '@astryxdesign/core/BottomSheet';
import { Button } from '@astryxdesign/core/Button';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { DateInput } from '@astryxdesign/core/DateInput';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import type { useToast } from '@astryxdesign/core/Toast';
import type { Draft, NoticeCard } from '../api.ts';
import type { Want } from '../lib/actions.ts';
import { kstToday } from '../lib/date.ts';
import { laterRange } from '../lib/later.ts';
import { ActionBar } from './ActionBar.tsx';
import type { Ask } from './ActionHost.tsx';
import { ActivityForm } from './ActivityForm.tsx';
import { PushAsk } from './PushAsk.tsx';

const REASONS = [['time', '시간이 안 맞아요'], ['field', '관심 없는 분야예요'], ['done', '이미 해 봤어요'], ['hard', '너무 어려워요']];
function Later({ notice, onPick }: { notice: NoticeCard; onPick: (day: string) => void }) {
  const range = laterRange(notice.closesOn, kstToday());
  const [day, setDay] = useState(range?.value);
  if (!range) return <Text>오늘 닫히는 공지라 나중에 볼 날을 고를 수 없어요.</Text>;
  return (
    <VStack gap={4}>
      <DateInput label="다시 볼 날" size="lg" value={day as ISODateString} min={range.min as ISODateString} max={range.max as ISODateString} onChange={v => setDay(v)} width="100%" />
      <Button label="나중에 보기" variant="primary" size="lg" width="100%" isDisabled={!day || day < range.min || day > range.max} onClick={() => onPick(day!)} />
    </VStack>
  );
}

type Props = {
  now: Ask | null; suggest: { draft: Draft; undo: () => void } | null; asking: boolean; pushAsk: { undo: () => void } | null;
  setAsking: (v: boolean) => void; setPushAsk: (v: null) => void; close: () => void; closeNow: () => void; pick: (want: Want) => void;
  toast: ReturnType<typeof useToast>; onPushChanged: () => Promise<void>;
};

export function Sheets({ now, suggest, asking, pushAsk, setAsking, setPushAsk, close, closeNow, pick, toast, onPushChanged }: Props) {
  const title = now?.mode === 'later' ? '언제 다시 볼까요?' : now?.mode === 'dislike' ? '어떤 점이 안 맞았어요?' : '표시하기';
  return (
    <>
      <BottomSheet label={title} isOpen={!!now} onOpenChange={o => { if (!o) closeNow(); }} height="hug" padding={5}>
        {now && (
          <VStack gap={4}>
            <VStack gap={1}><Heading level={2}>{title}</Heading><Text size="sm" color="secondary" maxLines={2} hasTruncateTooltip={false} data-server-text>{now.notice.title}</Text></VStack>
            {now.mode === 'menu' && <ActionBar notice={now.notice} opts={now.opts} onPicked={closeNow} />}
            {now.mode === 'later' && <Later notice={now.notice} onPick={revisitOn => pick({ kind: 'later', revisitOn })} />}
            {now.mode === 'dislike' && (
              <VStack gap={2}>
                <Text size="sm" color="secondary">고르면 다음 추천과 나의 분석에 써요.</Text>
                {REASONS.map(([reason, label]) => <Button key={reason} label={label} size="lg" width="100%" onClick={() => pick({ kind: 'dislike', reason })} />)}
                <Button label="이유 없이" variant="ghost" size="lg" width="100%" onClick={() => pick({ kind: 'dislike' })} />
              </VStack>
            )}
          </VStack>
        )}
      </BottomSheet>
      <BottomSheet label="해 온 활동에 넣기" isOpen={!!suggest} onOpenChange={o => { if (!o) close(); }} height="hug" padding={5}>
        {suggest && (
          <VStack gap={4}>
            <VStack gap={1}><Heading level={2}>나의 분석에 활동으로 넣을까요?</Heading><Text size="sm" color="secondary">나중에 고치거나 지울 수 있어요.</Text></VStack>
            {asking
              ? <ActivityForm draft={suggest.draft} path="/me/activities/new" unsaved onSaved={() => { close(); toast({ body: '해 온 활동에 넣었어요' }); }} />
              : <HStack gap={2} wrap="wrap"><Button label="넣기" variant="primary" size="lg" onClick={() => setAsking(true)} /><Button label="안 넣을래요" variant="ghost" size="lg" onClick={close} /><Button label="되돌리기" variant="ghost" size="lg" onClick={() => { close(); suggest.undo(); }} /></HStack>}
          </VStack>
        )}
      </BottomSheet>
      <BottomSheet label="마감 알림" isOpen={!!pushAsk} onOpenChange={o => { if (!o) setPushAsk(null); }} height="hug" padding={5}>
        {pushAsk && (
          <VStack gap={4}>
            <VStack gap={1}><Text size="sm" color="secondary">내 목록에 담았어요</Text><Heading level={2}>마감 전에 알려 드릴까요?</Heading></VStack>
            <PushAsk onDone={async on => {
              setPushAsk(null);
              toast({ body: on ? '알림을 켰어요' : '알림을 켜려면 브라우저 설정에서 허용해 주세요', uniqueID: 'note' });
              await onPushChanged();
            }} />
            <HStack gap={2}>
              <Button label="나중에" size="lg" onClick={() => setPushAsk(null)} />
              <Button label="되돌리기" variant="ghost" size="lg" onClick={() => { setPushAsk(null); pushAsk.undo(); }} />
            </HStack>
          </VStack>
        )}
      </BottomSheet>
    </>
  );
}
