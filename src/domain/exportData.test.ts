import { describe, expect, it } from 'vitest';
import { INITIAL_STATE } from '../app/state';
import { exportMine, exportText } from './exportData';

describe('exportMine', () => {
  it('입력한 것만 담고 분석 결과(발견 확인, 근거)는 담지 않는다', () => {
    const out = exportMine(INITIAL_STATE);
    expect(Object.keys(out)).toEqual(expect.arrayContaining(['프로필', '활동', '기록', '설정', '알림', '공개범위']));
    expect(Object.keys(out)).not.toContain('confirm');
    expect(Object.keys(out)).not.toContain('reqEvidence');
  });
  it('교과 지도는 이름으로 담고 과목표에 없는 값은 뺀다', () => {
    expect(exportMine(INITIAL_STATE).교과).toMatchObject({ 지금학기: '3학년 2학기', 진로방향: '고르지 않음' });
    const s = { ...INITIAL_STATE, courses: { term: null, taken: ['SWE3004', 'NOPE000'], direction: 'search' } };
    expect(exportMine(s).교과).toEqual({ 지금학기: '고르지 않음', 들은과목: ['운영체제'], 진로방향: '검색·추천 엔지니어' });
  });
  it('글로 바꿔도 다시 읽힌다', () => {
    expect(() => JSON.parse(exportText(INITIAL_STATE))).not.toThrow();
  });
});
