// 모델 바꾸기(FR-051·054~056, 3단계 contracts/api.md): 지금 모델과 후보, 재기 요청, 85%를 넘고 조건이 같은 결과로만 바꾼다
import { EMBED_MODEL } from '../../etl/notices/embed.ts';
import { passes, type Ratio } from '../../etl/notices/score.ts';
import type { Ctx } from '../app.ts';
import type { Sql } from '../db/sql.ts';
import { HttpError, kstIso, type Route } from '../http.ts';
import { currentModel, installedModels, type Installed } from '../model.ts';
import { conditions, TRIAL_VERSION, type Conditions } from './conditions.ts';
import { requireOperator } from './guard.ts';
import { lastRequest, openRequest } from './requests.ts';

type Trial = { id: string; model: string; taxonomy_id: string; field_version: string; prompt_version: string; gold_version: string; trial_version: number; metrics: { corePrecision: Ratio } & Record<string, unknown>; ended_at: Date };
const KEEP = 20;

/** 임베딩 모델과 크기 정보가 없는 것은 후보가 아니다 */
export const isCandidate = (m: Installed) => !m.family.includes('bert') && m.name.split(':')[0] !== EMBED_MODEL && !!m.parameterSize;
/** 지금 조건과 하나라도 다르면 낡은 결과다. 지금 조건을 모르면(정답셋 판이 없음) 모두 낡았다 */
const isStale = (t: Trial, c: Conditions | null) => !c || c.goldVersion === null || t.taxonomy_id !== c.taxonomy.id || t.field_version !== c.fieldVersion || t.prompt_version !== c.promptVersion
  || t.gold_version !== c.goldVersion || t.trial_version !== TRIAL_VERSION;

export function modelRoutes(ctx: Ctx): Route[] {
  const sql = ctx.sql;
  const now = () => conditions(sql, ctx.taxonomyDir);
  const list = () => (ctx.models ?? installedModels)();
  const invalid = (field: string, message: string) => new HttpError(422, 'invalid', message, { field });
  const view = (t: Trial, c: Conditions | null) => ({ id: Number(t.id), model: t.model, at: kstIso(t.ended_at), stale: isStale(t, c), passes: passes(t.metrics.corePrecision), metrics: t.metrics });

  /** 처음 모델의 고른 기록(분야 목록의 chosen). 지금 판과 같고 85%를 넘고 설치돼 있으면 되돌릴 수 있다 */
  const initialOf = (c: Conditions | null, names: string[]) => {
    const ch = c?.taxonomy.chosen;
    return ch ? { model: ch.model, num: ch.corePrecision.num, den: ch.corePrecision.den, usable: ch.prompt === c.fieldVersion && passes(ch.corePrecision) && names.includes(ch.model) } : null;
  };
  async function state(sql: Sql) {
    const [last] = await sql<{ new_model: string; at: Date; by_operator: string; trial_id: string | null }[]>`select new_model, at, by_operator, trial_id from model_changes order by id desc limit 1`;
    const c = await now();
    const [t] = last?.trial_id ? await sql<Trial[]>`select * from model_trials where id = ${last.trial_id}` : [];
    return { c, current: { model: await currentModel(sql), since: last ? kstIso(last.at) : null, by: last?.by_operator ?? null, trial: t ? view(t, c) : null } };
  }

  return [
    ['GET', '/api/ops/models', async req => {
      const o = await requireOperator(ctx, req);
      const installed = await list().catch(() => null);
      const { c, current } = await state(sql);
      const trials = await sql<Trial[]>`select * from model_trials order by id desc limit ${KEEP}`;
      const changes = await sql<{ old_model: string; new_model: string; by_operator: string; at: Date; core: Ratio | null }[]>`select c.old_model, c.new_model, c.by_operator, c.at, t.metrics->'corePrecision' as core
        from model_changes c left join model_trials t on t.id = c.trial_id order by c.id desc limit ${KEEP}`;
      return {
        body: {
          current, initial: initialOf(c, installed?.map(m => m.name) ?? []), serverOk: installed !== null, goldReady: c?.goldVersion != null,
          installed: (installed ?? []).filter(isCandidate).map(({ name, size, parameterSize }) => ({ name, size, parameterSize })),
          request: await lastRequest(sql, 'model_trial'), trials: trials.map(t => view(t, c)),
          changes: changes.map(x => ({ old: x.old_model, new: x.new_model, by: x.by_operator, at: kstIso(x.at), corePrecision: x.core }))
        },
        headers: o.headers
      };
    }],
    ['POST', '/api/ops/models/trial', async req => {
      const o = await requireOperator(ctx, req);
      const model = (req.body as Record<string, unknown>).model;
      if (typeof model !== 'string' || !(await list()).some(m => m.name === model && isCandidate(m))) throw invalid('model', '모델 서버에 설치된 모델이 아니에요');
      return { status: 202, body: { request: await openRequest(sql, 'model_trial', o.by, model) }, headers: o.headers };
    }],
    ['POST', '/api/ops/models/trial/cancel', async req => {
      const o = await requireOperator(ctx, req);
      const [r] = await sql`update op_requests set status = 'canceled', ended_at = now() where kind = 'model_trial' and status in ('waiting', 'paused') returning 1`;
      if (!r) {
        const [running] = await sql`select 1 from op_requests where kind = 'model_trial' and status = 'running'`;
        throw running ? new HttpError(409, 'running', '지금 재는 중이에요. 멈춘 뒤에 취소할 수 있어요') : invalid('request', '취소할 재기가 없어요');
      }
      return { status: 204, headers: o.headers };
    }],
    ['POST', '/api/ops/models/current', async req => {
      const o = await requireOperator(ctx, req);
      const trialId = (req.body as Record<string, unknown>).trialId;
      const names = (await list()).filter(isCandidate).map(m => m.name);
      const c = await now();
      let model: string;
      let trial: string | null = null;
      if (trialId === 'initial') {
        const first = initialOf(c, names);
        if (!first) throw invalid('trialId', '고른 기록이 없어요');
        if (!first.usable) throw new HttpError(422, 'trial_stale', '고른 뒤 조건이 바뀌었거나 모델이 없어요. 다시 재야 해요');
        model = first.model;
      } else {
        const [t] = typeof trialId === 'number' && Number.isInteger(trialId) ? await sql<Trial[]>`select * from model_trials where id = ${trialId}` : [];
        if (!t) throw invalid('trialId', '없는 결과예요');
        if (!passes(t.metrics.corePrecision)) throw new HttpError(422, 'trial_low', '핵심 정밀도가 85% 미만이라 바꿀 수 없어요');
        if (isStale(t, c)) throw new HttpError(422, 'trial_stale', '잰 뒤 조건이 바뀌었어요. 다시 재야 해요');
        model = t.model;
        trial = t.id;
      }
      if (!names.includes(model)) throw invalid('trialId', '모델 서버에 설치된 모델이 아니에요');
      // 동시에 눌러도 한 줄씩 이어지게 잠근다
      await sql.begin(async tx => {
        await tx`select pg_advisory_xact_lock(hashtext('kingo:model-change:' || current_schema()))`;
        const old = await currentModel(tx as unknown as Sql);
        if (old === model) throw invalid('trialId', '이미 지금 모델이에요');
        await tx`insert into model_changes (old_model, new_model, trial_id, by_operator) values (${old}, ${model}, ${trial}, ${o.by})`;
      });
      return { body: { current: (await state(sql)).current }, headers: o.headers };
    }]
  ];
}
