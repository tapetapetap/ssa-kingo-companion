import { describe, expect, it } from 'vitest';
import { logError, logRequest } from './log.ts';

describe('서버 기록 (research R18, FR-047)', () => {
  it('요청 기록은 한 줄 JSON이고 정한 칸만 있다', () => {
    const lines: string[] = [];
    logRequest({ method: 'PUT', route: '/api/me/prompt', status: 200, ms: 12.4, student: 7, body: { body: '비밀 프롬프트' }, cookie: 'kingo_session=abc' } as never, l => { lines.push(l); });
    expect(lines).toHaveLength(1);
    const o = JSON.parse(lines[0]);
    expect(Object.keys(o).sort()).toEqual(['at', 'kind', 'method', 'ms', 'route', 'status', 'student']);
    expect(lines[0]).not.toContain('비밀');
    expect(lines[0]).not.toContain('abc');
  });

  it('오류 기록은 오류의 첫 줄만 남긴다', () => {
    const lines: string[] = [];
    logError('/api/x', new Error('터짐\n둘째 줄'), l => { lines.push(l); });
    expect(JSON.parse(lines[0])).toMatchObject({ kind: 'error', route: '/api/x', message: 'Error: 터짐' });
  });
});
