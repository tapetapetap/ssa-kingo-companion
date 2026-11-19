// 시험용 결과 파일 조각(결과 파일 계약을 지키는 가짜 값)
export const url = (no: number) => `https://cse.skku.edu/cse/notice.do?mode=view&articleNo=${no}`;
export const opp = (no: number, o: Record<string, unknown> = {}) => ({
  id: `cse:${no}`, title: `제목 ${no}`, url: url(no), postedAt: '2026-11-01', host: '가나다', kind: 'job', deadline: '2026-11-20', rule: 'LLM: gemma4:12b', deadlineRule: '제목', ...o
});
export const review = (no: number) => ({ id: `cse:${no}`, title: `안내 ${no}`, url: url(no), postedAt: '2026-11-02', why: 'LLM 확신 낮음' });
export const file = (o: Record<string, unknown> = {}) => ({ source: 'https://cse.skku.edu/cse/notice.do', collectedAt: '2026-11-10T06:45:56.700Z', since: '2026-08-12', opportunities: [opp(2), opp(1)], review: [review(3)], ...o });
