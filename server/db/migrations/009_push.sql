-- 마감 알림(3단계 data-model): 기기 구독, 보낸 알림, 하루 숫자
create table push_subscriptions (
  id bigint generated always as identity primary key, student_id bigint not null references students on delete cascade,
  -- 구독은 그 기기의 로그인에 붙어 로그아웃·만료·계정 지우기로 함께 사라진다(R6)
  token_hash bytea not null unique references sessions on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000), p256dh text not null, auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_student on push_subscriptions (student_id);
create table push_sent (
  student_id bigint not null references students on delete cascade, endpoint_hash bytea not null, notice_id text not null,
  kind text not null check (kind in ('due3', 'due0', 'revisit')), day date not null,
  status text not null check (status in ('sending', 'sent', 'failed', 'gone')), attempts int not null default 1, at timestamptz not null default now(),
  primary key (student_id, endpoint_hash, notice_id, kind, day)
);
create index push_sent_day on push_sent (day);
-- 학생을 가리키는 값이 없다
create table daily_counts (day date not null, name text not null, n int not null, primary key (day, name));
