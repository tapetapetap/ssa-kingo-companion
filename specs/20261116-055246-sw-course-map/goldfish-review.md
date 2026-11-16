# Goldfish Review — 소프트웨어학과 교과 지도

- 날짜: 2026-11-16
- 리뷰어 상태: comprehension 완료 · readiness NO-GO(첫 실행 NO-GO, 재리뷰 NO-GO)
- 사용자 위임: 사용자가 2026-11-16 "추천 방향대로 승인 없이 끝까지"로 위임했다. 새 결정이 필요한 지적(규칙상 `사용자 판단`)은 추천안을 적용하고 처리를 `수정(사용자 결정)`으로 적었다. 근거 열의 '위임:'이 그 표시다. 사용자가 확인할 목록이다.
- 리뷰 뒤 사용자 입력: 같은 날 사용자가 "CSRankings가 기준을 제일 잘 나눴다"며 그 분류를 넣으라고 했다. 지도 줄을 CSRankings에 맞춰 다시 나눴다(research R13). 아래 지적과 별개의 변경이다.

## Comprehension의 다시 쓰기

### 다시 쓰기
소프트웨어학과 학부생이 앞으로 들을 과목 전체를 한눈에 보고 다음 학기 수강을 고를 수 있게 한다. 이를 위해 사이드바에 다섯 번째 메뉴 '교과'(`#/courses`)를 더한다. 학과 2026 로드맵의 과목을 학기 8칸(1-1~4-2) × 분야 12개와 기초 층 격자에 점으로 놓는다. 경험 층은 지도 아래 한 줄에 둔다. 학생은 지금 학년·학기와 들은 과목을 직접 표시하고, 새 학생만 브라우저에 저장된다.
진로 방향 28가지 중 하나를 고르면, 그 방향의 연구실들이 이어진다고 본 과목과 그 선수 과목이 밝아진다. 지도 아래에는 안 들은 과목(길의 과목과 전공코어)이 '지금 들을 만한 / 나중 / 열리지 않음 / 다른 학과'로 묶여, 사실로 만든 이유 한 줄과 함께 나온다. 진행 한 줄과 그 방향의 연구실 목록도 붙는다.
만드는 이유는 두 가지다. 서비스 범위가 교과 선택까지 넓어졌고(2026-11-11), 학교 로드맵에는 분야·진로·선수 화살표가 없어 진로에서 과목으로 거슬러 가기 어렵다. 점수 없이 규칙과 정렬만 쓰고, 연결 데이터는 '예시(학과 확인 전)'로 밝히며, 데이터 틀은 다른 전공을 더할 수 있게 열어 둔다.
### 기존 시스템
- 데스크톱 웹 프로토타입이다(React 19·TypeScript, 서버 없음, 예시 데이터, GitHub Pages 정적 배포). 학교 시스템(GLS·i-Campus) 연동은 없다.
- 사이드바 메인 메뉴는 1단 4개다(홈·추천·내 활동·나의 분석). 추천에는 탭 둘(추천 활동·전체 기회)이, 내 활동에는 구역 탭이 있다. 주소는 `#/...` 해시 경로이고, 화면 덩어리는 처음 갈 때 받는다(lazy + preload).
- 상세는 오른쪽 서랍으로 열린다. 서랍은 주소(`?drawer=<종류>:<id>`)에 남아 새로고침해도 다시 열리고, 없는 id면 '찾지 못했어요' 서랍이 열린다.
- 내 활동 › 기록에 '기록 지도'(`#/activities/records`)가 있다. 학기(가로) × 분야(세로) 격자에 점을 놓고 선으로 잇는다. 기록이 없는 분야는 아래 한 줄에 모은다.
- 학생 상태는 두 가지다.
  - 새 학생: 가입 인터뷰를 마친 학생. localStorage `kingo-companion:v1`에 저장된다.
  - 예시 학생: '예시로 둘러보기'로 들어온 3학년 2학기 학생. 바꿔도 새로고침하면 예시로 돌아간다.
