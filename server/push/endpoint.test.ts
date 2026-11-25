import { describe, expect, it } from 'vitest';
import { pushEndpoint, pushKeys } from './endpoint.ts';

describe('푸시 서버 주소 (R5)', () => {
  it.each(['https://fcm.googleapis.com/fcm/send/abc', 'https://web.push.apple.com/QK', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-par02p.notify.windows.com/w/?token=x', 'https://fcm.googleapis.com:443/wp/a'])('받는다: %s', u => {
    expect(pushEndpoint(u)).toBe(new URL(u).href);
  });
  it.each([
    'http://fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.com/x', 'https://evil.com/fcm.googleapis.com', 'https://evilpush.apple.com/x', 'https://push.apple.com/x', 'https://fcm.googleapis.com:8443/x',
    'https://user@fcm.googleapis.com/x', 'https://fcm.googleapis.com@evil.com/x', 'https://127.0.0.1/x', 'https://[::1]/x', 'https://db:5432/', 'http://ollama:11434/api/tags', 'https://xfcm.googleapis.com/x', 'https://fcm.googleapis.com./x',
    'https://web.push.apple.com.evil.com/x', 'file:///etc/passwd', 'fcm.googleapis.com', '', `https://fcm.googleapis.com/${'a'.repeat(1000)}`, 'https://fcm.googleapis.com%2eevil.com/x'
  ])('거절: %s', u => { expect(pushEndpoint(u)).toBeNull(); });
  it('글이 아니면 거절', () => { for (const v of [null, 1, {}, ['https://fcm.googleapis.com/x']]) expect(pushEndpoint(v)).toBeNull(); });
  it('키 길이와 꼴', () => {
    const p = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url');
    const a = Buffer.alloc(16, 2).toString('base64url');
    expect(pushKeys(p, a)).toBe(true);
    expect(pushKeys(Buffer.alloc(65, 1).toString('base64url'), a)).toBe(false);
    expect(pushKeys(p.slice(0, -4), a)).toBe(false);
    expect(pushKeys(p, Buffer.alloc(15).toString('base64url'))).toBe(false);
    expect(pushKeys(`${p.slice(0, -1)}*`, a)).toBe(false);
    expect(pushKeys(undefined, a)).toBe(false);
  });
});
