# Research: 운영자 '분야 관계'

결정은 모두 2026-11-28 brainstorming(설계 1/4~4/4)과 아래 코드 확인에 따른다.

## R1. 분야 판의 진실은 DB의 전체 목록

- **Decision**: 적용한 판은 `taxonomy_versions.list`(jsonb)에 바탕 파일과 같은 꼴의 **전체 목록**으로 둔다. 서버 어디서나 `currentTaxonomy(sql)`로 읽는다: 지금 판이 있으면 그 목록, 없으면 바탕 파일(`loadTaxonomy`). 지금 `loadTaxonomy`를 부르는 서버 쪽 다섯 곳(`server/ops/conditions.ts`의 `activeTaxonomy`, `server/ops/trial.ts`, `server/ingest/ingest.ts`, `server/jobs/daily.ts`의 `rejudgePaths`, 분류기 실행)이 이것을 쓴다.
- **Rationale**: 고친 값만 두고 매번 합치면 바탕이 바뀔 때 "그때 판정한 목록"이 사라진다. 전체를 남겨야 판 파일(FR-028)과 되돌리기(FR-031)가 그 목록 그대로다.
- **Alternatives**: 서버 파일을 고침(B안) — api가 파일을 쓰게 되고 저장소와 어긋남. PR로 만듦(C안) — 운영자에게 GitHub 권한이 들고 학교 서버가 바깥에 의존. 둘 다 사용자가 A를 골라 뺐다.

## R2. 분류기에 판을 넘기는 길: 판 파일 경로

- **Decision**: 매일 작업은 분류기를 띄우기 전에 지금 판을 판 폴더(`KINGO_TAXONOMY_VERSIONS_DIR`, 기본 `etl/taxonomy/versions`)에 쓰고(이미 있으면 그대로), 그 경로를 `KINGO_TAXONOMY_FILE`로 넘긴다. `etl/notices/run.ts`의 `chosenField`는 이 값이 있으면 `findChosen(목록 셋)` 대신 그 파일 하나를 읽는다. 없으면 지금과 같다(손으로 돌릴 때, 바탕만 쓸 때). 판 폴더에 쓰지 못하면 `etl/.cache/taxonomy/`에 임시로 써서 넘기고 판 기록의 파일 상태는 '못 씀'으로 둔다(판정은 계속).
- **Rationale**: 분류기는 DB에 붙지 않는다(2단계 원칙). 모델 이름을 넘기는 `classifierEnv`(PR H)와 같은 길이다. 판 파일 쓰기(FR-028)와 넘기기가 한 번에 된다.
- **Alternatives**: 목록 JSON을 환경 변수에 통째로 넣기 — 90KB가 넘을 수 있어 환경 크기 한계에 걸린다.

## R3. 판의 85% 근거는 판 안의 `chosen`

- **Decision**: 적용할 때 새 판의 `chosen`을 그 재기 결과로 바꿔 쓴다: `{ date: 적용한 날, prompt: fieldVersion(새 목록), model: 지금 모델, corePrecision: 재기 값 }`. 그러면 `fieldGate`가 지금 코드 그대로 통과한다(FR-025). 되돌리기도 그 판의 `chosen`을 그대로 쓴다.
- **Rationale**: `fieldGate`는 `chosen.prompt === 지금 판정 판`과 `chosen.model`을 본다(`etl/taxonomy/taxonomy.ts:195`). 근거를 목록 안에 두면 판 파일 하나만으로 "이 판은 이 모델로 85%를 넘었다"가 남는다. 모델을 바꾼 뒤에는 PR H의 `KINGO_FIELD_MEASURED`가 그대로 대신한다.
- **Alternatives**: 근거를 따로 환경 변수로 넘기기 — 모델 바꾸기의 `measured`와 겹쳐 규칙이 둘이 된다.

## R4. 판정 판에 동의어 넣기: 비었으면 지금과 같은 글

- **Decision**: 분야에 `aliases?: string[]`를 더한다(없거나 빈 목록이면 지금과 같음). 세 곳만 바꾼다:
  - `etl/notices/embed.ts`의 `fieldText`: 동의어가 있으면 `${경로} > ${이름} (다른 이름: a, b): ${정의}`.
  - `etl/notices/fields.ts`의 `systemFor` 분야 줄: 동의어가 있으면 `- 이름 (다른 이름: a, b): 정의`. 지시문 본문(`FIELD_SYSTEM`)은 고치지 않는다.
  - `fieldParts`의 `taxonomy.fields`: 동의어가 있는 분야만 다섯째 칸을 붙인다.
- **Rationale**: SC-006. 지시문 본문의 "줄마다 '이름: 설명'" 한 줄을 고치면 동의어가 없어도 판이 바뀌어 지금 85% 근거(`73a2661c`)가 무너진다. 줄 꼴만 늘려도 LLM은 괄호 안을 이름의 다른 부름으로 읽는다. 답은 `schemaFor`의 enum(이름만)이 막으므로 동의어로 답하면 지금처럼 실패다(FR-017).
- **Alternatives**: 동의어를 별도 단락으로 — 줄이 멀어져 연결이 약하고 지시문이 더 길다.

## R5. 초안 재기는 모델 재기 틀을 그대로 쓴다