- 설정에는 '내 데이터 내려받기·지우기', '프로토타입 정보'(예시 학생으로 보기), 학교 데이터 칸이 있다. 학교 데이터의 i-Campus 항목에는 '과목을 추천하지는 않아요'가 적혀 있다.
- 원칙:
  - 점수·순위·적합도 숫자를 쓰지 않는다.
  - 점선은 '학생이 안 한 것'에만 쓴다.
  - 색·간격은 토큰만 쓴다.
  - 계산은 `src/domain`에 테스트와 함께 둔다.
- 교과 학습 지원은 '코스 에이전트'가 맡는다. 앱의 기준 학기는 2026년 2학기다.
- 점검 도구는 `npm run check`(tsc + vitest), build, `audit:layout`(모든 경로 × 크기 × 학생 상태), `audit:copy`다.

## 지적과 처리

| # | 리뷰어 | 심각도 | 위치 | 요지 | 처리 | 근거·변경 |
|---|---|---|---|---|---|---|
| 1 | comprehension | Major | spec FR-005·Edge, plan 규칙 1·7 | 지도에 없는 로드맵 밖 과목을 '들었어요'로 표시할 길이 없어 진행을 다 채울 수 없다 | 수정(사용자 결정) | 위임: 목록의 과목 줄도 같은 과목 서랍(`?drawer=course:`)을 연다. spec FR-005·US2-7, tasks T016 |
| 2 | comprehension | Major | spec FR-003·008·009 | 점 상태 겹침(옅음 두 뜻), 길 밖 전공코어가 '지금'이면서 옅음·접힘 | 수정(사용자 결정) | 위임: lit = 방향 닫힘 ∪ 안 들은 전공코어, 최근 안 열린 과목은 점선 없는 얇은 실선(옅음과 다른 모양), 상태 표를 research R2에 둠. spec FR-003·FR-008 |
| 3 | comprehension | Major | spec US2-2·FR-008, research R2 | 들은 선수 과목을 밝히는지, 서랍으로 연 과목의 선을 긋는지 문서마다 다름 | 수정 | 리뷰 전 결정 문서 쪽으로 맞춤: 밝힘은 data-model의 선수 닫힘 전체(들은 것 포함), 선은 research R2의 '연 과목 앞뒤 선 포함'. spec US2-2·FR-008 |
| 4 | comprehension | Major | research R2, plan 화면 구성 2 | '지도 아래 한 줄'에 점 버튼이 있는지, 접힌 분야 과목이 숨는지 모름(기록 지도는 이름만) | 수정(사용자 결정) | 위임: 경험 층은 맨 아래 '경험' 줄 하나(여덟 칸을 합친 칸에 점 버튼), 접힌 분야는 그 위 '이 길에 없는 분야' 이름 한 줄(과목은 방향을 풀면 보임). research R2, plan '지도 모양' |
| 5 | comprehension | Major | spec Edge 첫 항목, plan 규칙 5, data-model | 학년·학기 없이 방향을 고르면 목록에 무엇이 보이는지, group 값이 없음 | 수정(사용자 결정) | 위임: 새 묶음 `left`(남은 과목) + 안내 문장, `closed`·`other`·진행 한 줄은 보임. spec Edge, plan 규칙 5·9, data-model PlanGroup |
| 6 | comprehension | Major | plan 규칙 4~6 | 학기 없는 과목·선수로만 든 과목의 묶음·정렬·이유가 빔 | 수정(사용자 결정) | 위임: 학기 없는 과목은 학기 비교 없이 판정하고 정렬 맨 뒤, 선수로만 든 과목은 "'<과목>'의 먼저 들을 과목", 학기 토막 생략. plan 규칙 5~7 표 |
| 7 | comprehension | Major | spec US3·FR-012, data-model 연구실 | 방향 단위 '졸업생 상위 3곳'을 만들 데이터가 없음 | 수정(사용자 결정) | 위임: 졸업생 요약은 연구실마다 그대로 보인다(FR-012·US3 고침). data-model Lab.alumni |
| 8 | comprehension | Major | spec FR-008·009, research R10 | '학과 과목'과 '다른 학과 과목'의 경계(배치 유무 vs 개설 학과) | 수정(사용자 결정) | 위임: 방향 과목은 '과목표의 과목', 묶음 이름은 배치 기준 '로드맵 밖 과목', '전공 인정은 학과에 확인'은 개설 학과 ≠ 소프트웨어학과일 때만. spec FR-008·Edge, plan 규칙 7 |
| 9 | comprehension | Major | spec FR-018 | 설정 문구가 '학교 시스템과 잇지 않음' 가정과 반대로 읽힘 | 수정(사용자 결정) | 위임: 그 칸은 '연결하면 쓸 곳'을 적는 자리라고 한 줄로 밝히고, 바뀔 문구를 그대로 적음. spec FR-018, tasks T018 |
| 10 | comprehension | Major | spec Assumptions '지금 학기' | '앱의 기준 학기'가 무엇을 정하는지 없음 | 수정 | `src/data/records.ts:2` `CURRENT_TERM`은 기록 화면용이다. '지금' 칸은 고른 학년·학기만 따른다고 고치고, 예시 학생이 3-2인 이유로만 남김. spec Assumptions, research R5 |
| 11 | comprehension | Major | spec 배경, research R3 | 방향 28·연구실 34·연구실-과목 연결이 외부 링크에만 있음 | 수정 | 리뷰 전 연구실 조사(2026-11-16, 조사 문서·원자료)로 정해진 데이터. 부록 data.md G·H로 옮김 |
| 12 | comprehension | Nit | spec US1-3, plan 화면 구성 1 | 학년·학기 고르기 자리가 지도 머리/페이지 머리로 다름 | 수정 | 문서 간 사실 불일치. plan의 페이지 머리로 맞춤(spec US1-3) |
| 13 | comprehension | Nit | spec US3-1, data-model 연구실 | 학부생 표시 `member` 문구가 다름 | 수정 | 화면 문구를 '학부생 모집·인턴 안내 / 학부생 있음(공고 없음) / 학부생 안내 없음'으로 하나로(spec·data-model) |
| 14 | comprehension | Nit | spec FR-014, data-model Prereq | 선수 관계 '출처'가 타입에 없음 | 수정 | FR-014를 타입에 맞춤: 근거 요지는 data.md F에만, 데이터에는 `{from,to}` |
| 15 | comprehension | Nit | spec 배경, data-model Placement | 이수구분 '6종'인데 kind는 8개, 경험 층 kind 없음 | 수정 | 사실 오류. kind 9개(현장실습·연구학점 추가, 쓰이지 않는 DS/교양 뺌)와 경험 층 14과목 목록(data.md D) |
| 16 | comprehension | Nit | spec 배경 | '코스 에이전트'를 정의 없이 씀 | 기록 | 이해에 주는 영향이 작다. 배경에 '(교과 학습을 돕는 별도 서비스)'만 덧붙였다 |
| 17 | readiness | Blocker | tasks T003·T004·T005 | 과목표·배치·방향·연구실·연결 데이터가 문서·저장소에 없고 스크래치패드·메모리만 가리킴 | 수정 | 리뷰 전 조사로 모은 데이터(교육과정 표·로드맵·연구실 조사). 부록 data.md(A~I)에 커밋해도 되는 파생 표와 원본 URL을 넣고 스크래치패드·메모리 참조를 지움 |
| 18 | readiness | Blocker | tasks T004 '연결' | 학수번호 → 줄 매핑 표가 없음 | 수정 | 리뷰 전 배치 초안이 있었다. 표를 data.md B·C에 넣음(그 뒤 사용자 요청으로 CSRankings 기준 줄로 다시 나눔, research R13) |
| 19 | readiness | Blocker | plan 화면 구성, research R2 '폭' | 지도 + 목록을 쌓으면 1280×640에 안 들어가고, 페이지 스크롤·창 밖 버튼이 검사 실패 | 수정(사용자 결정) | 위임: 지도 카드 본문을 화면의 유일한 칸 안 스크롤로, 목록·연구실은 그 칸 안 지도 아래(곁 열은 지도 칸을 64px로 좁혀 버림), 1280×640 높이 예산, 안 들은 최근 안 열린 과목은 기본 숨김 + 스위치. research R2, plan 화면 구성 |
| 20 | readiness | Major | plan Project Structure, tasks T008 | 저장을 부르는 `AppState.tsx` 의존 목록·뼈대 `sizes.ts`가 변경 목록에 없음 | 수정 | `src/app/AppState.tsx:41-44`, `src/screens/sizes.ts:24-34` 확인. T007에 의존 목록, T009에 `skeletonOf` courses → 'panel'(그림 칸 하나) |
| 21 | readiness | Major | tasks T010 'EntityKind' | 기본 서랍 요약을 코드로 옮길 방법이 없음(ENTITY_LABEL 값, 필수 칸) | 수정 | `src/app/entity.tsx:76`상 등록한 종류는 기본 서랍을 쓰지 않는다. `ENTITY_LABEL.course = '과목'`, entitySummary course 갈래 `undefined`, 테스트(T009) |
| 22 | readiness | Major | tasks T014, spec Edge '찾지 못했어요' | 없는 학수번호 처리 규칙이 하나로 안 정해짐 | 수정 | spec Edge(리뷰 전)가 '찾지 못했어요' 서랍을 정했다. CourseEntity가 못 찾으면 `EntityDrawer`로 그 상태를 그린다(T013, quickstart 3) |
| 23 | readiness | Major | plan 규칙 5, data-model, tasks T018 | needsTerm group 값, 빈 '지금'의 이유, '연구실 보기' 동작이 없음 | 수정(사용자 결정) | 위임: `left` 묶음, 목록 상태 표(plan 규칙 9), '연구실 보기' = 스크롤 칸을 연구실 목록으로 옮김 |
| 24 | readiness | Major | plan 규칙 6 '이유 한 줄' | 이유 문구의 갈래가 여럿 비어 있음 | 수정(사용자 결정) | 위임: 토막별 규칙과 문구 표(plan 규칙 7), `onPath` = 닫힘 전 방향 과목(data-model) |
| 25 | readiness | Major | data-model Placement, tasks T004·T006·T012 | 경험 층 kind·term null 처리·경험 줄 기준·아래 줄 모양이 없음 | 수정(사용자 결정) | 위임: kind `internship`·`research`, 줄은 `field`가 정하고 `field = experience ⟺ term = null` 검사, 학기 비교 없이 판정·정렬 맨 뒤, 경험 줄은 점 버튼 |
| 26 | readiness | Major | data-model lit, plan 규칙 3 | 길 밖 전공코어가 '지금'이면서 옅고 줄째 접힘 | 수정(사용자 결정) | 위임: 2번과 같은 결정(lit에 안 들은 전공코어 포함, 목록 = lit − 들은 과목) |
| 27 | readiness | Major | spec FR-012·US3, data-model Lab | 방향 단위 상위 3곳 vs 연구실 자유글 | 수정(사용자 결정) | 위임: 7번과 같은 결정(연구실별 요약) |
| 28 | readiness | Major | tasks T019, spec FR-013 | 방향을 고르기 전에는 '예시' 표시가 화면에 없음 | 수정(사용자 결정) | 위임: '분야: CSRankings 기준 · 연결은 예시(학과 확인 전)'를 지도 카드 안내 줄에 늘, 연구실 출처는 목록 머리에. spec FR-013 |
| 29 | readiness | Major | tasks T006 | SC-001 기대값이 없고 direction.labs 검사가 빠짐 | 수정 | 로드맵 데이터에서 센 학기별 개수(1-1 1 … 4-2 15)와 경험 14를 spec SC-001·tasks T004에, 방향의 연구실 id 검사를 FR-015에 |
| 30 | readiness | Major | tasks Phase 2 Checkpoint·Dependencies·Parallel | 적힌 순서대로 하면 tsc가 실패하고 map이 plan 타입을 기다림, Parallel이 의존과 어긋남 | 수정 | `src/app/lazyScreens.tsx:26-33·65-67` 확인. T009가 자리표 파일을 만들고, plan.ts(T005)를 map.ts(T010) 앞에, Parallel을 의존에 맞춤 |
| 31 | readiness | Major | tasks T009·T022, spec SC-006 | 방향을 고른 화면이 레이아웃 검사에 안 나오고, 내려받기 테스트·진입점 방침이 없음 | 수정(사용자 결정) | 위임: run.mjs STEPS에 방향 고르기 단계, exportData 테스트, 진입점 CASES에 courses 두 상태(서랍·스크롤 버튼은 주소 이동이 아니라 세지 않음). tasks T008·T020 |
| 32 | readiness | Major | tasks T021 | '메뉴 4개'가 남는 곳들이 변경 목록에 없음 | 수정 | `docs/design/web-desktop.md:11-12·60-70`, `ia-navigation.md:69`, `README.md:13`, `router.ts:15`, `Sidebar.tsx:7` 확인. tasks T019 |
| 33 | readiness | Major | tasks T004, data-model FieldDef | exampleTaken 목록·줄 색·기초/경험 줄 이름이 정해지지 않음 | 수정(사용자 결정) | exampleTaken 15과목은 리뷰 전 배치 초안의 값(data.md I). 위임: 줄 색은 두지 않고 점 색을 상태로(research R2), 줄 이름 '기초'·'경험'(data.md B) |
| 34 | readiness | Nit | spec US1-3 | 학년·학기 고르기 자리 불일치 | 수정 | 12번과 같은 수정 |
| 35 | readiness | Nit | research R6 '파일' | 파일 나눔이 plan 구조와 다름 | 수정 | R6을 plan 구조(catalog·swe·directions·csrankings)에 맞춤 |
| 36 | readiness | Nit | spec FR-014·Key Entities | '출처'·'분류 기준(CS2023)'이 타입에 없음 | 수정 | FR-014·Key Entities를 타입에 맞춤(분류 기준은 CSRankings, 줄의 `group`·`areas`로 담김) |
| 37 | readiness | Nit | spec US2-2 | '안 들은 먼저 들을 과목이 밝아지고'가 lit 정의와 다름 | 수정 | 3번과 같은 수정(들은 것 포함) |
| 38 | readiness(재리뷰) | Blocker | tasks T003, plan 단계 1, data.md 머리말 | 데이터를 '같은 스크립트로 뽑았다'는데 스크립트가 저장소에 없고 표 → TS 대응 규칙이 없음 | 수정(사용자 결정) | 재리뷰 Blocker(규칙상 사용자 판단), 위임: TS 네 파일을 정본으로 이 기능 PR에 커밋하고, data.md는 같은 원자료에서 함께 뽑은 표로 둔다(스크립트·원자료는 일회성이라 커밋 안 함). 표 → TS 대응 규칙을 data.md 머리말에, 검사 범위(개수·학기별 배치·규칙, 줄 단위 대조 없음)를 맞춰 적음. **사용자 확인 필요** |
| 39 | readiness(재리뷰) | Blocker | tasks T020 | 서랍을 처음 열면 `navigate`가 불려 진입점으로 세는데, 지도 점과 목록 줄이 같은 서랍을 열어 중복 | 수정(사용자 결정) | 재리뷰 Blocker(규칙상 사용자 판단), 위임: 목록 줄은 지도에 그려진 과목이면 그 점을 찾아 강조(서랍을 열지 않음), 지도에 없는 과목만 서랍을 연다. 진입점 예외는 만들지 않음. 방향을 고른 새 학생 CASE 추가. spec US2-7·FR-005, plan 화면 구성 3, research R2, tasks T016·T020. **사용자 확인 필요** |
| 40 | readiness(재리뷰) | Major | plan 규칙 7, research R2, data.md H | 이유 한 줄·접힌 줄·졸업생 요약이 ' · ' 사슬이라 문구 검사(`DOT_CHAIN_MAX = 1`)에 걸림, 방향 화면은 audit:copy가 안 봄 | 수정(사용자 결정) | 위임: 이유는 토막 배열(`reasons`)로 따로 그려 세로 줄로 나눔, 접힌 줄·방향 이름은 쉼표, 졸업생 요약 데이터는 쉼표로 다시 뽑음, audit:copy에 방향 고르기 단계. spec FR-010, plan 규칙 7, data-model, tasks T020 |
| 41 | readiness(재리뷰) | Major | plan 화면 구성 1, tasks T009 | 메뉴 '교과'와 화면 제목 '교과 지도'가 다름 | 수정 | `docs/design/ia-navigation.md` 7-5 '메뉴 이름 = 화면 제목', `src/app/ScreenFallback.tsx`의 `screenLabel` 확인. 메뉴 이름도 '교과 지도'로(spec FR-001, research R1, tasks T009) |
| 42 | readiness(재리뷰) | Major | plan 규칙 4, spec US2-7·US1-4 | '들었어요'로 표시한 로드맵 밖 과목은 다시 열어 취소할 곳이 없음 | 수정(사용자 결정) | 위임: 지도 맨 아래 '로드맵 밖' 줄에 들은 로드맵 밖 과목을 점으로 둔다(토스트 되돌리기도 있음). spec FR-002·US2-7·Edge, plan '지도 모양', research R2 |
| 43 | readiness(재리뷰) | Major | tasks T013, spec FR-005 | 서랍의 '이어지는 진로 방향' 정의·동작, 권장 학기 문구, 없는 값 표시가 없음 | 수정(사용자 결정) | 위임: plan '서랍 칸' 표(방향 = `pathCourses`에 든 방향 이름만, 학기·이수구분·분야가 없을 때의 문구와 생략) |
| 44 | readiness(재리뷰) | Major | data.md H comnet, tasks T017 | 주소가 없는 연구실의 표시가 없음 | 수정(사용자 결정) | 위임: 주소가 없으면 링크 없이 교수 이름과 연구실 이름(있을 때)만. plan 화면 구성, tasks T017 |
| 45 | readiness(재리뷰) | Major | plan Project Structure | 데이터 묶음을 나열하는 설정 문구·예시로 바꿀 때 경고가 변경 목록에 없음 | 수정 | `src/screens/settings/DataSection.tsx:64·95`, `AboutSection.tsx:20-23` 확인. tasks T018에 두 파일과 문구, 경고에 들은 과목 수 |
| 46 | readiness(재리뷰) | Major | plan 화면 구성, tasks T013·T016 | 스위치 상태 자리, 학년·학기 되돌리기, '들었어요' 컨트롤·토스트, 두 열 비율이 안 정해짐 | 수정(사용자 결정) | 위임: 스위치는 화면 상태(새로고침하면 꺼짐), 학년·학기는 되돌리는 칸 없음, aria-pressed 버튼 + 토스트 두 문구 + 되돌리기, 두 열 3:2(폭 1200 아래 한 열). plan 화면 구성 |
| 47 | readiness(재리뷰) | Major | plan 규칙 9, tasks T008 | 목록 상태가 겹칠 때와 내려받기 키 이름이 없음 | 수정(사용자 결정) | 위임: 겹치면 위에서부터 모두('다 들음' 띠 → '지금이 빔' → 묶음), 내려받기 `교과: { 지금학기, 들은과목, 진로방향 }`(기존 키처럼 띄어쓰기 없이). plan 규칙 9, tasks T008 |
| 48 | readiness(재리뷰) | Nit | tasks Phase 3 | T010~T014에 [US1] 꼬리표가 없음 | 수정 | tasks.md 형식 줄(`T### [P] [US#]`)에 맞춤 |
| 49 | readiness(재리뷰) | Nit | tasks T019 | IA 1절 37·39줄, 10절 140줄, web-desktop.md 21·76줄이 반영 목록에 없음 | 수정 | 문서 위치 확인 뒤 T019에 더함 |
| 50 | readiness(재리뷰) | Nit | spec US2-5 | '(과목 수와 진행 한 줄만)'인데 졸업생 수·학점도 보임 | 수정 | 괄호를 빼고 '점수·순위·적합도 숫자 없음'만 남김 |
| 51 | readiness(재리뷰) | Nit | quickstart 2 | '옅은 과목'이 방향 밖 옅음과 최근 안 열린 과목을 섞어 부름 | 수정 | '얇은 회색 테두리 점(최근 안 열린 과목)'으로 고침 |

## 재리뷰

- 대상: readiness(첫 실행 Blocker 17·18이 `수정`이라 1회).
- VERDICT: NO-GO → NO-GO.
- 새 지적: 38~51(Blocker 2, Major 8, Nit 4). `재지적` 행 없음.
- 재리뷰 Blocker 38·39는 규칙상 `사용자 판단`이다. 위임에 따라 추천안을 적용했고, 사용자가 확인할 두 결정으로 표시했다. 더 재리뷰하지 않는다.

## 집계

지적 51개 중 문서를 바꾼 것 50개
