import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CACHE_DIR } from '../../etl/notices/cse.ts';
import { FIELD_CACHE_DIR } from '../../etl/notices/fields.ts';
import { LLM_CACHE_DIR, PROMPT_VERSION } from '../../etl/notices/llm.ts';
import type { Model } from '../model.ts';
import { testDb } from '../test/db.ts';
import { notice } from '../test/notice.ts';
import { createDevStudent, seedTaxonomy } from '../test/student.ts';
import { DailyBusy, dailyLine, dailyRunning, rejudgePaths, runDaily, type DailyDeps } from './daily.ts';

let db: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.sql`truncate students, taxonomies, notices, daily_runs, model_bursts, rejudge_marks, repick_queue, daily_counts cascade`; });

const fakeModel = (): Model => ({ name: 'm', chat: async () => 'fail', embed: async () => 'down' as never, noTemp: 0, close: async () => ({}) as never });
const at = (iso: string) => () => new Date(iso);
const ok = { ok: true as const, summary: { new: 1 } as never, dryRun: false };
const deps = (o: Partial<DailyDeps> = {}): DailyDeps => ({
  sql: db.sql, mode: 'dev', databaseUrl: '', backupDir: null, now: at('2026-11-24T03:00:00+09:00'), pollMs: 5, model: fakeModel,
  classifier: async () => ({ code: 0, stdout: '새 글 3\n부하: GPU 평균 40% · 최고 70°C\n' }), ingestFile: async () => ok, backup: async () => '/backup/kingo-2026-11-24.dump', ...o
});

