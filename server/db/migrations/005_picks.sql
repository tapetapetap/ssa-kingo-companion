-- 홈(US3, data-model 4·5): 나에 대한 프롬프트, 가장 추천, 다시 고르기 줄, 부하 기록
create table prompts (
  student_id bigint primary key references students on delete cascade, body text not null check (char_length(body) <= 1000),
  vector vector(1024), updated_at timestamptz not null default now()
);
create table picks (
  student_id bigint primary key references students on delete cascade, notice_id text not null references notices,
  reason text not null, cited jsonb not null default '[]', analysis_version int, method text not null, prompt_version text,
  computed_at timestamptz not null default now()
);
create table repick_queue (
  student_id bigint primary key references students on delete cascade, queued_at timestamptz not null default clock_timestamp(),
  cause text not null check (cause in ('daily', 'answers', 'fields', 'action', 'prompt', 'analysis', 'ingest'))
);
create table model_bursts (
  id bigint generated always as identity primary key, who text not null check (who in ('api', 'daily', 'ingest')),
  started_at timestamptz not null, ended_at timestamptz not null, requests int not null, request_ms bigint not null,
  gpu_avg real, temp_max real
);
