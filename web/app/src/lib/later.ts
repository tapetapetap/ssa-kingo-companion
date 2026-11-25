// 나중에 보기에서 고를 수 있는 날: 내일부터 닫히는 날까지, 기본은 3일 뒤와 닫히는 날 가운데 이른 날(FR-015)
import { LATER_DAYS } from './values.ts';

const add = (day: string, n: number) => new Date(Date.parse(day) + n * 86400_000).toISOString().slice(0, 10);
/** 오늘 닫히는 공지면 null(나중에 볼 날이 없다) */
export function laterRange(closesOn: string, today: string): { min: string; max: string; value: string } | null {
  if (closesOn <= today) return null;
  const three = add(today, LATER_DAYS);
  return { min: add(today, 1), max: closesOn, value: three < closesOn ? three : closesOn };
}
