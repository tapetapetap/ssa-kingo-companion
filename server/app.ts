// 서버의 경로를 모으고 시작 검사를 한다. main.ts와 시험이 함께 쓴다
import { devLogin, authRoutes, type LoginMethod } from './auth/login.ts';
import type { Mode } from './config.ts';
import type { Sql } from './db/sql.ts';
import { health, type Route } from './http.ts';
import { nextStep, onboardingRoutes, type Consent } from './me/onboarding.ts';
import { noticeRoutes } from './notices/routes.ts';

export type Ctx = { sql: Sql; mode: Mode; consent: Consent; methods: Record<string, LoginMethod> };

export const defaultMethods = (): Record<string, LoginMethod> => ({ dev: devLogin });

/** 운영 모드는 쓸 수 있는 로그인 방식이 있어야 하고(FR-012), 개발용 동의 문구로는 시작하지 않는다(research R23) */
export function checkStartup(ctx: Ctx) {
  if (ctx.mode !== 'prod') return;
  if (!Object.keys(ctx.methods).some(k => k !== 'dev')) throw new Error('운영 모드에 쓸 수 있는 로그인 방식이 없어 시작하지 않아요(개발 로그인은 운영에서 꺼져요)');
  if (ctx.consent.version.startsWith('dev-')) throw new Error(`운영 모드는 개발용 동의 문구(${ctx.consent.version})로 시작하지 않아요`);
}

export function routes(ctx: Ctx): Route[] {
  return [health, ...authRoutes(ctx, id => nextStep(ctx, id)), ...onboardingRoutes(ctx), ...noticeRoutes(ctx)];
}
