import { worldOf } from '../../domain/courses/plan';
import type { CsrArea, CsrGroup } from '../../domain/courses/types';
import { COURSES } from './catalog';
import { CSR_AREAS } from './csrankings';
import { DIRECTIONS, LABS } from './directions';
import { SWE } from './swe';

/** 소프트웨어학과 교과 지도가 쓰는 찾기 표(과목표·배치·선수·연구실·방향) */
export const WORLD = worldOf(SWE, COURSES, LABS, DIRECTIONS);
export const AREA_GROUP = new Map<CsrArea, CsrGroup>(CSR_AREAS.map(a => [a.id, a.group]));
export const areaLabel = (a: CsrArea) => CSR_AREAS.find(x => x.id === a)?.label ?? a;
