// DB 연결(research R3). 스키마를 주면 그 스키마를 먼저 찾고 pgvector가 있는 public을 뒤에 둔다(시험은 파일마다 스키마가 다르다, R19)
import postgres from 'postgres';

export type Sql = postgres.Sql;

export function connect(url: string, schema = 'public'): Sql {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`스키마 이름 꼴이 아니에요: ${schema}`);
  return postgres(url, { max: 10, onnotice: () => {}, connection: { search_path: schema === 'public' ? 'public' : `${schema}, public` } });
}
