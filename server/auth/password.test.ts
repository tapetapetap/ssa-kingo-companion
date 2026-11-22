import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.ts';

describe('비밀번호 (research R5)', () => {
  it('같은 비밀번호도 저장 글이 다르고, 맞으면 참·틀리면 거짓이다', async () => {
    const [a, b] = [await hashPassword('correct horse'), await hashPassword('correct horse')];
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$32768$8$1$')).toBe(true);
    expect(await verifyPassword('correct horse', a)).toBe(true);
    expect(await verifyPassword('correct hors', a)).toBe(false);
  });

  it('꼴이 틀린 저장 글은 거짓이고, 8자 미만은 거절한다', async () => {
    expect(await verifyPassword('x', 'plain')).toBe(false);
    await expect(hashPassword('short')).rejects.toThrow('8자 이상');
  });
});
