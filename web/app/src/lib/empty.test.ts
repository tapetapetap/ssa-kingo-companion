import { expect, it } from 'vitest';
import { homeEmpty, listEmpty } from './empty.ts';

it('까닭마다 글과 할 일. 같은 no_match도 홈과 목록이 다르고, 모르는 까닭도 글이 있다', () => {
  expect(homeEmpty('fields_not_done').link?.href).toBe('/me/fields');
  expect(homeEmpty('no_match').link?.href).toBe('/notices');
  expect(listEmpty('no_match')).toEqual({ title: '찾는 말이나 필터에 맞는 공지가 없어요', clear: true });
  expect(homeEmpty('no_open_notices').link).toBeUndefined();
  for (const r of ['x', null, 'constructor']) expect(typeof homeEmpty(r).title).toBe('string');
});
