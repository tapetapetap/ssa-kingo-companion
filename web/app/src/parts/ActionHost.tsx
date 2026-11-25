// 카드 행동의 창들(앱에 하나). 카드가 목록에서 빠져도 되돌리기와 활동 넣기 제안이 남게 카드 밖에 둔다
import { useState, useSyncExternalStore } from 'react';
import { BottomSheet } from '@astryxdesign/core/BottomSheet';
import { Button } from '@astryxdesign/core/Button';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { DateInput } from '@astryxdesign/core/DateInput';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { useToast } from '@astryxdesign/core/Toast';
import { messageOf, type Draft, type NoticeCard } from '../api.ts';
import { again, type Want } from '../lib/actions.ts';
import { kstToday } from '../lib/date.ts';
import { laterRange } from '../lib/later.ts';
import { dayText } from '../lib/notice.ts';
import { actions } from '../lib/store.ts';
import { UNDO_MS } from '../lib/values.ts';
import { ActionBar } from './ActionBar.tsx';
import { ActivityForm } from './ActivityForm.tsx';

/** 홈의 가장 추천처럼 되돌리기를 알림 줄 대신 그 자리에서 보일 때 */
export type Opts = { onActed?: (undo: () => void) => void; onFailed?: () => void; onUndone?: () => void };
type Ask = { mode: 'menu' | 'later' | 'dislike'; notice: NoticeCard; opts: Opts };

let ask: Ask | null = null;
const subs = new Set<() => void>();
let closeToast = () => {};
function open(a: Ask | null) {
  if (a) closeToast(); // 앞 알림이 창의 단추를 덮지 않게
  ask = a;
  subs.forEach(f => f());
}
export const openSheet = (mode: 'menu' | 'later' | 'dislike', notice: NoticeCard, opts: Opts = {}) => open({ mode, notice, opts });
/** 화면이 바뀌거나 로그인이 끊기면 열린 창과 되돌리기를 닫는다 */
let shut = () => {};
export const closeSheets = () => shut();
let perform: (notice: NoticeCard, want: Want, opts: Opts) => void = () => {};
export const act = (notice: NoticeCard, want: Want, opts: Opts = {}) => perform(notice, want, opts);

const REASONS = [['time', '시간이 안 맞아요'], ['field', '관심 없는 분야예요'], ['done', '이미 해 봤어요'], ['hard', '너무 어려워요']];
const said = (w: NonNullable<Want>) => (w.kind === 'like' ? '내 목록에 담았어요' : w.kind === 'later' ? `${dayText(w.revisitOn!)}에 다시 보여 드려요` : '관심 없음으로 옮겼어요');

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

export function ActionHost() {
  const toast = useToast();
  const now = useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => ask);
  const [suggest, setSuggest] = useState<{ draft: Draft; undo: () => void } | null>(null);
  const [asking, setAsking] = useState(false);
  perform = (notice, want, opts) => {
    const before = actions.of(notice);
    const fail = (e: unknown) => {
      closeToast();
      closeToast = toast({ body: messageOf(e), type: 'error', isAutoHide: true, autoHideDuration: UNDO_MS });
    };
    const undo = () => { actions.set(notice, again(before, laterRange(notice.closesOn, kstToday()))).catch(fail); };
    closeToast();
    closeToast = () => {};
    if (opts.onActed) opts.onActed(undo);
    else if (want) closeToast = toast({ body: said(want), uniqueID: 'action', autoHideDuration: UNDO_MS, endContent: <Button label="되돌리기" variant="ghost" size="lg" onClick={() => { closeToast(); undo(); }} /> });
    actions.set(notice, want).then(d => { 
      if (!d?.suggestActivity) return;
      closeToast(); // 되돌리기는 제안 창에 있다
      setSuggest({ draft: d.suggestActivity, undo: () => { undo(); opts.onUndone?.(); } });
    }, e => {
      opts.onFailed?.();
      fail(e);
    });
  };
  const pick = (want: Want) => {
    if (!now) return;
    open(null);
    act(now.notice, want, now.opts);
  };
  const close = () => { setSuggest(null); setAsking(false); };
  shut = () => { open(null); close(); closeToast(); };
  const title = now?.mode === 'later' ? '언제 다시 볼까요?' : now?.mode === 'dislike' ? '어떤 점이 안 맞았어요?' : '표시하기';
  return (
    <>
      <BottomSheet label={title} isOpen={!!now} onOpenChange={o => { if (!o) open(null); }} height="hug" padding={5}>
        {now && (
          <VStack gap={4}>
            <VStack gap={1}><Heading level={2}>{title}</Heading><Text size="sm" color="secondary" maxLines={2} hasTruncateTooltip={false} data-server-text>{now.notice.title}</Text></VStack>
            {now.mode === 'menu' && <ActionBar notice={now.notice} opts={now.opts} onPicked={() => open(null)} />}
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
    </>
  );
}
