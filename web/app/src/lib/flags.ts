// 안내를 한 번 보였다는 표시(research R17). 저장소를 못 쓰면 안내가 다시 보일 뿐이다
export function flag(key: string): string | null {
  try {
    return localStorage.getItem(`kingo-${key}`);
  } catch {
    return null;
  }
}
export function setFlag(key: string, value = '1') {
  try {
    localStorage.setItem(`kingo-${key}`, value);
  } catch { /* 다시 보일 뿐이다 */ }
}
