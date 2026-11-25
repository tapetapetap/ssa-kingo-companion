# Tasks: 3단계 새 학생 앱과 마감 알림, 운영자 모니터링·임베딩 지도·모델 바꾸기

**Input**: `specs/20261125-171634-student-app/`의 [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**시험**: spec FR-060·FR-061이 시험을 요구한다. 시험 작업이 구현 작업 앞이고, 시험이 실패하는 것을 본 뒤 구현한다. DB 시험은 `server/test/db.ts`의 새 스키마, HTTP 시험은 `server/test/app.ts`를 쓴다.

**차례**: 단계마다 PR 하나(plan '만드는 순서와 PR'). [P]는 앞 작업을 기다리지 않고 다른 파일이라 함께 할 수 있다. 다음 단계는 앞 단계의 PR이 머지된 뒤 시작한다.

**PR마다 끝에 하는 것**(작업으로 따로 적지 않음): `npm run check`, 화면이 바뀌었으면 `npm run e2e:app`과 `impeccable audit`·`polish`, `ponytail-review`, `/code-review`(E·H는 `/security-review`도), PR(`gh pr create -R tapetapetap/ssa-kingo-companion`), CI, Claude 리뷰 읽기, 머지.

## Phase 1: Setup

- [ ] T001 `web/app/vite.config.ts`, `web/app/index.html`(lang ko, viewport, manifest·아이콘 링크), `web/app/src/main.tsx`(빈 화면)를 만들고 `package.json`에 `build:app`(`vite build --config web/app/vite.config.ts`)을 더한다. 개발 서버는 `/api`를 `KINGO_API_URL`로 넘긴다
- [ ] T002 [P] `.gitignore`에 `web/app/dist`가 빠지는지 보고(`web/ops/dist`와 같은 규칙) `tsconfig.json`의 include에 `web/app`이 드는지 확인한다
- [ ] T003 `deploy/Dockerfile`에 `npm run build:app`, `.github/workflows/ci.yml`의 빌드 줄에 `npm run build:app`을 더한다
- [ ] T004 [P] dev 의존성 `axe-core`를 정확한 판으로 더한다(`package.json`, `package-lock.json`)

## Phase 2: Foundational

**목표**: 앱 파일이 `/`에서 열리고 화면을 짤 바탕(요청·주소·테마·상태 화면)이 있다. 여기까지 PR A의 앞부분이다.

- [ ] T005 시험: `server/http.test.ts`에 R2의 경우를 더한다: `/`·`/notices/cse%3A1` → `index.html`과 CSP·`no-cache`, `/assets/x.js` → immutable, 없는 `/assets/y.js`·`/x.png` → 404, `/../package.json`과 `%2e%2e` → 404, `/api/없음` → JSON 404, `POST /` → 404, `/ops/` 그대로, 모든 파일에 `nosniff`
- [ ] T006 `server/http.ts`: `opsFile`을 `staticFile(dir, rel)`로 바꾸고 앱 내주기를 더한다(R2). `createServer(routes, write, opsDir, appDir, onError)`로 넓히고 `server/test/app.ts`를 맞춘다. 요청 기록의 route는 `/(앱)`
- [ ] T007 [P] 시험과 구현: `web/app/src/lib/date.ts`(`kstToday`, `dday(deadline, today)` → '오늘 마감'·'D-3'·'마감 지남'·'마감 없음', `termOf(day)`, `termSuggestion(answeredAt, answers, today)`)와 `date.test.ts`. 학기 경계(2/28~3/1, 8/31~9/1), 학년 올림(3월이 지난 횟수, 4 이하), 기기 시간대가 달라도 같은 값
- [ ] T008 [P] `web/app/src/api.ts`: 요청·오류(`web/ops/src/api.ts`와 같은 꼴), 401·403 `consent_required`를 앱 사건(`app-auth`)으로 알린다. 시험 `web/app/src/api.test.ts`(HTML 오류 쪽, 네트워크 끊김은 `offline` 코드)
- [ ] T009 [P] 시험과 구현: `web/app/src/route.ts`(contracts/app.md 주소 표 읽기·만들기, `go`·`replace`·뒤로 가기, 자리 기억 Map, `safeTo(to)` 검사)와 `route.test.ts`(`//evil`, `/\evil`, `/login`, `/start` 거절, 거르기 주소 왕복)
- [ ] T010 [P] `web/app/src/theme.ts`: 디자인 후보 아티팩트(X6aGWhu4g5NdQJVTTdi3es)의 추천안을 읽어 astryx 테마 `kingo`를 만든다(밝은·어두운 화면). `web/app/src/lib/values.ts`에 앱의 첫 값
- [ ] T011 `web/app/src/parts/States.tsx`(불러오는 중·빈 상태·실패·오프라인)와 `web/app/src/main.tsx`의 틀(아래 메뉴 막대, 900px부터 왼쪽 메뉴)
- [ ] T012 `scripts/e2e-app/run.mjs`와 `package.json`의 `e2e:app`: 시험 스키마(`server/test/db.ts`의 방법)에 공지 45개·분야 목록·개발 계정 둘(로그인 전, 분야까지 마친 것)을 넣고 서버를 임시 포트에 띄워 Playwright로 돈다. 걸음마다 320·390·768px 가로 넘침 0, axe 심각·중대 0, 화면 글자를 `scripts/audit-copy/rules.mjs`로 검사. 끝나면 스키마를 지운다. `.github/workflows/ci.yml`에 더한다

**Checkpoint**: `npm run server`로 `/`를 열면 빈 틀이 뜨고 `e2e:app`이 빈 걸음으로 통과한다.

## Phase 3: User Story 1 - 처음 들어온 학생이 홈까지 간다 (P1) 🎯 MVP

**Goal**: 로그인 → 동의 → 처음 질문 → 분야 → 홈(빈 틀). **Independent Test**: spec US1.

- [ ] T013 [P] [US1] 시험: `server/auth/auth.test.ts`에 `GET /api/login/methods`(로그인 없이, dev·prod), 로그인할 때 앞 세션이 지워짐, `/api/me`의 `tag`
- [ ] T014 [US1] `server/auth/login.ts`: `GET /api/login/methods`, `POST /api/login`의 앞 세션 지우기(R6), `/api/me`에 `tag`(R16)
- [ ] T015 [US1] 시험과 구현: `web/app/src/lib/entry.ts`(contracts/app.md 규칙 1의 순수 함수: `me` 답·오류·주소 → 갈 화면)와 `entry.test.ts`, `main.tsx`에 잇기
- [ ] T016 [P] [US1] `web/app/src/screens/Login.tsx`: 방식 목록, '개발용 로그인' 표시, 잠김 시각(`until`을 한국 시각으로)
- [ ] T017 [P] [US1] `web/app/src/screens/Consent.tsx`: 서버 문구 그대로(줄바꿈·목록), 동의하고 시작하기, 로그아웃. `invalid`(판이 바뀜)면 문구를 다시 받는다
- [ ] T018 [P] [US1] `web/app/src/screens/Answers.tsx`: 학년·학기·진로 목표, 남은 것 표시
- [ ] T019 [US1] `web/app/src/parts/FieldPicker.tsx`와 `web/app/src/screens/Fields.tsx`: 큰 묶음 펼치기, 설명, 찾기(띄어쓰기·대소문자 무시), 고른 것 위에, 3개 미만 막기. 찾기는 `web/app/src/lib/find.ts`와 시험
- [ ] T020 [US1] `scripts/e2e-app/run.mjs`: US1 걸음(새로 고침해 같은 걸음, 잘못된 비밀번호 5번, `to`로 돌아오기, 동의 판 바뀜)

**Checkpoint**: PR A.

## Phase 4: User Story 2 - 홈과 공지 (P2)

**Goal**: 추천과 선반, 공지 거르기·찾기·자세히. **Independent Test**: spec US2.

- [ ] T021 [P] [US2] `web/app/src/parts/NoticeCard.tsx`: FR-014의 칸, 두 줄 자르기, 분야 근거 표시(app.md 6), 행동 자리(눌리지 않음, US3에서 잇는다)
- [ ] T022 [P] [US2] 시험과 구현: `web/app/src/lib/empty.ts`(app.md 7의 까닭 → 글·할 일)와 시험
- [ ] T023 [US2] `web/app/src/screens/Home.tsx`: 가장 추천, '이걸 보고 골랐어요'(`cited`의 `prompt`는 '나에 대한 프롬프트'), 고른 방식, 다시 고르는 중 5초 뒤 한 번, 선반 가로 넘기기와 빈 선반 숨기기
- [ ] T024 [US2] `web/app/src/screens/Notices.tsx`: 거르기(종류·분야 여럿)·찾기·정렬이 주소에, 칩으로 보이고 한 번에 지우기, 20개씩 이어 불러오기(끝 '여기까지예요', 실패 '다시 불러오기'), 자리 기억
- [ ] T025 [US2] `web/app/src/screens/NoticeDetail.tsx`: 모든 칸, 닫힘·내려감 표시, 원문 열기(`target=_blank`, `rel="noopener noreferrer"`), `not_found`
- [ ] T026 [US2] `scripts/e2e-app/run.mjs`: US2 걸음(거르기 → 자세히 → 뒤로 같은 자리, 45개 이어 불러오기, 빈 선반, 다시 고르는 중)

**Checkpoint**: PR B.

## Phase 5: User Story 3 - 카드 행동과 내 목록 (P3)

**Goal**: 세 행동과 되돌리기, 내 목록. **Independent Test**: spec US3.

- [ ] T027 [P] [US3] 시험과 구현: `web/app/src/lib/list.ts`(FR-017 순서)와 `web/app/src/lib/later.ts`(기본 날짜, 고를 수 있는 날, 오늘 닫히면 못 함)와 시험
- [ ] T028 [P] [US3] 시험과 구현: `web/app/src/lib/actions.ts`(바로 바꾸고 실패하면 되돌림, 겹치면 마지막 것 하나만 보냄, 여러 화면의 같은 공지에 알림)와 시험
- [ ] T029 [US3] `web/app/src/parts/ActionBar.tsx`: 관심 있어요·나중에 보기(날짜 칸)·관심 없음(네 이유와 '이유 없이'), 5초 되돌리기, 닫힌 공지는 지우기만. `NoticeCard`와 `NoticeDetail`에 잇고, 알림 묻기 자리는 빈 고리로 둔다(US5)
- [ ] T030 [US3] `web/app/src/parts/ActivityForm.tsx`: 활동 칸(이름 100자·학기·종류·분야 0~2·증빙). '이미 해 봤어요' 뒤 초안으로 연다. US4에서도 쓴다
- [ ] T031 [US3] `web/app/src/screens/List.tsx`: 두 탭과 개수, D-n, 흐린 닫힌 공지, 다시 볼 날 표시
- [ ] T032 [US3] `scripts/e2e-app/run.mjs`: US3 걸음(세 행동, 저장 실패 되돌림(요청 막기), 되돌리기, 활동 초안 저장, 두 탭)

**Checkpoint**: PR C.

## Phase 6: User Story 4 - 나 (P4)

**Goal**: 나에 대한 것을 고친다. **Independent Test**: spec US4.

- [ ] T033 [P] [US4] 시험과 구현: `web/app/src/lib/draft.ts`(R17의 `sessionStorage` 글, `tag`가 다르면 버림, 저장소가 막히면 조용히)와 시험
- [ ] T034 [P] [US4] `web/app/src/screens/Me.tsx`: 칸과 길, 로그아웃, 계정 지우기 두 번 확인
- [ ] T035 [P] [US4] `web/app/src/screens/Prompt.tsx`: 글자 수, 저장하지 않고 나가면 묻기, `draft` 잇기
- [ ] T036 [US4] `web/app/src/screens/Analysis.tsx`: 세 칸, 출처·증빙, 줄 빼기·되살리기, 흐름의 근거 줄, 끄기(지워지는 것 알림)·켜기, `.md` 내려받기. 뺀 줄의 글은 서버가 키만 주므로 키를 사람이 읽을 말로 푼다(`liked:<분야>` → '관심 있어요가 몰린 분야: …', `web/app/src/lib/lineKey.ts`와 시험)
- [ ] T037 [US4] `web/app/src/screens/Activity.tsx`: `ActivityForm`으로 넣기·고치기·지우기, 100개 한도, `draft` 잇기. 처음 질문·분야 고치기는 `Answers`·`Fields`를 다시 쓴다
- [ ] T038 [US4] `web/app/src/screens/Home.tsx`에 새 학기 제안(FR-019, `termSuggestion`), 닫으면 `localStorage`에 학기
- [ ] T039 [US4] `scripts/e2e-app/run.mjs`: US4 걸음(프롬프트 쓰다 로그인 끊김 → 복구, 다른 계정이면 복구 없음, 줄 빼기, 끄기·켜기, `.md`, 새 학기, 계정 지우기)

**Checkpoint**: PR D. 여기까지면 학생 화면이 온전히 돈다.

## Phase 7: User Story 5 - 설치와 마감 알림 (P5)

**Goal**: 설치하고 09:00 알림을 받는다. **Independent Test**: spec US5.

- [ ] T040 [US5] `server/db/migrations/009_push.sql`(data-model)과 `server/limits.ts`의 새 값. `server/db/migrate.test.ts`가 통과하는지 본다
- [ ] T041 [P] [US5] 시험과 구현: `server/push/endpoint.ts`(R5)와 시험(정한 네 host, `fcm.googleapis.com.evil.com`·IP·`http:`·포트·`user@` 거절, 키 길이)
- [ ] T042 [P] [US5] 시험과 구현: `server/push/message.ts`(R8)와 시험(하나·둘·넷, 40자, 종류 차례, 4KB)
- [ ] T043 [US5] 시험: `server/push/targets.test.ts` — 마감 오늘·3일·2일·없음, 사람 판정으로 바뀐 마감, 내려감·공지 아님·닫힘, 취소, 다시 볼 날 오늘·내일, 동의 판 옛것, 만료 세션, 100가지 경우표(SC-004)
- [ ] T044 [US5] `server/push/targets.ts`(R7의 질의)
- [ ] T045 [US5] 시험: `server/push/routes.test.ts` — 켜기·끄기, 로그아웃·계정 지우기로 사라짐, 같은 주소를 다른 학생이 켬, 11대째, 준비 전 404, 동의 전 403, 다른 학생 것에 닿지 못함
- [ ] T046 [US5] `server/push/routes.ts`와 `server/app.ts`·`server/config.ts`(`pushPublicKey`, `publicUrl`) 잇기. `/api/me`의 `push`
- [ ] T047 [US5] 의존성 `web-push@4.0.0`(정확한 판), `server/push/web-push.d.ts`
- [ ] T048 [US5] 시험: `server/push/send.test.ts` — 보냄·410(구독 지움)·500 뒤 한 번 더·또 실패, 두 번 돌리면 0, `sending`으로 남은 것은 안 보냄, 08:59·21:00, 기기 둘, TTL, 30일 지난 기록, 출력에 제목·주소 없음
- [ ] T049 [US5] `server/push/send.ts`(R7)와 `server/cli.ts`의 `notify`·`push-keys`(contracts/cli.md, `server/cli.test.ts`)
- [ ] T050 [US5] `server/outbound.test.ts`: `web-push`를 가져오는 파일은 `server/push/send.ts`(와 `push-keys`의 자리) 하나이고 api가 시작할 때 가져오는 파일 묶음(`server/main.ts`에서 따라간 import)에 없음을 본다
- [ ] T051 [P] [US5] `web/app/public/sw.js`(R3), `web/app/public/manifest.webmanifest`, 아이콘(192·512·maskable·apple-touch). `sw.js`의 알림 꼴 검사는 `web/app/src/sw.test.ts`에서 파일을 읽어 가짜 전역으로 돌린다
- [ ] T052 [US5] 시험과 구현: `web/app/src/lib/push.ts`(상태: 지원 안 함·설치 필요·막힘·준비 중·꺼짐·켜짐, 켜기·끄기, app.md 9)와 시험
- [ ] T053 [US5] `web/app/src/screens/Push.tsx`(FR-036·FR-039), `ActionBar`의 '마감 전에 알려 드릴까요?' 한 번, `Home`의 아이폰 안내 한 번, `main.tsx`의 서비스 워커 등록
- [ ] T054 [P] [US5] `deploy/`: `kingo-notify.service`·`.timer`, `compose.yaml`(jobs에만 `kingo.push.env`), `kingo.env.example`, `kingo.push.env.example`, `.gitignore`, `consent.dev.md`를 `dev-2`로(FR-040)
- [ ] T055 [US5] `scripts/e2e-app/run.mjs`: 알림 칸의 상태(준비 중·꺼짐)와 오프라인 껍데기(`context.setOffline`), Cache Storage에 `/api` 없음. 실제 켜기는 quickstart 2를 손으로 하고 결과를 이 줄에 적는다

**Checkpoint**: PR E(`/security-review` 포함). 동의 문구 초안 문서(Claude Docs)에도 문장을 더한다.

## Phase 8: User Story 6 - 모니터링 (P6)

**Goal**: 숫자와 띠, 한 번 더 돌리기. **Independent Test**: spec US6.

- [ ] T056 [US6] `server/db/migrations/010_ops.sql`(data-model, `model_bursts.who`에 `trial`)
- [ ] T057 [P] [US6] 시험과 구현: `etl/notices/run.ts`의 `KINGO_RUN_JSON` 줄(R10)과 `etl/notices/run.test.ts`
- [ ] T058 [P] [US6] 시험과 구현: `server/ops/counts.ts`(R12)와 시험, `server/main.ts`·`server/http.ts`의 `onError` → `server_error` 올리기
- [ ] T059 [US6] 시험과 구현: `server/jobs/daily.ts` — `kingo:daily` 잠금(두 개가 함께 시작하면 차례로), `counts` 단계, 분류기 숫자 담기(읽지 못하면 비움). `server/jobs/daily.test.ts`의 단계 순서 시험을 고친다(`map`은 US7)
- [ ] T060 [P] [US6] 시험과 구현: `server/ops/alerts.ts`(R11)와 시험(둘 잇단 실패, 하나, 10% 경계, 36시간 경계, 건너뜀, 첫날)
- [ ] T061 [US6] 시험과 구현: `server/ops/requests.ts`와 `server/cli.ts requests`(R9: 열린 것 하나, 죽은 `running` 되돌림, 없음). `kingo-requests.service`·`.timer`
- [ ] T062 [US6] 시험과 구현: `server/ops/monitor.ts`의 `GET /api/ops/monitor`·`POST /api/ops/daily`(contracts/api.md, 운영자 아님 403, 답의 모든 글에 학생 번호·이메일·프롬프트 0), `server/model.ts`의 `installedModels`(3초, `outbound.test.ts` 그대로 통과)
- [ ] T063 [US6] `web/ops/src/Shell.tsx`(메뉴와 실패 띠)와 `Monitor.tsx`(개요·수집과 판정)·`Daily.tsx`·`Service.tsx`. `dataviz` 스킬을 읽고 7일 흐름을 그린다. `Console.tsx`는 메뉴 하나로 들어간다. `?notice=`로 판정 검토의 공지를 바로 연다(US7이 쓴다)

**Checkpoint**: PR F.

## Phase 9: User Story 7 - 임베딩 지도 (P7)

**Goal**: 지도와 먼저 볼 것. **Independent Test**: spec US7.

- [ ] T064 [P] [US7] 시험과 구현: `server/ops/tsne.ts`(R13)와 시험(같은 입력 같은 글자, 세 무리가 갈라짐, 91개 1초 안)
- [ ] T065 [US7] 시험과 구현: `server/ops/map.ts`의 `buildMap`(무게 가운데, 순위, 쌍·빈 곳·안 쓰인 분야, 벡터 없음, 분야 12개 미만, 7개만 남김, 공지 1,000개 1분 안)과 `server/jobs/daily.ts`의 `map` 단계(실패해도 이어짐)
- [ ] T066 [US7] 시험과 구현: `GET /api/ops/map`(contracts/api.md, 내려간 공지 빠짐, `stale`, 없을 때 까닭)
- [ ] T067 [US7] `web/ops/src/EmbedMap.tsx`: SVG 점(색과 모양 둘 다로 구분), 기준 3·5·10·15, 목록 넷, 거르기 다섯, 판정 검토로 가기, 자판으로 목록을 다 쓸 수 있음. 시안(8Mdj7g1CwejvUDQdkgM3Ki)을 읽어 맞춘다

**Checkpoint**: PR G.

## Phase 10: User Story 8 - 모델 바꾸기 (P8)

**Goal**: 재고, 85%를 넘으면 바꾸고, 앞 판정은 그대로. **Independent Test**: spec US8.

- [ ] T068 [US8] 시험: `etl/notices/llm.test.ts`·`fields.test.ts` — `older`가 있으면 앞 모델 답을 읽고 묻지 않음, 지금 모델 답이 먼저, 판이 다르면 안 읽음, 돌려준 `model`, 환경이 없으면 지금과 같음
- [ ] T069 [US8] `etl/notices/llm.ts`(`makeChat`의 `older`, `Outcome.model`)와 `fields.ts`·`run.ts`(근거에 실제 모델 이름)
- [ ] T070 [P] [US8] 시험과 구현: `etl/taxonomy/taxonomy.ts`의 `fieldGate(t, version, model, measured?)`(R14)와 `run.ts`의 `KINGO_FIELD_MEASURED` 읽기
- [ ] T071 [US8] 시험과 구현: `server/model.ts`의 `currentModel`과 부르는 세 곳(`server/jobs/daily.ts`, `server/cli.ts`, `server/pick/repick.ts`), 분류기 환경 넘기기, `rejudgePaths(no, models)`가 앞 모델 답도 지움. `server/jobs/daily.test.ts`·`server/model.test.ts`를 고친다
- [ ] T072 [US8] 시험: `server/jobs/swap.test.ts` — 가짜 모델 서버로 A로 판정 → B로 바꿈 → 매일 작업 → 앞 공지 근거 'LLM: A', 새 공지 'LLM: B', 다시 판정한 공지 'LLM: B', A로 되돌려도 B 판정 그대로(SC-010)
- [ ] T073 [US8] 시험과 구현: `server/ops/trial.ts`(R15): 정답셋·본문 없음 까닭, 이어 하기, 밤 시간 끝에 멈춤, 글마다 잠금을 놓음, 지표가 `scoreTaxonomy`·`eval.score`와 같음, 조건 판, 지금 모델 먼저, `model_bursts`에 `trial`. `server/outbound.test.ts`의 `etl/` 허용 목록에 `score.ts`·`eval.ts`·`run.ts`를 더한다(수집 코드를 부르지 않는지 함께 본다)
- [ ] T074 [US8] `server/ops/requests.ts`에 `model_trial`을 잇는다(밤 시간 22:00~02:50, 매일 작업 끝~07:00)
- [ ] T075 [US8] 시험과 구현: `server/ops/models.ts`의 경로 넷(contracts/api.md): 84.9%·85.0% 경계(분수), `trial_stale` 세 가지, 설치되지 않음, 이미 지금 모델, 열린 요청, 취소, 바꾼 사람
- [ ] T076 [US8] `web/ops/src/Models.tsx`: 지금 모델·후보·진행·나란히 비교·경고·바꾸기 확인·기록
- [ ] T077 [P] [US8] `deploy/compose.yaml`의 jobs에 `/gold` 읽기 전용과 `KINGO_GOLD_DIR`, `kingo.env.example`, 2단계 quickstart의 설치 절에 정답셋·본문 보관본 옮기기
- [ ] T078 [US8] 이 맥에서 실제로 한 번 잰다: 지금 모델의 핵심 정밀도가 27/31과 같은지(보관 답), 후보 하나(설치된 것)의 값. GPU 80%·80°C를 지키고 결과를 이 줄에 적는다

**Checkpoint**: PR H(`/security-review` 포함).

## Phase 11: Polish

- [ ] T079 앱 전체 `impeccable critique`와 `polish`, `kingo-toss-ux`·`kingo-ux-writing` 점검, 지적을 고친다(`web/app/src/**`)
- [ ] T080 [P] SC-002를 잰다: Playwright에서 느린 4G 흉내로 홈·공지 첫 화면 시간과 행동 표시 시간(`scripts/e2e-app/run.mjs --perf`), 넘으면 고친다
- [ ] T081 [P] `README.md`(앱 띄우기, `e2e:app`, 새 명령)와 `deploy/` 설명
- [ ] T082 quickstart 1~3을 처음부터 해 보고 어긋난 곳을 고친다
- [ ] T083 학교 데스크톱(2단계 T087 뒤): quickstart 4, 실제 기기 알림(FR-070 (5)). 접근 권한과 HTTPS 주소를 기다린다

## Dependencies

- Phase 1 → 2 → 3(US1) → 4(US2) → 5(US3) → 6(US4) → 7(US5). US5의 서버 쪽(T040~T050)은 Phase 2 뒤 언제든 할 수 있고 앱 쪽은 US3·US4 뒤다.
- 8(US6)은 Phase 2 뒤면 된다. 9(US7)와 10(US8)은 8 뒤다(메뉴 틀, 010 마이그레이션, 요청).
- T056의 010은 US7·US8의 표도 함께 만든다. T063의 `?notice=`를 T067이 쓴다.
- T068~T072가 T073~T076보다 앞이다(바꾸기가 안전해진 뒤 화면을 연다).

## Parallel Examples

- Phase 2: T007·T008·T009·T010을 함께.
- US1: T016·T017·T018을 함께(T015 뒤).
- US5: T041·T042·T051·T054를 함께.
- US6: T057·T058·T060을 함께.

## Implementation Strategy

- MVP는 Phase 3(US1)까지지만, 학생이 쓸모를 느끼는 첫 지점은 PR B(US2)다. PR D까지면 알림 빼고 학생 화면이 온전하다.
- 학생에게 여는 것은 모든 PR과 FR-070의 다섯 조건 뒤다.
- 운영자 이야기(US6~8)는 학생 이야기와 서로 기다리지 않아 급하면 앞당길 수 있다.

## 세기

작업 83개: Setup 4, Foundational 8, US1 8, US2 6, US3 6, US4 7, US5 16, US6 8, US7 4, US8 11, Polish 5.
