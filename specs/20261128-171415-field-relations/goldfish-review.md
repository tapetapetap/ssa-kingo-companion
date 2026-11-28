# Goldfish Review — 4단계 첫 명세 — 운영자 '분야 관계'(분야 지식그래프 보기와 동의어·정의 고치기)

- 날짜: 2026-11-28
- 리뷰어 상태: comprehension 완료 · readiness NO-GO

## Comprehension의 다시 쓰기

운영자 화면에 '분야 관계' 메뉴를 새로 만든다. 운영자는 여기서 분야 목록 custom(묶음 11개, 분야 91개)을 나무와 방사형 그림으로 본다. 분야마다 정의, CSRankings 영역, 과목 영역, 최근 30일 공지 수, 가까운 분야가 함께 나온다. 운영자는 분야마다 동의어를 붙이고 정의를 고칠 수 있다. 이렇게 하는 까닭은 분야 판정의 재현율이 낮기 때문이다(27/74). 공지가 분야와 다른 말을 쓰면 후보에서 빠지거나 LLM이 놓친다. 고친 값은 바로 쓰이지 않고 DB 초안에 모인다. 밤에 지금 모델로 정답셋에 재서 핵심 정밀도가 85% 이상이고 조건이 같을 때만 운영자가 적용한다. 적용하면 날짜·순번 이름의 '분야 판'이 생기고, 다음 매일 작업부터 분류기가 그 판의 동의어를 후보 글과 지시문에 넣어 판정한다. 앞 판으로 되돌릴 수 있고, 동의어는 학생에게 보이지 않는다.

**기존 시스템**
- 분야 목록은 저장소의 JSON 파일 하나다. 묶음, 분야(이름·정의·CSRankings), 과목 영역 연결, 85% 통과 근거 `chosen`을 담고 있고, 서버 다섯 곳이 `loadTaxonomy`로 읽는다.
- 매일 03:00 작업이 수집·판정·넣기·백업을 한다.
  - 분류기는 DB에 붙지 않는다. 판정에 필요한 값은 환경 변수로 받는다(모델 이름, `KINGO_FIELD_MEASURED`).
  - 분류기는 공지와 벡터가 가까운 분야 30개를 후보로 고르고, LLM이 그 안에서 핵심 0~2개, 관련 0~5개를 붙인다.
  - `fieldGate`는 `chosen.prompt`가 지금 판정 판과 같고 모델 근거가 있을 때만 분야를 넣는다.
- 3단계에 '모델 재기'가 있다. 운영자가 요청하면 10분 요청 처리가 밤 시간에 정답셋으로 재고, 그 결과로 모델을 바꾼다. 결과는 `op_requests`와 `model_trials`에 남는다.
- 넣기 단계는 서버 `fields` 표에 이름·설명·벡터를 넣고, 학생 분야 고르기 화면은 이 표를 쓴다.

## 지적과 처리

