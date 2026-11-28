# Tasks: 4단계 첫 명세 — 운영자 '분야 관계'

**Input**: `specs/20261128-171415-field-relations/`의 [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md)

**시험**: 시험 작업이 구현 작업 앞이고, 시험이 실패하는 것을 본 뒤 구현한다. DB 시험은 `server/test/db.ts`의 새 스키마, HTTP 시험은 `server/test/app.ts`, 운영자 로그인은 기존 ops 시험(`server/ops/models.test.ts`)의 도움 함수를 쓴다.

**차례**: 단계마다 PR 하나(plan '만드는 순서와 PR'). [P]는 앞 작업을 기다리지 않고 다른 파일이라 함께 할 수 있다. 다음 단계는 앞 단계의 PR이 머지된 뒤 시작한다.

**PR마다 끝에 하는 것**(작업으로 따로 적지 않음): `npm run check`, 화면이 바뀌었으면 `npm run e2e:ops`·눈으로 보기·`impeccable audit`·`polish`, `ponytail-review`, `/code-review`(A·D는 `/security-review`도), PR(`gh pr create -R tapetapetap/ssa-kingo-companion`), CI, Claude 리뷰 읽기, 머지.

## Phase 1: Setup

- [ ] T001 `.gitignore`와 `.dockerignore`에 `etl/taxonomy/versions/`를 더한다(판 파일은 서버에만, plan Storage)
- [ ] T002 [P] `package.json`에 `e2e:ops`(`node scripts/e2e-ops/run.mjs`)를 더하고, `scripts/e2e-app/run.mjs`의 화면 검사 함수(가로 넘침·axe·문구·44px)를 `scripts/e2e-app/checks.mjs`로 빼서 두 스크립트가 함께 쓰게 한다(동작은 그대로, `npm run e2e:app`이 통과하는지 본다)

## Phase 2: Foundational — 동의어 칸과 분야 판(PR A)

**목표**: 동의어가 판정에 들어갈 자리와, 지금 판을 DB에서 읽어 분류기·넣기·재기가 쓰는 길. 동의어가 비면 모든 것이 지금과 같다.

