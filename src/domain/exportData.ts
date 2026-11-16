import type { AppState } from '../app/state';
import { termLabel } from './courses/types';
import { WORLD } from '../data/courses';

/** 내려받기용 내 데이터. 학생이 입력한 것과 고른 것만 담는다. 발견·역량 근거 같은 분석 결과는 담지 않는다. */
export function exportMine(s: AppState): Record<string, unknown> {
  return {
    내려받은곳: '킹고 컴패니언 프로토타입(예시 데이터)',
    프로필: s.profile,
    활동: s.activities,
    기록: s.records,
    설정: s.settings,
    알림: s.notify,
    공개범위: s.visibility,
    // 과목표·방향에 없는 옛 값은 빼고 이름으로
    교과: {
      지금학기: s.courses.term ? termLabel(s.courses.term) : '고르지 않음',
      들은과목: s.courses.taken.flatMap(c => WORLD.course.has(c) ? [`${WORLD.course.get(c)!.name}(${c})`] : []),
      진로방향: WORLD.directions.find(d => d.id === s.courses.direction)?.name ?? '고르지 않음'
    }
  };
}

/** 사람이 읽을 수 있게 들여쓴 JSON 글 */
export const exportText = (s: AppState): string => JSON.stringify(exportMine(s), null, 2);