| # | 리뷰어 | 심각도 | 위치 | 요지 | 처리 | 근거·변경 |
|---|---|---|---|---|---|---|
| 1 | comprehension | Major | spec US2-5 / FR-014 | 재는 중인 초안을 지울 수 있는지가 반대 | 수정 | 설계 4/4에서 "재기 중에 초안을 고치면 결과가 '다시 재야 해요'"로 정함. US2-5를 FR-014·contracts에 맞춤 |
| 2 | comprehension | Major | spec 새 용어·FR-024 / R5 / data-model | 초안을 바탕 위에 합치는지 지금 판 위에 합치는지 두 가지로 읽힘 | 사용자 판단 | 초안을 무엇 위의 차이로 둘까? 바탕이 바뀌면 지금 판과 어떻게 합칠까? (9와 같은 문제) |
| 3 | comprehension | Major | spec Edge Cases '바탕이 바뀜' / R5 | 바탕이 바뀌면 모두 다시 재는지, 판정 칸이 바뀔 때만인지 다름 | 사용자 판단 | 바탕 파일에서 판정에 안 쓰는 칸(CSRankings·과목 영역)만 바뀌어도 '다시 재야 해요'로 할까? |
| 4 | comprehension | Major | data-model taxonomy_versions·model_trials | 바탕 표시를 저장할 칸이 없음 | 수정 | 설계 4/4 "바탕 sha가 판에 함께 남아요". `base_version`(바탕의 `fieldVersion`)을 두 표에 더하고 비교 규칙을 적음 |
| 5 | comprehension | Major | R3 / FR-031 / '모델을 바꿈' | 근거 고르기 규칙이 없고, 초안 재기 결과가 근거로 뽑힐 수 있음 | 수정 | server/model.ts:55-59 확인. R3에 근거 고르기(`field_version = fieldVersion(지금 판)`)와 되돌리기 근거를 적고 T013·T014에 반영 |
| 6 | comprehension | Nit | plan Summary | 판 파일을 쓰는 주체(매일 작업·10분 처리)가 다르게 읽힘 | 기록 | |
| 7 | comprehension | Nit | spec FR-021·022 | '재는 방법의 판'·'정답셋 판'이 용어 목록에 없음 | 기록 | |
| 8 | comprehension | Nit | spec US3-3 | '기회 판정이 나빠지면'이 어느 값인지 모호 | 기록 | |
| 9 | readiness | Blocker | data-model taxonomy_drafts / T004·T021·T022 / R5 | 초안 합치는 기준이 문서끼리 어긋남. 두 번째 판에서 앞 판 값이 사라질 수 있음 | 사용자 판단 | 2와 같은 질문. 재지적(재리뷰 Blocker) |
| 10 | readiness | Blocker | data-model | 바탕 표시 칸이 없음 | 수정 | 4와 같음 |
| 11 | readiness | Blocker | plan Summary / R3 | `classifierEnv`가 `field_version`과 상관없이 통과 줄을 근거로 넘겨 분야 판정이 멈출 수 있음 | 수정 | server/model.ts:55-59, taxonomy.ts:199 확인. R3·T013·T014 |
| 12 | readiness | Major | data-model 바뀌는 표 | `op_requests.model` 체크가 taxonomy_trial을 막음 | 수정 | 010_ops.sql:4 확인. 체크 다시 만들기를 data-model·T009에 적음 |
| 13 | readiness | Major | T027·T028 | `runTrial`이 잴 것·이어 하기를 모델 이름으로 가름 | 수정 | trial.ts:182-188 확인. R5에 `(request_id, field_version)`로 가르기, 차례, 진행 칸, `readGold` 목록을 적고 T027·T028을 고침 |
| 14 | readiness | Major | T012 | `rejudgePaths`는 동기, `ingest`의 목록 규칙 없음 | 수정 | daily.ts:64-73·145, ingest.ts:40 확인. 시작할 때 읽은 판을 인자·deps로, ingest는 id가 같을 때만 판(R1·T012) |
| 15 | readiness | Major | T003·T004·T007·T008 | 경로 하나를 읽는 함수가 없고 `shapeError`·`listSha`가 export되지 않음 | 수정 | taxonomy.ts:36·55, embed.ts:57 확인. `loadTaxonomyFile` 새로, `listSha`는 파일 이름으로 확인 |
| 16 | readiness | Major | T029·T036 | 새 색인 위반이 `openRequest`에서 500, 모델 화면에 초안 재기 결과가 섞임 | 수정 | requests.ts:23-25, models.ts:46-47 확인. R5와 T029·T030·T036 |
| 17 | readiness | Major | T030 | 요청 처리 쿼리가 `kind = 'model_trial'`로 박힘 | 수정 | requests.ts:57·84·91 확인. R5와 T030 |
| 18 | readiness | Nit | R1 | '다섯 곳'에 trial.ts가 들어 있지만 activeTaxonomy를 거침 | 수정 | 사실 오류(trial.ts:55). R1을 '직접 부르는 세 곳 + 분류기'로 고침 |
| 19 | readiness | Major | R3 / contracts revert | 되돌리기 근거에 바탕 조건이 드는지, 바탕으로 되돌릴 때 무엇을 보는지 | 사용자 판단 | 되돌리기 근거에 `base_version = 지금 바탕`을 넣을까(3과 묶임)? 바탕으로 되돌릴 때는 바탕 `chosen`(모델·판)만 볼까? |
| 20 | readiness | Major | T027·T028 / `metrics.promptChars` | 지시문 글자 수의 정의가 없음(글마다 후보가 다름) | 사용자 판단 | 표본 글 지시문 길이의 평균·최대를 셀까, 분야 전체 줄 길이를 셀까? |
| 21 | readiness | Major | T013·T014 | `classifierEnv`가 판과 판 파일 경로를 받는 꼴이 없음 | 수정 | R2에 정한 순서를 T014에 꼴(`classifierEnv(sql, { taxonomy, file })`)과 함께 옮김 |
| 22 | readiness | Major | T012 / models.ts:30-33 | `currentTaxonomy`로 바꾸면 모델 화면의 '처음 모델'이 지금 판의 `chosen`을 가리킴 | 사용자 판단 | '처음 모델로 되돌리기'는 바탕 파일의 `chosen`을 볼까, 지금 판의 `chosen`을 볼까? |
| 23 | readiness | Major | contracts GET `/api/ops/taxonomy` | `trials[]` 범위·kind 가르기, `flags.overlap` 꼴이 없음 | 사용자 판단 | `trials[]`는 최근 몇 개를 담을까? `overlap`은 422 `alias_overlap`과 같은 꼴로 할까? |
| 24 | readiness | Major | T012 | `rejudgePaths`에서 지금 판 폴더가 무엇을 대신하는지 | 사용자 판단 | 다시 판정할 때 지금 판 폴더를 목록 셋의 폴더에 더할까, custom 바탕 폴더를 대신할까? |
| 25 | readiness | Major | T007·T008 | `KINGO_TAXONOMY_FILE` 파일의 `chosen`이 null이면 | 사용자 판단 | 분야 판정을 하지 않고 조용히 넘길까(`undefined`), 까닭을 남길까? |
| 26 | readiness | Major | T036 | 재기 단추를 서로 막는 화면 동작을 확인할 걸음이 없음 | 수정 | spec US3-1이 이미 요구. T035에 e2e 걸음을 더함 |
| 27 | readiness | Nit | R10 | Figma 여부가 미정 | 기록 | |

## 재리뷰

- 대상: readiness. 첫 VERDICT NO-GO → 재리뷰 VERDICT NO-GO.
- 재리뷰 Blocker는 9(초안 합치는 기준)뿐이고 이미 `사용자 판단`이라 행을 더하지 않고 9에 '재지적'을 적었다.
- 새 지적: 19~27.

## 집계

지적 27개 중 문서를 바꾼 것 14개