- [ ] T003 시험: `etl/notices/fields.test.ts`·`etl/notices/embed.test.ts`에 SC-006을 고정한다. 바탕 custom의 `fieldVersion`이 `73a2661c`, 분야 글 sha(`listSha`)가 지금 값(시험에서 한 번 계산해 상수로 적음)과 같다. 'llm'에 동의어 둘을 넣은 목록은 `fieldText`가 `… > LLM (다른 이름: a, b): …`, `systemFor` 줄이 `- LLM (다른 이름: a, b): …`, 판이 달라진다. `schemaFor`의 enum에는 동의어가 없다. 분야 글 sha는 `fieldVectors`가 쓴 파일 이름(`<id>-<sha>.json`)으로 확인한다(`listSha`는 export하지 않는다)
- [ ] T004 시험: `etl/taxonomy/taxonomy.test.ts`에 `shapeError`가 `aliases`(문자열 목록, 없어도 됨)를 받아들이고 꼴이 틀리면 거부하는지, `normalizeWord`(NFKC→소문자→빈칸 제거), `mergeDraft(합친 바탕, 초안 줄들)`(같은 id만 덮고 없어진 분야 줄은 빼고 돌려줌), `baseMerge(바탕, 지금 판)`(바탕의 판정 판이 지금 판의 `base_version`과 다르면 새 바탕에 지금 판의 바탕과 다른 동의어·정의를 얹음, research R5), `aliasOverlaps(목록)`(다른 분야의 이름·동의어와 겹친 말 목록), `loadTaxonomyFile(path)`(경로 하나를 읽어 파일 안 `id`로 꼴 검사)를 더한다
- [ ] T005 `etl/taxonomy/taxonomy.ts`: `Field.aliases?: string[]`, `shapeError`, `normalizeWord`, `mergeDraft`, `aliasOverlaps`, `loadTaxonomyFile`을 구현한다(R4, R7). `shapeError`는 안에서만 쓴다
- [ ] T006 `etl/notices/embed.ts`의 `fieldText`와 `etl/notices/fields.ts`의 `systemFor`·`fieldParts`에 동의어를 넣는다. 동의어가 없으면 글과 판 재료가 한 글자도 다르지 않다(R4). `FIELD_SYSTEM`은 고치지 않는다
- [ ] T007 시험: `etl/notices/run.test.ts`에 `KINGO_TAXONOMY_FILE`이 있으면 `chosenField`가 그 파일 하나를 읽고(목록 셋을 읽지 않음), 그 파일의 `chosen`이 지금 판·모델과 맞으면 분야를 넣고, 파일이 없거나 꼴이 틀리거나 `chosen`이 null이면 까닭만 돌려 공지 수집은 도는지 더한다
- [ ] T008 `etl/notices/run.ts`의 `chosenField`와 `modelEnv`: `KINGO_TAXONOMY_FILE`을 `loadTaxonomyFile`로 읽는다(R2). 파일 이름에서 목록 id를 얻지 않고 파일 안의 `id`를 쓴다
- [ ] T009 `server/db/migrations/011_taxonomy.sql`: `taxonomy_drafts`, `taxonomy_versions`, `taxonomy_changes`, `op_requests.kind`에 `taxonomy_trial`, `op_requests.snapshot`과 그 체크, `op_requests.model` 체크 다시 만들기(010_ops.sql:4), `model_trials.base_version`, 부분 유일 색인 `op_requests_one_trial`(data-model.md). `server/db/migrate.test.ts`가 새 파일까지 도는지 본다
- [ ] T010 시험: `server/taxonomy/current.test.ts`(새로)에 `currentTaxonomy(sql)`이 바꾼 기록이 없으면 바탕 파일, 있으면 마지막 줄의 판 목록(되돌림으로 바탕이면 바탕), `versionName(sql, 날짜)`가 그날 판 수 + 1(`2026-11-28-1`, `-2`), `writeVersionFile(dir, 판)`이 `custom-<이름>.json`을 바탕 꼴로 쓰고 이미 있으면 덮어쓰지 않으며(내용이 다르면 던짐) 쓴 경로를 돌려주는지, 판 목록의 `baseChanged`(판을 만든 뒤 바탕 파일의 `fieldVersion`이 달라짐)를 더한다
- [ ] T011 `server/taxonomy/current.ts`: `currentTaxonomy`, `currentVersion`(이름·근거·바탕 표시), `versionName`, `writeVersionFile`, `pendingFiles`(file이 null인 판)를 구현한다(R1, R2, R6)
- [ ] T012 `server/ops/conditions.ts`의 `activeTaxonomy`가 `currentTaxonomy`를 쓰게 바꾼다. 매일 작업은 시작할 때 읽은 판을 `rejudgePaths(no, models, taxonomy)`(목록 셋의 폴더에 지금 판 폴더를 더해 지움)(`DailyDeps.cachePaths` 꼴도 같이)와 `ingest`의 deps(`d.taxonomy`)로 넘긴다. `ingest`는 넣을 목록 id가 지금 판의 id와 같을 때만 판을, 아니면 지금처럼 파일을 쓴다(CLI `ingest --taxonomy`·`--switch`, research R1). 기존 시험(`conditions`·`ingest`·`daily`)이 바탕만 있을 때 그대로 통과하는지 본다
- [ ] T013 시험: `server/jobs/daily.test.ts`와 `server/jobs/swap.test.ts`에 지금 판이 있으면 매일 작업이 판 파일을 판 폴더(시험 폴더)에 쓰고 `classifierEnv`가 `KINGO_TAXONOMY_FILE`을 넘기는지, 판 폴더에 못 쓰면 `etl/.cache/taxonomy/`(시험 폴더)에 써서 넘기고 판의 `file`은 비어 있는지, 판이 없으면 환경에 그 키가 없는지(지금과 같음), 지금 모델로 잰 통과 줄이 여럿일 때 `KINGO_FIELD_MEASURED`가 `field_version = fieldVersion(지금 판)`인 줄만 고르는지(적용하지 않은 초안 재기가 85%를 넘어도 근거가 되지 않음, research R3)를 더한다. 넣기 단계가 판의 설명으로 `fields`를 넣고 `fields`에 동의어가 없는지도 본다(R9)
- [ ] T014 `server/model.ts`의 `classifierEnv`와 `server/jobs/daily.ts`: 시작할 때 판을 한 번 읽어 쓰고 넘긴다(R2, FR-025·026·028). `classifierEnv`의 근거 고르기를 `field_version = fieldVersion(지금 판)`으로 좁힌다(R3). 꼴은 `classifierEnv(sql, { taxonomy, file: string | null })`이다. 순서(R2): daily가 시작할 때 판을 읽고 → `writeVersionFile`로 판 폴더에 쓰고(실패하면 `etl/.cache/taxonomy/`에 써서 그 경로) → 판 폴더에 썼을 때만 `taxonomy_versions.file`을 갱신하고 → 그 경로를 `classifierEnv`에 넘겨 `KINGO_TAXONOMY_FILE`이 된다. 판이 없으면(바탕) `file: null`이고 키를 넣지 않는다. `KINGO_TAXONOMY_VERSIONS_DIR`(기본 `etl/taxonomy/versions`)
- [ ] T015 [P] `deploy/compose.yaml`(jobs에 판 폴더 이름 있는 볼륨 읽고 쓰기, `KINGO_TAXONOMY_VERSIONS_DIR`), `deploy/kingo.env.example`, `README.md`의 환경 변수 표

