// 받는 푸시 서버(3단계 research R5): 구독 주소는 학생이 보내는 값이고 보내는 쪽(jobs)은 안쪽 서버에도 닿는다. 정한 네 곳만 받는다(SSRF)
import { LIMITS } from '../limits.ts';

const SUFFIX = ['.push.apple.com', '.push.services.mozilla.com', '.notify.windows.com'];

/** 정한 푸시 서버의 주소면 다듬은 주소, 아니면 null */
export function pushEndpoint(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > LIMITS.endpointChars) return null;
  const u = URL.parse(v);
  if (!u || u.protocol !== 'https:' || u.port || u.username || u.password) return null;
  return u.hostname === 'fcm.googleapis.com' || SUFFIX.some(s => u.hostname.endsWith(s)) ? u.href : null;
}

const bytes = (v: unknown, n: number) => typeof v === 'string' && /^[A-Za-z0-9_-]+={0,2}$/.test(v) && Buffer.from(v, 'base64url').length === n;
/** 브라우저가 준 공개 키(65바이트, 0x04로 시작)와 비밀(16바이트)인가 */
export const pushKeys = (p256dh: unknown, auth: unknown) => bytes(p256dh, 65) && Buffer.from(p256dh as string, 'base64url')[0] === 4 && bytes(auth, 16);
