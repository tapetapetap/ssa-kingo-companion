// 알림 보내기(3단계 research R7): jobs가 09:00에 부른다. api는 이 파일을 가져오지 않는다(바깥에 닿지 않는다, FR-037).
// web-push를 부르는 곳은 여기 하나다. 출력과 기록에 제목·주소를 남기지 않는다
import { createHash } from 'node:crypto';
import { generateVAPIDKeys, sendNotification } from 'web-push';
import type { Sql } from '../db/sql.ts';
import { LIMITS } from '../limits.ts';
import { pushEndpoint } from './endpoint.ts';
import { message, type Item } from './message.ts';
import { targets } from './targets.ts';

export { generateVAPIDKeys };
export type Keys = { publicKey: string; privateKey: string; subject: string };
type Sub = { id: string; student_id: string; endpoint: string; p256dh: string; auth: string };
export type SendFn = (sub: Sub, payload: string, ttl: number, keys: Keys) => Promise<void>;
export type NotifyDeps = { sql: Sql; consentVersion: string; keys: Keys | null; now?: () => Date; wait?: (ms: number) => Promise<void>; send?: SendFn; timeoutMs?: number };
/** 통(학생·기기·날)으로 센 수 */
export type NotifyResult = { sent: number; failed: number; gone: number; skipped: number };

const realSend: SendFn = async (s, payload, ttl, keys) => {
  await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload,
    { vapidDetails: { subject: keys.subject, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: ttl, urgency: 'normal', timeout: LIMITS.pushTimeoutMs });
};

/** 설정에서 키를 읽는다. 하나라도 없거나 서비스 주소가 https가 아니면 null */
export function pushKeysOf(env: Record<string, string | undefined>): Keys | null {
  const [publicKey, privateKey, subject] = [env.KINGO_PUSH_PUBLIC_KEY, env.KINGO_PUSH_PRIVATE_KEY, env.KINGO_PUBLIC_URL];
  return publicKey && privateKey && subject?.startsWith('https://') ? { publicKey, privateKey, subject } : null;
}

/** 라이브러리의 제한 시간은 조용한 동안만 센다. 답이 끝나지 않아도 이 시간이면 실패로 본다 */
async function within(p: Promise<void>, ms: number): Promise<void> {
  let t: NodeJS.Timeout | undefined;
  try {
    await Promise.race([p, new Promise<never>((_, no) => { t = setTimeout(() => no(new Error('시간 초과')), ms); })]);
  } finally {
    clearTimeout(t);
  }
}

const kst = (d: Date) => new Date(d.getTime() + 9 * 3600_000);
const hash = (endpoint: string) => createHash('sha256').update(endpoint).digest();

