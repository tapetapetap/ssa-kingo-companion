// 서버 설정(research R20): 환경 변수에서 읽는다. 필수 값이 없거나 틀리면 이유를 담아 던진다(서버와 명령이 시작하지 않는다)
import { DEFAULT_MODEL } from '../etl/notices/llm.ts';

export type Mode = 'dev' | 'prod';
export type Config = {
  mode: Mode; databaseUrl: string; port: number; ollamaHost: string; model: string;
  consentFile: string; operatorsFile: string | null; backupDir: string | null; apiUrl: string;
  /** 알림의 공개 키와 서비스 주소. 개인 키는 jobs만 읽고(push/send.ts) api는 모른다 */
  pushPublicKey: string | null; publicUrl: string | null;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const mode = env.KINGO_MODE;
  if (mode !== 'dev' && mode !== 'prod') throw new Error(`KINGO_MODE는 dev나 prod여야 해요(지금: ${mode ?? '없음'})`);
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL이 없어요');
  const consentFile = env.KINGO_CONSENT_FILE || (mode === 'dev' ? 'deploy/consent.dev.md' : '');
  if (!consentFile) throw new Error('운영 모드에는 KINGO_CONSENT_FILE(동의 문구 파일)이 있어야 해요');
  const port = Number(env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`PORT가 포트 번호가 아니에요: ${env.PORT}`);
  return {
    mode, databaseUrl: env.DATABASE_URL, port, ollamaHost: env.OLLAMA_HOST || '127.0.0.1:11434', model: env.KINGO_LLM_MODEL || DEFAULT_MODEL,
    consentFile, operatorsFile: env.KINGO_OPERATORS_FILE || null, backupDir: env.KINGO_BACKUP_DIR || null, apiUrl: env.KINGO_API_URL || 'http://127.0.0.1:8080',
    pushPublicKey: env.KINGO_PUSH_PUBLIC_KEY || null, publicUrl: env.KINGO_PUBLIC_URL || null
  };
}
