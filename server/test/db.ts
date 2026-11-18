// DB 시험 틀(research R19): 시험 파일마다 새 스키마를 만들어 마이그레이션을 적용하고, 끝나면 지운다. DB가 없으면 건너뛰지 않고 실패한다
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { migrate } from '../db/migrate.ts';
import { connect, type Sql } from '../db/sql.ts';

export const DEV_DATABASE_URL = 'postgres://kingo:kingo@127.0.0.1:54329/kingo';
export const dbUrl = () => process.env.DATABASE_URL || DEV_DATABASE_URL;

export async function testDb(): Promise<{ sql: Sql; schema: string; close: () => Promise<void> }> {
  const admin = postgres(dbUrl(), { max: 1, onnotice: () => {} });
  try {
    await admin`select 1`;
  } catch {
    await admin.end({ timeout: 0 });
    throw new Error('DB 시험에는 Postgres가 필요해요: docker compose -f deploy/compose.dev.yaml up -d');
  }
  // 확장은 DB에 하나라 여러 시험 파일이 함께 시작해도 한 번만 만들게 잠근다
  await admin.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('kingo:test:extension'))`;
    await tx`create extension if not exists vector with schema public`;
  });
  const schema = `t_${randomBytes(6).toString('hex')}`;
  await admin.unsafe(`create schema ${schema}`);
  const sql = connect(dbUrl(), schema);
  await migrate(sql);
  return {
    sql, schema,
    close: async () => {
      await sql.end({ timeout: 5 });
      await admin.unsafe(`drop schema ${schema} cascade`);
      await admin.end({ timeout: 5 });
    }
  };
}
