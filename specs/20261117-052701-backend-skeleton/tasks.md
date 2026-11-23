# Tasks: 2단계 백엔드 뼈대(API 서버와 DB)

**Input**: Design documents from `specs/20261117-052701-backend-skeleton/`

**Prerequisites**: plan.md, spec.md, research.md(R1~R23), data-model.md, contracts/api.md, contracts/cli.md, contracts/llm.md, quickstart.md

**Tests**: 시험을 먼저 쓴다(사용자 요청). 파일 옆 `*.test.ts`에 실패하는 시험을 쓰고 구현한다. DB가 필요한 시험은 진짜 Postgres에서 시험 파일마다 새 스키마를 쓴다(research R19).

**Organization**: 이야기별로 묶되 순서는 plan.md '만드는 순서'(바탕 → US1 → US2 → US4 → US3 → US5 → US7 → US6)다. 단계(Phase)마다 PR 하나로 올려 머지한다(조금씩).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일이고 앞 작업을 기다리지 않아 함께 할 수 있다
- 경로는 저장소 뿌리 기준이다. '계약 시험'은 contracts/api.md의 그 경로마다 되는 예 하나와 거절되는 예 하나다
- **단계 마무리**(각 Phase의 마지막 작업): `npm run check`·`npm run build` 통과 → ponytail-review → code-review(로그인·권한을 건드린 단계는 security-review도) → PR → CI와 Claude 리뷰 확인 → 머지 → 브랜치 삭제

## Phase 1: Setup

**Purpose**: 서버 코드가 설 자리와 시험용 DB

- [X] T001 `package.json`에 의존성 `postgres`를 더하고(research R3) scripts에 `"server": "node --env-file-if-exists=.env server/main.ts"`, `"cli": "node --env-file-if-exists=.env server/cli.ts"`를 넣는다(research R20). `tsconfig.json`의 `include`에 `server`를 더한다
- [X] T002 [P] `deploy/compose.dev.yaml`을 쓴다(개발·시험용 DB 하나): `pgvector/pgvector:pg17`, 사용자·비밀번호·DB 이름 모두 `kingo`(이 컴퓨터 안에서만 여는 개발 값), 이름 있는 볼륨, healthcheck(`pg_isready`), 포트 `127.0.0.1:54329:5432`. 운영 묶음(`deploy/compose.yaml`)은 US6에서 쓴다(운영의 db는 internal 네트워크에만 있어 포트를 열 수 없다, research R16)
- [X] T003 [P] `.env.example`을 쓴다(research R20 표의 변수와 개발 기본값. `DATABASE_URL`은 개발 DB 주소). `.gitignore`의 `.env.*`가 이 파일도 막으므로 `!.env.example`을 더하고, `.env`는 여전히 막히는지 `git check-ignore`로 확인한다
- [X] T004 [P] `.github/workflows/ci.yml`의 check 작업과 `.github/workflows/deploy.yml`의 check 단계(main에 push될 때 `npm run check`를 돌린다)에 `services.postgres`(같은 이미지, 사용자·비밀번호·DB `kingo`, healthcheck)와 `DATABASE_URL` 환경 변수를 더한다
- [X] T005 [P] `server/limits.ts`에 research R21의 첫 숫자 값을 이름 붙인 상수로 둔다(spec 사용자 확인 19번의 값 그대로)

---

## Phase 2: Foundational

**Purpose**: 모든 이야기가 쓰는 바탕(설정, 기록, DB 연결과 스키마 바꾸기, HTTP 틀, 시험 틀)

- [X] T006 [P] `server/config.test.ts`를 쓴다(research R20 표): `KINGO_MODE`가 없거나 dev·prod가 아니면 던진다, `DATABASE_URL`이 없으면 던진다, 기본값(`PORT` 8080, `OLLAMA_HOST`, `KINGO_LLM_MODEL`, `KINGO_API_URL`, 개발 모드의 `KINGO_CONSENT_FILE`)이 채워진다, 운영 모드에 `KINGO_CONSENT_FILE`이 없으면 던진다
- [X] T007 [P] `server/log.test.ts`를 쓴다: 한 줄 JSON이고, 요청 기록에 방법·경로 틀·상태·걸린 시간·학생 번호만 있고 본문·쿠키가 없다(FR-047)
- [X] T008 [P] `server/db/migrate.test.ts`를 쓴다: 빈 스키마에 번호 순서로 적용한다, 두 번 돌려도 한 번만 적용한다, 적용한 이름이 `schema_migrations`에 남는다
- [X] T009 `server/http.test.ts`를 쓴다: 경로 표가 `/api/notices/:id`의 `id`를 꺼낸다, 없는 경로는 404 `not_found`, JSON이 아니거나 64KB를 넘으면 400 `bad_request`, 상태를 바꾸는 요청에 같은 출처 `Origin`과 JSON `Content-Type`이 없으면 403 `bad_origin`, 오류 꼴이 `{ error: { code, message } }`, 던진 오류는 500 `server_error`이고 기록에 본문이 없다, `GET /api/health`는 `{ ok: true }` 같은 출처는 `Origin`의 host와 `Host`가 같음(스킴은 안 봄), 본문이 없는 POST는 `{}`로 봄.
- [X] T010 `server/config.ts`, `server/log.ts`를 쓴다(T006·T007 통과)
- [X] T011 `server/db/sql.ts`(연결, `search_path`를 `<스키마>, public`으로 정하기, `withModelLock`은 US3에서)와 `server/db/migrate.ts`, `server/db/migrations/001_base.sql`(`create extension if not exists vector with schema public`, `schema_migrations`)을 쓴다(T008 통과)
- [X] T012 `server/test/db.ts`를 쓴다: 시험 파일마다 `t_<무작위>` 스키마를 만들고 마이그레이션을 적용해 연결을 돌려주며, 끝나면 스키마를 지운다. 확장은 DB에 하나라 `pg_advisory_xact_lock` 안에서 `public`에 한 번 만든다(여러 시험 파일이 함께 시작해도 부딪히지 않게, research R19). 주소는 `DATABASE_URL`이고 없으면 개발 DB 주소다. DB에 닿지 못하면 `DB 시험에는 Postgres가 필요해요: docker compose -f deploy/compose.dev.yaml up -d`로 실패한다(건너뛰지 않는다)
- [X] T013 `server/http.ts`를 쓴다(T009 통과): 경로 표, `HttpError`, JSON·쿠키, `Origin` 검사, 요청 기록
- [X] T014 `server/test/app.ts`(시험에서 서버를 임시 포트로 띄우고 쿠키를 들고 요청하는 도우미)와 `server/main.ts`(설정 → DB 연결 → 적용 안 된 마이그레이션이 있으면 이유를 내고 끝 → 서버 시작)를 쓴다. `server/test/`와 `*.test.ts`는 T082의 바깥 요청 검사에서 뺀다
- [X] T015 `server/cli.test.ts`와 `server/cli.ts`의 틀을 쓴다: 명령 나누기, `migrate`, 끝 코드(0·1·2), `--json`, 모르는 명령은 쓰는 법과 2(contracts/cli.md)
- [ ] T016 단계 마무리(PR '2단계 바탕': Phase 1~2). PR 본문에 `docker compose -f deploy/compose.dev.yaml up -d`와 `npm run check`를 적는다

