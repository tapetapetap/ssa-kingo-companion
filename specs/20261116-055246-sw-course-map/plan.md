# Implementation Plan: 소프트웨어학과 교과 지도

**Branch**: `feat/course-map` | **Date**: 2026-11-16 | **Spec**: [spec.md](./spec.md) | **Data**: [data.md](./data.md)

**Input**: Feature specification from `specs/20261116-055246-sw-course-map/spec.md`

## Summary

사이드바에 '교과 지도'(`#/courses`, 메뉴 이름 = 화면 제목)를 더하고, 학과 2026 로드맵의 과목을 학기 8칸 × 지도 줄(기초 + CSRankings에 맞춘 분야 12 + 경험) 지도에 놓는다(기록 지도 틀). 학생은 지금 학년·학기와 들은 과목을 표시하고, 진로 방향 28가지 중 하나를 고르면 그 길의 과목이 밝아지며 같은 스크롤 칸의 지도 아래에 '이 길의 과목'(묶음과 이유 한 줄)과 연구실이 보인다. 분기·계산(밝힘, 묶음 규칙, 데이터 검사)은 `src/domain/courses/`에 순수 함수로 두고 테스트한다. 데이터는 `src/data/courses/`에 과목표·전공·방향·CSRankings 이름으로 나눠 두며(이 TS 파일들이 정본, [data.md](./data.md)는 같은 원자료에서 함께 뽑은 표), 전공 id를 키로 해서 학과를 더할 수 있게 한다. 결정과 근거는 [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.7 strict, React 19 (기존 앱)

**Primary Dependencies**: 없음(새 의존성 없음). 기존 공용 컴포넌트(`src/components`: PageHeader, Drawer, Legend, EmptyState, Button, Badge, Switch, Icon, useToast)와 다이어그램 훅(`useLinkPaths`)을 쓴다.

**Storage**: 브라우저 localStorage, 기존 키 `kingo-companion:v1`의 저장 꼴에 `courses` 조각을 더한다(새 학생만 저장, 예시는 저장하지 않음).

**Testing**: vitest(`npm run check` = tsc + vitest), 레이아웃 검사 `npm run audit:layout`(Playwright, 모든 경로 × 크기 × 학생 상태), 문구 검사 `npm run audit:copy`(CI).

**Target Platform**: 데스크톱 웹(1280×640~1920, 1024는 깨지지만 않게), GitHub Pages 정적 배포.

**Project Type**: 웹 프론트엔드(서버 없음, 예시 데이터).

**Performance Goals**: 과목 95개 × 방향 28개 계산은 즉시(렌더 중 계산, 따로 캐시 없음). 화면 덩어리는 기존처럼 처음 갈 때 받는다(lazy + preload).

**Constraints**: 점수·순위·적합도 숫자 없음, 색·간격·글자는 토큰만, 파일 500줄 이하, 과목 설명 원문·개인정보 커밋 금지, CSRankings는 분야 이름만, 점선은 '학생이 안 한 것'만, 한 화면 스크롤 칸 하나.

**Scale/Scope**: 전공 1개(소프트웨어학과), 과목표 95개(지도 83 = 학기 칸 69 + 경험 14), 진로 방향 28개, 연구실 34곳.

## Constitution Check

`.specify/memory/constitution.md`는 채워지지 않은 틀이라 따를 원칙 조항이 없다. 대신 저장소 CLAUDE.md와 기준 문서의 원칙으로 점검한다.

| 원칙 | 이 계획 |
|---|---|
| 기준 문서가 이긴다 | 범위 확장(2026-11-11)과 메뉴 추가를 결정 로그·기준 문서·IA 문서에 함께 반영(FR-019) |
| 점수·레벨·순위 없음 | 묶음과 정렬만, 숫자는 과목 수·진행 한 줄뿐(R4). CSRankings 순위는 쓰지 않음 |
| 분기·계산은 domain + 테스트 | `src/domain/courses/plan.ts`, `check.ts`와 테스트 |
| 새 의존성 없음 | 없음 |
| 토큰만, 500줄 상한 | 새 CSS는 토큰 변수만, 데이터는 파일 넷으로 |
| 공개 저장소에 원문·개인정보 없음 | R6 |
| 학생이 확인한 것만 / 예시 표시 | 과목-줄·방향-과목 연결은 '예시(학과 확인 전)'(R3), 안내 줄에 늘 |
| 한 화면 스크롤 칸 하나(ia-navigation 6-1) | 지도 카드 본문만 칸 안 스크롤(R2) |

통과. 위반 없음.

## Project Structure

### Documentation (this feature)

```text
specs/20261116-055246-sw-course-map/
├── spec.md
├── plan.md
├── research.md
├── data.md             # 데이터 정본(과목표·배치·선수·방향·연구실·CSRankings 대응)
├── data-model.md
├── quickstart.md
├── goldfish-review.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── domain/courses/
│   ├── types.ts          # 학기·전공·줄·과목·배치·선수·방향·연구실·CSRankings·학생 교과 상태 타입, 학기 순서
│   ├── plan.ts           # 방향 과목, 선수 닫힘, 밝힘, 묶음, 정렬, 이유 한 줄, 진행 한 줄
│   ├── plan.test.ts
│   ├── check.ts          # 데이터 검사(FR-015)
│   └── check.test.ts     # 실제 데이터로 검사를 돌리고 SC-001 기대값을 본다
├── data/courses/         # 정본. data.md 표와 같은 원자료에서 함께 뽑았다(생성 스크립트·원자료는 일회성이라 커밋하지 않는다)
│   ├── catalog.ts        # 과목표 95개(data.md E)
│   ├── swe.ts            # 소프트웨어학과: 줄 14, 배치 83, 선수 13(data.md B·C·D·F)
│   ├── directions.ts     # 진로 방향 28, 연구실 34(data.md G·H)
│   ├── csrankings.ts     # CSRankings 분야 27개·묶음 4개 이름(data.md A)
│   └── index.ts          # WORLD(찾기 표), AREA_GROUP, areaLabel
├── data/seed.ts          # EXAMPLE_COURSES: 예시 학생 교과 상태(3-2, data.md I)
├── screens/courses/
│   ├── index.tsx         # 화면: 머리(학년·학기), 지도 카드(머리·안내 줄·스크롤 칸), 서랍 등록
│   ├── map.ts            # 지도 줄·칸·점·선 모양 만들기(화면용 순수 함수)
│   ├── map.test.ts
│   ├── CourseMap.tsx     # 학기 8칸 × 줄 격자(기록 지도와 같은 틀, useLinkPaths)
│   ├── PlanList.tsx      # 이 길의 과목: 묶음 목록
│   ├── LabList.tsx       # 이 길의 연구실
│   ├── CourseEntity.tsx  # 과목 서랍(registerEntityView) + '들었어요'
│   └── courses.css
├── app/
│   ├── router.ts         # SCREENS·NAV·KNOWN_SUBS에 courses(+ router.test.ts)
│   ├── lazyScreens.tsx   # courses 덩어리, deferEntity('course'), PRELOAD_ORDER
│   ├── state.ts          # AppState.courses, 행동 3개, dataOf(+ state.test.ts)
│   ├── storage.ts        # 저장 꼴 courses, 복원 검사(+ storage.test.ts)
│   ├── AppState.tsx      # 저장 의존 목록에 state.courses
│   ├── entitySummary.ts  # EntityKind 'course', ENTITY_LABEL.course = '과목', course 갈래는 undefined(+ 테스트)
│   ├── Sidebar.tsx       # 주석의 '메뉴 4개'
│   └── audit/entries.test.tsx  # CASES에 courses(예시·새 학생)
├── screens/sizes.ts      # courses 뼈대 = 'panel'(+ sizes.test.ts)
├── components/Icon.tsx   # 'book' 아이콘
├── domain/exportData.ts  # 내려받기에 '교과'(+ exportData.test.ts)
├── data/settings.ts      # i-Campus 문구
└── screens/settings/DataSection.tsx, AboutSection.tsx   # 내려받기·지우기 문구에 '들은 과목', 예시로 바꿀 때 경고에 들은 과목 수
scripts/audit-layout/run.mjs   # STEPS에 #/courses 방향 고르기
scripts/audit-copy/run.mjs     # #/courses 는 방향을 고른 화면도 한 번 더 본다
docs/product/concept.md, docs/product/decisions.md, docs/design/ia-navigation.md, docs/design/web-desktop.md, README.md
```

**Structure Decision**: 기존 단일 프론트엔드 구조를 따른다. 화면 하나 = `src/screens/<이름>/index.tsx` 기본 내보내기, 서랍은 `registerEntityView`, 계산은 `src/domain`, 예시 데이터는 `src/data`. 지도 모양 만들기는 기록 지도처럼 화면 폴더의 `map.ts`(+테스트)에 둔다. 공용 파일(`src/app`, `src/components`)은 이 기능이 메뉴·상태·서랍 종류를 더하는 데 꼭 필요한 줄만 고친다.

## 화면 구성 (1280×640 기준, 높이 예산은 research R2)

1. 페이지 머리: 제목 '교과 지도'(메뉴 이름과 같다), 오른쪽에 지금 학년·학기 고르기(네이티브 select, 고르지 않았으면 비활성 첫 칸 '학년·학기 고르기'. 한 번 고르면 되돌리는 칸은 없다).
2. 지도 카드(주인공, `.os-card`):
   - 머리(고정): 카드 제목 '소프트웨어학과 로드맵', 진로 방향 고르기(네이티브 select, optgroup = CSRankings 묶음 AI·시스템·융합, 첫 칸 '진로 방향 고르기' / 고른 뒤 '방향 없이 보기'), 범례(지금 보이는 모양만).
   - 안내 줄(고정): 왼쪽 = 상황 한 줄(아래 표), 오른쪽 = '분야: CSRankings 기준 · 연결은 예시(학과 확인 전)'와 스위치 '최근 안 열린 과목'(화면 상태 `useState`, 처음과 새로고침 뒤에는 꺼짐).
   - 스크롤 칸(`.os-scroll`, 화면의 유일한 칸 안 스크롤): 지도 격자(학기 머리 sticky) → 방향을 골랐으면 두 열(왼쪽 '이 길의 과목' : 오른쪽 '이 길의 연구실' = 3 : 2, 폭 1200 아래에서는 한 열).
3. 지도 점을 누르면 오른쪽 서랍(`?drawer=course:<학수번호>`). 목록 줄은 지도에 그려진 과목이면 그 점을 화면 가운데로 옮기고 잠깐 강조 테두리로 표시한다(서랍은 열지 않는다). 지도에 없는 과목(로드맵 밖, 숨긴 최근 안 열린 과목)이면 서랍을 연다. 그래서 한 화면에서 같은 서랍으로 가는 길은 하나다(ia-navigation 2절, 진입점 검사).
4. 서랍의 '들었어요'는 `aria-pressed` 버튼('들었어요' / '들었어요 취소'), 누르면 토스트 '들은 과목에 넣었어요.' / '들은 과목에서 뺐어요.'와 되돌리기.

| 서랍 칸 | 값 | 없을 때 |
|---|---|---|
| 학수번호·학점 | 'SWE3050', '3학점' | — |
| 개설 학과 | 소프트웨어학과가 아닐 때만 | 줄을 뺀다 |
| 권장 학기 | '4학년 1학기' | 경험 층 '학기 없음(경험 층)', 배치 없음 '로드맵 밖 과목' |
| 이수구분 | KIND 이름 | 배치 없으면 줄을 뺀다 |
| 분야 | 분야 줄이면 '<줄 이름> · CSRankings <분야 이름>', 기초·경험 줄이면 줄 이름만 | 배치 없으면 줄을 뺀다 |
| 개설 | '최근 열린 과목' / '최근 열리지 않은 과목(교육과정 표 기준) · 다음 학기 시간표에서 확인해요' | — |
| 먼저 들을 과목·다음 과목 | 과목 이름 버튼(누르면 그 과목 서랍), 들은 것은 '들음' | '과목 설명에 적힌 먼저 들을 과목이 없어요.' / '이 과목을 먼저 들으라는 과목은 아직 없어요.' |
| 이어지는 진로 방향 | 방향 과목(`pathCourses`, 닫힘 전)에 이 과목이 든 방향 이름을 쉼표로(누르는 동작 없음) | '이 과목을 꼽은 연구실이 아직 없어요.' |

연구실 목록: 주소가 있으면 연구실 이름(없으면 '연구실 홈페이지')을 새 창 링크로, 주소가 없으면 링크 없이 교수 이름과 연구실 이름(있을 때)만 쓴다. 졸업생 요약·주제는 쉼표나 가운뎃점 하나로만 잇는다.

| 상황(위에서부터 처음 맞는 것) | 안내 줄 왼쪽 |
|---|---|
| 방향 있음 | '이 길의 과목 n개 중 m개 들었어요' + (학년·학기 있음) ' · 지금 들을 만한 과목 k개' + 버튼 '목록 보기'(스크롤 칸을 목록으로) |
| 학년·학기 없음 | '학년·학기를 고르면 지금 칸과 들을 만한 과목이 보여요' |
| 그 밖 | '진로 방향을 고르면 그 길이 밝아져요' |

'목록 보기'와 '연구실 보기'는 스크롤 칸 안의 해당 절로 `scrollIntoView`(주소는 바꾸지 않는다).

## 들을 만한 과목 규칙 (domain/courses/plan.ts)

1. `pathCourses(direction)` = 방향 연구실들의 과목 합집합 ∩ 과목표.
2. `closure(codes, prereqs)` = 각 과목의 먼저 들을 과목을 끝까지 거슬러 더한 집합(고리는 데이터 검사가 막는다).
3. `lit` = 방향이 있으면 closure(방향 과목) ∪ (안 들은 전공코어 = 배치의 이수구분이 `core-basic` 또는 `core`), 없으면 빈 집합.
4. 목록 대상 = lit − 들은 과목.
5. 묶음(위에서부터 처음 맞는 것):

| 순서 | 조건 | 학년·학기 있음 | 학년·학기 없음 |
|---|---|---|---|
| 1 | 전공 배치가 없음 | `other` 로드맵 밖 과목 | `other` |
| 2 | 개설 여부 = 아니오 | `closed` 최근 열리지 않은 과목 | `closed` |
| 3 | 학년·학기 없음 | — | `left` 남은 과목 |
| 4 | 안 들은 먼저 들을 과목이 있음 | `later` 나중에 들을 과목 | — |
| 5 | 권장 학기가 있고 다음 학기보다 뒤 | `later` | — |
| 6 | 그 밖(학기 없는 경험 층 과목 포함) | `now` 지금 들을 만한 과목 | — |

   화면의 묶음 순서: now → later → left → closed → other. 빈 묶음은 그리지 않는다.
6. 정렬(묶음 안): 권장 학기 순(학기 없으면 맨 뒤) → 전공코어 먼저(`core-basic`, `core`) → 이름(가나다).
7. 이유 한 줄 = 아래 토막의 배열(`reasons`). 화면은 토막을 따로 그리고 세로 줄로 나눈다(' · ' 사슬은 문구 검사가 막는다). 빈 토막은 뺀다.

| 토막 | 규칙 | 문구 |
|---|---|---|
| 출처 | 방향 과목이면 | '<방향 이름> 길' |
| | 전공코어면(방향 과목이어도 함께) | 이수구분 이름 '전공코어 기초필수' 또는 '전공코어' |
| | 둘 다 아니면(선수 닫힘으로만 들어옴) | '‘<과목>’의 먼저 들을 과목' — <과목>은 이 과목을 바로 먼저 들을 과목으로 두는 밝은 과목 중 정렬 첫째 |
| 선수 | 먼저 들을 과목이 없음 | (생략) |
| | 모두 들음 | '먼저 들을 과목을 다 들었어요' |
| | 남음 | '먼저 들을 과목: <이름>, <이름>'(안 들은 것만, 정렬 순) |
| 학기 | 권장 학기가 있음 | '권장 <n>학년 <m>학기' |
| | 없음(경험 층·로드맵 밖) | (생략) |
| 학과 | `other`이고 개설 학과가 소프트웨어학과가 아님 | 토막 둘: '<개설 학과> 과목', '전공 인정은 학과에 확인' |

8. 진행: 방향 과목(닫힘 전) 중 들은 수 / 전체 수. 방향이 없으면 없음.
9. 목록 상태(화면 문구, PlanList):

| 상태 | 판정 | 보이는 것 |
|---|---|---|
| 다 들음 | 진행 done = total | '이 길의 과목을 다 들었어요' + 버튼 '연구실 보기', 그 아래 남은 묶음(전공코어 등) |
| 지금이 빔 | 학년·학기 있음, `now` 0개, 대상 1개 이상 | '다음 학기에 들을 만한 과목은 없어요. 아래 묶음에서 이유를 보세요.' |
| 학년·학기 없음 | needsTerm | '남은 과목' 묶음 머리에 '학년·학기를 고르면 지금 들을 만한 과목을 골라 줘요' |
| 대상 없음 | 대상 0개 | '다 들음' 문장만 |

   겹치면 위 표의 위에서부터 모두 보인다: '다 들음' 띠 → '지금이 빔' 문장 → 묶음들('남은 과목' 묶음 머리의 안내 포함).

## 지도 모양 (screens/courses/map.ts)

- 칸: TERMS 8개, 머리 이름 '1학년 1학기'…, 고른 학기 머리에 '지금'.
- 줄: 전공 `fields` 순서. 분야 줄 앞에 그 줄의 CSRankings 묶음이 바뀔 때마다 묶음 이름 줄 하나. 그릴 과목이 없는 줄은 그리지 않는다(방향이 없을 때도 같다). 방향이 있으면 밝은 과목이 하나도 안 그려진 분야·기초 줄은 접힌 줄 목록(쉼표로 잇는다)으로. 맨 아래는 경험 줄, 그 아래 '로드맵 밖' 줄(들은 과목 중 배치가 없는 것, 학기 칸 없이 점만).
- 점: 배치마다 하나 + 들은 로드맵 밖 과목마다 하나. 숨김 = 안 들음 ∧ 개설 아니오 ∧ 스위치 꺼짐. 상태 = taken / now / open / closed(R2 표), dim = 방향 있음 ∧ lit 밖.
- 선: 방향 있음 → 그려진 lit 과목끼리의 선수 관계, 그리고 서랍으로 연 과목이 그려져 있으면 그 과목의 앞뒤 선수 관계(그려진 과목끼리). 학기 칸의 과목끼리, 먼저 들을 과목의 권장 학기가 같거나 앞일 때만 긋는다(로드맵과 거꾸로인 관계, 예: 강화학습개론 3-2 ← 기계학습원론 4-1 은 서랍·목록에만). 중복은 하나로.

## 단계

1. 데이터: `src/data/courses/` 네 파일(data.md와 같은 원자료에서 함께 뽑은 값, 표 → TS 대응은 data.md 머리말), 데이터 검사와 테스트.
2. 도메인: 밝힘·묶음 규칙과 테스트.
3. 상태·저장: `courses` 조각, 행동 3개, 저장·복원·내려받기·지우기, 저장 의존 목록, 테스트.
4. 화면: 라우트·메뉴·아이콘·덩어리·뼈대, 지도·목록·연구실·서랍.
5. 함께 고칠 것: 설정 문구, 기준 문서·IA·web-desktop·결정 로그, README, 레이아웃 검사 단계, 진입점 검사 CASES.
6. 점검: kingo-ui-review 절차(두 학생 상태 × 세 크기 스크린샷), impeccable audit, ponytail-review, code-review, check·build·audit:layout·audit:copy.

## Complexity Tracking

없음. 새 메뉴 하나와 화면 하나, 상태 조각 하나를 더한다.
