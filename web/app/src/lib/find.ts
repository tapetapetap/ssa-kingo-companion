// 분야 찾기(FR-011): 띄어쓰기와 대소문자를 가리지 않는다
const flat = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, '');
export function findFields<T extends { name: string }>(fields: T[], q: string): T[] {
  const k = flat(q);
  return k ? fields.filter(f => flat(f.name).includes(k)) : fields;
}
