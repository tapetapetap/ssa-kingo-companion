// 앱 하나에 하나인 카드 행동 저장소
import { useSyncExternalStore } from 'react';
import { api, type Action, type Draft, type NoticeCard } from '../api.ts';
import { createActions, type Done } from './actions.ts';
import { kstToday } from './date.ts';

export const actions = createActions(async (id, want): Promise<Done> => {
  const path = `/api/notices/${encodeURIComponent(id)}/action`;
  if (want) return api<{ action: Action; suggestActivity: Draft | null }>('PUT', path, want);
  await api('DELETE', path);
  return { action: null, suggestActivity: null };
});
/** 행동이 바뀌면 다시 그린다 */
export const useActions = () => useSyncExternalStore(actions.subscribe, actions.version);

/** 카드가 든 답을 받고, 이 앱이 들고 있는 행동을 서버의 것으로 맞춘다 */
export async function withCards<T>(method: string, path: string, cardsOf: (data: T) => NoticeCard[]): Promise<T> {
  const asked = performance.now();
  const data = await api<T>(method, path);
  actions.know(cardsOf(data), asked);
  return data;
}

/** 서버가 목록에서 숨기는 것: 관심 없음, 다시 볼 날 전인 나중에 보기(2단계 FR-026) */
export function hidden(n: NoticeCard): boolean {
  const a = actions.of(n);
  return a?.kind === 'dislike' || (a?.kind === 'later' && !!a.revisitOn && a.revisitOn > kstToday());
}
