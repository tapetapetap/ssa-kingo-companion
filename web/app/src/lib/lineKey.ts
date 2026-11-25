// 뺀 줄의 열쇠를 사람이 읽을 말로(T036). 열쇠 꼴은 server/analysis/lines.ts에 있다
export function lineText(key: string, textOf: (key: string) => string | undefined, fieldName: (id: string) => string | undefined): string {
  const now = textOf(key);
  if (now) return now;
  const i = key.indexOf(':');
  const [kind, rest] = i < 0 ? [key, ''] : [key.slice(0, i), key.slice(i + 1)];
  const field = () => fieldName(rest) ?? '지금 목록에 없는 분야';
  switch (kind) {
    case 'ans': return '처음 질문 답';
    case 'picked': return '고른 분야';
    case 'act': return '지운 활동';
    case 'liked': return `관심 있어요가 몰린 분야: ${field()}`;
    case 'disliked': return `관심 없음이 몰린 분야: ${field()}`;
    case 'flow': return `컴패니언이 본 흐름 한 줄(근거: ${rest.split('+').map(k => lineText(k, textOf, fieldName)).join(', ')})`;
    default: return '지금은 없는 줄';
  }
}
