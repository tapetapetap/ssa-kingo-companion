-- 나의 분석(US5, data-model 4): 직접 넣은 활동, 뺀 줄, 분석 글 하나
create table activities (
  id bigint generated always as identity primary key, student_id bigint not null references students on delete cascade,
  name text not null check (char_length(name) between 1 and 100), term text not null check (term ~ '^\d{4}-[12]$'),
  kind text not null, field_ids text[] not null default '{}' check (cardinality(field_ids) <= 2),
  proof_url text check (proof_url ~ '^https?://' and char_length(proof_url) <= 500),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index activities_student on activities (student_id);
create table excluded_lines (
  student_id bigint not null references students on delete cascade, line_key text not null, at timestamptz not null default now(),
  primary key (student_id, line_key)
);
create table analyses (
  student_id bigint primary key references students on delete cascade, version int not null, made_at timestamptz not null default now(),
  lines jsonb not null, flow jsonb not null default '[]', flow_version int, md text not null
);
