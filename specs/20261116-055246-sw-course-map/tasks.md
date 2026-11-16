# Tasks: 소프트웨어학과 교과 지도

**Input**: `specs/20261116-055246-sw-course-map/` 의 spec.md, plan.md, research.md, data-model.md, data.md, quickstart.md
**Tests**: 넣는다. CLAUDE.md '분기·계산 로직은 src/domain 에 두고 테스트를 남긴다'와 spec SC-001~SC-007.

형식: `- [ ] T### [P] [US#] 설명 (파일)`. [P] = 다른 파일이고 앞 작업에 기대지 않아 같이 해도 되는 일.

## Phase 1: Setup

- [X] T001 메뉴 아이콘 'book'(펼친 책, 기존 아이콘과 같은 선 굵기·24 viewBox)을 아이콘 표에 더한다 — `src/components/Icon.tsx`

## Phase 2: Foundational (모든 스토리 전에)

- [X] T002 타입과 학기 순서: `Term`, `TERMS`, `nextTerm`, `termLabel`('3학년 2학기'), `CsrArea`, `CsrGroup`, `FieldId`, `FieldDef`, `CourseKind`, `Course`, `Placement`, `Prereq`, `Major`, `Direction`, `Lab`, `CourseState` — `src/domain/courses/types.ts` (data-model.md)
- [X] T003 데이터 파일 네 개와 찾기 표: data.md 표(A~H)와 같은 원자료에서 함께 뽑은 값을 커밋한다(이 TS가 정본, 생성 스크립트·원자료는 일회성이라 커밋하지 않음). 표 → TS 대응 규칙은 data.md 머리말. 졸업생 요약은 쉼표로 잇는다. `index.ts`에 `WORLD`·`AREA_GROUP`·`areaLabel`. 예시 학생 상태 `EXAMPLE_COURSES`(data.md I)는 `src/data/seed.ts` — `src/data/courses/catalog.ts`, `swe.ts`, `directions.ts`, `csrankings.ts`, `index.ts`, `src/data/seed.ts`
- [X] T004 데이터 검사(FR-015)와 테스트: 실제 데이터로 검사를 돌려 문제 0건, 학기별 배치 수가 SC-001 값(1-1 1, 1-2 2, 2-1 4, 2-2 4, 3-1 11, 3-2 14, 4-1 18, 4-2 15)이고 경험 층 14, 방향 28개 모두 과목·연구실 1개 이상(SC-002), 일부러 고리·없는 학수번호·두 묶음에 걸친 줄을 넣은 가짜 전공에서 문제를 찾아냄 — `src/domain/courses/check.ts`, `src/domain/courses/check.test.ts`
- [X] T005 [P] 밝힘·묶음 규칙과 테스트(plan.md 규칙 1~9): `worldOf`, `pathCourses`, `closure`, `directionsOf`, `planOf`. 테스트: 선수 남은 과목은 '지금'에 없음, 들은 과목은 어디에도 없음, 개설 아니오는 `closed`, 배치 없음은 `other`, 4-2 학생의 늦은 과목은 `now`, 학기 없음이면 needsTerm이고 `left`, 경험 층 과목은 학기 비교 없이 `now`, 정렬(학기 없는 과목 맨 뒤), 이유 토막 표의 갈래마다 한 건, 진행 한 줄, 방향 없음이면 lit null·progress null — `src/domain/courses/plan.ts`, `src/domain/courses/plan.test.ts`
- [X] T006 앱 상태에 `courses` 조각과 행동 `courses/term`·`courses/taken`·`courses/direction`을 더하고 `DATA_KEYS`·`INITIAL_STATE`(예시 3-2, exampleTaken)·`NEW_STUDENT_STATE`에 넣는다. 테스트: 토글, 예시↔새 학생 전환, '내 데이터 지우기' — `src/app/state.ts`, `src/app/state.test.ts`
- [X] T007 저장·복원에 `courses`를 더한다(새 학생만 저장, 복원 때 학년·학기가 아니면 null, 과목표에 없는 학수번호·겹친 학수번호는 버림, 방향은 글자가 아니면 null, data-model). `AppState.tsx` 저장 의존 목록에 `state.courses`. 테스트: 왕복, 잘못된 값 버림 — `src/app/storage.ts`, `src/app/storage.test.ts`, `src/app/AppState.tsx`
- [X] T008 [P] 내려받기에 `교과: { 지금학기, 들은과목, 진로방향 }`(지금학기 '3학년 2학기' 또는 '고르지 않음', 들은과목 = 과목표에 있는 들은 과목 이름 목록, 진로방향 = 방향 이름 또는 '고르지 않음')를 더하고 테스트 — `src/domain/exportData.ts`, `src/domain/exportData.test.ts`
- [X] T009 라우트와 서랍 종류: `SCREENS`·`NAV`(홈·추천·교과 지도·내 활동·나의 분석, 아이콘 book, 메뉴 이름 '교과 지도' = 화면 제목)·`KNOWN_SUBS.courses = []`, `LAZY.courses`, `PRELOAD_ORDER`에 courses(recommend 다음), `deferEntity('course', …)`, `EntityKind`에 'course'·`ENTITY_LABEL.course = '과목'`·`entitySummary`의 course 갈래는 `undefined`(서랍은 CourseEntity가 그리고, 못 찾을 때만 기본 서랍이 '찾지 못했어요'를 보인다), `skeletonOf` courses → 'panel'. 이 단계에서 빈 화면 `screens/courses/index.tsx`와 빈 서랍 `CourseEntity.tsx` 자리표를 만든다. 테스트 갱신: router, entitySummary, sizes — `src/app/router.ts`, `src/app/router.test.ts`, `src/app/lazyScreens.tsx`, `src/app/entitySummary.ts`, `src/app/entitySummary.test.ts`, `src/screens/sizes.ts`, `src/screens/sizes.test.ts`, `src/screens/courses/index.tsx`, `src/screens/courses/CourseEntity.tsx`

