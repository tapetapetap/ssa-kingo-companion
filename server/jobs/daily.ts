// 매일 작업(US6, research R14, FR-043): 다시 판정 표시 → 분류기 → 넣기 → 백업 → 사실 칸 → 흐름 → 다시 고르기 → 요약.
// 한 단계가 실패해도 다음 단계를 잇는다. 분류기가 실패하면 넣기는 건너뛰고 어제 자료로 간다
import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE_DIR } from '../../etl/notices/cse.ts';
import { fieldFolder } from '../../etl/notices/fields.ts';
import { LLM_CACHE_DIR, modelDir, PROMPT_VERSION } from '../../etl/notices/llm.ts';
import { loadTaxonomy } from '../../etl/taxonomy/taxonomy.ts';
import { writeFlow } from '../analysis/flow.ts';
import { rebuild } from '../analysis/store.ts';
import type { Mode } from '../config.ts';
import type { Sql } from '../db/sql.ts';
import { ingest, type IngestResult } from '../ingest/ingest.ts';
import { openModel, withModelLock, type Model } from '../model.ts';
import { enqueue } from '../pick/queue.ts';
import { backup } from './backup.ts';

export type Step = { ok: boolean; skipped: boolean; seconds: number; error: string | null } & Record<string, unknown>;
export type DailyRun = { startedAt: Date; endedAt: Date; steps: Record<string, Step>; load: { gpuAvg: number | null; tempMax: number | null; requests: number; classifierLine: string | null } };

export type DailyDeps = {
  sql: Sql; mode: Mode; databaseUrl: string; backupDir: string | null; skipClassifier?: boolean;
  now?: () => Date;
  /** 분류기 자식 프로세스. 끝 코드와 표준 출력 */
  classifier?: () => Promise<{ code: number; stdout: string }>;
  ingestFile?: (taxonomyId: string, model: Model) => Promise<IngestResult>;
  backup?: () => Promise<string>;
  model?: () => Model;
  /** 다시 판정할 글 번호의 분류기 보관 셋(research R11) */
  cachePaths?: (no: number, taxonomyId: string, model: string) => string[];
  pollMs?: number;
};

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
/** 분류기의 결과 파일(etl/notices/run.ts의 OUT_FILE과 같은 자리. 그 모듈은 수집 코드를 끌고 와 가져오지 않는다) */
const OUT_FILE = join(ROOT, 'etl/out/cse-notices.json');

