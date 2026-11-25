import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../test/db.ts';
import { createDevStudent, PASSWORD, seedTaxonomy, studentApp } from '../test/student.ts';
import { readConsent } from './onboarding.ts';

let db: Awaited<ReturnType<typeof testDb>>;
let app: Awaited<ReturnType<typeof studentApp>>;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.sql`truncate students, taxonomies cascade`;
  await seedTaxonomy(db.sql);
  app = await studentApp(db.sql);
  await createDevStudent(db.sql, 'dev1@example.com');
  await app.request('POST', '/api/login', { method: 'dev', email: 'dev1@example.com', password: PASSWORD });
});
afterEach(async () => { await app.close(); });
const next = async () => ((await app.request('GET', '/api/me')).body as { next: string }).next;
const consent = () => app.request('POST', '/api/consent', { version: 'dev-1' });

describe('동의·처음 질문·분야 (US2, FR-015~018)', () => {
  it('동의 → 처음 질문 → 분야 3개를 마치면 다음 할 일이 홈이다', async () => {
    expect(await next()).toBe('consent');
    expect((await app.request('GET', '/api/consent')).body).toEqual({ version: 'dev-1', text: '시험 문구' });
    expect((await consent()).status).toBe(204);
    expect(await next()).toBe('answers');
    expect(await app.request('PUT', '/api/me/answers', { grade: 3, term: 1, goal: 'job' })).toMatchObject({ status: 200, body: { grade: 3, term: 1, goal: 'job' } });
    expect(await next()).toBe('fields');
    expect((await app.request('PUT', '/api/me/fields', { ids: ['backend', 'qa'] })).body).toMatchObject({ error: { code: 'too_few_fields' } });
    expect((await app.request('PUT', '/api/me/fields', { ids: ['qa', 'backend', 'csr-ai'] })).body).toEqual({ ids: ['csr-ai', 'backend', 'qa'] }); // 목록 순서
    expect(await next()).toBe('home');
  });

  it('동의 전에는 학생 자료를 받지 않는다. 지금 판이 아닌 동의는 invalid이고, 문구 판이 바뀌면 다시 동의다', async () => {
    expect((await app.request('PUT', '/api/me/answers', { grade: 3, term: 1, goal: 'job' })).body).toMatchObject({ error: { code: 'consent_required' } });
    expect((await app.request('PUT', '/api/me/fields', { ids: ['a', 'b', 'c'] })).body).toMatchObject({ error: { code: 'consent_required' } });
    expect((await app.request('POST', '/api/consent', { version: 'dev-0' })).body).toMatchObject({ error: { code: 'invalid', field: 'version' } });
    await consent();
    expect(await next()).toBe('answers');
    await app.close();
    app = await studentApp(db.sql, { consent: { version: 'dev-2', text: '바뀐 문구' } });
    await app.request('POST', '/api/login', { method: 'dev', email: 'dev1@example.com', password: PASSWORD });
    expect(await next()).toBe('consent');
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['학년', { grade: 5, term: 1, goal: 'job' }, 'grade'],
    ['학년 소수', { grade: 2.5, term: 1, goal: 'job' }, 'grade'],
    ['학기', { grade: 3, term: 3, goal: 'job' }, 'term'],
    ['진로 목표', { grade: 3, term: 1, goal: 'rich' }, 'goal']
  ])('처음 질문 거절: %s', async (_name, body, field) => {
    await consent();
    expect((await app.request('PUT', '/api/me/answers', body)).body).toMatchObject({ error: { code: 'invalid', field } });
  });

  it('분야 거절: 목록에 없음·겹침·배열 아님. 분야 목록은 묶음·분야를 목록 순서대로 준다', async () => {
    await consent();
    for (const ids of [['backend', 'qa', 'nope'], ['backend', 'qa', 'qa'], 'backend']) {
      expect((await app.request('PUT', '/api/me/fields', { ids })).body).toMatchObject({ error: { code: 'invalid', field: 'ids' } });
    }
    const f = (await app.request('GET', '/api/fields')).body as { taxonomy: { id: string }; groups: { id: string }[]; fields: { id: string; group: string; desc: string }[] };
    expect(f.taxonomy.id).toBe('custom');
    expect(f.groups[0]).toEqual({ id: 'g-a0', name: '묶음 0', parent: null });
    expect(f.fields).toHaveLength(80);
    expect(f.fields[0]).toMatchObject({ id: 'csr-ai', group: 'g-a0' });
  });

  it('목록이 바뀌어 고른 분야가 3개보다 적어지면 다음 할 일이 다시 분야 고르기다(FR-008)', async () => {
    await consent();
    await app.request('PUT', '/api/me/answers', { grade: 1, term: 2, goal: 'unsure' });
    await app.request('PUT', '/api/me/fields', { ids: ['backend', 'qa', 'frontend'] });
    expect(await next()).toBe('home');
    await db.sql`delete from fields where id = 'qa'`;
    expect(await next()).toBe('fields');
    expect((await app.request('GET', '/api/me/fields')).body).toEqual({ ids: ['backend', 'frontend'] });
  });

  it('문구 파일: 첫 줄의 판과 나머지 글. 꼴이 틀리면 던진다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'consent-'));
    writeFileSync(join(dir, 'a.md'), 'version: dev-1\n\n동의 문구예요.\n');
    expect(readConsent(join(dir, 'a.md'))).toEqual({ version: 'dev-1', text: '동의 문구예요.' });
    writeFileSync(join(dir, 'b.md'), '동의 문구');
    expect(() => readConsent(join(dir, 'b.md'))).toThrow("첫 줄이 'version: <판>'");
    expect(readConsent(new URL('../../deploy/consent.dev.md', import.meta.url).pathname).version).toBe('dev-2');
  });
});
