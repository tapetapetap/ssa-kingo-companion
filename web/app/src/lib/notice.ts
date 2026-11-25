// 공지 한 건을 화면 글로
import { KIND_LABEL } from '../../../../etl/notices/classify.ts';
import type { Action, NoticeCard } from '../api.ts';
import { dday } from './date.ts';

export const KINDS = Object.entries(KIND_LABEL);
export const kindName = (k: string | null) => (k ? KIND_LABEL[k as keyof typeof KIND_LABEL] ?? k : null);

/** 마감 표시. 급한 것(오늘~3일 안)은 눈에 띄게 한다. 마감 없이 닫힌 공지는 '닫힘'이다 */
export function due(n: Pick<NoticeCard, 'deadline' | 'open' | 'down'>, today: string): { text: string; urgent: boolean } {
  if (n.down) return { text: '내려감', urgent: false };
  if (!n.open) return { text: n.deadline ? '마감 지남' : '닫힘', urgent: false };
  const text = dday(n.deadline, today);
  return { text, urgent: text === '오늘 마감' || /^D-[1-3]$/.test(text) };
}

export const dayText = (day: string) => `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일`;
export const actionText = (a: Action | null) => (!a ? null : a.kind === 'like' ? '관심 있어요' : a.kind === 'dislike' ? '관심 없음' : `${dayText(a.revisitOn!)}에 다시 보기`);
/** 분야를 누가 붙였는가(contracts/app.md 6) */
export const byText = (by: string | null) => (by === '운영자' ? '운영자 확인' : 'AI 추정');