**Checkpoint**: 빈 서버가 뜨고 `GET /api/health`가 답한다. DB 시험이 CI에서 돈다.

---

## Phase 3: User Story 1 - 분류기 결과와 분야 목록을 넣는다 (Priority: P1) 🎯 MVP

**Goal**: 결과 파일·분야 목록·벡터를 검사해 넣고 요약을 남긴다.

**Independent Test**: quickstart 1(실제 결과 파일을 두 번 넣어 `새 126` → `새 0 · 바뀜 0`).

### Tests for User Story 1

- [X] T017 [P] [US1] `server/ingest/check.test.ts`를 쓴다: 결과 파일 계약(`specs/20261107-193624-cse-notice-opportunities/contracts/cse-notices.schema.json`)의 규칙마다 맞는 예와 어긋난 예(필수 칸, id·url·날짜 꼴, 종류 11가지, 근거 꼴, 분야는 핵심 2개·관련 5개까지이고 겹치지 않음, 머리의 분야 목록 id). 어긋난 곳의 경로와 이유를 모두 돌려준다
- [X] T018 [US1] `server/ingest/ingest.test.ts`를 쓴다(가짜 결과 파일과 `etl/taxonomy/fixtures.ts`의 목록): spec US1의 시나리오 1~7과 Edge Cases(기준일 앞 공지는 그대로, 내려간 공지가 다시 나오면 되살림, 머리의 목록 id가 `--taxonomy`와 다르면 거절, 활성 목록과 다른 목록은 `--switch` 없이 거절, 분야 id가 목록에 없으면 아무것도 바뀌지 않음, 도중에 던지면 되돌림). 확인 필요 글 둘이 든 파일: `notices`에 `is_notice`가 거짓으로 들어가고 요약이 `확인 필요 2`이며 새·바뀜·그대로에 세지 않는다, 다음 파일에서 빠지면 내려감이다, 기회가 확인 필요로 바뀌면 `is_notice`가 거짓이 된다(research R11). 벡터: 길이가 1024가 아닌 보관 벡터는 그 벡터만 넣지 않고 '못 만듦'에 센다, 벡터가 빈 공지는 다음 넣기가 다시 만들고 '그대로'로 센다. 사라진 분야가 고른 분야에서 빠지는 것은 US2(T034)에서 더한다 같은 파일을 두 번 넣으면 둘째의 벡터 세 수가 모두 0이고, 확인 필요 글은 벡터를 만들지 않음.

### Implementation for User Story 1

- [X] T019 [US1] `server/db/migrations/002_notices.sql`을 쓴다(data-model 2·3의 `taxonomies`, `field_groups`, `fields`, `notices`, `notice_fields`, 5절의 `ingest_runs`). `notices.closes_on`은 계산 칸이다
- [X] T020 [P] [US1] `server/ingest/check.ts`를 쓴다(T017 통과). 분야 목록 검사는 `etl/taxonomy/taxonomy.ts`의 `checkTaxonomy`를 부른다
- [X] T021 [P] [US1] `server/ingest/vectors.ts`를 쓴다: 분류기 보관 벡터를 `etl/notices/embed.ts`의 `readFieldVectors`·`readNoticeVector`로 읽고, 없으면 `makeEmbed`와 1단계 글 규칙(`fieldText`, `noticeText`)으로 만든다. 본문은 `etl/notices/gold.ts`의 `cachedBody`로 보관본에서만 읽고(학교 서버를 부르지 않는다) 돌려주지 않는다. 길이가 1024가 아닌 벡터는 넣지 않는다(research R11). 넣기는 `embed` 함수를 인자로 받는다. 이 단계의 `ingest` 명령은 `createThrottle()` 문 하나를 `makeEmbed({ gate })`에 넣어 쓴다(부하 제한은 지난다. 모델 잠금은 T051 뒤에 더한다)
- [X] T022 [US1] `server/ingest/ingest.ts`를 쓴다(T018 통과): 한 트랜잭션에서 비교하고 쓴다(research R11, R22). 확인 필요 글도 여기서 `is_notice` 거짓으로 넣는다(확인할 것의 이유는 US7의 T072). 활성 목록 정하기와 `--switch` 갈아타기를 한다. 요약은 FR-007의 칸이다. 운영 모드는 `chosen`이 없는 목록을 거절한다
- [X] T023 [US1] `server/cli.ts`에 `ingest <결과 파일> --taxonomy <id> [--switch] [--dry-run]`을 더한다(출력 문구는 contracts/cli.md, 시험은 `server/cli.test.ts`)
- [X] T024 [US1] quickstart 1을 실제 파일로 돌려 확인하고 요약 줄을 PR 본문에 적는다
- [ ] T025 [US1] 단계 마무리(PR '2단계 넣기')

