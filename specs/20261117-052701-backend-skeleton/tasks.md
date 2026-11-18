# Tasks: 2단계 백엔드 뼈대(API 서버와 DB)

**Input**: Design documents from `specs/20261117-052701-backend-skeleton/`

**Prerequisites**: plan.md, spec.md, research.md(R1~R23), data-model.md, contracts/api.md, contracts/cli.md, quickstart.md

**Tests**: 시험을 먼저 쓴다(사용자 요청). 파일 옆 `*.test.ts`에 실패하는 시험을 쓰고 구현한다. DB가 필요한 시험은 진짜 Postgres에서 시험 파일마다 새 스키마를 쓴다(research R19).

**Organization**: 이야기별로 묶되 순서는 plan.md '만드는 순서'(바탕 → US1 → US2 → US4 → US3 → US5 → US7 → US6)다. 단계(Phase)마다 PR 하나로 올려 머지한다(조금씩).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일이고 앞 작업을 기다리지 않아 함께 할 수 있다
- 경로는 저장소 뿌리 기준이다. '계약 시험'은 contracts/api.md의 그 경로마다 되는 예 하나와 거절되는 예 하나다
- **단계 마무리**(각 Phase의 마지막 작업): `npm run check`·`npm run build` 통과 → ponytail-review → code-review(로그인·권한을 건드린 단계는 security-review도) → PR → CI와 Claude 리뷰 확인 → 머지 → 브랜치 삭제

## Phase 1: Setup

**Purpose**: 서버 코드가 설 자리와 시험용 DB

- [ ] T001 `package.json`에 의존성 `postgres`를 더하고(research R3) scripts에 `"server": "node server/main.ts"`, `"cli": "node server/cli.ts"`를 넣는다. `tsconfig.json`의 `include`에 `server`를 더한다
- [ ] T002 [P] `deploy/compose.dev.yaml`을 쓴다(개발·시험용 DB 하나): `pgvector/pgvector:pg17`, 이름 있는 볼륨, healthcheck(`pg_isready`), 포트 `127.0.0.1:54329:5432`. 운영 묶음(`deploy/compose.yaml`)은 US6에서 쓴다(운영의 db는 internal 네트워크에만 있어 포트를 열 수 없다, research R16)
- [ ] T003 [P] `.env.example`을 쓴다(research R20의 변수와 개발 기본값. 비밀번호는 `change-me`). `.gitignore`가 `.env`를 막는지 확인한다
- [ ] T004 [P] `.github/workflows/ci.yml`의 check 작업에 `services.postgres`(같은 이미지, healthcheck)와 `DATABASE_URL` 환경 변수를 더한다
- [ ] T005 [P] `server/limits.ts`에 research R21의 첫 숫자 값을 이름 붙인 상수로 둔다(spec 사용자 확인 19번의 값 그대로)

---

## Phase 2: Foundational

**Purpose**: 모든 이야기가 쓰는 바탕(설정, 기록, DB 연결과 스키마 바꾸기, HTTP 틀, 시험 틀)

