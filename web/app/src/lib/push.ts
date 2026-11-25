// 이 기기의 알림(FR-036, contracts/app.md 9): 상태와 켜기·끄기
import { api, ApiError, type Me } from '../api.ts';

export type PushState = 'unsupported' | 'install' | 'soon' | 'denied' | 'off' | 'on';
type Env = { ios: boolean; standalone: boolean; supported: boolean; permission: string; subscribed: boolean };

/** 아이폰은 홈 화면에 추가한 앱에서만 된다. 브라우저에 구독이 남아 있어도 서버(로그인)에 없으면 꺼짐이다(조용히 다시 켜지 않는다) */
export function pushState(push: Me['push'], e: Env): PushState {
  if (e.ios && !e.standalone) return 'install';
  if (!e.supported) return 'unsupported';
  if (!push.ready) return 'soon';
  if (e.permission === 'denied') return 'denied';
  return push.on && e.subscribed && e.permission === 'granted' ? 'on' : 'off';
}

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const worker = () => navigator.serviceWorker.getRegistration();
async function current(): Promise<PushSubscription | null> {
  if (!supported()) return null;
  try {
    return (await (await worker())?.pushManager.getSubscription()) ?? null;
  } catch {
    return null; // 저장소를 막은 브라우저
  }
}
const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
/** 지금 공개 키로 만든 구독인가. 키가 바뀌었으면 보내도 오지 않아 꺼짐으로 보고 다시 켜게 한다 */
async function fresh(push: Me['push']): Promise<boolean> {
  const sub = await current();
  if (!sub || !push.ready) return false;
  const { key } = await api<{ key: string }>('GET', '/api/me/push/key');
  return !sub.options.applicationServerKey || b64(sub.options.applicationServerKey) === key.replace(/=+$/, '');
}

export async function readState(push: Me['push']): Promise<PushState> {
  return pushState(push, { ios: isIos(), standalone: isStandalone(), supported: supported(), permission: supported() ? Notification.permission : 'default', subscribed: push.on && await fresh(push) });
}

/** 켠다. 학생이 허용하지 않으면 false */
export async function turnOn(): Promise<boolean> {
  if (await Notification.requestPermission() !== 'granted') return false;
  const { key } = await api<{ key: string }>('GET', '/api/me/push/key');
  const reg = await worker();
  if (!reg) throw new ApiError('no_worker', '새로 고친 뒤 다시 해 주세요');
  await (await reg.pushManager.getSubscription())?.unsubscribe(); // 키가 바뀌었으면 앞 구독으로는 새로 만들지 못한다
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  try {
    const { endpoint, keys } = sub.toJSON();
    await api('PUT', '/api/me/push', { endpoint, keys });
  } catch (e) {
    await sub.unsubscribe().catch(() => {}); // 저장하지 못한 구독은 거둔다
    throw e;
  }
  return true;
}

export async function turnOff() {
  await api('DELETE', '/api/me/push');
  await drop();
}
/** 이 브라우저의 구독을 거둔다(로그아웃·계정 지우기 뒤에도) */
export async function drop() {
  try {
    await (await current())?.unsubscribe();
  } catch { /* 서버에는 이미 없어 오지 않는다 */ }
}