**Checkpoint**: 서버에 실제 공지 126건과 분야 목록이 있다.

---

## Phase 4: User Story 2 - 로그인, 동의, 처음 질문, 분야 고르기 (Priority: P2)

**Goal**: 개발 로그인으로 들어와 동의 → 처음 질문 → 분야 3개를 마치면 다음 할 일이 홈이다.

**Independent Test**: quickstart 2.

### Tests for User Story 2

- [X] T026 [P] [US2] `server/auth/password.test.ts`를 쓴다: 같은 비밀번호도 저장 글이 다르다(솔트), 맞으면 참·틀리면 거짓, 꼴이 틀린 저장 글은 거짓, 8자 미만은 거절
- [X] T027 [US2] `server/auth/auth.test.ts`를 쓴다(계약 시험: login, logout, me, DELETE me): spec US2의 시나리오 1·5·6·7·8·9, 30일이 지난 로그인은 `login_required`, 쓸 때 늘어남, 로그아웃하면 그 쿠키가 바로 끝남, 운영 모드에 켜진 로그인 방식이 없으면 서버가 시작하지 않고 이유를 냄, 시험용 로그인 방식을 켠 운영 모드 서버에서 개발 로그인은 `login_off`(SC-008), 운영 모드는 판이 `dev-`로 시작하는 동의 문구로는 시작하지 않음(research R23), 쿠키 속성(HttpOnly, SameSite=Lax, Path=/, Max-Age 30일, 운영 모드 Secure) 운영 모드에서 `X-Forwarded-Proto: https`가 없는 로그인은 `https_required`, 잠금이 끝난 뒤 첫 시도는 실패 수를 0부터 셈.
- [X] T028 [US2] `server/me/onboarding.test.ts`를 쓴다(계약 시험: consent, answers, fields, me/fields): spec US2의 시나리오 2·3·4, `next`의 네 값, 문구 판이 바뀌면 다시 `consent`(R23), 목록이 바뀌어 고른 분야가 3개보다 적어지면 `next`가 `fields`(FR-008), `GET /api/fields`가 목록 순서대로 준다

### Implementation for User Story 2

- [X] T029 [US2] `server/db/migrations/003_students.sql`을 쓴다(data-model 1의 `students`, `login_methods`, `sessions`, `consents`, `answers`, `student_fields`)
- [X] T030 [P] [US2] `server/auth/password.ts`를 쓴다(scrypt, research R5. T026 통과)
- [X] T031 [US2] `server/auth/methods.ts`(로그인 방식 꼴과 개발 로그인, 잠금), `server/auth/sessions.ts`(토큰 만들기·확인·지우기, DB에는 해시만)를 쓴다
- [X] T032 [US2] `server/auth/routes.ts`를 쓴다: login, logout, me, DELETE me. `server/http.ts`의 로그인 확인이 `sessions.ts`를 쓴다. 운영 모드의 시작 검사를 `server/main.ts`에 넣는다(T027 통과)
- [X] T033 [US2] `server/me/consent.ts`(문구 파일 읽기, 동의 기록, 동의 확인 함수), `server/me/answers.ts`, `server/me/fields.ts`(분야 목록 읽기와 고른 분야), `server/me/next.ts`(다음 할 일)를 쓰고 경로를 잇는다(T028 통과). `deploy/consent.dev.md`를 둔다
- [X] T034 [US2] `server/ingest/ingest.ts`가 목록에서 사라진 분야를 `student_fields`에서 지우고, `--switch`로 갈아탈 때는 모두 지우게 한다(FR-008, research R11. 시험은 `server/ingest/ingest.test.ts`에 더한다)
- [X] T035 [US2] `server/cli.ts`에 `account create|password|delete`를 더한다(비밀번호는 표준 입력, 운영 모드는 create·password 거절. 시험은 `server/cli.test.ts`)
- [X] T036 [US2] quickstart 2를 curl로 돌려 확인한다(홈 줄은 홈이 생긴 뒤 T055에서 본다)
- [ ] T037 [US2] 단계 마무리(PR '2단계 로그인과 첫 흐름'. security-review를 함께 돌린다)

**Checkpoint**: 학생이 로그인해 첫 흐름을 마친다(홈은 아직 없다).

---

## Phase 5: User Story 4 - 공지, 카드 행동, 내 목록 (Priority: P4)

**Goal**: 열린 공지를 거르고 찾고, 세 행동을 남기고 되돌리고, 내 목록에서 다시 본다.

**Independent Test**: quickstart 3의 공지·내 목록 줄.

