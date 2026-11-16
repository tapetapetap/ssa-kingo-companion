// 교과 지도의 타입. 값은 src/data/courses/, 정본 표는 specs/20261116-055246-sw-course-map/data.md.

export const TERMS = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'] as const;
export type Term = (typeof TERMS)[number];
export const isTerm = (x: unknown): x is Term => (TERMS as readonly unknown[]).includes(x);
/** 바로 다음 학기. 4학년 2학기의 다음은 그대로 4학년 2학기 */
export const nextTerm = (t: Term): Term => TERMS[Math.min(TERMS.indexOf(t) + 1, TERMS.length - 1)];
export const termLabel = (t: Term) => `${t[0]}학년 ${t[2]}학기`;

/** CSRankings(csrankings.org) 묶음 4개와 분야 27개. 이름은 src/data/courses/csrankings.ts */
export type CsrGroup = 'ai' | 'systems' | 'theory' | 'inter';
export type CsrArea =
  | 'ai' | 'vision' | 'mlmining' | 'nlp' | 'inforet'
  | 'arch' | 'comm' | 'sec' | 'mod' | 'da' | 'bed' | 'hpc' | 'mobile' | 'metrics' | 'ops' | 'plan' | 'soft'
  | 'act' | 'crypt' | 'log'
  | 'bio' | 'graph' | 'csed' | 'ecom' | 'chi' | 'robotics' | 'visualization';

export type FieldId = 'base' | 'ai' | 'ml' | 'vision' | 'arch' | 'os' | 'network' | 'security' | 'db' | 'pl' | 'se' | 'theory' | 'graphics' | 'experience';
/** 지도 줄. 분야 줄은 CSRankings 분야 하나 이상(같은 묶음 안), 기초·경험 줄은 CSRankings 밖 */
export type FieldDef = { id: FieldId; label: string; layer: 'field' | 'base' | 'experience'; group?: CsrGroup; areas: CsrArea[] };

export type CourseKind = 'core-basic' | 'core' | 'advanced' | 'lab' | 'grad' | 'project' | 'internship' | 'research' | 'startup';
export const KIND_LABEL: Record<CourseKind, string> = {
  'core-basic': '전공코어 기초필수', core: '전공코어', advanced: '전공심화', lab: '실험실습', grad: '학석공통',
  project: '프로젝트', internship: '현장실습', research: '연구학점', startup: '창업'
};
export const isCore = (k: CourseKind) => k === 'core-basic' || k === 'core';

/** 학교 전체에서 학수번호 하나가 과목 하나다 */
export type Course = { code: string; name: string; credits: number; dept: string; offered: boolean };
/** 전공 안의 자리: 칸은 term(경험 층은 null), 줄은 field */
export type Placement = { code: string; term: Term | null; kind: CourseKind; field: FieldId; area?: CsrArea };
/** from 을 먼저 듣는다(과목 설명에 적힌 권장) */
export type Prereq = { from: string; to: string };

export type Major = {
  id: 'swe';
  name: string;
  /** 줄 연결을 누가 확인했나. 지금은 예시(학과 확인 전) */
  checked: 'example' | 'dept';
  fields: FieldDef[];
  placements: Placement[];
  prereqs: Prereq[];
};

export type Direction = { id: string; name: string; side: '연구' | '산업' | '둘 다'; area: CsrArea; labs: string[] };
export type Lab = {
  id: string; prof: string; name: string; url?: string; areas: CsrArea[]; topics: string[];
  undergrad: 'open' | 'member' | 'none'; alumni: string; courses: string[];
};

export type CourseState = { term: Term | null; taken: string[]; direction: string | null };