- [ ] T006 [P] `server/config.test.ts`를 쓴다: `KINGO_MODE`가 dev·prod가 아니면 던진다, `DATABASE_URL`이 없으면 던진다, 기본값(포트 8080, `OLLAMA_HOST`)이 채워진다
- [ ] T007 [P] `server/log.test.ts`를 쓴다: 한 줄 JSON이고, 요청 기록에 방법·경로 틀·상태·걸린 시간·학생 번호만 있고 본문·쿠키가 없다(FR-047)
- [ ] T008 [P] `server/db/migrate.test.ts`를 쓴다: 빈 스키마에 번호 순서로 적용한다, 두 번 돌려도 한 번만 적용한다, 적용한 이름이 `schema_migrations`에 남는다
- [ ] T009 `server/http.test.ts`를 쓴다: 경로 표가 `/api/notices/:id`의 `id`를 꺼낸다, 없는 경로는 404 `not_found`, JSON이 아니거나 64KB를 넘으면 400 `bad_request`, 상태를 바꾸는 요청에 같은 출처 `Origin`과 JSON `Content-Type`이 없으면 403 `bad_origin`, 오류 꼴이 `{ error: { code, message } }`, 던진 오류는 500이고 기록에 본문이 없다, `GET /api/health`는 `{ ok: true }`
- [ ] T010 `server/config.ts`, `server/log.ts`를 쓴다(T006·T007 통과)
- [ ] T011 `server/db/sql.ts`(연결, 스키마 고르기, `withModelLock`은 US3에서)와 `server/db/migrate.ts`, `server/db/migrations/001_base.sql`(`create extension if not exists vector`, `schema_migrations`)을 쓴다(T008 통과)
- [ ] T012 `server/test/db.ts`를 쓴다: 시험 파일마다 `t_<무작위>` 스키마를 만들고 마이그레이션을 적용해 연결을 돌려주며, 끝나면 스키마를 지운다. DB에 닿지 못하면 `DB 시험에는 Postgres가 필요해요: docker compose -f deploy/compose.dev.yaml up -d`로 실패한다(건너뛰지 않는다)
- [ ] T013 `server/http.ts`를 쓴다(T009 통과): 경로 표, `HttpError`, JSON·쿠키, `Origin` 검사, 요청 기록
- [ ] T014 `server/test/app.ts`(시험에서 서버를 임시 포트로 띄우고 쿠키를 들고 요청하는 도우미)와 `server/main.ts`(설정 → DB 연결 → 적용 안 된 마이그레이션이 있으면 이유를 내고 끝 → 서버 시작)를 쓴다
- [ ] T015 `server/cli.test.ts`와 `server/cli.ts`의 틀을 쓴다: 명령 나누기, `migrate`, 끝 코드(0·1·2), `--json`, 모르는 명령은 쓰는 법과 2(contracts/cli.md)
- [ ] T016 단계 마무리(PR '2단계 바탕': Phase 1~2). PR 본문에 `docker compose -f deploy/compose.dev.yaml up -d`와 `npm run check`를 적는다

**Checkpoint**: 빈 서버가 뜨고 `GET /api/health`가 답한다. DB 시험이 CI에서 돈다.

---

## Phase 3: User Story 1 - 분류기 결과와 분야 목록을 넣는다 (Priority: P1) 🎯 MVP

**Goal**: 결과 파일·분야 목록·벡터를 검사해 넣고 요약을 남긴다.

**Independent Test**: quickstart 1(실제 결과 파일을 두 번 넣어 `새 126` → `새 0 · 바뀜 0`).

### Tests for User Story 1

- [ ] T017 [P] [US1] `server/ingest/check.test.ts`를 쓴다: 결과 파일 계약(`specs/20261107-193624-cse-notice-opportunities/contracts/cse-notices.schema.json`)의 규칙마다 맞는 예와 어긋난 예(필수 칸, id·url·날짜 꼴, 종류 11가지, 근거 꼴, 분야는 핵심 2개·관련 5개까지이고 겹치지 않음, 머리의 분야 목록 id). 어긋난 곳의 경로와 이유를 모두 돌려준다
- [ ] T018 [US1] `server/ingest/ingest.test.ts`를 쓴다(가짜 결과 파일과 `etl/taxonomy/fixtures.ts`의 목록): spec US1의 시나리오 1~7과 Edge Cases(기준일 앞 공지는 그대로, 내려간 공지가 다시 나오면 되살림, 머리의 목록 id가 지금 목록과 다르면 거절, 벡터 모델·차원이 다르면 거절, 분야 id가 목록에 없으면 아무것도 바뀌지 않음, 도중에 던지면 되돌림, 사라진 분야는 고른 분야에서 빠짐은 US2에서)

### Implementation for User Story 1

