// 화면이 열릴 때 한 번 불러오고, 실패하면 다시 부를 수 있게 한다. 화면이 바뀐 뒤 온 답은 버린다
import { useCallback, useEffect, useState, type DependencyList } from 'react';

export function useLoad<T>(fn: () => Promise<T>, deps: DependencyList): { data: T | null; error: unknown; reload: () => void } {
  const [s, set] = useState<{ data: T | null; error: unknown }>({ data: null, error: null });
  const [n, setN] = useState(0);
  useEffect(() => {
    let on = true;
    set({ data: null, error: null });
    fn().then(data => { if (on) set({ data, error: null }); }, error => { if (on) set({ data: null, error }); });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 무엇이 바뀌면 다시 부를지는 부르는 쪽이 정한다
  }, [...deps, n]);
  return { ...s, reload: useCallback(() => setN(x => x + 1), []) };
}
