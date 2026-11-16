import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { validList } from '../taxonomy/fixtures.ts';
import type { NoticeRow } from './cse.ts';
import { EMBED_K, fieldText, fieldVectors, makeEmbed, noticeText, noticeVector, readFieldVectors, readNoticeVector, topCandidates } from './embed.ts';
import type { Gate, Post } from './llm.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'embed-'));
const row = (no: number, title = '[가나다] 드론 영상 분석 대회'): NoticeRow => ({ no, title, board: '채용/모집', postedAt: '2026-11-01', pinned: false });
/** 글마다 정해진 2차원 벡터를 주는 가짜 /api/embed(직접 만든 값) */
const vec = (s: string) => [s.length % 7, 1];
const okPost = () => vi.fn<Post>(async (_url, body) => {
  const { input } = JSON.parse(body) as { input: string[] };
  return { status: 200, text: async () => JSON.stringify({ model: 'bge-m3', embeddings: input.map(vec) }) };
});
const reply = (status: number, embeddings: unknown = []) => ({ status, text: async () => JSON.stringify({ embeddings }) });
const gateOf = (open: boolean[] = [true]): Gate & { after: ReturnType<typeof vi.fn> } =>
  ({ before: vi.fn(async () => (open.length > 1 ? open.shift()! : open[0])), after: vi.fn(async () => {}), noTemp: 0 });

describe('글 (research R17)', () => {
  it('분야 글은 묶음 경로 > 이름: 설명, 공지 글은 제목과 본문 앞 1,500자(본문이 없으면 제목만)', () => {
    const t = validList('ncs');
    expect(fieldText(t, t.fields[0])).toBe('정보통신 › 정보기술 > 정보기술전략·계획: 세분류 0가, 세분류 0나');
    expect(noticeText(row(1), ['첫 줄', '둘째 줄'])).toBe('[가나다] 드론 영상 분석 대회\n첫 줄\n둘째 줄');
    expect(noticeText(row(1), ['가'.repeat(2000)])).toBe(`[가나다] 드론 영상 분석 대회\n${'가'.repeat(1500)}`);
    expect(noticeText(row(1), [])).toBe('[가나다] 드론 영상 분석 대회');
  });
});