**Checkpoint**: 동의어가 없는 지금 상태에서 판정 판·분야 판정·넣기가 바뀌지 않는다(T003 시험, 기존 시험 전부 통과).

## Phase 3: User Story 1 - 운영자가 분야의 관계를 본다 (P1) — PR B

**Independent Test**: spec US1.

- [ ] T016 시험: `server/ops/taxonomy.test.ts`(새로)에 `GET /api/ops/taxonomy`가 운영자만(학생 401/403), 묶음·분야·CSRankings 영역·과목 영역, 분야마다 최근 30일 공지 수(핵심·관련, 내려간 공지와 30일 밖은 빠짐), `flags.noLinks`·`noNotices`, 지금 판이 '바탕'인지 돌려주는지, 응답 JSON에 학생 계정 이메일·학생 id가 없는지(시험 학생을 만들고 글자를 찾음, FR-005) 더한다. `GET /api/ops/taxonomy/fields/:id`의 최근 글 5개(최근 것부터)와 가까운 분야 5개(벡터 없으면 null), 없는 분야 404도 더한다
- [ ] T017 `server/ops/taxonomy.ts`의 두 GET 경로와 `server/app.ts`에 경로 묶음을 더한다(contracts/api.md, R8). 공지 수는 한 쿼리로 센다
- [ ] T018 [P] `web/ops/src/api.ts`에 자료 꼴(`Taxonomy`, `FieldDetail`)을 더한다
- [ ] T019 `web/ops/src/Fields.tsx`(새로)와 `web/ops/src/Shell.tsx` 메뉴 '분야 관계'(`?menu=fields`): 판 카드(지금 판·초안 수·재기 상태 자리), 묶음→분야 나무와 찾기(이름·동의어·정의), 자세히(이름·경로·정의·동의어·CSRankings·과목 영역·공지 수와 최근 글·가까운 분야). 글을 누르면 임베딩 지도의 '판정 검토에서 보기'와 같은 `onReview(id)`로 판정 검토를 연다. 부품은 `astryx search`로 고른다(R10)
- [ ] T020 `scripts/e2e-ops/run.mjs`(새로): 시험 스키마에 활성 목록·공지·운영자를 넣고 서버를 띄워 '분야 관계'를 열고, 묶음 펼치기 → 분야 고르기 → 자세히 칸 확인 → 찾기, 1280·768·390px과 글자 200%에서 `checks.mjs` 검사를 한다