**Checkpoint**: `npm run check` 통과, 사이드바 '교과'로 빈 화면 `#/courses` 이동 가능.

## Phase 3: User Story 1 — 지도로 본다 (P1) 🎯 MVP

**Goal**: 학기 8칸 × 지도 줄(묶음 이름 포함), 점 상태, 지금 학기, 최근 안 열린 과목 스위치, 과목 서랍과 '들었어요', 새 학생 학년·학기 고르기.
**Independent Test**: quickstart 2·3의 지도·서랍·저장 부분.

- [X] T010 [US1] 지도 모양 함수와 테스트(plan.md '지도 모양'): 칸 8개와 '지금', 줄(묶음 이름 줄, 그릴 과목 없는 줄 빼기), 점(상태 taken/now/open/closed, dim, 숨김), 접힌 줄, 경험 줄, 선(방향 lit + 연 과목 앞뒤, 그려진 과목끼리, 중복 없음), '로드맵 밖' 줄(들은 배치 없는 과목) — `src/screens/courses/map.ts`, `src/screens/courses/map.test.ts`
- [X] T011 [US1] 지도 격자 컴포넌트: 기록 지도와 같은 틀, `useLinkPaths`로 선, 학기 머리 sticky, 점은 버튼(접근 이름: 과목명·분야 줄·권장 학년 학기·상태, 툴팁에 전체 이름), 이름 두 줄 + 줄임표, 묶음 이름 줄, 접힌 줄 한 줄, 경험 줄·'로드맵 밖' 줄(여덟 칸을 합친 칸에 점 버튼), 목록에서 찾은 점의 잠깐 강조 — `src/screens/courses/CourseMap.tsx`
- [X] T012 [US1] 화면: 페이지 머리(제목 '교과 지도', 학년·학기 select), 지도 카드(`.os-card`: 머리 제목·범례, 안내 줄 왼쪽 상황 문구(plan.md 표)·오른쪽 출처 문구와 스위치, `.os-scroll` 안에 지도), 서랍 열기, 서랍 등록 import — `src/screens/courses/index.tsx`
- [X] T013 [US1] 과목 서랍: plan.md '서랍 칸' 표대로(값과 없을 때 문구), 먼저 들을 과목·다음 과목(누르면 그 과목 서랍), 이어지는 진로 방향(이름만), '들었어요' aria-pressed 버튼(토스트 두 문구 + 되돌리기), 과목표에 없으면 `EntityDrawer`로 '항목을 찾지 못했어요', `registerEntityView('course', …)` — `src/screens/courses/CourseEntity.tsx`
- [X] T014 [US1] 스타일(토큰만): 격자·sticky 머리·점 상태 4가지·옅음·지금 칸 머리·두 줄 이름·묶음 이름 줄·접힌 줄·경험 줄·안내 줄·select — `src/screens/courses/courses.css`

