-- 분야 체계(4단계 data-model): 초안, 분야 판, 판 바꾼 기록, 초안 재기. 학생을 가리키는 값이 없다
-- 초안은 지금 판 위의 차이다(분야마다 지금 판과 다른 값만)
create table taxonomy_drafts (
  taxonomy_id text not null, field_id text not null, aliases text[] not null, description text not null,
  by_operator text not null, updated_at timestamptz not null default now(),
  primary key (taxonomy_id, field_id)
);
-- 적용한 판: 전체 목록과 바탕 위의 고침 전체(edits). 바탕이 바뀌면 새 바탕에 edits를 얹어 잰다(research R5)
create table taxonomy_versions (
  id bigint generated always as identity primary key, taxonomy_id text not null, name text not null,
  list jsonb not null, edits jsonb not null, field_version text not null, base_version text not null,
  trial_id bigint references model_trials, by_operator text not null, at timestamptz not null default now(), file text,
  unique (taxonomy_id, name)
);
-- 지금 판은 마지막 행. version_id가 null이면 바탕
create table taxonomy_changes (
  id bigint generated always as identity primary key, taxonomy_id text not null, kind text not null check (kind in ('apply', 'revert')),
  version_id bigint references taxonomy_versions, by_operator text not null, at timestamptz not null default now()
);
alter table op_requests drop constraint op_requests_kind_check;
alter table op_requests add constraint op_requests_kind_check check (kind in ('daily', 'model_trial', 'taxonomy_trial'));
alter table op_requests drop constraint op_requests_check;
alter table op_requests add constraint op_requests_model_check check ((kind in ('model_trial', 'taxonomy_trial')) = (model is not null));
alter table op_requests add column snapshot jsonb check ((kind = 'taxonomy_trial') = (snapshot is not null));
-- 재기(모델·초안)는 한 번에 하나만 열려 있다
create unique index op_requests_one_trial on op_requests ((true)) where kind in ('model_trial', 'taxonomy_trial') and status in ('waiting', 'running', 'paused');
alter table model_trials add column base_version text;
