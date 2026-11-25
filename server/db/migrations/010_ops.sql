-- 운영자 모니터링·지도·모델(3단계 data-model): 운영자 요청, 모델 재기와 바꾸기, 지도, 운영 값. 학생을 가리키는 값이 없다
create table op_requests (
  id bigint generated always as identity primary key, kind text not null check (kind in ('daily', 'model_trial')),
  model text check ((kind = 'model_trial') = (model is not null)), by_operator text not null, at timestamptz not null default now(),
  status text not null default 'waiting' check (status in ('waiting', 'running', 'paused', 'done', 'failed', 'canceled')),
  done int not null default 0, total int not null default 0,
  -- 여러 밤에 걸친 재기의 누적(gpu_ms는 GPU 퍼센트 × 밀리초)
  requests int not null default 0, request_ms bigint not null default 0, gpu_ms double precision not null default 0, gpu_known_ms bigint not null default 0, temp_max real,
  started_at timestamptz, ended_at timestamptz, error text
);
create unique index op_requests_one_open on op_requests (kind) where status in ('waiting', 'running', 'paused');
create table model_trials (
  id bigint generated always as identity primary key, request_id bigint references op_requests, model text not null, taxonomy_id text not null,
  field_version text not null, prompt_version text not null, gold_version text not null, trial_version int not null,
  metrics jsonb not null, started_at timestamptz not null, ended_at timestamptz not null default now()
);
-- 지금 모델은 마지막 행. 처음 모델의 고른 기록으로 되돌린 것은 trial_id가 null이다
create table model_changes (
  id bigint generated always as identity primary key, old_model text not null, new_model text not null, trial_id bigint references model_trials,
  by_operator text not null, at timestamptz not null default now()
);
create table field_maps (id bigint generated always as identity primary key, at timestamptz not null default now(), taxonomy_id text not null, edition text not null, data jsonb not null);
create table op_state (key text primary key, value text not null, at timestamptz not null default now());
alter table model_bursts drop constraint model_bursts_who_check;
alter table model_bursts add constraint model_bursts_who_check check (who in ('api', 'daily', 'ingest', 'trial'));