**Checkpoint**: 예시·새 학생 모두 지도와 서랍이 동작.

## Phase 4: User Story 2 — 방향을 고른다 (P2)

**Goal**: 방향 고르기 → 밝힘·옅음·접기·선, 안내 줄의 진행 한 줄, 묶음 목록과 이유 한 줄.
**Independent Test**: quickstart 2의 방향 부분, plan.test.

- [X] T015 [US2] 지도 카드 머리에 방향 고르기(네이티브 select, optgroup = CSRankings 묶음, 첫 칸 '진로 방향 고르기'/'방향 없이 보기')를 두고 `planOf` 결과를 지도(lit·now·접기·선)와 안내 줄(진행 한 줄, '지금 들을 만한 과목 k개', '목록 보기')에 넘긴다 — `src/screens/courses/index.tsx`
- [X] T016 [US2] 목록 '들을 과목': 묶음 제목과 과목 줄(이름 + 이유 토막들, 누르면 지도에 그려진 과목은 그 점을 찾아 표시하고 없으면 서랍), plan.md 규칙 9의 상태 문구(겹치면 위에서부터 모두), '연구실 보기' — `src/screens/courses/PlanList.tsx`, `src/screens/courses/index.tsx`

## Phase 5: User Story 3 — 연구실과 근거 (P3)

- [X] T017 [US3] 연구실 목록 '이 길의 연구실': 머리 출처 줄 '연구실 홈페이지 기준(2026-11-16 확인)', 연구실마다 교수·연구실 이름(주소가 있으면 새 창 링크, rel="noopener noreferrer", 이름 없으면 '연구실 홈페이지'; 주소가 없으면 링크 없이 이름만)·CSRankings 분야·주제 1~2개·학부생 표시·졸업생 진로 요약 — `src/screens/courses/LabList.tsx`

## Phase 6: Polish & 함께 고칠 것