- [ ] T019 [US1] `server/db/migrations/002_notices.sql`을 쓴다(data-model 2·3의 `taxonomies`, `field_groups`, `fields`, `notices`, `notice_fields`, 5절의 `ingest_runs`). `notices.closes_on`은 계산 칸이다
- [ ] T020 [P] [US1] `server/ingest/check.ts`를 쓴다(T017 통과). 분야 목록 검사는 `etl/taxonomy/taxonomy.ts`의 `checkTaxonomy`를 부른다
- [ ] T021 [P] [US1] `server/ingest/vectors.ts`를 쓴다: 분류기 보관 벡터를 `etl/notices/embed.ts`의 `readFieldVectors`·`readNoticeVector`로 읽고, 없으면 `makeEmbed`와 1단계 글 규칙으로 만든다(본문은 보관본에서만 읽고 돌려주지 않는다). 모델·차원이 다르면 거절한다
- [ ] T022 [US1] `server/ingest/ingest.ts`를 쓴다(T018 통과): 한 트랜잭션에서 비교하고 쓴다(research R11, R22). 요약은 FR-007의 칸이다. 운영 모드는 `chosen`이 없는 목록을 거절한다
- [ ] T023 [US1] `server/cli.ts`에 `ingest <결과 파일> --taxonomy <id> [--dry-run]`을 더한다(출력 문구는 contracts/cli.md, 시험은 `server/cli.test.ts`)
- [ ] T024 [US1] quickstart 1을 실제 파일로 돌려 확인하고 요약 줄을 PR 본문에 적는다
- [ ] T025 [US1] 단계 마무리(PR '2단계 넣기')

**Checkpoint**: 서버에 실제 공지 126건과 분야 목록이 있다.

---

## Phase 4: User Story 2 - 로그인, 동의, 처음 질문, 분야 고르기 (Priority: P2)

**Goal**: 개발 로그인으로 들어와 동의 → 처음 질문 → 분야 3개를 마치면 다음 할 일이 홈이다.

**Independent Test**: quickstart 2.

### Tests for User Story 2

- [ ] T026 [P] [US2] `server/auth/password.test.ts`를 쓴다: 같은 비밀번호도 저장 글이 다르다(솔트), 맞으면 참·틀리면 거짓, 꼴이 틀린 저장 글은 거짓, 8자 미만은 거절
- [ ] T027 [US2] `server/auth/auth.test.ts`를 쓴다(계약 시험: login, logout, me, DELETE me): spec US2의 시나리오 1·5·6·7·8·9, 30일이 지난 로그인은 `login_required`, 쓸 때 늘어남, 로그아웃하면 그 쿠키가 바로 끝남, 운영 모드에 켜진 로그인 방식이 없으면 서버가 시작하지 않고 이유를 냄, 쿠키 속성(HttpOnly, SameSite=Lax, 운영 모드 Secure)
- [ ] T028 [US2] `server/me/onboarding.test.ts`를 쓴다(계약 시험: consent, answers, fields, me/fields): spec US2의 시나리오 2·3·4, `next`의 네 값, 문구 판이 바뀌면 다시 `consent`(R23), 목록이 바뀌어 고른 분야가 3개보다 적어지면 `next`가 `fields`(FR-008), `GET /api/fields`가 목록 순서대로 준다

### Implementation for User Story 2

- [ ] T029 [US2] `server/db/migrations/003_students.sql`을 쓴다(data-model 1의 `students`, `login_methods`, `sessions`, `consents`, `answers`, `student_fields`)
- [ ] T030 [P] [US2] `server/auth/password.ts`를 쓴다(scrypt, research R5. T026 통과)
- [ ] T031 [US2] `server/auth/methods.ts`(로그인 방식 꼴과 개발 로그인, 잠금), `server/auth/sessions.ts`(토큰 만들기·확인·지우기, DB에는 해시만)를 쓴다
- [ ] T032 [US2] `server/auth/routes.ts`를 쓴다: login, logout, me, DELETE me. `server/http.ts`의 로그인 확인이 `sessions.ts`를 쓴다. 운영 모드의 시작 검사를 `server/main.ts`에 넣는다(T027 통과)
- [ ] T033 [US2] `server/me/consent.ts`(문구 파일 읽기, 동의 기록, 동의 확인 함수), `server/me/answers.ts`, `server/me/fields.ts`(분야 목록 읽기와 고른 분야), `server/me/next.ts`(다음 할 일)를 쓰고 경로를 잇는다(T028 통과). `deploy/consent.dev.md`를 둔다
- [ ] T034 [US2] `server/ingest/ingest.ts`가 목록에서 사라진 분야를 `student_fields`에서 지우게 한다(FR-008. 시험은 T018의 남은 줄)
- [ ] T035 [US2] `server/cli.ts`에 `account create|password|delete`를 더한다(비밀번호는 표준 입력, 운영 모드는 create·password 거절. 시험은 `server/cli.test.ts`)
- [ ] T036 [US2] quickstart 2를 curl로 돌려 확인한다
- [ ] T037 [US2] 단계 마무리(PR '2단계 로그인과 첫 흐름'. security-review를 함께 돌린다)