## Phase 4: User Story 2 - 동의어와 정의를 고쳐 초안에 모은다 (P1) — PR C

**Independent Test**: spec US2.

- [ ] T021 시험: `server/taxonomy/draft.test.ts`(새로)에 맞추기(앞뒤 빈칸, 같은 분야 안 중복), 개수·길이·빈 값 거부, 다른 분야와 겹침 거부(빈칸·대소문자 무시)와 겹친 분야 알림, 지금 판과 같아지면 줄 지우기, `seen`이 다르면 `draft_changed`와 지금 값, 고친 사람·때, 비교 기준이 지금 판인지(판 1에서 넣은 동의어가 판 2 초안에서 사라지지 않음), '바탕 값 불러오기'를 더한다
- [ ] T022 `server/taxonomy/draft.ts`: 저장·지우기(하나·전체)·판 불러오기(`replace`)를 구현한다(R7, FR-010~015)
- [ ] T023 시험: `server/ops/taxonomy.test.ts`에 `PUT`·`DELETE /api/ops/taxonomy/draft*`와 `POST /api/ops/taxonomy/draft/load`의 상태 코드(contracts/api.md), GET 응답의 `draft`·`fields[].draft`·`flags.gone`·`flags.overlap`, 학생 API(`/api/fields` 등)에 초안을 고친 뒤에도 정의가 그대로이고 동의어 글자가 없는지(SC-005)를 더한다
- [ ] T024 `server/ops/taxonomy.ts`에 초안 경로를 더한다
- [ ] T025 `web/ops/src/Fields.tsx`: 자세히에서 정의 고치기·동의어 칩 넣고 빼기·저장, 겹침과 409를 그 자리에 보이기(새 값으로 바꾸기), 나무의 '고침' 표시, 판 카드의 고친 분야 수, '바탕으로 되돌리기'·'초안 지우기'(확인 창). 화면의 겹침 미리 알림은 T005의 `aliasOverlaps`를 같이 쓴다
- [ ] T026 `scripts/e2e-ops/run.mjs`에 고치기 걸음(동의어 둘 넣기 → 저장 → '고침' → 겹침 알림 → 초안 지우기)을 더한다

## Phase 5: User Story 3·4 - 초안 재기와 적용, 판 기록과 되돌리기 (P1·P2) — PR D

**Independent Test**: spec US3, US4.

