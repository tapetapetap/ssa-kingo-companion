-- 넣기(US1, data-model 2·3·5): 분야 목록, 공지와 공지 분야, 넣기 기록
create table taxonomies (
  id text primary key, name text not null, edition text not null, chosen jsonb,
  active boolean not null default false, loaded_at timestamptz not null default now()
);
create unique index taxonomies_one_active on taxonomies ((true)) where active;
create table field_groups (
  taxonomy_id text not null references taxonomies on delete cascade, id text not null, name text not null, parent_id text, ord int not null,
  primary key (taxonomy_id, id)
);
create table fields (
  taxonomy_id text not null references taxonomies on delete cascade, id text not null, name text not null, group_id text not null,
  description text not null, ord int not null, vector vector(1024),
  primary key (taxonomy_id, id)
);
create table notices (
  id text primary key, source text not null, title text not null, url text not null, posted_on date not null, host text,
  is_notice boolean not null, kind text, deadline date,
  field_state text not null check (field_state in ('off', 'missing', 'judged', 'human')), field_rule text,
  closes_on date generated always as (coalesce(deadline, posted_on + 30)) stored,
  search_text text not null, vector vector(1024), down boolean not null default false,
  file jsonb not null, file_hash text not null, first_seen_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table notice_fields (
  notice_id text not null references notices on delete cascade, field_id text not null,
  level text not null check (level in ('core', 'related')), ord int not null,
  primary key (notice_id, field_id)
);
create table ingest_runs (
  id bigint generated always as identity primary key, at timestamptz not null default now(), source text not null,
  collected_at timestamptz, since date, taxonomy_id text, taxonomy_edition text, summary jsonb, rejected text
);