describe('makeEmbed: 요청과 실패 구분', () => {
  it('/api/embed에 model·input·truncate·keep_alive를 보내고 벡터를 돌려준다', async () => {
    const post = okPost();
    const embed = makeEmbed({ host: 'localhost:9', post });
    expect(await embed(['가', '나다'])).toEqual([vec('가'), vec('나다')]);
    const [url, body] = post.mock.calls[0];
    expect(url).toBe('http://localhost:9/api/embed');
    expect(JSON.parse(body)).toEqual({ model: 'bge-m3', input: ['가', '나다'], truncate: true, keep_alive: '10m' });
  });

  it.each([
    ['시간 초과', Object.assign(new Error('timeout'), { name: 'TimeoutError' })],
    ['HTTP 500', reply(500)],
    ['개수가 다름', reply(200, [[1, 2]])],
    ['차원이 다름', reply(200, [[1, 2], [1]])],
    ['차원 0', reply(200, [[], []])],
    ['수가 아님', reply(200, [[1, '2'], [3, 4]])]
  ])('%s는 fail이고 다음 요청은 보낸다', async (_name, first) => {
    const post = vi.fn<Post>().mockImplementationOnce(async () => { if (first instanceof Error) throw first; return first; }).mockImplementation(okPost());
    const embed = makeEmbed({ post });
    expect(await embed(['가', '나'])).toBe('fail');
    expect(await embed(['가', '나'])).toEqual([vec('가'), vec('나')]);
  });

  it.each([['연결 실패', 'net'], ['모델 없음(404)', 404]] as const)('%s는 down이고 그 뒤로 부르지 않는다', async (_name, how) => {
    const post = vi.fn<Post>(async () => { if (how === 'net') throw new TypeError('fetch failed'); return reply(404); });
    const embed = makeEmbed({ post });
    expect(await embed(['가'])).toBe('down');
    expect(await embed(['가'])).toBe('down');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('gate.before()가 false면 요청 없이 down이고 잠그지 않는다. 요청 뒤에는 결과와 상관없이 after(ms)', async () => {
    const gate = gateOf([false, true]);
    const post = vi.fn<Post>().mockResolvedValueOnce(reply(500)).mockImplementation(okPost());
    const embed = makeEmbed({ post, gate });
    expect(await embed(['가'])).toBe('down');
    expect(post).not.toHaveBeenCalled();
    expect(await embed(['가'])).toBe('fail');
    expect(await embed(['가'])).toEqual([vec('가')]);
    expect(gate.after).toHaveBeenCalledTimes(2);
  });
});

describe('벡터 보관', () => {
  it('분야 벡터는 32개씩 받아 <모델>/<안 id>-<목록 sha>.json에 두고, 다음에는 묻지 않는다', async () => {
    const [dir, post] = [tmp(), okPost()];
    const t = validList('custom'); // 분야 80개
    const fv = await fieldVectors(t, makeEmbed({ post }), dir);
    expect(post.mock.calls.map(c => (JSON.parse(c[1]) as { input: string[] }).input.length)).toEqual([32, 32, 16]);
    expect(fv).toEqual({ ids: t.fields.map(f => f.id), vectors: t.fields.map(f => vec(fieldText(t, f))) });
    const files = readdirSync(join(dir, 'bge-m3'));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^custom-[0-9a-f]{8}\.json$/);
    expect(Object.keys(JSON.parse(readFileSync(join(dir, 'bge-m3', files[0]), 'utf8')))).toEqual(['model', 'taxonomy', 'sha', 'at', 'ids', 'vectors']);
    expect(await fieldVectors(t, makeEmbed({ post }), dir)).toEqual(fv);
    expect(post).toHaveBeenCalledTimes(3);
    expect(readFieldVectors(t, dir)).toEqual(fv);
  });

  it('설명 한 글자를 바꾸면 목록 sha가 바뀌어 새 파일이고, 실패면 보관하지 않는다', async () => {
    const dir = tmp();
    const t = validList('ncs');
    await fieldVectors(t, makeEmbed({ post: okPost() }), dir);
    t.fields[0].desc += '.';
    expect(readFieldVectors(t, dir)).toBeNull();
    expect(await fieldVectors(t, makeEmbed({ post: vi.fn<Post>(async () => reply(500)) }), dir)).toBe('fail');
    expect(readdirSync(join(dir, 'bge-m3'))).toHaveLength(1);
    await fieldVectors(t, makeEmbed({ post: okPost() }), dir);
    expect(readdirSync(join(dir, 'bge-m3'))).toHaveLength(2);
  });

  it('공지 벡터는 notices/<번호>.json이고 글 sha가 같으면 묻지 않는다. 파일에 본문 글자가 없다', async () => {
    const [dir, post] = [tmp(), okPost()];
    const body = ['드론으로 찍은 영상에서 사람을 찾는 모델을 겨뤄요'];
    expect(await noticeVector(row(7), body, makeEmbed({ post }), dir)).toEqual(vec(noticeText(row(7), body)));
    expect(await noticeVector(row(7), body, makeEmbed({ post }), dir)).toEqual(vec(noticeText(row(7), body)));
    expect(post).toHaveBeenCalledTimes(1);
    const saved = readFileSync(join(dir, 'bge-m3', 'notices', '7.json'), 'utf8');
    expect(Object.keys(JSON.parse(saved))).toEqual(['model', 'sha', 'at', 'vector']);
    expect(saved).not.toContain('드론');
    await noticeVector(row(7), [...body, '접수 기간이 바뀌었어요'], makeEmbed({ post }), dir);
    expect(post).toHaveBeenCalledTimes(2);
    expect(readNoticeVector(7, dir)).toEqual(vec(noticeText(row(7), [...body, '접수 기간이 바뀌었어요'])));
  });

  it('readFieldVectors·readNoticeVector는 요청 없이 읽고, 없거나 꼴이 틀리면 null이다', () => {
    const dir = tmp();
    expect(readFieldVectors(validList('ncs'), dir)).toBeNull();
    expect(readNoticeVector(7, dir)).toBeNull();
    mkdirSync(join(dir, 'bge-m3', 'notices'), { recursive: true });
    writeFileSync(join(dir, 'bge-m3', 'notices', '7.json'), '{"vector": ["x"]}');
    expect(readNoticeVector(7, dir)).toBeNull();
  });
});

describe('topCandidates', () => {
  const fv = { ids: ['a', 'b', 'c', 'd'], vectors: [[1, 0], [0, 1], [1, 1], [2, 0]] };

  it('코사인 상위 k개를 목록 순서로 돌려준다. 같은 점수는 목록 앞이 먼저다', () => {
    expect(topCandidates(fv, [1, 0], 2)).toEqual(['a', 'd']); // a·d는 1, c는 0.707
    expect(topCandidates(fv, [1, 0], 1)).toEqual(['a']);
    expect(topCandidates(fv, [0, 1], 2)).toEqual(['b', 'c']);
  });

  it(`분야가 k개 이하면 모두 후보다(k 기본값 ${EMBED_K})`, () => {
    expect(topCandidates(fv, [1, 0])).toEqual(['a', 'b', 'c', 'd']);
    expect(topCandidates(fv, [0, 0], 4)).toEqual(['a', 'b', 'c', 'd']);
  });
});