### Tests for User Story 4

- [X] T038 [P] [US4] `server/notices/list.test.ts`를 쓴다(계약 시험: notices, notices/:id): spec US4의 시나리오 1·2, 종류·분야 여럿, 찾는 말 띄어쓰기·대소문자와 50자를 넘으면 `too_long`, 모르는 종류·정렬은 `invalid`, 열린 공지가 없으면 `empty`가 `no_open_notices`이고 거르기에 맞는 것이 없으면 `no_match`, 두 정렬(마감 없는 공지는 맨 뒤), 20개씩 나눔, 관심 없음과 다시 볼 날 전 공지는 빠짐, 닫힌 공지와 내려간 공지·공지가 아니게 된 글도 자세히에서는 표시와 함께 옴(목록에는 없음), 답에 점수·유사도 칸이 없음(FR-024) 정렬 동점은 글 번호 큰 순, `cursor`로 다음 20개, 공지가 아닌 글은 행동이 없으면 자세히가 `not_found`.
- [X] T039 [P] [US4] `server/notices/actions.test.ts`를 쓴다(계약 시험: PUT·DELETE action, me/list): spec US4의 시나리오 3~7, 새 행동이 앞 행동을 바꿈, 마감이 오늘이면 나중에 보기 거절, 마감이 당겨지면 바로 다시 나옴, 이유는 관심 없음에만, `done`일 때 `suggestActivity`의 네 칸(api.md), 내 목록의 세 표시와 순서(행동한 때 최근 순) 열린 공지가 아니면 새 행동은 `invalid`이고 지우기는 됨, 1월에 받은 `suggestActivity.term`은 앞 해의 2학기.

### Implementation for User Story 4

- [X] T040 [US4] `server/db/migrations/004_actions.sql`을 쓴다(data-model 4의 `actions`)
- [X] T041 [US4] `server/notices/open.ts`(열린 공지와 '이 학생에게 숨길 공지' SQL 조각, 오늘은 한국 날짜)와 `server/notices/card.ts`(NoticeCard 꼴)를 쓴다
- [X] T042 [US4] `server/notices/list.ts`와 경로를 쓴다(T038 통과)
- [X] T043 [US4] `server/notices/actions.ts`, `server/notices/mylist.ts`와 경로를 쓴다(T039 통과)
- [ ] T044 [US4] 단계 마무리(PR '2단계 공지와 카드 행동')

**Checkpoint**: 공지 메뉴와 내 목록이 서버만으로 돈다.

---

## Phase 6: User Story 3 - 홈: 가장 추천 하나와 선반 셋 (Priority: P3)

**Goal**: 규칙으로 추천 후보 10개를 고르고 LLM이 하나를 고른다. 모델이 없으면 규칙 1위다. 선반 셋을 준다.

**Independent Test**: quickstart 3의 홈 줄과 SC-004(Ollama를 끄고도 가장 추천이 있다).

### Tests for User Story 3

- [x] T045 [P] [US3] `server/pick/score.test.ts`를 쓴다: research R8 표의 줄마다 점수, 같은 자료면 같은 순서, 동점은 마감 → 게시 → id 순, 분야가 붙지 않은 공지(`off`·`missing`)는 분야 점수 0이고 `off`인 공지들 사이에 운영자가 분야를 넣은(`human`) 공지 하나는 분야 점수를 받음, 학생 벡터(세 묶음의 평균, 묶음이 없으면 벡터 점수 0), 규칙 문장(research R8 표의 조각과 조건이 없을 때의 문장, 날짜·날 수 없음), 채용은 3학년 이상에게만 종류 점수 동점 예(닫히는 날 같음 → 게시일 → 글 번호), 규칙 문장의 같은 점수 조건 순서와 남은 날 14일은 마감 조각 없음.
- [x] T046 [P] [US3] `server/pick/llm.test.ts`를 쓴다(가짜 모델): contracts/llm.md의 가장 추천 답 검사 표의 줄마다(꼴, 후보, 이유, 날짜 정규식의 예 여섯, 참고한 줄) 규칙 1위로 돌아감, 재료 글의 꼴(후보 줄, 칸이 없을 때 빠짐), 모델이 `down`·`fail`이면 규칙, 규칙 문장에 날짜가 없음, 고른 방식 글자
- [x] T047 [US3] `server/pick/repick.test.ts`를 쓴다: 같은 학생의 다시 고르기는 한 줄로 합쳐짐, 계산 중에 다시 걸리면 끝난 뒤 행이 남아 한 번 더 고름, 계산이 던지면 행이 남음, 일꾼이 가장 오래된 줄부터 처리, 모델 잠금이 잡혀 있으면 기다림(두 요청이 겹치지 않음), 줄이 비면 부하 제한을 닫고 `model_bursts`에 한 줄이 남음, 온도를 읽지 못하면 그 다시 고르기만 규칙이고 다음 일은 새 부하 제한으로 다시 물어봄(research R7), 프롬프트 벡터가 비어 있으면 그 학생 차례에 만들어 채우고 임베딩이 실패하면 비운 채 고름(research R9)
- [x] T048 [US3] `server/pick/home.test.ts`를 쓴다(계약 시험: home): spec US3의 시나리오 1·3~10, `pickEmpty`와 선반의 `empty` 까닭 네 가지(`no_field_verdicts`는 열린 공지 가운데 분야가 붙은 것이 없을 때, research R8), 비슷한 공지 선반의 순서(관심 있어요 공지와의 유사도 가운데 가장 큰 값), FR-038의 바로 바꾸기(다시 볼 날이 된 나중에 보기 공지는 그대로 둠), 한 홈에 같은 공지는 한 번, 관심 있어요 공지는 가장 추천이 아니고 마감 임박에는 나옴, 다시 고르는 때(고른 분야·처음 답이 바뀜, 가장 추천 공지에 행동) 선반 자르기 순서와 겹침 빼기, 모두 걸러졌을 때 `pickEmpty`가 `no_match`.