- [ ] T027 시험: `server/ops/trial.test.ts`에 `runTrial`이 목록을 인자로 받아 그 목록으로 재고(분야 판정 판이 결과 `field_version`), `taxonomy_trial`은 지금 모델 하나로 "지금 판(같은 조건 값이 없을 때만) → 뜬 목록" 차례로 재고, 이어 할 때 `(request_id, field_version)`으로 이미 잰 목록을 건너뛰며, `total`이 `잴 목록 수 × 표본 수`인지, 재기 폴더에만 쓰는지(분류기 폴더 그대로), `metrics.promptChars`(표본 글 지시문 글자 수의 평균·최대)를 남기는지 더한다
- [ ] T028 `server/ops/trial.ts`: `runTrial(d, request)`가 요청의 kind로 잴 목록을 정하고(모델 재기는 `currentTaxonomy`, 초안 재기는 `snapshot`), `measure`가 목록을 인자로 받는다. 잴 것·이어 하기는 초안 재기에서 `field_version`으로 가른다. 결과 줄에 `base_version`을 남긴다(R5)
- [ ] T029 시험: `server/ops/requests.test.ts`에 `taxonomy_trial`이 밤 시간에만 가져가지고 멈춤·이어 하기·실패가 모델 재기와 같은지, 두 재기가 동시에 열리지 않는지(색인 위반을 `trial_open`으로), 10분 처리마다 `file`이 빈 판을 판 폴더에 쓰는지, 초안 재기가 열려 있을 때 `POST /api/ops/models/trial`이 500이 아니라 409 `trial_open`인지, 줄 글이 "초안 재기 끝 …"인지 더한다
- [ ] T030 `server/ops/requests.ts`: 가져가기·멈춤 쿼리를 `kind in ('model_trial','taxonomy_trial')`로 넓히고 `returning id, kind, model, snapshot`, `RequestDeps.trial`의 꼴을 `(request: { id, kind, model, snapshot }, stop)`으로, `openRequest`의 23505(`op_requests_one_trial`)를 409 `trial_open`으로, 못 쓴 판 파일 쓰기(`pendingFiles`)(R5)
- [ ] T031 시험: `server/ops/taxonomy.test.ts`에 `POST /api/ops/taxonomy/trial`(초안 없음·정답셋 없음·열린 재기·겹침), `trial/cancel`, `apply`(85% 미만·잰 뒤 초안·모델·정답셋·바탕·재는 방법 중 하나가 바뀜·지금 판을 잰 결과 → 거부, 같으면 판 생성·이름·초안 비움·`chosen`이 재기 값·동시에 둘이 눌러도 하나), `revert`(그 판 목록을 지금 모델·정답셋·재는 방법·바탕 표시로 잰 통과 결과가 있으면 바로·아니면 `trial_stale`·바탕은 바탕 `chosen`이 지금 모델·판정 판에 맞을 때만·이미 지금), 바탕의 판정 칸이 바뀌면 `baseChanged`와 잴 목록이 `baseMerge`인지, CSRankings만 바뀌면 낡지 않는지, GET의 `trials[].stale`·`staleWhy`, `versions[].revert`, `changes`를 더한다
- [ ] T032 `server/ops/taxonomy.ts`에 재기·적용·되돌리기 경로를 더한다(R3, R6). 판 바꾸기는 advisory 잠금 안에서 조건을 다시 본다
- [ ] T033 시험: `server/jobs/swap.test.ts`에 적용한 다음 매일 작업이 새 판으로 분야를 넣고(분야 판정 멈추지 않음, SC-002), 앞서 판정한 공지의 분야는 그대로이고(FR-027), 되돌린 다음 매일 작업은 앞 판 파일을 넘기는지 더한다
- [ ] T034 `web/ops/src/Fields.tsx`: 판 카드의 '초안 재기'·취소·상태 글, 결과를 지금 판과 나란히(핵심 정밀도·재현율·관련 정밀도·기회 맞음·놓침·지시문 글자 수), 적용 확인 창(바뀐 분야 수, 변화, 나빠지면 '주의'), 판 기록 표와 되돌리기·'초안으로 불러오기'(초안이 있으면 덮어쓰기 확인), `baseChanged` 알림. 모델 화면(`web/ops/src/Models.tsx`)의 상태 글·비교 함수를 함께 쓸 수 있으면 옮겨 쓴다
- [ ] T035 `scripts/e2e-ops/run.mjs`에 재기 결과를 시험 자료로 넣은 뒤 적용 → 판 기록 → 되돌리기 걸음과, 열린 모델 재기가 있으면 '초안 재기'가 막히고 까닭이 보이는 걸음(반대로 열린 초안 재기가 있으면 모델 화면의 '오늘 밤 재기'가 막힘, spec US3-1)을 더한다
- [ ] T036 `server/ops/models.ts`와 `server/ops/models.test.ts`: `GET /api/ops/models`의 결과 목록과 `POST /api/ops/models/current`가 `request_id`의 kind가 `model_trial`인 줄(과 request_id가 null인 앞 줄)만 쓰는지 시험하고 고친다(초안 재기 결과가 섞이지 않음, R5). '처음 모델'(`initialOf`)은 판을 적용한 뒤에도 바탕 파일의 `chosen`을 보는지 시험한다(R3). `web/ops/src/Models.tsx`는 초안 재기가 열려 있으면 모델 재기 단추를 막고 까닭을 보인다(반대도 `Fields.tsx`에서)

