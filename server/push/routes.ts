// 기기 구독(3단계 contracts/api.md, R6): 구독은 그 기기의 로그인(세션)에 붙는다. 보내는 일은 jobs가 한다(send.ts)
import type { Ctx } from '../app.ts';
import { requireStudent } from '../auth/login.ts';
import { COOKIE, digest } from '../auth/sessions.ts';
import type { Sql } from '../db/sql.ts';
import { HttpError, type Req, type Route } from '../http.ts';
import { LIMITS } from '../limits.ts';
import { requireConsent } from '../me/onboarding.ts';
import { pushEndpoint, pushKeys } from './endpoint.ts';

/** 보내는 쪽(send.ts)이 받는 조건과 같다: 공개 키와 https 서비스 주소 */
export const pushReady = (ctx: Ctx) => !!ctx.push?.publicKey && !!ctx.push.publicUrl?.startsWith('https://');
/** 이 기기(세션)에 구독이 있는가 */
export const pushOn = async (sql: Sql, req: Req) => (await sql`select 1 from push_subscriptions where token_hash = ${digest(req.cookies[COOKIE])}`).length > 0;

export function pushRoutes(ctx: Ctx): Route[] {
  const sql = ctx.sql;
  const ready = () => { if (!pushReady(ctx)) throw new HttpError(404, 'not_found', '알림은 아직 준비 중이에요'); };
  return [
    ['GET', '/api/me/push/key', async req => {
      const s = await requireStudent(ctx, req);
      ready();
      return { body: { key: ctx.push!.publicKey }, headers: s.headers };
    }],
    ['PUT', '/api/me/push', async req => {
      const s = await requireStudent(ctx, req);
      await requireConsent(ctx, s.id);
      ready();
      const b = req.body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
      const endpoint = pushEndpoint(b.endpoint);
      if (!endpoint) throw new HttpError(422, 'invalid', '이 브라우저의 알림 주소는 쓸 수 없어요', { field: 'endpoint' });
      if (!pushKeys(b.keys?.p256dh, b.keys?.auth)) throw new HttpError(422, 'invalid', '알림 키가 틀려요', { field: 'keys' });
      const token = digest(req.cookies[COOKIE]);
      await sql.begin(async tx => {
        // 같은 기기를 마지막에 켠 학생의 것이다. 이 세션의 앞 구독과 이 주소의 앞 구독을 지우고 넣는다
        await tx`delete from push_subscriptions where endpoint = ${endpoint} or token_hash = ${token}`;
        await tx`insert into push_subscriptions (student_id, token_hash, endpoint, p256dh, auth) values (${s.id}, ${token}, ${endpoint}, ${b.keys!.p256dh as string}, ${b.keys!.auth as string})
          on conflict (endpoint) do update set student_id = excluded.student_id, token_hash = excluded.token_hash, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now()`;
        await tx`delete from push_subscriptions where id in (select id from push_subscriptions where student_id = ${s.id} order by created_at desc, id desc offset ${LIMITS.pushDevices})`;
      });
      return { status: 204, headers: s.headers };
    }],
    ['DELETE', '/api/me/push', async req => {
      const s = await requireStudent(ctx, req);
      await sql`delete from push_subscriptions where token_hash = ${digest(req.cookies[COOKIE])}`;
      return { status: 204, headers: s.headers };
    }]
  ];
}
