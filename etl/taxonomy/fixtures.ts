// 시험용 분야 목록: 검사를 통과하는 가장 작은 목록을 코드로 만든다. 시험만 쓴다(goldfish 리뷰 8)
import { CSR_AREAS } from '../../src/data/courses/csrankings.ts';
import { COURSE_ROWS, type Field, type Taxonomy, type TaxonomyId } from './taxonomy.ts';

/** 1안·3안이 함께 쓰는 직무 11개(research R8 표) */
export const JOBS: [string, string][] = [
  ['backend', '백엔드'], ['frontend', '프론트엔드'], ['mobile-app', '모바일 앱'], ['cloud', '클라우드·인프라'],
  ['data-eng', '데이터 엔지니어링'], ['qa', 'QA·테스트'], ['data-analysis', '데이터 분석'], ['ml-eng', 'ML 엔지니어링'],
  ['security-eng', '보안 엔지니어링'], ['embedded', '임베디드·펌웨어'], ['game', '게임 개발']
];

const field = (id: string, name: string, group: string, csr: string[] = [], desc = `${name}을 다루는 일`): Field =>
  ({ id, name, group, desc, descFrom: 'made', csr, ncs: null });
const noRows = () => Object.fromEntries(COURSE_ROWS.map(r => [r, [] as string[]]));

/** custom은 묶음 10·분야 80(CSRankings 27키 하나씩 + 직무 11 + 채움 42), csrankings는 연구 27 + 직무 11, ncs는 분야 3 */
export function validList(id: TaxonomyId): Taxonomy {
  const head = { id, name: `시험 ${id}`, edition: '2026-11-16', sources: [], sourceCounts: null, chosen: null };
  if (id === 'custom') {
    const groups = Array.from({ length: 10 }, (_, i) => ({ id: `g-a${i}`, name: `묶음 ${i}`, parent: null }));
    const fields = [
      ...CSR_AREAS.map((a, i) => field(`csr-${a.id}`, `연구 ${a.label}`, `g-a${i % 9}`, [a.id])),
      ...JOBS.map(([jid, name]) => field(jid, name, 'g-a9')),
      ...Array.from({ length: 42 }, (_, i) => field(`fill-${i}`, `채움 ${i}`, `g-a${i % 10}`))
    ];
    return { ...head, groups, fields, courseMap: { ...noRows(), ai: ['csr-ai'] } };
  }
  if (id === 'csrankings') {
    const groups = [['g-ai', 'AI'], ['g-systems', '시스템'], ['g-theory', '이론'], ['g-inter', '융합'], ['g-job', '개발 직무']]
      .map(([gid, name]) => ({ id: gid, name, parent: null }));
    const fields = [
      ...CSR_AREAS.map(a => field(a.id, a.label, `g-${a.group}`, [a.id], `(${a.id}) ${a.label}을 연구한다`)),
      ...JOBS.map(([jid, name]) => field(jid, name, 'g-job'))
    ];
    return { ...head, groups, fields, courseMap: { ...noRows(), vision: ['vision', 'nlp'] } };
  }
  const groups = [{ id: 'ncs-20', name: '정보통신', parent: null }, { id: 'ncs-2001', name: '정보기술', parent: 'ncs-20' }];
  const fields = ['정보기술전략·계획', '정보기술개발', '정보기술운영'].map((name, i): Field =>
    ({ id: `ncs-20010${i + 1}`, name, group: 'ncs-2001', desc: `세분류 ${i}가, 세분류 ${i}나`, descFrom: 'source', csr: [], ncs: `20010${i + 1}` }));
  return { ...head, sourceCounts: { major: 1, middle: 1, minor: 3, detail: 6 }, groups, fields, courseMap: noRows() };
}