describe('매일 작업 (US6, research R14)', () => {
  it('단계는 정한 순서로 돌고, 요약은 daily_runs에 남는다. 분류기의 부하 줄을 옮긴다', async () => {
    await seedTaxonomy(db.sql);
    const r = await runDaily(deps());
    expect(Object.keys(r.steps)).toEqual(['rejudge', 'classifier', 'ingest', 'map', 'backup', 'facts', 'flow', 'counts', 'repick']);
    expect(r.steps.rejudge).toMatchObject({ ok: false, skipped: true });
    expect(r.steps.ingest).toMatchObject({ ok: true, new: 1 });
    expect(r.steps.map).toMatchObject({ ok: false, error: '벡터가 있는 분야가 0개라 지도를 만들지 못했어요(12개부터)' }); // 실패해도 이어진다
    expect(r.steps.backup).toMatchObject({ ok: true, file: '/backup/kingo-2026-11-24.dump' });
    expect(r.load.classifierLine).toBe('부하: GPU 평균 40% · 최고 70°C');
    const [row] = await db.sql`select steps, load from daily_runs`;
    expect(Object.keys(row.steps).sort()).toEqual(Object.keys(r.steps).sort());
    for (const s of Object.values(row.steps as Record<string, object>)) expect(Object.keys(s)).toEqual(expect.arrayContaining(['ok', 'skipped', 'seconds', 'error']));
  });

  it('분류기가 실패하면 넣기는 skipped이고 뒤 단계는 돈다. 부하 줄이 없으면 비운다', async () => {
    await seedTaxonomy(db.sql);
    const r = await runDaily(deps({ classifier: async () => ({ code: 1, stdout: '' }) }));
    expect(r.steps.classifier).toMatchObject({ ok: false, error: '분류기가 1로 끝났어요' });
    expect(r.steps.ingest).toMatchObject({ ok: false, skipped: true });
    expect([r.steps.backup.ok, r.steps.facts.ok, r.steps.flow.ok, r.steps.repick.ok]).toEqual([true, true, true, true]);
    expect(r.load.classifierLine).toBeNull();
  });

  it('활성 목록이 없으면 넣기 단계만 실패한다. 넣기가 던져도 다음 단계를 잇는다', async () => {
    const r = await runDaily(deps());
    expect(r.steps.ingest).toMatchObject({ ok: false, error: '활성 분야 목록이 없어요' });
    expect(r.steps.backup.ok && r.steps.repick.ok).toBe(true);
    await seedTaxonomy(db.sql);
    const t = await runDaily(deps({ ingestFile: async () => ({ ok: false, reason: '파일이 틀려요' }) }));
    expect(t.steps.ingest).toMatchObject({ ok: false, error: '파일이 틀려요' });
  });

  it('다시 판정 표시는 분류기 앞에서 보관 셋을 지우고, 넣기가 되면 표시를 지운다. 지울 세 경로는 research R11과 같다', async () => {
    await seedTaxonomy(db.sql);
    await notice(db.sql, { no: 7 });
    await db.sql`insert into rejudge_marks (notice_id, by_operator) values ('cse:7', 'ops@example.com')`;
    const seen: unknown[] = [];
    const order: string[] = [];
    const r = await runDaily(deps({
      cachePaths: (no, m) => { seen.push([no, m]); order.push('rejudge'); return []; },
      classifier: async () => { order.push('classifier'); return { code: 0, stdout: '' }; }
    }));
    expect(seen).toEqual([[7, ['gemma4:12b']]]);
    expect(order).toEqual(['rejudge', 'classifier']);
    expect(r.steps.rejudge).toMatchObject({ ok: true, notices: 1 });
    expect(await db.sql`select * from rejudge_marks`).toEqual([]);
    const p = rejudgePaths(123, ['gemma4:12b']);
    expect(rejudgePaths(123, ['gemma4:12b', 'old:1']).filter(x => x.includes('old_1'))).toHaveLength(4); // 앞 모델의 답도
    expect(rejudgePaths(123, ['gemma4:12b', 'old:1']).filter(x => x.endsWith('.html'))).toHaveLength(1);
    expect(p.slice(0, 2)).toEqual([join(CACHE_DIR, '123.html'), join(LLM_CACHE_DIR, 'gemma4_12b', PROMPT_VERSION, '123.json')]);
    expect(p.slice(2).map(x => x.slice(join(FIELD_CACHE_DIR, 'gemma4_12b').length + 1).replace(/-[^/]+\//, '/'))).toEqual(['custom/123.json', 'ncs/123.json', 'csrankings/123.json']);
    // 분류기를 건너뛴 날은 다시 판정되지 않았으니 표시를 둔다
    await db.sql`insert into rejudge_marks (notice_id, by_operator) values ('cse:7', 'ops@example.com')`;
    await runDaily(deps({ skipClassifier: true, cachePaths: () => [] }));
    expect((await db.sql`select notice_id from rejudge_marks`).map(x => x.notice_id)).toEqual(['cse:7']);
  });

  it('줄이 비면 기다리기를 멈추고, 다시 고른 수는 picks에서, 부하는 model_bursts에서 센다', async () => {
    await seedTaxonomy(db.sql);
    await notice(db.sql, { no: 1 });
    const [a, b] = [await createDevStudent(db.sql, 'a@x.co'), await createDevStudent(db.sql, 'b@x.co')];
    // api 일꾼 대신: 매일 작업이 두 학생을 줄에 넣으면 고르고 줄을 비운다(정한 시간에 하면 다시 고르기가 시작하기 전에 끼어들어 가끔 실패했다)
    let done = false;
    void (async () => {
      while (!done && (await db.sql`select 1 from repick_queue where cause = 'daily'`).length < 2) await new Promise(r => setTimeout(r, 10));
      if (done) return;
      await db.sql`insert into picks (student_id, notice_id, reason, method) values (${a}, 'cse:1', 'r', 'llm:m'), (${b}, 'cse:1', 'r', 'rule')`;
      await db.sql`delete from repick_queue`;
    })();
    await db.sql`insert into model_bursts (who, started_at, ended_at, requests, request_ms, gpu_avg, temp_max) values
      ('api', now() + interval '1 second', now(), 3, 1000, 40, 70), ('daily', now() + interval '1 second', now(), 1, 3000, 80, 75)`;
    const r = await runDaily(deps({ now: () => new Date('2026-11-24T03:00:00+09:00') })).finally(() => { done = true; });
    expect(r.steps.repick).toMatchObject({ ok: true, queued: 2, llm: 1, rule: 1, left: 0 });
    expect(r.load).toMatchObject({ requests: 4, tempMax: 75, gpuAvg: 70 });
  });

  it('07:00이 되면 기다리기를 멈추고 남은 학생은 줄에 둔다. 07:00이 지나 시작하면 기다리지 않는다', async () => {
    await createDevStudent(db.sql, 'a@x.co');
    let n = 0;
    const r = await runDaily(deps({ now: () => new Date(n++ < 3 ? '2026-11-24T06:59:59+09:00' : '2026-11-24T07:00:01+09:00') }));
    expect(r.steps.repick).toMatchObject({ ok: true, queued: 1, left: 1 });
    const late = await runDaily(deps({ now: at('2026-11-24T09:00:00+09:00') }));
    expect(late.steps.repick).toMatchObject({ left: 1, daytime: true, llm: null, rule: null });
    expect(dailyLine(late)).toContain('낮 실행(다시 고르기 남음 1)');
  });

  it('분류기의 요약JSON을 단계에 담고, 깨졌으면 비운다(단계는 성공). 하루 숫자는 어제 것이다', async () => {
    await seedTaxonomy(db.sql);
    const line = '요약JSON: {"fetched":5,"opportunity":2,"llm":{"fresh":4,"failed":1},"field":null}';
    const r = await runDaily(deps({ consentVersion: 'dev-1', classifier: async () => ({ code: 0, stdout: `새 글 5\n${line}\n` }) }));
    expect(r.steps.classifier).toMatchObject({ ok: true, fetched: 5, opportunity: 2, llm: { fresh: 4, failed: 1 }, field: null });
    expect(r.steps.counts).toMatchObject({ ok: true, day: '2026-11-23' });
    expect((await db.sql`select count(*)::int as n from daily_counts where day = '2026-11-23'`)[0].n).toBeGreaterThan(5);
    const bad = await runDaily(deps({ classifier: async () => ({ code: 0, stdout: '요약JSON: {깨짐' }) }));
    expect(bad.steps.classifier).toMatchObject({ ok: true });
    expect(bad.steps.classifier.fetched).toBeUndefined();
    expect(bad.steps.counts).toMatchObject({ skipped: true });
  });

  it('어느 때든 하나만 돈다: 뒤의 것은 기다렸다 돌고, 오래 기다리면 DailyBusy다(FR-045)', async () => {
    await seedTaxonomy(db.sql);
    const order: string[] = [];
    let go = () => {};
    const first = runDaily(deps({ classifier: () => new Promise(ok => { order.push('첫째 시작'); go = () => { order.push('첫째 끝'); ok({ code: 0, stdout: '' }); }; }) }));
    while (!order.length) await new Promise(r => setTimeout(r, 5));
    expect(await dailyRunning(db.sql)).toBe(true);
    await expect(runDaily(deps({ waitMs: 20 }))).rejects.toThrow(DailyBusy);
    const second = runDaily(deps({ classifier: async () => { order.push('둘째'); return { code: 0, stdout: '' }; } }));
    await new Promise(r => setTimeout(r, 30));
    go();
    await Promise.all([first, second]);
    expect(order).toEqual(['첫째 시작', '첫째 끝', '둘째']);
    expect(await dailyRunning(db.sql)).toBe(false);
  });

  it('--skip-classifier면 분류기 없이 있는 결과 파일로 넣는다', async () => {
    await seedTaxonomy(db.sql);
    let called = false;
    const r = await runDaily(deps({ skipClassifier: true, classifier: async () => { called = true; return { code: 0, stdout: '' }; } }));
    expect(called).toBe(false);
    expect(r.steps.classifier).toMatchObject({ ok: false, skipped: true });
    expect(r.steps.ingest).toMatchObject({ ok: true });
  });
});