- **Decision**: `op_requests.kind`에 `taxonomy_trial`을 더한다. 요청 줄에 뜬 목록(`snapshot` jsonb)을 둔다. `server/ops/trial.ts`의 `runTrial`은 목록을 인자로 받게 하고(지금은 `activeTaxonomy`), 초안 재기는 뜬 목록으로 지금 모델을 잰다. 같은 요청에서 지금 판의 값이 같은 조건으로 없으면 지금 판도 잰다(FR-023, 모델 재기가 지금 모델을 함께 재는 것과 같음). 결과는 `model_trials`에 두고 `field_version`이 곧 그 목록의 표시다. 재기 폴더는 `etl/.cache/trial`이고, 판정 판이 폴더 이름에 들어 있어 다른 판과 섞이지 않는다.
- **열린 재기 하나**: 지금 `op_requests_one_open`은 kind마다 하나다. 두 재기 kind를 합쳐 하나만 열리게 부분 유일 색인을 하나 더한다(`on ((true)) where kind in ('model_trial','taxonomy_trial') and status in (...)`).
- **'같은 초안'**: 초안 표시는 `fieldVersion(바탕 + 지금 초안)`이다. 정의·동의어·바탕의 이름·묶음이 바뀌면 달라진다. 결과의 `field_version`과 다르면 낡음(FR-022). CSRankings·과목 영역처럼 판정에 안 쓰이는 칸은 판을 바꾸지 않는다(그것만 바뀐 바탕은 재지 않아도 된다).
- **Alternatives**: 초안 재기를 따로 짜기 — 밤 시간·멈춤·부하·정답셋 읽기를 두 번 쓰게 된다.

## R6. 적용·되돌리기와 동시성

- **Decision**: 적용·되돌리기는 모델 바꾸기와 같은 advisory 잠금(`kingo:taxonomy-change:<schema>`) 안에서 지금 판을 다시 읽고, 조건을 다시 본 뒤 한 줄을 넣는다. 판 이름은 잠금 안에서 `한국 날짜 + (그날 판 수 + 1)`로 정한다. 지금 판은 `taxonomy_changes`의 마지막 줄이다(모델의 `model_changes`와 같은 꼴). 되돌리기는 새 판을 만들지 않고 `taxonomy_changes`에 그 판을 가리키는 줄(`kind = 'revert'`)을 넣는다. 바탕으로 되돌리면 `version_id`가 null이다.
- **매일 작업 중 적용**: 매일 작업은 시작할 때 판을 한 번 읽는다(FR-025, edge case).

## R7. 초안의 동시 고치기: 고친 때로 막기

- **Decision**: 초안 줄은 분야마다 하나이고 `updated_at`을 가진다. 저장 요청에 운영자가 본 `updated_at`(없던 줄이면 null)을 함께 보내고, 다르면 409 `draft_changed`와 지금 값을 돌려준다(FR-013).
- **겹침 검사**: 서버에서 `바탕+초안`의 모든 이름·동의어를 `NFKC → 소문자 → 빈칸 제거`로 맞춰 비교한다. 화면도 같은 함수를 써서 미리 알리지만 결정은 서버가 한다.

## R8. 보기 자료: 공지 수·가까운 분야·그림

- **공지 수**: `notice_fields` × `notices`(게시일 30일 안, 내려가지 않은 것)를 분야·핵심/관련으로 센다. 학생 표는 읽지 않는다(FR-005).
- **가까운 분야**: `fields.vector` 사이 거리(pgvector `<=>`)로 분야마다 5개. 벡터가 없으면 비운다. 지금 판의 벡터는 넣기 단계가 넣는다(FR-026).
- **그림 배치**: 서버는 노드·선 목록만 준다. 화면이 방사형으로 놓는다: 가운데 원에 묶음(목록 순서로 각도 등분), 그다음 원에 분야(자기 묶음의 각도 안에서 등분), 바깥 원에 CSRankings 영역과 과목 영역(이어진 분야 각도의 평균 순으로 정렬해 등분). 무작위가 없어 같은 목록이면 같은 그림이다(FR-006). 선은 곧은 선, 고른 노드와 이어진 것만 진하게. 새 의존성 없이 SVG(임베딩 지도와 같음).
- **접근성**: 노드는 `button` 역할과 이름을 갖고 Tab으로 돈다. 표시는 색 + 모양(고친 분야 굵은 테두리, 연결 없음 점선, 공지 0 속 빈 원)으로 한다(FR-007).

## R9. 학생 자료와 동의어

- **Decision**: 학생 API의 분야 자료(`/api/fields` 등)는 `fields` 표의 이름·설명만 낸다. 동의어는 `fields` 표에 넣지 않는다(판 목록 안에만). 시험으로 학생 응답에 동의어 글자가 없음을 본다(SC-005).

## R10. 화면

- **Decision**: 운영 화면(`web/ops`)에 메뉴 '분야 관계'를 더한다. 기존 부품(astryx Tree/List·Card·Table·Tabs·TextArea·TokenInput 등, 있는 것을 `astryx search`로 확인)을 쓴다. 화면 구성은 설계 3/4. Figma는 구현 전 승인 전에 그린다(AGENTS.md 2-0.5). 파일 URL이 필요하다. 3단계에서는 사용자가 Figma를 빼기로 했으므로(2026-11-18) 이번에도 뺄지 게이트 전에 묻는다.
