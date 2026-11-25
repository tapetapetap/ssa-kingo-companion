// SC-009의 정적 확인: 서버 코드가 바깥으로 여는 곳은 모델 서버(model.ts)와 api 상태 확인(jobs/status.ts)뿐이다
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const p = join(dir, e.name);
  return e.isDirectory() ? (e.name === 'test' ? [] : files(p)) : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [p] : [];
});
const src = files(join(ROOT, 'server')).map(p => ({ path: relative(ROOT, p), text: readFileSync(p, 'utf8') }));

describe('바깥으로 나가는 곳 (SC-009, FR-042)', () => {
  it('fetch·http.request·net.connect는 model.ts와 jobs/status.ts에만 있다', () => {
    const open = src.filter(f => /\bfetch\(|http\.request\(|net\.connect\(/.test(f.text)).map(f => f.path);
    expect(open.every(p => ['server/model.ts', 'server/jobs/status.ts'].includes(p))).toBe(true);
  });

  it('web-push를 가져오는 곳은 push/send.ts 하나이고, api(main.ts)가 시작할 때 가져오는 파일에는 없다(3단계 FR-037)', () => {
    expect(src.filter(f => /from 'web-push'/.test(f.text)).map(f => f.path)).toEqual(['server/push/send.ts']);
    const seen = new Set<string>();
    const walk = (path: string) => {
      if (seen.has(path)) return;
      seen.add(path);
      for (const m of readFileSync(join(ROOT, path), 'utf8').matchAll(/(?:from|import\()\s*'(\.[^']+\.ts)'/g)) walk(relative(ROOT, resolve(ROOT, path, '..', m[1])));
    };
    walk('server/main.ts');
    expect(seen.has('server/push/routes.ts')).toBe(true);
    expect([...seen].filter(p => p === 'server/push/send.ts' || p === 'server/cli.ts')).toEqual([]);
  });

  it('server/가 가져오는 etl/ 파일은 정한 목록뿐이다', () => {
    const allowed = ['etl/taxonomy/taxonomy.ts', 'etl/notices/embed.ts', 'etl/notices/throttle.ts', 'etl/notices/sensors.ts', 'etl/notices/llm.ts',
      'etl/notices/fields.ts', 'etl/notices/cse.ts', 'etl/notices/gold.ts', 'etl/notices/classify.ts',
      // 모델 재기(3단계 R15)가 셈에 쓴다. 학교 서버를 부르는 함수는 아래 시험이 막는다
      'etl/notices/score.ts', 'etl/notices/eval.ts', 'etl/notices/run.ts'];
    const used = new Set(src.flatMap(f => [...f.text.matchAll(/from '((?:\.\.\/)+etl\/[^']+)'/g)].map(m => relative(ROOT, resolve(ROOT, f.path, '..', m[1])))));
    expect([...used].filter(p => !allowed.includes(p))).toEqual([]);
  });

  it('server/는 학교 서버를 부르는 함수(makeGet·listSince·collect)를 쓰지 않는다', () => {
    expect(src.filter(f => /\b(makeGet|listSince|collect)\(/.test(f.text)).map(f => f.path)).toEqual([]);
  });

  it('postOnce·makeEmbed·fetchPost는 model.ts와 ingest/vectors.ts만 부른다', () => {
    const callers = src.filter(f => /\b(postOnce|makeEmbed|fetchPost)\(|\?\? fetchPost\b/.test(f.text)).map(f => f.path);
    expect(callers.every(p => ['server/model.ts', 'server/ingest/vectors.ts'].includes(p))).toBe(true);
  });
});
