// 숫자와 때를 화면 글로(한국 시간)
const at = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' });
export const when = (iso: string) => at.format(new Date(iso));
export const dayText = (day: string) => `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일`;
export const num = (n: number | null | undefined) => (typeof n === 'number' ? n.toLocaleString('ko-KR') : '없음');
export const took = (s: number) => (s < 60 ? `${Math.round(s)}초` : s < 3600 ? `${Math.round(s / 60)}분` : `${Math.floor(s / 3600)}시간 ${Math.round((s % 3600) / 60)}분`);
export const percent = (num: number, den: number) => (den ? `${((num / den) * 100).toFixed(1)}%` : '없음');