## Phase 6: User Story 5 - 분야 관계를 그림으로 본다 (P2) — PR E

**Independent Test**: spec US5.

- [ ] T037 시험: `web/ops/src/radial.test.ts`(새로)에 `radialLayout(목록, 공지 수)`가 노드(묶음·분야·CSRankings 영역·과목 영역 각각 한 번)와 선(묶음→분야, 분야–CSRankings, 과목 영역–분야)을 모두 내고, 같은 입력이면 같은 좌표, 분야는 자기 묶음의 각도 안, 바깥 고리는 이어진 분야 각도의 평균 순, 노드 크기가 공지 수를 따르는지(0이면 최소) 더한다
- [ ] T038 `web/ops/src/radial.ts`: 배치 순수 함수(R8)
- [ ] T039 `web/ops/src/FieldGraph.tsx`(새로)와 `Fields.tsx`의 '나무 | 그림' 탭: SVG 그림, 노드는 버튼 역할과 이름·Tab 이동, 고른 노드와 이어진 것만 진하게, 표시는 색 + 모양(고친 분야 굵은 테두리, 연결 없음 점선, 공지 0 속 빈 원)과 범례, 노드를 고르면 나무·자세히가 같은 분야, 좁은 화면에서는 줄여 보이고 고치기는 나무로 안내(FR-006~008)
- [ ] T040 `scripts/e2e-ops/run.mjs`에 그림 탭 걸음(노드 수·선 수 확인, 노드 누르기 → 자세히, 키보드로 고르기, 390px에서 가로 넘침 없음)을 더한다

## Phase 7: Polish

- [ ] T041 SC-007: PR D가 머지된 뒤 이 맥에서 동의어를 넣은 초안(재현율이 낮은 분야 위주, 운영자처럼 화면으로 넣음)을 한 번 재서 지금 판 대비 핵심 재현율·핵심 정밀도·관련 정밀도의 변화를 이 줄에 적는다(`KINGO_TEMP_LIMIT=70`, 한도는 목표로만). 결과가 85% 이상이어도 적용은 사용자와 정한다
- [ ] T042 [P] `README.md`(분야 관계 화면, 판 폴더, 새 환경 변수, `e2e:ops`)와 2단계 `specs/20261117-052701-backend-skeleton/quickstart.md`의 운영 절차에 판 폴더 백업 메모
- [ ] T043 quickstart 1~4를 처음부터 해 보고 어긋난 곳을 고친다

## Dependencies

- Phase 1 → Phase 2(PR A) → Phase 3(PR B) → Phase 4(PR C) → Phase 5(PR D) → Phase 6(PR E) → Phase 7.
- US1(보기)은 PR A만 있으면 된다. US2는 US1의 화면 위에 선다. US3·4는 US2의 초안이 있어야 잴 것이 있다. US5는 US1의 자료만 쓰므로 PR B 뒤 어느 때나 할 수 있지만, 화면 파일이 겹쳐 PR D 뒤에 한다.

## Parallel Examples

- Phase 2: T003·T004 시험을 함께 쓰고, T015는 T014와 따로 한다.
- Phase 3: T018은 T017과 함께.
- Phase 5: T036은 T034와 다른 파일이라 함께.

## Implementation Strategy

- MVP는 PR A + PR B(보기)다. 판정은 바뀌지 않고 운영자가 관계를 본다.
- PR C까지면 고치기를 모을 수 있고, PR D부터 판정이 나아질 수 있다. SC-007(T041)이 첫 효과 확인이다.

## 세기

- 모두 43개: Setup 2, Foundational 13, US1 5, US2 6, US3·4 10, US5 4, Polish 3.
