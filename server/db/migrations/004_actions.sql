-- 카드 행동(US4, data-model 4): 학생·공지마다 지금 상태 하나
create table actions (
  student_id bigint not null references students on delete cascade,
  notice_id text not null references notices,
  kind text not null check (kind in ('like', 'later', 'dislike')),
  revisit_on date check ((kind = 'later') = (revisit_on is not null)),
  reason text check (reason is null or (reason in ('time', 'field', 'done', 'hard') and kind = 'dislike')),
  at timestamptz not null default now(),
  primary key (student_id, notice_id)
);
