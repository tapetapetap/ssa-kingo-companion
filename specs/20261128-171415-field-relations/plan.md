# Implementation Plan: 4단계 첫 명세 — 운영자 '분야 관계'

**Branch**: `docs/field-relations-spec` | **Date**: 2026-11-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/20261128-171415-field-relations/spec.md`

## Summary

분야에 동의어 칸을 더하고, 운영자 화면 '분야 관계'에서 보고 고친다. 고친 것은 DB 초안에 모이고, 3단계 모델 재기 틀로 밤에 재서, 85%를 넘으면 적용해 DB에 **전체 목록**으로 된 분야 판이 생긴다(R1). 매일 작업은 그 판을 날짜·순번 이름의 판 파일로 써서 분류기에 넘긴다(R2). 판 안의 `chosen`이 85% 근거라 `fieldGate`는 그대로 통과한다(R3).

가장 조심할 것은 둘이다. (1) **동의어가 없으면 판정 판이 지금과 같아야 한다**: 지시문 본문은 손대지 않고 분야 줄과 판 재료에만 동의어가 있을 때 붙인다(R4, SC-006). 어기면 지금 85% 근거가 무너져 분야 판정이 멈춘다. (2) **분류기는 DB에 붙지 않는다**: 판은 파일 경로로만 넘긴다(R2).

## Technical Context

**Language/Version**: TypeScript, Node 24(타입 제거로 실행), 운영 화면 Vite 8 + React 19 + astryx 0.7.17

**Primary Dependencies**: 새 의존성 없음. 그림은 SVG를 직접 그린다(임베딩 지도와 같음)

**Storage**: Postgres 17 + pgvector. 마이그레이션 011 하나(새 표 3개, `op_requests` 칸·색인, [data-model.md](data-model.md)). 판 파일은 서버 폴더 `etl/taxonomy/versions/`(저장소 밖, gitignore)

**Testing**: vitest(순수 함수·API·DB·매일 작업), 운영 화면 Playwright 스크립트 `e2e:ops`(새로 만듦, `scripts/e2e-app/run.mjs`의 검사 함수를 함께 씀)

**Target Platform**: 운영자 PC 브라우저(휴대폰은 보기만, 그림은 줄여 보임). 서버는 3단계와 같음

**Project Type**: API + 운영 작업 + 운영자 웹 페이지 + 분류기

**Performance Goals**: 화면 자료 1초 안(분야 91개 × 공지 수 한 쿼리), 그림 140노드·210선 첫 그리기 0.5초 안

**Constraints**: 학생 자료를 운영자 응답에 넣지 않음. 분류기는 DB에 붙지 않음. 부하 제한과 밤 시간 그대로(재기는 모델 재기와 한 번에 하나). 판정 판은 동의어가 없으면 그대로. 저장소에 정답셋·공지 본문 없음

**Scale/Scope**: 운영자 5명 이하, 분야 91개, 새 API 10개, 새 화면 1개(탭 2개), 마이그레이션 1개

## Constitution Check

`.specify/memory/constitution.md`는 빈 틀이라 3단계와 같은 문으로 본다.

| 문 | 이 plan | 결과 |
|---|---|---|
| 새 의존성은 꼭 필요할 때만 | 없음(그림은 SVG 직접) | 통과(R8) |
| 학생 자료는 운영자에게 안 보임 | 공지 수는 공지 판정에서만, 응답 꼴에 학생 칸 없음, 시험으로 확인 | 통과(R8, FR-005) |
| 동의어는 학생에게 안 보임 | `fields` 표에 동의어 칸 없음, 학생 응답 시험 | 통과(R9, SC-005) |
| 85% 문턱 | 적용·되돌리기는 같은 조건·85%만, 근거는 판 안 `chosen` | 통과(R3, R6) |
| 시험 먼저 | 순수 함수(맞추기·겹침·판 이름·합치기·배치)와 API·매일 작업은 시험 먼저. 화면은 e2e | 통과 |
| 부하 제한 하나 | 초안 재기는 모델 재기 틀, 열린 재기 하나 | 통과(R5) |
| 과설계 없음 | 판 상태 기계·편집 기록 표·그림 라이브러리 없음. 바뀐 기록은 `taxonomy_changes` 한 표 | 통과 |

설계 뒤 다시 봤다: 그대로 통과다.

## Project Structure

### Documentation (this feature)

```text
specs/20261128-171415-field-relations/
├── spec.md
├── plan.md              # 이 파일
├── research.md          # R1~R10
├── data-model.md
├── quickstart.md
├── contracts/api.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
etl/taxonomy/taxonomy.ts        # Field.aliases, shapeError, mergeDraft(바탕, 초안줄) , normalizeWord
etl/notices/embed.ts            # fieldText에 동의어(R4)
etl/notices/fields.ts           # systemFor 분야 줄, fieldParts 동의어 칸(R4)
etl/notices/run.ts              # chosenField: KINGO_TAXONOMY_FILE(R2)
server/db/migrations/011_taxonomy.sql
server/taxonomy/current.ts      # currentTaxonomy(sql), 판 이름, 판 파일 쓰기(R1, R2, R6)
server/taxonomy/draft.ts        # 초안 저장·검사·지우기·불러오기(R7)
server/ops/taxonomy.ts          # /api/ops/taxonomy* 경로(contracts/api.md)
server/ops/conditions.ts        # activeTaxonomy → currentTaxonomy
server/ops/trial.ts             # runTrial이 목록을 받음, taxonomy_trial(R5)
server/ops/requests.ts          # taxonomy_trial 가져가기, 못 쓴 판 파일 쓰기
server/model.ts                 # classifierEnv에 KINGO_TAXONOMY_FILE
server/jobs/daily.ts            # 시작할 때 판 읽기, rejudgePaths가 지금 판 사용
server/ingest/ingest.ts         # 지금 판으로 fields 넣기
web/ops/src/Fields.tsx          # '분야 관계' 화면(판 카드·나무·자세히·판 기록)
web/ops/src/FieldGraph.tsx      # 방사형 그림 탭
web/ops/src/radial.ts           # 배치 순수 함수(시험)
web/ops/src/Shell.tsx           # 메뉴 더함
scripts/e2e-ops/run.mjs         # 운영 화면 검사(새로)
deploy/compose.yaml             # jobs에 판 폴더 읽고 쓰기 볼륨, 환경 변수
```

## 만드는 순서와 PR

| PR | 담는 것 | 이야기 |
|---|---|---|
| A | 동의어 칸, 판정 판·후보 글·지시문 줄(R4), `KINGO_TAXONOMY_FILE`(R2), 마이그레이션 011, `currentTaxonomy`와 다섯 곳 바꾸기, 판 이름·판 파일 쓰기, 매일 작업 연결 | US3 바탕 |
| B | 초안 API(저장·지우기·불러오기, 겹침·409), 초안 재기(`taxonomy_trial`), 적용·되돌리기 API | US2, US3, US4 |
| C | '분야 관계' 화면: 판 카드, 나무·찾기, 자세히(고치기 포함), 판 기록, `e2e:ops` | US1, US2, US3, US4 |
| D | 방사형 그림 탭 | US5 |

PR마다: 시험 → 구현 → (화면이면) e2e·눈으로 보기·`impeccable audit`·`polish` → `ponytail-review` → `/code-review` → PR → CI → Claude 리뷰 → 머지. A와 B는 `/security-review`도 한다(A는 분류기 환경과 파일 쓰기, B는 운영자 입력과 적용 권한).

**A의 첫 확인(SC-006)**: 동의어가 빈 바탕으로 `fieldVersion`이 지금 `73a2661c` 그대로인지, 후보 글 sha가 그대로인지 시험으로 고정한 뒤 시작한다.

**SC-007 실측**: B가 머지되면 이 맥에서 동의어를 넣은 초안을 한 번 재서 tasks.md에 적는다(GPU·온도 한도는 목표로만, `KINGO_TEMP_LIMIT=70`).

## 구현 전에 할 것

- `/speckit-tasks` → goldfish 리뷰 → (화면이 바뀌므로) Figma 그리기 또는 생략 결정 → 구현 전 승인(2-1).
- Figma: 3단계는 사용자가 빼기로 했다(2026-11-18). 이번에도 뺄지, 뺀다면 astryx로 바로 만들지 게이트 전에 묻는다. 그릴 거면 Figma 파일 URL이 필요하다.
- 아키텍처 그림: 새 서비스·외부 의존성이 없어 만들지 않는다. 게이트에는 기존 시스템 그림에 판 흐름(초안 → 재기 → 판 → 판 파일 → 분류기)을 더한 그림을 보인다(메모리: 게이트에서 전체 시스템 도식도).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| 판을 전체 목록으로 DB와 파일 두 곳에 둠 | 되돌리기와 "그때 판정한 목록"을 남김(FR-028·031), 사용자 제안 | 고친 값만 두면 바탕이 바뀔 때 앞 판이 사라진다 |
| 분류기에 판 파일 경로를 넘김(`KINGO_TAXONOMY_FILE`) | 분류기는 DB에 붙지 않는다 | 환경 변수에 목록 통째로는 크기 한계, DB 접속은 분류기 원칙 위반 |
| 두 재기 kind를 묶는 부분 유일 색인 | 부하 제한: 재기는 한 번에 하나 | 앱 코드로 막으면 동시에 누를 때 둘이 열린다 |

## 위험

| 위험 | 대응 |
|---|---|
| 동의어가 정밀도를 떨어뜨림 | 적용 전 재기가 85% 문턱과 관련 정밀도 '주의'를 보인다. SC-007로 첫 효과를 잰다 |
| 지시문이 길어져 CPU 판정이 느려짐(학교 데스크톱) | 재기 결과에 지시문 글자 수와 요청당 시간을 보인다. 동의어 10개 상한 |
| 바탕 파일이 PR로 바뀌어 지금 판이 낡음 | `baseChanged` 알림, 판정은 지금 판으로 계속. 다음 명세 ③에서 바탕 고치기를 화면으로 옮길지 정한다 |
| 판 폴더가 컨테이너 재시작으로 사라짐 | compose에서 이름 있는 볼륨에 붙인다. 판은 DB(매일 백업)에 전체가 있어, 파일이 없어지면 `file`을 비우고 다시 쓰면 된다 |
| 그림이 실뭉치가 됨 | 방사형 고정 배치, 고른 노드만 진하게, 범례. 엉키면 바깥 고리 정렬을 고친다(R8) |
