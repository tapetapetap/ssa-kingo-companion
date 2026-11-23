-- 운영자 판정 검토(US7, data-model 3): 확인할 것, 사람 판정, 고친 기록, 다시 판정 표시
create table review_items (
  notice_id text primary key references notices on delete cascade, reasons text[] not null check (cardinality(reasons) > 0),
  checked_by text, checked_at timestamptz
);
create table human_verdicts (
  notice_id text not null references notices on delete cascade, field text not null check (field in ('is_notice', 'kind', 'deadline', 'fields')),
  value jsonb not null, by_operator text not null, at timestamptz not null default now(),
  primary key (notice_id, field)
);
-- 지우지 않는다(FR-053)
create table verdict_log (
  id bigint generated always as identity primary key, notice_id text not null, field text,
  action text not null check (action in ('edit', 'confirm', 'rejudge')), old jsonb, new jsonb, by_operator text not null, at timestamptz not null default now()
);
create index verdict_log_notice on verdict_log (notice_id, id);
create table rejudge_marks (
  notice_id text primary key references notices on delete cascade, by_operator text not null, at timestamptz not null default now()
);