**Checkpoint**: 학생이 로그인해 첫 흐름을 마친다(홈은 아직 없다).

---

## Phase 5: User Story 4 - 공지, 카드 행동, 내 목록 (Priority: P4)

**Goal**: 열린 공지를 거르고 찾고, 세 행동을 남기고 되돌리고, 내 목록에서 다시 본다.

**Independent Test**: quickstart 3의 공지·내 목록 줄.

### Tests for User Story 4

- [ ] T038 [P] [US4] `server/notices/list.test.ts`를 쓴다(계약 시험: notices, notices/:id): spec US4의 시나리오 1·2, 종류·분야 여럿, 찾는 말 50자와 띄어쓰기·대소문자, 두 정렬(마감 없는 공지는 맨 뒤), 20개씩 나눔, 관심 없음과 다시 볼 날 전 공지는 빠짐, 닫힌 공지와 내려간 공지도 자세히에서는 표시와 함께 옴, 답에 점수·유사도 칸이 없음(FR-024)
- [ ] T039 [P] [US4] `server/notices/actions.test.ts`를 쓴다(계약 시험: PUT·DELETE action, me/list): spec US4의 시나리오 3~7, 새 행동이 앞 행동을 바꿈, 마감이 오늘이면 나중에 보기 거절, 마감이 당겨지면 바로 다시 나옴, 이유는 관심 없음에만, `done`일 때 `suggestActivity`, 내 목록의 세 표시

### Implementation for User Story 4

- [ ] T040 [US4] `server/db/migrations/004_actions.sql`을 쓴다(data-model 4의 `actions`)
- [ ] T041 [US4] `server/notices/open.ts`(열린 공지와 '이 학생에게 숨길 공지' SQL 조각, 오늘은 한국 날짜)와 `server/notices/card.ts`(NoticeCard 꼴)를 쓴다
- [ ] T042 [US4] `server/notices/list.ts`와 경로를 쓴다(T038 통과)
- [ ] T043 [US4] `server/notices/actions.ts`, `server/notices/mylist.ts`와 경로를 쓴다(T039 통과)
- [ ] T044 [US4] 단계 마무리(PR '2단계 공지와 카드 행동')

**Checkpoint**: 공지 메뉴와 내 목록이 서버만으로 돈다.

---

## Phase 6: User Story 3 - 홈: 가장 추천 하나와 선반 셋 (Priority: P3)

**Goal**: 규칙으로 추천 후보 10개를 고르고 LLM이 하나를 고른다. 모델이 없으면 규칙 1위다. 선반 셋을 준다.

**Independent Test**: quickstart 3의 홈 줄과 SC-004(Ollama를 끄고도 가장 추천이 있다).

### Tests for User Story 3

