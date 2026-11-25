// 다시 고르기 줄(research R9, FR-037): 학생마다 한 행. 일꾼은 2초마다 가장 오래된 행 하나를 집어 고르고,
// 집었을 때와 queued_at이 같을 때만 지운다(계산 중에 다시 걸리면 남아 한 번 더 고른다). 던지면 기록하고 행을 둔다
import type { Sql } from '../db/sql.ts';
import { logError } from '../log.ts';
import { currentModel, openModel, type Model, type ModelDeps } from '../model.ts';
import { choosePick, type AnalysisOf } from './choose.ts';


export type WorkerDeps = { model?: ModelDeps; analysisOf?: AnalysisOf; noModel?: boolean };

/** 줄에서 하나를 처리한다. 처리한 학생 번호, 줄이 비었으면 null. 모델(부하 제한)은 줄이 빌 때까지 이어 쓰고 비면 닫는다 */
export function makeWorker(sql: Sql, d: WorkerDeps = {}) {
  let model: Model | null = null;
  const close = async () => {
    const m = model;
    model = null;
    if (m) await m.close();
  };
  const step = async (): Promise<number | null> => {
    // queued_at은 글자로 받고 글자로 비교한다. postgres.js는 시각 값을 JS 날짜(밀리초)로 바꿔 보내 마이크로초가 사라진다
    const [row] = await sql<{ student_id: string; queued_at: string }[]>`select student_id, queued_at::text from repick_queue order by queued_at, student_id limit 1`;
    if (!row) {
      await close();
      return null;
    }
    const student = Number(row.student_id);
    // 모델은 줄이 비었다 다시 찰 때마다 새로 연다(바꾼 모델이 다음 일부터 쓰인다)
    if (!d.noModel) model ??= openModel(sql, 'api', { model: await currentModel(sql), ...d.model });
    try {
      if (model) await fillPromptVector(sql, student, model);
      await choosePick(sql, student, model, d.analysisOf, row.queued_at);
      await sql`delete from repick_queue where student_id = ${student} and queued_at::text = ${row.queued_at}`;
    } catch (e) {
      logError('repick', e);
      // 줄 맨 뒤로 보낸다. 계속 실패하는 학생 하나가 다른 학생을 막지 않게
      await sql`update repick_queue set queued_at = clock_timestamp() where student_id = ${student} and queued_at::text = ${row.queued_at}`;
    }
    // 온도를 읽지 못해 문이 닫혔으면 그 다시 고르기만 규칙이었다. 다음 일은 새 부하 제한으로 다시 물어본다(research R7)
    if (model && model.noTemp > 0) await close();
    return student;
  };
  return { step, close };
}

/** 프롬프트 벡터가 비어 있으면 그 학생 차례에 만든다. 실패하면 비운 채 둔다(research R9) */
async function fillPromptVector(sql: Sql, student: number, model: Model) {
  const [p] = await sql<{ body: string }[]>`select body from prompts where student_id = ${student} and vector is null`;
  if (!p || !p.body.trim()) return;
  const r = await model.embed([p.body]);
  if (typeof r === 'string') return;
  await sql`update prompts set vector = ${JSON.stringify(r[0])}::vector where student_id = ${student} and body = ${p.body}`;
}

/** api 프로세스의 일꾼: 2초마다 한 번 처리한다. 멈추는 함수를 돌려준다 */
export function startWorker(sql: Sql, d: WorkerDeps = {}, everyMs = 2000): () => Promise<void> {
  const w = makeWorker(sql, d);
  let busy = false;
  const h = setInterval(() => {
    if (busy) return;
    busy = true;
    w.step().catch(e => logError('repick', e)).finally(() => { busy = false; });
  }, everyMs);
  h.unref();
  return async () => { clearInterval(h); await w.close(); };
}
