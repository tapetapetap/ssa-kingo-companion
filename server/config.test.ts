import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

const base = { KINGO_MODE: 'dev', DATABASE_URL: 'postgres://a@b/c' };

describe('loadConfig (research R20)', () => {
  it('기본값을 채운다', () => {
    expect(loadConfig(base)).toEqual({
      mode: 'dev', databaseUrl: 'postgres://a@b/c', port: 8080, ollamaHost: '127.0.0.1:11434', model: 'gemma4:12b',
      consentFile: 'deploy/consent.dev.md', operatorsFile: null, backupDir: null, apiUrl: 'http://127.0.0.1:8080'
    });
  });

  it.each<[string, Record<string, string>, string]>([
    ['모드 없음', { DATABASE_URL: 'x' }, 'KINGO_MODE는 dev나 prod여야 해요(지금: 없음)'],
    ['모드 틀림', { ...base, KINGO_MODE: 'test' }, '지금: test'],
    ['DB 주소 없음', { KINGO_MODE: 'dev' }, 'DATABASE_URL이 없어요'],
    ['운영인데 동의 문구 없음', { ...base, KINGO_MODE: 'prod' }, 'KINGO_CONSENT_FILE'],
    ['포트 틀림', { ...base, PORT: '99999' }, 'PORT가 포트 번호가 아니에요']
  ])('던진다: %s', (_name, env, message) => {
    expect(() => loadConfig(env)).toThrow(message);
  });

  it('운영 모드는 준 동의 문구 파일을 쓴다', () => {
    expect(loadConfig({ ...base, KINGO_MODE: 'prod', KINGO_CONSENT_FILE: '/etc/kingo/consent.md' })).toMatchObject({ mode: 'prod', consentFile: '/etc/kingo/consent.md' });
  });
});