- [X] T018 [P] 설정 문구: 학교 데이터 i-Campus 쓰임을 '교과 지도의 들은 과목 채우기, 배운 것과 이어지는 기회 찾기'로, 내려받기 설명 '입력한 정보, 활동, 기록, 들은 과목, 설정을 파일 하나로 받아요', 지우기 확인 '프로필, 활동, 기록, 들은 과목, 설정이 모두 지워져요.', 예시로 바꿀 때 경고에 들은 과목 수('새 학생으로 쓴 활동·기록 n개와 들은 과목 m개가 지워져요.') — `src/data/settings.ts`, `src/screens/settings/DataSection.tsx`, `src/screens/settings/AboutSection.tsx`
- [X] T019 [P] 문서 반영: 기준 문서(교과 지도 절, 메뉴 5개), IA 문서 1절 메뉴 트리(37·39줄 포함)와 4절 '사이드바 메인 항목 4개'와 10절 140줄 메뉴 나열, web-desktop.md 11-12줄 '메뉴 4개'·21줄 localStorage에 남기는 것·60-70줄 경로 표·76줄 `openEntity` 종류, 결정 로그 2026-11-16(교과 메뉴, CSRankings 지도 줄, 진로 방향 층, 한 스크롤 칸·최근 안 열린 과목 숨김), README 13줄과 화면 목록, `router.ts` 15줄·`Sidebar.tsx` 7줄 주석 — `docs/product/concept.md`, `docs/design/ia-navigation.md`, `docs/design/web-desktop.md`, `docs/product/decisions.md`, `README.md`, `src/app/router.ts`, `src/app/Sidebar.tsx`
- [X] T020 검사 도구: 레이아웃 검사 `STEPS`와 문구 검사(`audit:copy`)에 `#/courses`에서 방향 '검색·추천 엔지니어' 고르기 단계를 더한다. 진입점 검사 CASES에 `courses`(예시), `courses`(새 학생), `courses`(새 학생, 저장값에 학년·학기 3-1과 방향 search)를 더한다. 과목 서랍을 처음 열 때는 `navigate`가 불려 진입점으로 세므로, 같은 과목 서랍은 지도 점 하나에서만 열린다(목록 줄은 점을 찾아 표시) — `scripts/audit-layout/run.mjs`, `scripts/audit-copy/run.mjs`, `src/app/audit/entries.test.tsx`
- [X] T021 kingo-ui-review 절차: 두 학생 상태 × 1280×640·1440×900·1920 스크린샷(방향 고르기 전·후), 콘솔 에러, 클릭 흐름 끝까지, 고친 뒤 다시 확인
- [X] T022 impeccable audit(필요하면 polish)로 렌더된 화면 점검
- [X] T023 ponytail-review로 과설계 점검, 지적 반영
- [X] T024 /code-review(필요하면 /security-review)로 정확성·보안 점검, 지적 반영
- [X] T025 `npm run check`, `npm run build`, `npm run audit:layout`, `npm run audit:copy` 통과 확인(출력 확인)
- [X] T026 커밋(한 커밋 한 이유)·`tape`에 push·PR(머지는 사용자)
- [X] T027 [US3] 연구실 목록 머리에 CSRankings 국내 대학 링크(방향의 대표 분야, 새 탭) — `src/data/courses/index.ts`, `src/screens/courses/LabList.tsx`, `src/domain/courses/check.test.ts`

## 후속 (보류, 2026-11-16 사용자)

- 학과 확인 요청: 과목-분야 줄 연결 69개, 방향-과목(연구실 기준) 28가지, 선수 관계 13개(로드맵과 거꾸로인 강화학습개론 ← 기계학습원론 포함)와 질문 4개(로드맵 학기를 권장 학기로 써도 되는지, '개설 여부' 칸의 뜻, 최신 C/L 목록, 1만라인 2024학번 경계)를 학과(교수님 경유 추천, 학과사무실 computing@skku.edu)에 묻는다. 준비물: 확인 시트(맞음/고침/모름), 화면 설명, 메일 초안(보내기는 사용자). 확인을 받으면 `SWE.checked`를 'dept'로 바꾸고 고친 연결을 데이터에 반영한다(research R11).

## Dependencies

- Phase 1 → Phase 2 → Phase 3(US1) → Phase 4(US2) → Phase 5(US3) → Phase 6.
- T002가 T003~T005보다 먼저. T003이 T004·T005보다 먼저(실제 데이터로 테스트). T006이 T007·T008보다 먼저(AppState.courses). T009는 T006 뒤.
- T005(plan.ts)가 T010(map.ts)보다 먼저: 지도 모양이 `Plan`(lit·now)을 입력으로 받는다.
- T021~T025는 화면이 다 된 뒤.

## Parallel

- Phase 2: T003 뒤에 T004와 T005를 같이. T006 뒤에 T007과 T008을 같이.
- US1: T010과 T013은 다른 파일.
- Phase 6: T018·T019·T020을 같이.

## Implementation Strategy

MVP는 US1(지도·서랍·학년·학기·들었어요)이다. 그 위에 US2(방향·목록), US3(연구실)을 얹는다. 각 단계 끝에서 `npm run check`.