### Implementation for User Story 3

- [x] T049 [US3] `server/db/migrations/005_picks.sql`을 쓴다(data-model 4의 `prompts`, `picks`, `repick_queue`, 5절의 `model_bursts`)
- [x] T050 [P] [US3] `server/pick/score.ts`(순수 함수)와 `server/pick/reason.ts`(규칙 문장)를 쓴다(T045 통과)
- [x] T051 [US3] `server/model.test.ts`(가짜 `post`, contracts/llm.md '시험')와 `server/model.ts`를 쓴다: `openModel()`이 부하 제한 하나와 `chat`·`embed`를 묶어 주고 `close()`가 `model_bursts`에 요약을 남긴다. 요청은 1단계 `postOnce`로 보내고 `server/db/sql.ts`의 `withModelLock`(`sql.reserve()`로 잡은 연결의 advisory lock, 키는 스키마 이름으로)으로 감싼다(research R7)
- [x] T052 [US3] `server/pick/candidates.ts`(거르기와 후보 10개, 학생 벡터는 research R8의 식)와 `server/pick/llm.ts`(contracts/llm.md의 지시문, 재료, 스키마, 답 검사)를 쓴다(T046 통과)
- [x] T053 [US3] `server/pick/repick.ts`를 쓴다: 줄에 넣기, 일꾼(2초마다 하나. 부하 제한을 여닫는 때와 프롬프트 벡터 채우기는 research R7·R9), `server/main.ts`가 일꾼을 시작한다(T047 통과). `server/me/answers.ts`·`server/me/fields.ts`·`server/notices/actions.ts`가 다시 고르기를 건다
- [x] T054 [US3] `server/pick/shelves.ts`와 `server/pick/home.ts`(경로 `GET /api/home`, FR-038의 바로 바꾸기)를 쓴다(T048 통과)
- [x] T054b [US3] `ingest` 명령과 매일 작업의 넣기 단계가 `openModel()`의 `embed`를 쓰게 바꾼다(모델 잠금 안). 모델 잠금이 잡혀 있으면 넣기의 임베딩이 기다리는 시험을 `server/ingest/ingest.test.ts`에 더한다
- [x] T055 [US3] 실제 Ollama로 개발 계정 셋의 홈을 받아 가장 추천·이유·고른 방식을 눈으로 확인하고, Ollama를 끄고 다시 확인한다
- [ ] T056 [US3] 단계 마무리(PR '2단계 홈')

**US3 결과(2026-11-23)**: 시험은 `pick/score.test.ts`·`pick/llm.test.ts`·`pick/home.test.ts`(다시 고르기 일꾼 시험 포함, `repick.test.ts`는 따로 두지 않음)·`model.test.ts`. 줄의 `queued_at`은 글자로 비교한다(postgres.js가 시각 값을 밀리초로 잘라 보내 같은 행을 못 지웠음). 넣기 임베딩의 잠금 기다림은 `model.test.ts`의 잠금 시험으로 갈음했다. T055(gemma4:12b, 열린 공지 8개, 학생 셋): 처음에는 셋 중 둘이 없는 키(`취업`)나 프롬프트 없는 `prompt`를 참고한 줄로 대 규칙 1위로 떨어졌다 → 재료 끝에 '참고한 줄로 댈 수 있는 키'를 적자 셋 중 둘이 LLM 답으로 통과. 남은 문제: 이유가 해요체가 아니라 '~습니다'로 나오기도 한다(답 검사 밖, 6단계에서 지시문 예시로 다룰 것). 모델을 끄면 셋 모두 규칙 1위와 규칙 문장(SC-004).

**Checkpoint**: 홈이 서버만으로 돈다(나의 분석 없이).

---

## Phase 7: User Story 5 - 나에 대한 프롬프트와 나의 분석 (Priority: P5)

**Goal**: 프롬프트를 쓰고, 기록에서 나의 분석(md)을 만들고, 줄을 빼고 되살리고 끈다. 가장 추천이 둘을 읽는다.

**Independent Test**: quickstart 4.

### Tests for User Story 5

- [x] T057 [P] [US5] `server/analysis/lines.test.ts`를 쓴다: 사실 줄과 줄 키(research R10), 몰린 분야 규칙(관심 있어요 30일 안 2번, 관심 없음은 이유 둘만·이번 학기 안 2번, 건수는 글에 없음), 분야가 붙지 않은 공지의 행동은 몰린 분야에 세지 않음, 뺀 줄은 빠짐, 줄마다 글의 틀·출처·증빙(research R10 표), md 전체가 R10의 예와 글자까지 같음(빈 칸은 '아직 없어요') 1월의 '이번 학기' 창은 앞 해 9월 1일부터.
- [x] T058 [P] [US5] `server/analysis/flow.test.ts`를 쓴다(가짜 모델): contracts/llm.md의 흐름 답 검사 표의 줄마다(근거, 길이, 뺀 흐름, 근거 키가 같은 둘째 문장) 버림, 4줄까지, 실패하면 앞 흐름(가리키던 줄이 없어졌으면 빔), 사실 줄이 처음 답·고른 분야뿐이면 쓰지 않음 흐름을 쓴 뒤 `flow_version`이 오른 뒤의 `version`과 같음.
- [x] T059 [US5] `server/analysis/store.test.ts`를 쓴다(계약 시험: prompt, analysis, analysis.md, excluded, off, activities): spec US5의 시나리오 1~6·9·10, 판 번호는 글이 바뀔 때만 오름(SC-013), 같은 재료면 같은 글, 활동 100개와 이름 100자, 증빙 주소 검사, 남의 활동 번호는 `not_found`, 분석이 꺼졌을 때 `analysis.md`와 줄 빼기는 `analysis_off`, 넣기가 목록에서 사라진 분야를 활동의 분야에서 뺌(활동은 남음), 처음 답과 고른 분야 줄은 빼지 못함, 끄면 분석과 뺀 줄이 지워지고 켜면 다시 만듦 활동을 지우면 그 줄을 가리키던 흐름 문장이 빠짐.

