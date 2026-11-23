import { describe, expect, it } from 'vitest';
import { clusters, factLines, termStart, toMd, visible, type Material } from './lines.ts';

const NAMES: Record<string, string> = { backend: '백엔드', database: '데이터베이스', llm: 'LLM·생성형 AI', frontend: '프론트엔드' };
const base = (o: Partial<Material> = {}): Material => ({
  answers: { grade: 3, term: 2, goal: 'job' }, picked: ['backend', 'database', 'llm'], activities: [], actions: [],
  fieldName: id => NAMES[id], fieldOrder: ['backend', 'database', 'llm', 'frontend'], today: '2026-11-20', ...o
});

describe('나의 분석 줄과 md (research R10)', () => {
  it('md가 R10의 예와 글자까지 같다', () => {
    const m = base({
      activities: [
        { id: 2, name: '오픈소스 기여 캠프', term: '2025-1', kind: 'edu', fieldNames: [], proofUrl: 'https://x' },
        { id: 1, name: '교내 해커톤', term: '2025-2', kind: 'hackathon', fieldNames: ['백엔드'], proofUrl: null }
      ],
      actions: [{ kind: 'dislike', reason: 'field', at: '2026-10-01', core: ['frontend'] }, { kind: 'dislike', reason: 'hard', at: '2026-11-01', core: ['frontend'] }]
    });
    expect(toMd(visible(factLines(m), [], new Set()))).toBe(`# 나의 분석

## 해 온 활동
- 2025-2 · 교내 해커톤 · 해커톤 · 백엔드 (직접 입력, 증빙 없음)
- 2025-1 · 오픈소스 기여 캠프 · 교육·캠프 (직접 입력, 증빙 링크)

## 관심 분야
- 처음 답: 3학년 2학기, 취업 (처음 질문)
- 고른 분야: 백엔드, 데이터베이스, LLM·생성형 AI (분야 고르기)
- 관심 없음이 몰린 분야: 프론트엔드 (앱 기록)

## 컴패니언이 본 흐름
- 아직 없어요.
`);
    expect(factLines(m).map(l => l.key)).toEqual(['act:1', 'act:2', 'ans', 'picked', 'disliked:frontend']);
  });

  it('4학년은 4학년 이상, 빈 칸은 아직 없어요', () => {
    const md = toMd(visible(factLines(base({ answers: { grade: 4, term: 1, goal: 'unsure' }, picked: [] })), [], new Set()));
    expect(md).toContain('- 처음 답: 4학년 이상 1학기, 아직 모름 (처음 질문)');
    expect(md).toContain('## 해 온 활동\n- 아직 없어요.');
  });

  it.each<[string, Material['actions'], string[], string[]]>([
    ['관심 있어요 30일 안 2번', [{ kind: 'like', reason: null, at: '2026-11-01', core: ['llm'] }, { kind: 'like', reason: null, at: '2026-11-19', core: ['llm', 'backend'] }], ['llm'], []],
    ['30일 밖은 세지 않음', [{ kind: 'like', reason: null, at: '2026-10-20', core: ['llm'] }, { kind: 'like', reason: null, at: '2026-11-19', core: ['llm'] }], [], []],
    ['관심 없음 이유가 time·done이면 세지 않음', [{ kind: 'dislike', reason: 'time', at: '2026-11-01', core: ['qa'] }, { kind: 'dislike', reason: 'done', at: '2026-11-02', core: ['qa'] }], [], []],
    ['관심 없음은 이번 학기 안만', [{ kind: 'dislike', reason: 'field', at: '2026-08-31', core: ['frontend'] }, { kind: 'dislike', reason: 'field', at: '2026-09-01', core: ['frontend'] }], [], []],
    ['분야가 없는 공지는 세지 않음', [{ kind: 'like', reason: null, at: '2026-11-01', core: [] }, { kind: 'like', reason: null, at: '2026-11-02', core: [] }], [], []]
  ])('몰린 분야: %s', (_n, actions, liked, disliked) => {
    expect(clusters({ actions, today: '2026-11-20', fieldOrder: ['backend', 'llm', 'frontend', 'qa'] })).toEqual({ liked, disliked });
  });

  it('1월의 이번 학기는 앞 해 9월 1일부터다', () => {
    expect([termStart('2027-01-15'), termStart('2026-03-01'), termStart('2026-12-31')]).toEqual(['2026-09-01', '2026-03-01', '2026-09-01']);
  });

  it('뺀 줄은 빠지고, 흐름은 보이는 줄만 가리킬 때 남는다', () => {
    const facts = factLines(base({ actions: [{ kind: 'like', reason: null, at: '2026-11-01', core: ['llm'] }, { kind: 'like', reason: null, at: '2026-11-02', core: ['llm'] }] }));
    const flow = [{ key: 'flow:liked:llm+picked', text: 'LLM을 꾸준히 봐요', refs: ['picked', 'liked:llm'] }, { key: 'flow:act:9+ans', text: '없는 줄', refs: ['ans', 'act:9'] }];
    expect(visible(facts, flow, new Set()).map(l => l.key)).toEqual(['ans', 'picked', 'liked:llm', 'flow:liked:llm+picked']);
    expect(visible(facts, flow, new Set(['liked:llm'])).map(l => l.key)).toEqual(['ans', 'picked']);
    expect(visible(facts, flow, new Set(['flow:liked:llm+picked'])).map(l => l.key)).toEqual(['ans', 'picked', 'liked:llm']);
  });
});