- [ ] T045 [P] [US3] `server/pick/score.test.ts`를 쓴다: research R8 표의 줄마다 점수, 같은 자료면 같은 순서, 동점은 마감 → 게시 → id 순, 분야 판정이 없으면 분야 점수 0, 채용은 3학년 이상에게만 종류 점수
- [ ] T046 [P] [US3] `server/pick/llm.test.ts`를 쓴다(가짜 모델): 답 검사(FR-035: 후보 밖, 없는 참고 줄, 빈 이유, 60자 넘음, 날짜)마다 규칙 1위로 돌아감, 모델이 `down`·`fail`이면 규칙, 규칙 문장에 날짜가 없음, 고른 방식 글자
- [ ] T047 [US3] `server/pick/repick.test.ts`를 쓴다: 같은 학생의 다시 고르기는 한 줄로 합쳐짐, 일꾼이 가장 오래된 줄부터 처리, 모델 잠금이 잡혀 있으면 기다림(두 요청이 겹치지 않음), 온도를 읽지 못하면 그 다시 고르기는 규칙
- [ ] T048 [US3] `server/pick/home.test.ts`를 쓴다(계약 시험: home): spec US3의 시나리오 1·3~10, `pickEmpty`와 선반의 `empty` 까닭 네 가지, 한 홈에 같은 공지는 한 번, 관심 있어요 공지는 가장 추천이 아니고 마감 임박에는 나옴, 다시 고르는 때(고른 분야·처음 답이 바뀜, 가장 추천 공지에 행동)

### Implementation for User Story 3

- [ ] T049 [US3] `server/db/migrations/005_picks.sql`을 쓴다(data-model 4의 `prompts`, `picks`, `repick_queue`)
- [ ] T050 [P] [US3] `server/pick/score.ts`(순수 함수)와 `server/pick/reason.ts`(규칙 문장)를 쓴다(T045 통과)
- [ ] T051 [US3] `server/model.ts`를 쓴다: Ollama 대화·임베딩 요청을 1단계 `createThrottle`과 `server/db/sql.ts`의 `withModelLock`(`sql.reserve()`로 잡은 연결의 advisory lock)으로 감싼다(research R7)
- [ ] T052 [US3] `server/pick/candidates.ts`(거르기와 후보 10개, 학생 벡터는 프롬프트·관심 있어요 공지·고른 분야의 평균)와 `server/pick/llm.ts`(지시문, 스키마, 답 검사)를 쓴다(T046 통과)
- [ ] T053 [US3] `server/pick/repick.ts`를 쓴다: 줄에 넣기, 일꾼(2초마다 하나), `server/main.ts`가 일꾼을 시작한다(T047 통과). `server/me/answers.ts`·`server/me/fields.ts`·`server/notices/actions.ts`가 다시 고르기를 건다
- [ ] T054 [US3] `server/pick/shelves.ts`와 `server/pick/home.ts`(경로 `GET /api/home`, FR-038의 바로 바꾸기)를 쓴다(T048 통과)
- [ ] T055 [US3] 실제 Ollama로 개발 계정 셋의 홈을 받아 가장 추천·이유·고른 방식을 눈으로 확인하고, Ollama를 끄고 다시 확인한다
- [ ] T056 [US3] 단계 마무리(PR '2단계 홈')

**Checkpoint**: 홈이 서버만으로 돈다(나의 분석 없이).

---

## Phase 7: User Story 5 - 나에 대한 프롬프트와 나의 분석 (Priority: P5)

**Goal**: 프롬프트를 쓰고, 기록에서 나의 분석(md)을 만들고, 줄을 빼고 되살리고 끈다. 가장 추천이 둘을 읽는다.

**Independent Test**: quickstart 4.

### Tests for User Story 5

- [ ] T057 [P] [US5] `server/analysis/lines.test.ts`를 쓴다: 사실 줄과 줄 키(research R10), 몰린 분야 규칙(관심 있어요 30일 안 2번, 관심 없음은 이유 둘만·이번 학기 안 2번, 건수는 글에 없음), 분야 판정이 없으면 몰린 분야 줄 없음, 뺀 줄은 빠짐
- [ ] T058 [P] [US5] `server/analysis/flow.test.ts`를 쓴다(가짜 모델): 근거가 없거나 없는 줄을 가리키는 문장·80자 넘는 문장·뺀 흐름과 근거가 같은 문장은 버림, 4줄까지, 실패하면 앞 흐름(가리키던 줄이 없어졌으면 빔), 사실 줄이 처음 답·고른 분야뿐이면 쓰지 않음
- [ ] T059 [US5] `server/analysis/store.test.ts`를 쓴다(계약 시험: prompt, analysis, analysis.md, excluded, off, activities): spec US5의 시나리오 1~6·9·10, 판 번호는 글이 바뀔 때만 오름(SC-013), 같은 재료면 같은 글, 활동 100개와 이름 100자, 처음 답과 고른 분야 줄은 빼지 못함, 끄면 분석과 뺀 줄이 지워지고 켜면 다시 만듦