### Implementation for User Story 5

- [x] T060 [US5] `server/db/migrations/006_analysis.sql`을 쓴다(data-model 4의 `activities`, `excluded_lines`, `analyses`)
- [x] T061 [P] [US5] `server/analysis/lines.ts`(순수: 재료 → 줄)와 `server/analysis/md.ts`(줄 → md)를 쓴다(T057 통과)
- [x] T062 [US5] `server/analysis/store.ts`를 쓴다: 재료를 바꾸는 요청과 같은 트랜잭션에서 다시 쓰고, 글이 바뀌면 판을 올리고 다시 고르기를 건다. 카드 행동·처음 답·고른 분야를 바꾸는 곳이 이것을 부른다
- [x] T063 [US5] `server/me/prompt.ts`(요청에서는 모델을 부르지 않는다: 글을 쓰고 벡터를 비우고 다시 고르기를 건다, research R9), `server/me/activities.ts`, `server/analysis/routes.ts`를 쓴다(T059 통과). `server/ingest/ingest.ts`가 사라진 분야를 `activities.field_ids`와 `liked:`·`disliked:` 뺀 줄에서도 빼게 한다
- [x] T064 [US5] `server/analysis/flow.ts`를 쓴다(contracts/llm.md의 흐름 쓰기. T058 통과). 매일 작업이 부를 함수다(US6에서 잇는다)
- [x] T065 [US5] `server/pick/candidates.ts`와 `server/pick/llm.ts`가 나의 분석을 읽게 한다: 몰린 분야 점수(R8), LLM에 넣는 글(FR-034), 참고한 줄 검사와 뺀 줄 빼기(spec US3 시나리오 2, US5 시나리오 6. 시험은 `server/pick/home.test.ts`에 더한다)
- [x] T066 [US5] quickstart 4를 확인한다(흐름은 `flow.ts`를 직접 불러 본다)
- [ ] T067 [US5] 단계 마무리(PR '2단계 나의 분석')

**US5 결과(2026-11-23)**: 줄과 md는 `analysis/lines.ts` 한 파일(md.ts를 따로 두지 않음), 프롬프트·활동·분석 경로는 `analysis/routes.ts` 한 파일. 재료 쓰기와 분석 다시 쓰기는 한 트랜잭션이 아니다(겹치면 판이 한 번 덜 오를 수 있고 다음 다시 쓰기가 맞춤, 코드에 ponytail 주석). T066(gemma4:12b, 활동 셋): 흐름 4줄이 써지고 `flow_version`이 판과 같음. 이때 앞의 두 줄이 처음 답·고른 분야를 되풀이할 뿐이라, 리뷰 뒤 근거 키가 둘보다 적은 문장을 버리게 했다(contracts/llm.md 표 고침). 몰린 분야는 날짜로 바뀌어 분석은 읽을 때마다 다시 쓰고, 넣기 뒤에도 모두 다시 쓴다.

**Checkpoint**: 학생 기능이 모두 서버만으로 돈다(SC-003).

---

## Phase 8: User Story 7 - 운영자 판정 검토 (Priority: P7)

**Goal**: 운영자가 확인할 것을 보고 공지를 고치면 학생 화면에 바로 반영되고 다음 넣기가 덮지 않는다.

**Independent Test**: quickstart 5.

### Tests for User Story 7

- [ ] T068 [P] [US7] `server/ops/review.test.ts`를 쓴다: 넣기가 이유를 붙임(data-model의 이유 표, `off`일 때 `no_fields` 없음), 이유가 같으면 확인 상태가 남고 달라지면 풀림, 이유가 없어지면 줄이 사라짐, 확인 필요 글은 학생의 공지 목록에 없음, `reason=review` 거르기가 `review:`로 시작하는 이유를 모두 맞춤
- [ ] T069 [US7] `server/ops/verdict.test.ts`를 쓴다(계약 시험: ops의 경로 전부): spec US7의 시나리오 1·3~9, 보낸 칸만 사람 판정이 됨, 고친 공지는 확인한 것으로 남음, `OpsNotice`가 api.md의 예와 같은 꼴, 고친 기록의 `by`가 운영자 목록의 `subject` 글, 마감을 고치면 열린 공지인지가 함께 바뀜, 분야 검사(핵심 2·관련 5·겹침·목록 밖), 답에 학생 자료가 없음(FR-055), 운영자 목록에 없는 계정은 모든 ops 경로에서 `forbidden`(SC-014) 확인 필요 글에 `isNotice: true`만 보내면 `invalid`(종류 없음), 넣기가 사람 판정 분야를 뺄 때 고친 기록이 `by` `ingest`.