export async function notify(d: NotifyDeps): Promise<NotifyResult> {
  const { sql } = d;
  if (!d.keys) throw new Error('알림 키가 없어요(KINGO_PUSH_PUBLIC_KEY·KINGO_PUSH_PRIVATE_KEY, https로 시작하는 KINGO_PUBLIC_URL)');
  const keys = d.keys;
  const now = d.now ?? (() => new Date());
  const send = d.send ?? realSend;
  const total: NotifyResult = { sent: 0, failed: 0, gone: 0, skipped: 0 };
  const day = kst(now()).toISOString().slice(0, 10);
  // 09:00~21:00에만. 놓친 날 것을 다음 날 몰아 보내지 않는다(다시 보내기 전에도 본다)
  const open = () => { const t = kst(now()); const h = t.getUTCHours(); return t.toISOString().slice(0, 10) === day && h >= LIMITS.pushFrom && h < LIMITS.pushUntil; };
  if (!open()) return total;

  /** 기기 하나. 보내기 직전에 대상을 다시 보고, 보낸 자리를 먼저 적는다(죽어도 많아야 한 번) */
  async function one(s: Sub): Promise<keyof NotifyResult | null> {
    const student = Number(s.student_id);
    // 도는 사이에 로그아웃했거나 다른 학생이 이 기기를 켰으면 보내지 않는다
    const [still] = await sql`select 1 from push_subscriptions p join consents c on c.student_id = p.student_id and c.text_version = ${d.consentVersion}
      where p.id = ${s.id} and p.student_id = ${student} and p.endpoint = ${s.endpoint}`;
    if (!still) return null;
    const items = await targets(sql, student, day);
    if (!items.length) return null;
    const h = hash(s.endpoint);
    const mine = await sql.begin(async tx => {
      // 이 기기에 오늘 이미 보냈으면(보내는 중이었으면) 더 보내지 않는다: 하루 한 통
      const [was] = await tx<{ n: number; done: boolean | null }[]>`select coalesce(max(attempts), 0)::int as n, bool_or(status <> 'failed') as done from push_sent
        where student_id = ${student} and endpoint_hash = ${h} and day = ${day}`;
      if (was.done || was.n >= 2) return []; // 실패한 것은 한 번 더까지
      const out: Item[] = [];
      for (const i of items) {
        await tx`insert into push_sent (student_id, endpoint_hash, notice_id, kind, day, status, attempts) values (${student}, ${h}, ${i.noticeId}, ${i.kind}, ${day}, 'sending', ${was.n + 1})
          on conflict (student_id, endpoint_hash, notice_id, kind, day) do update set status = 'sending', attempts = excluded.attempts, at = now()`;
        out.push(i);
      }
      return out;
    });
    if (!mine.length) return 'skipped';
    const status = await (async () => {
      if (!pushEndpoint(s.endpoint)) return 'failed' as const;
      const midnight = Date.parse(`${day}T00:00:00+09:00`) + 24 * 3600_000;
      try {
        await within(send(s, JSON.stringify(message(mine, day)), Math.max(0, Math.floor((midnight - now().getTime()) / 1000)), keys), d.timeoutMs ?? LIMITS.pushTimeoutMs);
        return 'sent' as const;
      } catch (e) {
        const code = (e as { statusCode?: unknown }).statusCode;
        return code === 404 || code === 410 ? 'gone' as const : 'failed' as const;
      }
    })();
    await sql`update push_sent set status = ${status}, at = now() where student_id = ${student} and endpoint_hash = ${h} and day = ${day} and status = 'sending'`;
    if (status === 'gone') await sql`delete from push_subscriptions where id = ${s.id}`;
    return status;
  }

  const conn = await sql.reserve();
  try {
    const [{ ok }] = await conn<{ ok: boolean }[]>`select pg_try_advisory_lock(hashtext('kingo:notify:' || current_schema())) as ok`;
    if (!ok) throw new Error('다른 알림 보내기가 돌고 있어요');
    try {
      await sql`delete from sessions where last_used_at <= now() - make_interval(days => ${LIMITS.sessionDays})`;
      const pass = async (only?: Set<string>) => {
        const subs = await sql<Sub[]>`
          select p.id, p.student_id, p.endpoint, p.p256dh, p.auth from push_subscriptions p
          join consents c on c.student_id = p.student_id and c.text_version = ${d.consentVersion} order by p.id`;
        const failed = new Set<string>();
        for (const s of subs) {
          if (only && !only.has(s.id)) continue;
          if (!open()) break;
          // 기기 하나의 DB 오류(보내는 사이 계정을 지움 등)가 다음 기기를 막지 않는다
          const r = await one(s).catch(() => 'failed' as const);
          if (r) total[r]++;
          if (r === 'failed') failed.add(s.id);
        }
        return failed;
      };
      const failed = await pass();
      // 아직 한 번만 해 본 기기만 10분 뒤 한 번 더
      const retry = failed.size ? new Set((await sql<{ id: string }[]>`
        select p.id from push_subscriptions p join push_sent x on x.student_id = p.student_id and x.endpoint_hash = sha256(convert_to(p.endpoint, 'UTF8'))
        where x.day = ${day} and x.status = 'failed' and x.attempts = 1 and p.id = any(${[...failed]})`).map(r => r.id)) : new Set<string>();
      if (retry.size) {
        await (d.wait ?? (ms => new Promise(r => setTimeout(r, ms))))(LIMITS.pushRetryMinutes * 60_000);
        if (open()) {
          total.failed -= retry.size;
          await pass(retry);
        }
      }
      await sql`delete from push_sent where day < ${day}::date - ${LIMITS.pushKeepDays}::int`;
    } finally {
      await conn`select pg_advisory_unlock(hashtext('kingo:notify:' || current_schema()))`;
    }
  } finally {
    conn.release();
  }
  return total;
}

export const notifyLine = (r: NotifyResult) => `알림 보냄 ${r.sent} · 실패 ${r.failed} · 사라짐 ${r.gone} · 건너뜀 ${r.skipped}`;
