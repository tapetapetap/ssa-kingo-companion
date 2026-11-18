-- 바탕(research R4·R19): pgvector는 DB에 하나라 public에 둔다. schema_migrations는 migrate.ts가 먼저 만든다
create extension if not exists vector with schema public;