### Implementation for User Story 7

- [ ] T070 [US7] `server/db/migrations/007_ops.sql`을 쓴다(data-model 3의 `review_items`, `human_verdicts`, `verdict_log`, `rejudge_marks`)
- [ ] T071 [US7] `server/ops/guard.ts`(운영자 목록 파일을 시작할 때 한 번 읽기와 운영자 확인. 파일이 없으면 운영자 없음)와 `deploy/operators.example.json`(research R17의 꼴)을 쓴다
- [ ] T072 [US7] `server/ops/review.ts`를 쓰고 `server/ingest/ingest.ts`가 부르게 한다(T068 통과). 넣기는 사람 판정이 있는 칸을 덮지 않고 요약에 '사람 판정 유지'를 센다(FR-052). 목록에서 사라진 분야는 사람 판정의 분야에서도 빼고 고친 기록에 남긴다(research R11)
- [ ] T073 [US7] `server/ops/verdict.ts`(고치기, 맞아요, 다시 판정, 고친 기록)와 `server/ops/routes.ts`를 쓴다(T069 통과)
- [ ] T074 [P] [US7] `server/ops/export.ts`와 `server/cli.ts`의 `export-gold <폴더>`를 쓴다: 파일 이름과 칸은 contracts/cli.md '정답셋 후보 내보내기'. 저장소 안 경로는 `etl/notices/gold.ts`의 `insideRepo`(내보내기만 더한다)로 거절한다. 시험은 `server/cli.test.ts`
- [ ] T075 [US7] 단계 마무리(PR '2단계 운영자 판정 검토 API'. security-review를 함께 돌린다)
- [ ] T076 [US7] 운영자 화면을 설계한다: `@astryxdesign/core`(0.7 판)와 개발용 `@astryxdesign/cli`를 `package.json`에 더하고, astryx로 PC 화면 하나(왼쪽 확인할 것 목록과 이유 거르기, 오른쪽 원문 링크·파일 값·고치는 칸·맞아요·다시 판정·고친 기록, 로그인 칸)를 잡는다. `npx astryx build`로 틀을 고르고 화면 구성을 `specs/20261117-052701-backend-skeleton/ops-screen.md`에 적는다(목차: 영역, 영역마다 쓰는 astryx 컴포넌트, 상태별 화면 — 불러오는 중·빈 목록·오류·로그인·권한 없음)(Figma는 쓰지 않고 강조색은 기본 테마다, 사용자 결정 2026-11-18, research R17)
- [ ] T077 [US7] `web/ops/`에 Vite + React + astryx 페이지를 만든다(`web/ops/index.html`, `web/ops/src/main.tsx`, `web/ops/vite.config.ts`: `base: '/ops/'`, 결과는 `web/ops/dist`). `package.json`에 `"build:ops": "vite build --config web/ops/vite.config.ts"`를 더하고 `tsconfig.json`의 `include`에 `web`을, CI의 build 단계에 `npm run build:ops`를 더한다. 자료는 `/api/ops`만 쓴다. 빈 상태·불러오는 중·오류 상태와, `login_required`면 로그인 칸·`forbidden`이면 '운영자 계정이 아니에요'를 둔다. `server/http.ts`가 `/ops/`에서 `web/ops/dist`의 파일을 로그인 없이 준다(폴더가 없으면 404). `server/http.test.ts`에 정적 파일 시험(폴더 없으면 404, `/ops/`는 index, `..`로 폴더 밖을 가리키면 404)을 더한다
- [ ] T078 [US7] 화면을 띄워 quickstart 5를 손으로 끝까지 해 보고 스크린샷(1280×640, 1440×900)을 찍어 본다. impeccable critique(리뷰어 둘) → polish로 다듬는다
- [ ] T079 [US7] 단계 마무리(PR '2단계 운영자 판정 검토 화면')

**Checkpoint**: 판정을 사람이 고칠 수 있다.

---

## Phase 9: User Story 6 - 학교 데스크톱에서 매일 스스로 돈다 (Priority: P6)

**Goal**: 매일 03:00 작업, 백업, 부하 제한, 바깥으로 나가지 않는 묶음.

**Independent Test**: quickstart 6(학교 데스크톱에서 3일).

### Tests for User Story 6

- [ ] T080 [P] [US6] `server/jobs/daily.test.ts`를 쓴다(단계는 가짜 함수): 순서(research R14), 분류기나 넣기가 실패해도 뒤 단계가 돌고 요약에 실패가 남음, 활성 목록이 없으면 넣기 단계만 실패함, 다시 판정 표시가 분류기 앞에서 처리되고 지울 세 경로가 research R11과 같음, 07:00이 되면 기다리기를 멈추고 줄에 남은 학생은 그대로이며 요약의 `left`에 그 수가 남음, 07:00이 지나 시작하면 기다리지 않음, 요약 값의 출처(다시 고른 수와 규칙 수는 `picks`, 부하는 `model_bursts`) 분류기가 실패하면 넣기는 `skipped`, 분류기 출력에 `부하:` 줄이 없는 날은 부하 줄이 빔, `steps`의 단계 이름과 칸(data-model 5절).
- [ ] T081 [P] [US6] `server/jobs/backup.test.ts`를 쓴다(가짜 `pg_dump`): 파일 이름이 `kingo-YYYY-MM-DD.dump`(한국 날짜)이고 같은 날은 덮어씀, 이름의 날짜가 7일 이상 앞선 파일만 지움(꼴이 다른 파일은 둠), 비어 있지 않은 DB(`students`나 `notices`에 행이 있음)에는 되살리지 않음
- [ ] T082 [P] [US6] `server/outbound.test.ts`를 쓴다(SC-009의 정적 확인): `server/` 아래에서 `*.test.ts`와 `server/test/`를 뺀 파일 가운데 바깥 요청을 여는 곳(`fetch(`, `http.request`, `net.connect`)이 `server/model.ts`(모델 서버)와 `server/jobs/status.ts`(api 상태 확인) 둘뿐이다. `server/`(시험 파일 제외)가 가져오는 `etl/` 파일은 이 목록뿐이다(파일 단위로 본다): `etl/taxonomy/taxonomy.ts`, `etl/notices/embed.ts`, `throttle.ts`, `sensors.ts`, `llm.ts`, `fields.ts`, `cse.ts`, `gold.ts`, `classify.ts`. 바깥 요청은 `llm.ts`의 `fetchPost`로도 나가므로 `server/model.ts`와 `server/ingest/vectors.ts` 말고는 `postOnce`·`makeEmbed`·`fetchPost`를 부르지 않는지도 본다