### Implementation for User Story 5

- [ ] T060 [US5] `server/db/migrations/006_analysis.sql`을 쓴다(data-model 4의 `activities`, `excluded_lines`, `analyses`)
- [ ] T061 [P] [US5] `server/analysis/lines.ts`(순수: 재료 → 줄)와 `server/analysis/md.ts`(줄 → md)를 쓴다(T057 통과)
- [ ] T062 [US5] `server/analysis/store.ts`를 쓴다: 재료를 바꾸는 요청과 같은 트랜잭션에서 다시 쓰고, 글이 바뀌면 판을 올리고 다시 고르기를 건다. 카드 행동·처음 답·고른 분야를 바꾸는 곳이 이것을 부른다
- [ ] T063 [US5] `server/me/prompt.ts`(벡터는 만들지 못하면 비워 둠), `server/me/activities.ts`, `server/analysis/routes.ts`를 쓴다(T059 통과)
- [ ] T064 [US5] `server/analysis/flow.ts`를 쓴다(T058 통과). 매일 작업이 부를 함수다(US6에서 잇는다)
- [ ] T065 [US5] `server/pick/candidates.ts`와 `server/pick/llm.ts`가 나의 분석을 읽게 한다: 몰린 분야 점수(R8), LLM에 넣는 글(FR-034), 참고한 줄 검사와 뺀 줄 빼기(spec US3 시나리오 2, US5 시나리오 6. 시험은 `server/pick/home.test.ts`에 더한다)
- [ ] T066 [US5] quickstart 4를 확인한다(흐름은 `flow.ts`를 직접 불러 본다)
- [ ] T067 [US5] 단계 마무리(PR '2단계 나의 분석')

**Checkpoint**: 학생 기능이 모두 서버만으로 돈다(SC-003).

---

## Phase 8: User Story 7 - 운영자 판정 검토 (Priority: P7)

**Goal**: 운영자가 확인할 것을 보고 공지를 고치면 학생 화면에 바로 반영되고 다음 넣기가 덮지 않는다.

**Independent Test**: quickstart 5.

### Tests for User Story 7

- [ ] T068 [P] [US7] `server/ops/review.test.ts`를 쓴다: 넣기가 이유를 붙임(data-model의 이유 표, `off`일 때 `no_fields` 없음), 이유가 같으면 확인 상태가 남고 달라지면 풀림, 이유가 없어지면 줄이 사라짐, 확인 필요 글은 학생의 공지 목록에 없음
- [ ] T069 [US7] `server/ops/verdict.test.ts`를 쓴다(계약 시험: ops의 경로 전부): spec US7의 시나리오 1·3~9, 보낸 칸만 사람 판정이 됨, 마감을 고치면 열린 공지인지가 함께 바뀜, 분야 검사(핵심 2·관련 5·겹침·목록 밖), 답에 학생 자료가 없음(FR-055), 운영자 목록에 없는 계정은 모든 ops 경로에서 `forbidden`(SC-014)

### Implementation for User Story 7

