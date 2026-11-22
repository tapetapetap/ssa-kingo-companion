-- 학생과 로그인(US2, data-model 1). 학생 자료 표는 모두 students를 cascade로 가리킨다(FR-020)
create table students (
  id bigint generated always as identity primary key, dept text not null default '소프트웨어학과',
  analysis_off boolean not null default false, created_at timestamptz not null default now(), last_seen_at timestamptz not null default now()
);
create table login_methods (
  id bigint generated always as identity primary key, student_id bigint not null references students on delete cascade,
  kind text not null check (kind in ('dev', 'sso', 'test')), subject text not null, password_hash text,
  failed_count int not null default 0, locked_until timestamptz,
  unique (kind, subject)
);
create table sessions (
  token_hash bytea primary key, student_id bigint not null references students on delete cascade,
  created_at timestamptz not null default now(), last_used_at timestamptz not null default now()
);
create table consents (student_id bigint primary key references students on delete cascade, text_version text not null, agreed_at timestamptz not null default now());
create table answers (
  student_id bigint primary key references students on delete cascade, grade int not null check (grade between 1 and 4),
  term int not null check (term in (1, 2)), goal text not null check (goal in ('job', 'grad', 'startup', 'unsure')), answered_at timestamptz not null default now()
);
create table student_fields (
  student_id bigint not null references students on delete cascade, field_id text not null, picked_at timestamptz not null default now(),
  primary key (student_id, field_id)
);
