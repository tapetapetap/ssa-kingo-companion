// 비밀번호(research R5): scrypt(N=2^15, r=8, p=1, 솔트 16바이트)로 바꿔 저장하고 timingSafeEqual로 견준다
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

const [N, R, P, LEN] = [2 ** 15, 8, 1, 32];
const STORED = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/;

const scrypt = (pw: string, salt: Buffer, n: number, r: number, p: number) =>
  new Promise<Buffer>((ok, no) => {
    scryptCb(pw, salt, LEN, { N: n, r, p, maxmem: 256 * n * r }, (e, k) => (e ? no(e) : ok(k)));
  });

export const MIN_PASSWORD = 8;

export async function hashPassword(pw: string): Promise<string> {
  if (pw.length < MIN_PASSWORD) throw new Error(`비밀번호는 ${MIN_PASSWORD}자 이상이어야 해요`);
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

/** 꼴이 틀린 저장 글은 거짓이다 */
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const m = STORED.exec(stored);
  if (!m) return false;
  const want = Buffer.from(m[5], 'base64');
  const got = await scrypt(pw, Buffer.from(m[4], 'base64'), Number(m[1]), Number(m[2]), Number(m[3]));
  return want.length === got.length && timingSafeEqual(want, got);
}