### Implementation for User Story 6

- [ ] T083 [US6] `server/db/migrations/008_daily.sql`(`daily_runs`)과 `server/jobs/daily.ts`를 쓴다(T080 통과): research R14의 단계 순서 그대로다. 분류기는 모델 잠금을 잡고 자식 프로세스로 돌린다. 넣기는 DB의 활성 목록 id로 한다
- [ ] T084 [US6] `server/jobs/status.test.ts`(다섯 줄, 하나라도 닿지 못하면 1)를 쓰고 `server/jobs/backup.ts`, `server/jobs/status.ts`와 `server/cli.ts`의 `daily`, `backup`, `restore`, `status`를 쓴다(contracts/cli.md의 '상태 보기'와 '백업과 되살리기'. T081 통과)
- [ ] T085 [US6] `deploy/Dockerfile`과 `.dockerignore`(research R16 '이미지': node:22-slim, PGDG의 postgresql-client-17, lm-sensors, 저장소 복사, `npm ci`, `npm run build:ops`), `deploy/compose.yaml`(`db`, `ollama`, `api`, `proxy`, `jobs`, 일회용 `ollama-pull`, `inner`는 `internal: true`, `outer`, R16의 볼륨 표, `env_file`), `deploy/Caddyfile`, `deploy/kingo-daily.service`(`WorkingDirectory=/opt/kingo`, `docker compose -f deploy/compose.yaml run --rm jobs node server/cli.ts daily`)·`kingo-daily.timer`를 쓴다(research R14~R16)
- [ ] T086 [US6] 이 맥에서 compose 전체를 띄워 확인한다: proxy의 8080으로 `GET /api/health`가 답함, api 컨테이너에서 바깥 주소에 닿지 못함, jobs 컨테이너에서 `daily --skip-classifier`와 `status`가 돌고 요약이 남음, 컨테이너를 지우고 다시 돌려도 `etl/.cache`와 `etl/out`이 볼륨에 남음, 백업 파일로 빈 DB에 되살려 행 수가 같음
- [ ] T087 [US6] 학교 데스크톱에 올려 확인한다(사용자와 함께: 장비 접근이 필요하다): CPU 패키지 온도가 읽히는지, 매일 작업이 3일 잇달아 도는지(SC-012), gemma4:12b의 CPU 속도를 재서 research R7의 측정 줄을 채운다
- [ ] T088 [US6] 단계 마무리(PR '2단계 운영 묶음')

**Checkpoint**: 2단계가 끝났다. 운영 모드는 통합 로그인과 학교 전산 승인 뒤에 켠다.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T089 quickstart.md의 1~7을 처음부터 끝까지 돌려 확인한다. SC-007을 잰다: 개발 DB에 시험용 학생 1,000명과 공지 3,000건을 만들어(일회용 스크립트, 저장소 밖) 홈·공지 목록·내 목록·나의 분석을 100번씩 부르고 95번째 값이 1초 안인지 PR 본문에 적는다
- [ ] T090 [P] `README.md`에 서버를 띄우는 법(개발 맥, 학교 데스크톱)과 명령 표를 더한다
- [ ] T091 [P] 저장소 밖 문서를 구현대로 고친다: 기획 문서(Claude Docs '킹고 컴패니언 새 기획')의 2단계 절, 전체 시스템 구조도 아티팩트(문지기 proxy), 교수님 기획안(Claude Docs)의 서버 그림
- [ ] T092 3단계 명세를 시작하기 전에 남은 것을 기획 문서의 '아직 정하지 않은 것' 목록에 적는다: 통합 로그인 방식, 동의 문구, `.nvmrc`와 이미지의 Node 올리기, GPU가 온 뒤 SC-005·SC-006 재기

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 → Phase 2 → US1 → US2 → US4 → US3 → US5 → US7 → US6 → Phase 10
- US3은 US4의 카드 행동(거르기, 관심 있어요 벡터)을 쓴다. US5는 US3의 다시 고르기를 쓴다. US7은 US1의 넣기를 고친다. US6은 US5의 흐름과 US7의 다시 판정을 잇는다
- 1단계 다듬기(`feat/field-refine`)가 `etl/notices/embed.ts`·`fields.ts`·`gold.ts`를 고친다. 서버는 T082에 적은 이름만 쓰고 이 꼴은 바뀌지 않는다. 다듬기가 머지된 뒤 그 위에서 시작한다

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