- [ ] T070 [US7] `server/db/migrations/007_ops.sql`을 쓴다(data-model 3의 `review_items`, `human_verdicts`, `verdict_log`, `rejudge_marks`)
- [ ] T071 [US7] `server/ops/guard.ts`(운영자 목록 파일 읽기와 운영자 확인)와 `deploy/operators.example.json`을 쓴다
- [ ] T072 [US7] `server/ops/review.ts`를 쓰고 `server/ingest/ingest.ts`가 부르게 한다(T068 통과). 넣기는 사람 판정이 있는 칸을 덮지 않고 요약에 '사람 판정 유지'를 센다(FR-052)
- [ ] T073 [US7] `server/ops/verdict.ts`(고치기, 맞아요, 다시 판정, 고친 기록)와 `server/ops/routes.ts`를 쓴다(T069 통과)
- [ ] T074 [P] [US7] `server/ops/export.ts`와 `server/cli.ts`의 `export-gold <폴더>`를 쓴다(저장소 안 경로 거절. 시험은 `server/cli.test.ts`)
- [ ] T075 [US7] 단계 마무리(PR '2단계 운영자 판정 검토 API'. security-review를 함께 돌린다)
- [ ] T076 [US7] 운영자 화면을 설계한다: astryx로 PC 화면 하나(왼쪽 확인할 것 목록과 이유 거르기, 오른쪽 원문 링크·파일 값·고치는 칸·맞아요·다시 판정·고친 기록). `npx astryx build`로 틀을 고르고 화면 구성을 `specs/20261117-052701-backend-skeleton/ops-screen.md`에 적는다(Figma는 쓰지 않는다, 사용자 결정 2026-11-18)
- [ ] T077 [US7] `web/ops/`에 Vite + React + astryx 페이지를 만든다(`web/ops/index.html`, `web/ops/src/main.tsx`, `web/ops/vite.config.ts`). 자료는 `/api/ops`만 쓴다. 빈 상태·불러오는 중·오류 상태를 둔다. `server/http.ts`가 `/ops/`에서 빌드 파일을 준다
- [ ] T078 [US7] 화면을 띄워 quickstart 5를 손으로 끝까지 해 보고 스크린샷(1280×640, 1440×900)을 찍어 본다. impeccable critique(리뷰어 둘) → polish로 다듬는다
- [ ] T079 [US7] 단계 마무리(PR '2단계 운영자 판정 검토 화면')

**Checkpoint**: 판정을 사람이 고칠 수 있다.

---

## Phase 9: User Story 6 - 학교 데스크톱에서 매일 스스로 돈다 (Priority: P6)

**Goal**: 매일 03:00 작업, 백업, 부하 제한, 바깥으로 나가지 않는 묶음.

**Independent Test**: quickstart 6(학교 데스크톱에서 3일).

### Tests for User Story 6

- [ ] T080 [P] [US6] `server/jobs/daily.test.ts`를 쓴다(단계는 가짜 함수): 순서(research R14), 분류기나 넣기가 실패해도 뒤 단계가 돌고 요약에 실패가 남음, 다시 판정 표시가 분류기 앞에서 처리됨, 07:00이 지나면 기다리기를 멈춤, 요약 칸(FR-045)
- [ ] T081 [P] [US6] `server/jobs/backup.test.ts`를 쓴다(가짜 `pg_dump`): 파일 이름이 날짜, 7일 지난 파일을 지움, 비어 있지 않은 DB에는 되살리지 않음
- [ ] T082 [P] [US6] `server/outbound.test.ts`를 쓴다: `server/` 아래 코드에서 바깥 요청을 여는 곳(`fetch(`, `http.request`, `net.connect`)이 `server/model.ts` 하나뿐이다(SC-009의 정적 확인)

### Implementation for User Story 6

- [ ] T083 [US6] `server/db/migrations/008_daily.sql`(`daily_runs`)과 `server/jobs/daily.ts`를 쓴다(T080 통과): 분류기는 모델 잠금을 잡고 자식 프로세스로 돌린다. 사실 칸 다시 쓰기 → `flow.ts` → 모든 학생을 다시 고르기 줄에 넣기
- [ ] T084 [US6] `server/jobs/backup.ts`와 `server/cli.ts`의 `daily`, `backup`, `restore`, `status`를 쓴다(T081 통과)
- [ ] T085 [US6] `deploy/Dockerfile`(node:22-slim, postgresql-client-17, lm-sensors), `deploy/compose.yaml`(`db`, `ollama`, `api`, `proxy`, `jobs`, 일회용 `ollama-pull`, `inner`는 `internal: true`, `outer`), `deploy/Caddyfile`, `deploy/kingo-daily.service`·`kingo-daily.timer`를 쓴다(research R14~R16)
- [ ] T086 [US6] 이 맥에서 compose 전체를 띄워 확인한다: proxy의 8080으로 `GET /api/health`가 답함, api 컨테이너에서 바깥 주소에 닿지 못함, `daily --skip-classifier`가 돌고 요약이 남음, 백업 파일로 빈 DB에 되살려 행 수가 같음
- [ ] T087 [US6] 학교 데스크톱에 올려 확인한다(사용자와 함께: 장비 접근이 필요하다): CPU 패키지 온도가 읽히는지, 매일 작업이 3일 잇달아 도는지(SC-012), gemma4:12b의 CPU 속도를 재서 research R7의 측정 줄을 채운다
- [ ] T088 [US6] 단계 마무리(PR '2단계 운영 묶음')

