-- 매일 작업 기록(US6, data-model 5): 단계마다 { ok, skipped, seconds, error, … }, 부하 { gpuAvg, tempMax, requests, classifierLine }
create table daily_runs (
  id bigint generated always as identity primary key, started_at timestamptz not null, ended_at timestamptz not null,
  steps jsonb not null, load jsonb not null
);
