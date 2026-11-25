// 카드 행동의 창들(앱에 하나). 카드가 목록에서 빠져도 되돌리기와 활동 넣기 제안이 남게 카드 밖에 둔다
import { Suspense, useState, useSyncExternalStore } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { messageOf, type Draft, type Me, type NoticeCard } from '../api.ts';
import { again, type Want } from '../lib/actions.ts';
import { kstToday } from '../lib/date.ts';
import { flag, setFlag } from '../lib/flags.ts';
import { laterRange } from '../lib/later.ts';
import { dayText } from '../lib/notice.ts';
import { readState } from '../lib/push.ts';
import { actions } from '../lib/store.ts';
import { UNDO_MS } from '../lib/values.ts';
import { part } from './Rest.tsx';

/** 홈의 가장 추천처럼 되돌리기를 알림 줄 대신 그 자리에서 보일 때 */
export type Opts = { onActed?: (undo: () => void) => void; onFailed?: () => void; onUndone?: () => void };
export type Ask = { mode: 'menu' | 'later' | 'dislike'; notice: NoticeCard; opts: Opts };

const Sheets = part('Sheets');
let ask: Ask | null = null;
const subs = new Set<() => void>();
let opened = false;
let closeToast = () => {};
let epoch = 0; // 화면이 바뀐 횟수
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

const said = (w: NonNullable<Want>) => (w.kind === 'like' ? '내 목록에 담았어요' : w.kind === 'later' ? `${dayText(w.revisitOn!)}에 다시 보여 드려요` : '관심 없음으로 옮겼어요');

export function ActionHost({ me, onPushChanged }: { me: Me | null; onPushChanged: () => Promise<void> }) {
  const toast = useToast();
  const now = useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => ask);
  const [suggest, setSuggest] = useState<{ draft: Draft; undo: () => void } | null>(null);
  const [asking, setAsking] = useState(false);
  const [pushAsk, setPushAsk] = useState<{ undo: () => void } | null>(null);
  // 관심 있어요를 처음 남기면 마감 알림을 켤지 한 번 묻는다(US3-1)
  const askPush = async (undo: () => void) => {
    const at = epoch;
    if (!me || flag('push-asked') || await readState(me.push).catch(() => null) !== 'off' || at !== epoch) return; // 그사이 화면이 바뀌었으면 다음에 묻는다
    setFlag('push-asked');
    closeToast();
    setPushAsk({ undo });
  };
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
      if (d && want?.kind === 'like') void askPush(() => { undo(); opts.onUndone?.(); }); 
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
  const close = () => { setSuggest(null); setAsking(false); setPushAsk(null); };
  shut = () => { epoch++; open(null); close(); closeToast(); };
  // 창은 처음 열 때 받는다(첫 화면을 가볍게). 한 번 열면 닫힘 움직임까지 남긴다
  if (now || suggest || pushAsk) opened = true;
  return opened && (
    <Suspense>
      <Sheets now={now} suggest={suggest} asking={asking} pushAsk={pushAsk} setAsking={setAsking} setPushAsk={setPushAsk} close={close} closeNow={() => open(null)} pick={pick} toast={toast} onPushChanged={onPushChanged} />
    </Suspense>
  );
}