**Checkpoint**: 2단계가 끝났다. 운영 모드는 통합 로그인과 학교 전산 승인 뒤에 켠다.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T089 quickstart.md의 1~7을 처음부터 끝까지 돌려 확인한다
- [ ] T090 [P] `README.md`에 서버를 띄우는 법(개발 맥, 학교 데스크톱)과 명령 표를 더한다
- [ ] T091 [P] 기획 문서의 2단계 절, 전체 시스템 구조도(문지기 proxy), 교수님 기획안의 서버 그림을 구현대로 고친다
- [ ] T092 3단계 명세를 시작하기 전에 남은 것을 적는다: 통합 로그인 방식, 동의 문구, `.nvmrc`와 이미지의 Node 올리기, GPU가 온 뒤 SC-005·SC-006 재기

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 → Phase 2 → US1 → US2 → US4 → US3 → US5 → US7 → US6 → Phase 10
- US3은 US4의 카드 행동(거르기, 관심 있어요 벡터)을 쓴다. US5는 US3의 다시 고르기를 쓴다. US7은 US1의 넣기를 고친다. US6은 US5의 흐름과 US7의 다시 판정을 잇는다
- 1단계 다듬기(`feat/field-refine`)가 `etl/notices/embed.ts`·`fields.ts`를 고친다. 서버는 `readFieldVectors`·`readNoticeVector`·`makeEmbed`·`createThrottle`·`checkTaxonomy`의 꼴만 쓰고 이 꼴은 바뀌지 않는다

### Within Each User Story

- 시험을 먼저 쓰고 실패를 본 뒤 구현한다. 마이그레이션 → 순수 함수 → DB 함수 → 경로 순서다
- 단계 마무리 작업이 끝나야 다음 단계를 시작한다(main이 늘 통과하는 상태)

### Parallel Opportunities

- 각 단계의 [P] 시험 파일들, 순수 함수 파일들(`score.ts`·`reason.ts`, `lines.ts`·`md.ts`)
- US7의 화면(T076~T079)은 API(T075)가 머지된 뒤 US6과 나란히 할 수 있다

## Parallel Example: User Story 3

```text
T045 score.test.ts   ┐
T046 llm.test.ts     ┘ 함께 쓴다
T050 score.ts · reason.ts (순수 함수)  ←→  T049 005_picks.sql
```

## Implementation Strategy

### MVP First (User Story 1 Only)

Phase 1~3이 끝나면 실제 공지가 서버에 있고 다시 넣어도 바뀌지 않는다. 여기까지가 첫 묶음이다.

### Incremental Delivery

단계마다 PR 하나다: 바탕 → 넣기 → 로그인과 첫 흐름 → 공지와 카드 행동 → 홈 → 나의 분석 → 운영자 판정 검토(API, 화면) → 운영 묶음. 각 PR은 시험과 함께 머지되고, 머지된 곳까지는 서버만으로 써 볼 수 있다.

## Notes

- 파일은 500줄을 넘기지 않는다. 시험 파일이 480줄에 가까워지면 이야기의 시나리오 묶음으로 나눈다
- 저장소에 실제 학생 자료·비밀번호·키를 넣지 않는다. `.env`, 운영자 목록, 백업은 저장소 밖이다
- 화면이 있는 작업은 T076~T079뿐이다. 학생 화면은 3단계다
