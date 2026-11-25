// 쓰던 글(research R17): 로그인이 끊겨 저장하지 못한 프롬프트·활동을 이 탭에만 잠깐 두고, 같은 학생이 다시 로그인하면 그 화면에 채운다
const KEY = 'kingo-draft';
let writing: { path: string; body: unknown } | null = null;

/** 지금 쓰고 있는 글. 저장했거나 화면을 떠나면 null */
export const writingNow = (path: string | null, body?: unknown) => { writing = path ? { path, body } : null; };

/** 로그인이 끊긴 순간. 글을 되살릴 화면의 주소를 준다 */
export function stash(tag: string): string | null {
  if (!writing || !tag) return null;
  const { path } = writing;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ tag, ...writing }));
  } catch { /* 저장소가 막혀 있으면 남기지 못한다 */ }
  writing = null;
  return path;
}
/** 다른 학생이 들어오면 버린다 */
export function dropOther(tag: string) {
  if (read()?.tag !== tag) remove();
}
/** 이 화면에 되살릴 글. 화면이 글을 받아 쓰기 시작하면 clear로 지운다 */
export function draftOf<T>(path: string): T | null {
  const d = read();
  return d?.path === path ? (d.body as T) : null;
}
export function clear(path: string) {
  if (read()?.path === path) remove();
}
function read(): { tag: string; path: string; body: unknown } | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}
function remove() {
  try {
    sessionStorage.removeItem(KEY);
  } catch { /* 위와 같다 */ }
}
