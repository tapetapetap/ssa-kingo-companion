// 화면이 열릴 때 한 번 불러오고, 실패하면 다시 부를 수 있게 한다. 화면이 바뀐 뒤 온 답은 버린다.
// key를 주면 뒤로 가기로 돌아왔을 때 앞 자료를 바로 보이고(같은 자리로 돌아가게) 조용히 새로 고친다.
// keep이면 새로 고치지도 않는다(이어 받은 쪽이 줄지 않게)
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { ApiError } from '../api.ts';
import { cameBack } from '../route.ts';

const kept = new Map<string, unknown>();
/** 로그인한 학생이 바뀌면 앞 학생의 자료를 버린다 */
export const forget = () => kept.clear();

export function useLoad<T>(fn: () => Promise<T>, deps: DependencyList, key?: string, keep = false) {
  const [s, set] = useState<{ data: T | null; error: unknown }>(() => ({ data: key && cameBack() ? (kept.get(key) as T) ?? null : null, error: null }));
  const live = useRef(0);
  const run = useCallback(async (quiet: boolean) => {
    const mine = ++live.current;
    if (!quiet) set({ data: null, error: null });
    try {
      const data = await fn();
      if (mine !== live.current) return;
      if (key) kept.set(key, data);
      set({ data, error: null });
    } catch (error) {
      if (mine !== live.current) return;
      // 조용히 새로 고칠 때 끊김은 앞 자료를 두고, 없어진 자료는 없어졌다고 보인다
      const gone = error instanceof ApiError && error.code === 'not_found';
      if (gone && key) kept.delete(key);
      if (!quiet || gone) set({ data: null, error });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 무엇이 바뀌면 다시 부를지는 부르는 쪽이 정한다
  }, deps);
  useEffect(() => {
    const back = !!key && cameBack() && kept.has(key);
    if (!back || !keep) void run(back);
    return () => { live.current++; };
  }, [run, key, keep]);
  /** 받은 자료를 고쳐 둔다(이어 불러오기) */
  const put = useCallback((data: T) => {
    if (key) kept.set(key, data);
    set({ data, error: null });
  }, [key]);
  return { ...s, set: put, reload: useCallback(() => void run(false), [run]), refresh: useCallback(() => run(true), [run]) };
}
