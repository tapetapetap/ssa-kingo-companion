// 둘째 덩어리(rest.ts)의 부품을 부르는 자리. 받은 뒤에는 바로 그리고(불러오는 중이 깜빡이지 않게), 옛 덩어리가 없거나 끊겼으면 새로 고침을 알린다.
// 브라우저는 실패한 모듈을 다시 받지 않으므로 되살리는 길은 새로 고침뿐이다
import { Component, createElement, useEffect, useSyncExternalStore, type ComponentProps, type ComponentType, type ReactNode } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { Empty, Loading } from './States.tsx';

type Parts = typeof import('../rest.ts');
type Props<K extends keyof Parts> = ComponentProps<Parts[K]>;
let state: Parts | 'idle' | 'loading' | 'failed' = 'idle';
let parts: Promise<Parts> | null = null;
const subs = new Set<() => void>();
export const restReady = () => typeof state === 'object';
const set = (s: typeof state) => { state = s; subs.forEach(f => f()); };
export function loadRest(): Promise<Parts> {
  if (parts) return parts;
  set('loading');
  // 고르기 칸이 휴대폰에서 여는 창은 astryx가 따로 받는다. 함께 받아 둔다
  parts = Promise.all([import('../rest.ts'), import('@astryxdesign/core/BottomSheet')]).then(([m]) => { set(m); return m; }, (e: unknown) => { set('failed'); throw e; });
  return parts;
}

/** 창을 열기 전에 덩어리를 받는다. 못 받으면 알리고 false */
export function useNeedRest() {
  const toast = useToast();
  return () => loadRest().then(() => true, () => { toast({ body: '새로 고쳐 주세요', type: 'error', uniqueID: 'note', isAutoHide: true, endContent: <Button label="새로 고침" variant="ghost" size="lg" onClick={() => location.reload()} /> }); return false; });
}

export const Old = () => <Empty title="새로 고쳐 주세요" description="연결이 끊겼거나 새 앱이 올라왔어요." action={<Button label="새로 고침" size="lg" onClick={() => location.reload()} />} />;

/** waiting·failed는 덩어리가 오기 전과 못 받았을 때 그 자리에 둘 것. ask가 거짓이면 먼저 청하지 않고 미리 받기를 기다린다 */
export function part<K extends keyof Parts>(name: K, { waiting = <Loading />, failed = <Old />, ask = true }: { waiting?: ReactNode; failed?: ReactNode; ask?: boolean } = {}) {
  return function Part(props: Props<K>) {
    const now = useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => state);
    useEffect(() => { if (ask) loadRest().catch(() => {}); }, []);
    if (now === 'failed') return failed;
    if (now === 'idle' || now === 'loading') return waiting;
    return createElement(now[name] as ComponentType<object>, props as object);
  };
}

/** 부품 안에서 따로 받는 것이 실패해도 흰 화면이 되지 않게 */
export class Guard extends Component<{ children: ReactNode }, { broken: boolean }> {
  override state = { broken: false };
  static getDerivedStateFromError() { return { broken: true }; }
  override render() { return this.state.broken ? <Old /> : this.props.children; }
}
