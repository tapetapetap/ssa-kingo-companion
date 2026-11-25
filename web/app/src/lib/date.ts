// 날짜는 기기 시간대와 상관없이 한국 날짜(YYYY-MM-DD)로 센다(contracts/app.md 4)
const DAY = 86400_000;
export const kstDay = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
export const kstToday = () => kstDay(new Date());

export function dday(deadline: string | null, today: string): string {
  if (!deadline) return '마감 없음';
  const n = Math.round((Date.parse(deadline) - Date.parse(today)) / DAY);
  return n === 0 ? '오늘 마감' : n > 0 ? `D-${n}` : '마감 지남';
}

// 1학기 3~8월, 2학기 9~2월. 1~2월은 앞 해의 2학기이고 앞 학년도다(2단계 termStart와 같다)
const ym = (day: string) => [Number(day.slice(0, 4)), Number(day.slice(5, 7))];
const schoolYear = (day: string) => { const [y, m] = ym(day); return m < 3 ? y - 1 : y; };
const term = (day: string): 1 | 2 => { const m = ym(day)[1]; return m >= 3 && m <= 8 ? 1 : 2; };
/** 이 날의 학기: '2026-2' */
export const termOf = (day: string) => `${schoolYear(day)}-${term(day)}`;

/** 고를 수 있는 학기: 이번 학기부터 다섯 해 앞까지(고른 학기가 그보다 앞이면 그것도) */
export function termsBefore(today: string, chosen = ''): string[] {
  const [y, t] = termOf(today).split('-').map(Number);
  const out = Array.from({ length: 12 }, (_, i) => { const n = y * 2 + t - 1 - i; return `${Math.floor(n / 2)}-${(n % 2) + 1}`; });
  return chosen && !out.includes(chosen) ? [...out, chosen] : out;
}

/** 처음 질문에 답한 학기가 지났으면 바꿀 값(FR-019). 바뀌는 것이 없으면 null */
export function termSuggestion(answers: { grade: number; term: number; answeredAt: string }, today: string): { grade: number; term: 1 | 2 } | null {
  const answered = kstDay(new Date(answers.answeredAt));
  if (termOf(answered) === termOf(today)) return null;
  const next = { grade: Math.min(4, answers.grade + schoolYear(today) - schoolYear(answered)), term: term(today) };
  return next.grade === answers.grade && next.term === answers.term ? null : next;
}