/** 분류기를 자식 프로세스로 돌린다. 표준 오류는 그대로 흘려 보낸다 */
function runClassifier(): Promise<{ code: number; stdout: string }> {
  return new Promise(ok => {
    const p = spawn(process.execPath, ['etl/notices/run.ts'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    p.stdout.on('data', d => { out += String(d); });
    p.on('close', code => ok({ code: code ?? 1, stdout: out }));
    p.on('error', e => ok({ code: 1, stdout: String(e) }));
  });
}

/** 본문 보관본, 기회 판정 보관 답, 분야 판정 보관 답(research R11) */
export const rejudgePaths = (no: number, taxonomyId: string, model: string) => [
  join(CACHE_DIR, `${no}.html`),
  join(LLM_CACHE_DIR, modelDir(model), PROMPT_VERSION, `${no}.json`),
  join(fieldFolder(loadTaxonomy(taxonomyId as never), model), `${no}.json`)
];

/** 그날(한국) 07:00. 기다리기를 멈추는 때 */
const sevenKst = (d: Date) => new Date(`${new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10)}T07:00:00+09:00`);

export async function runDaily(d: DailyDeps): Promise<DailyRun> {
  const { sql } = d;
  const now = d.now ?? (() => new Date());
  const startedAt = now();
  const [{ dbStart }] = await sql<{ dbStart: string }[]>`select clock_timestamp()::text as "dbStart"`; // 부하 기록은 DB 시계로 센다
  const steps: Record<string, Step> = {};
  const step = async (name: string, fn: () => Promise<Record<string, unknown> | 'skipped' | void>) => {
    const t0 = Date.now();
    try {
      const r = await fn();
      steps[name] = { ok: r !== 'skipped', skipped: r === 'skipped', seconds: (Date.now() - t0) / 1000, error: null, ...(typeof r === 'object' ? r : {}) };
    } catch (e) {
      steps[name] = { ok: false, skipped: false, seconds: (Date.now() - t0) / 1000, error: e instanceof Error ? e.message : String(e) };
    }
  };
  const model = (d.model ?? (() => openModel(sql, 'daily')))();
  const active = async () => (await sql<{ id: string }[]>`select id from taxonomies where active`)[0]?.id ?? null;
  let classifierLine: string | null = null;
  const marks = (await sql<{ notice_id: string }[]>`select notice_id from rejudge_marks`).map(r => r.notice_id);

  try {
    await step('rejudge', async () => {
      if (!marks.length) return 'skipped';
      const t = await active();
      if (!t) throw new Error('활성 분야 목록이 없어요');
      for (const id of marks) for (const p of (d.cachePaths ?? rejudgePaths)(Number(id.split(':')[1]), t, model.name)) rmSync(p, { force: true });
      return { notices: marks.length };
    });
    await step('classifier', async () => {
      if (d.skipClassifier) return 'skipped';
      // 분류기의 모델 요청이 api의 다시 고르기와 함께 가지 않게 모델 잠금을 잡고 돌린다(research R7)
      const r = await withModelLock(sql, () => (d.classifier ?? runClassifier)());
      classifierLine = r.stdout.split('\n').find(l => l.startsWith('부하:')) ?? null;
      if (r.code !== 0) throw new Error(`분류기가 ${r.code}로 끝났어요`);
    });
    await step('ingest', async () => {
      if (!steps.classifier.ok && !steps.classifier.skipped) return 'skipped'; // 분류기를 건너뛰었으면 있는 결과 파일로 넣는다
      const t = await active();
      if (!t) throw new Error('활성 분야 목록이 없어요');
      const r = await (d.ingestFile ?? ((id, m) => ingest(JSON.parse(readFileSync(OUT_FILE, 'utf8')), id, {}, { sql, mode: d.mode, embed: m.embed })))(t, model);
      if (!r.ok) throw new Error(r.reason);
      if (marks.length) await sql`delete from rejudge_marks where notice_id = any(${marks})`;
      return { ...r.summary };
    });
    await step('backup', async () => {
      if (!d.backup && !d.backupDir) return 'skipped';
      return { file: await (d.backup ?? (() => backup(d.backupDir!, d.databaseUrl)))() };
    });
    const students = (await sql<{ id: string }[]>`select id from students order by id`).map(r => Number(r.id));
    await step('facts', async () => {
      for (const s of students) await rebuild(sql, s);
      return { students: students.length };
    });
    await step('flow', async () => {
      let written = 0;
      let failed = 0;
      for (const s of students) {
        const r = await writeFlow(sql, s, model);
        if (r === 'written') written++;
        if (r === 'failed') failed++;
      }
      return { written, failed };
    });
    await step('repick', async () => {
      const [{ at }] = await sql<{ at: string }[]>`select clock_timestamp()::text as at`;
      for (const s of students) await enqueue(sql, s, 'daily');
      // api의 일꾼이 줄을 비운다. 07:00이 되면 기다리기를 멈추고 남은 학생은 줄에 둔다(낮에 이어서 한다)
      const end = sevenKst(startedAt);
      const left = async () => Number((await sql<{ n: number }[]>`select count(*)::int as n from repick_queue`)[0].n);
      while (now() < end && (await left()) > 0) await new Promise(r => setTimeout(r, d.pollMs ?? 5000));
      const [c] = await sql<{ llm: number; rule: number }[]>`
        select count(*) filter (where method like 'llm:%')::int as llm, count(*) filter (where method = 'rule')::int as rule
        from picks where computed_at > ${at}::timestamptz`;
      return { queued: students.length, llm: c.llm, rule: c.rule, left: await left() };
    });
  } finally {
    await model.close();
  }
  const [l] = await sql<{ requests: number; temp_max: number | null; gpu_avg: number | null }[]>`
    select coalesce(sum(requests), 0)::int as requests, max(temp_max) as temp_max,
      sum(gpu_avg * request_ms) / nullif(sum(request_ms) filter (where gpu_avg is not null), 0) as gpu_avg
    from model_bursts where started_at >= ${dbStart}::timestamptz`;
  const run: DailyRun = { startedAt, endedAt: now(), steps, load: { gpuAvg: l.gpu_avg, tempMax: l.temp_max, requests: l.requests, classifierLine } };
  await sql`insert into daily_runs (started_at, ended_at, steps, load) values (${run.startedAt}, ${run.endedAt}, ${sql.json(steps as never)}, ${sql.json(run.load as never)})`;
  return run;
}

/** 요약 한 줄(contracts/cli.md) */
export function dailyLine(r: DailyRun): string {
  const failed = Object.entries(r.steps).filter(([, s]) => !s.ok && !s.skipped).map(([k, s]) => `${k}(${s.error})`);
  const p = r.steps.repick;
  const f = r.steps.flow;
  const secs = Math.round((r.endedAt.getTime() - r.startedAt.getTime()) / 1000);
  return [`매일 작업 ${secs}초`, f?.ok ? `흐름 ${f.written} · 흐름 실패 ${f.failed}` : null, p?.ok ? `다시 고름 LLM ${p.llm} · 규칙 ${p.rule} · 남음 ${p.left}` : null,
    `모델 요청 ${r.load.requests}`, failed.length ? `실패한 단계 ${failed.join(', ')}` : '실패한 단계 없음'].filter(Boolean).join(' · ');
}
