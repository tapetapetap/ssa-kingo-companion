# API 계약: 운영자 '분야 관계'

모두 운영자 전용(`requireOperator`), 바꾸는 요청은 JSON 본문과 같은 출처(지금 `server/http.ts` 규칙). 오류 꼴은 2단계와 같다: `{ error: { code, message, field? } }`. 응답에 학생 자료가 없다(FR-005).

## `GET /api/ops/taxonomy`

화면 전체 자료 하나.

```jsonc
{
  "current": { "name": "2026-11-28-1" /* 바탕이면 "바탕" */, "since": "2026-11-28T10:00:00+09:00" | null, "by": "ops@…" | null,
               "corePrecision": { "num": 29, "den": 33 }, "baseChanged": false /* 판을 만든 뒤 바탕 파일이 바뀜 */ },
  "groups": [{ "id": "g-ai", "name": "인공지능", "parent": null }],
  "fields": [{
    "id": "llm", "name": "LLM", "group": "g-ai", "desc": "…", "aliases": ["거대언어모델"],      // 지금 판 값
    "draft": { "aliases": […], "desc": "…", "by": "ops@…", "updatedAt": "…" } | null,           // 초안 줄
    "csr": ["ai"], "courseAreas": ["vision"], "notices": { "core": 4, "related": 9 },             // 최근 30일
    "flags": { "noLinks": false, "noNotices": false, "gone": false /* 초안 줄만 있고 바탕에 없음 */, "overlap": [] }
  }],
  "csrAreas": [{ "id": "ai", "name": "Artificial intelligence" }],
  "courseAreas": [{ "id": "vision", "fields": ["llm", "nlp"] }],
  "draft": { "count": 3, "fieldVersion": "1a2b3c4d" | null /* 초안이 비면 null */ },
  "request": { /* 모델 재기와 같은 꼴, kind: "taxonomy_trial" */ } | null,
  "trials": [{ "id": 12, "kind": "draft" | "current", "fieldVersion": "…", "model": "gemma4:12b", "at": "…",
               "stale": true, "staleWhy": "잰 뒤 초안이 바뀌었어요" | null, "passes": true, "metrics": { /* 모델 재기 metrics + promptChars */ } }],
  "versions": [{ "id": 3, "name": "2026-11-28-1", "at": "…", "by": "…", "corePrecision": {…}, "file": "custom-2026-11-28-1.json" | null,
                 "current": true, "revert": { "ok": false, "why": "조건이 바뀌어 다시 재야 해요" } }],
  "changes": [{ "kind": "apply" | "revert", "name": "2026-11-28-1" | "바탕", "by": "…", "at": "…" }],
  "goldReady": true
}
```

## `GET /api/ops/taxonomy/fields/:id`

```jsonc
{ "recent": [{ "id": "cse:123", "title": "…", "postedOn": "2026-11-20", "level": "core" }],   // 최근 30일, 최대 5개
  "near": [{ "id": "nlp", "name": "자연어처리", "distance": 0.12 }] | null }                    // 벡터 없으면 null
```

404 `not_found`: 지금 판에 없는 분야.

## `PUT /api/ops/taxonomy/draft/:fieldId`

본문 `{ "aliases": string[], "desc": string, "seen": "<updatedAt>" | null }`. 맞추기(앞뒤 빈칸 지움, 같은 분야 안 중복 합침) 뒤 검사한다.

- 200: 바뀐 분야 하나(위 `fields[]` 꼴). 값이 지금 판과 같아지면 초안 줄을 지우고 `draft: null`.
- 409 `draft_changed`: `seen`이 지금 줄의 `updatedAt`과 다름. `extra.field`에 지금 값.
- 422 `invalid` (`field`: `aliases`|`desc`): 개수·길이·빈 값. 메시지는 화면에 그대로 보인다.
- 422 `alias_overlap`: `extra.with = [{ fieldId, name, word }]`.
- 404 `not_found`.

## `DELETE /api/ops/taxonomy/draft/:fieldId`, `DELETE /api/ops/taxonomy/draft`

분야 하나 / 초안 전체를 지운다. 204. 재는 중인 초안 재기가 있어도 지울 수 있고 그 결과가 낡는다(FR-014).

## `POST /api/ops/taxonomy/trial`

본문 `{}`. 지금 초안을 떠서 `taxonomy_trial` 요청을 연다. 202 `{ request }`.

- 422 `no_draft`, 422 `no_gold`, 409 `trial_open`(모델·초안 재기가 열려 있음), 422 `alias_overlap`(바탕이 바뀌어 겹침이 생긴 초안).

## `POST /api/ops/taxonomy/trial/cancel`

모델 재기 취소와 같다(재는 중이면 409 `running`).

## `POST /api/ops/taxonomy/apply`

본문 `{ "trialId": number }`. 잠금 안에서 FR-022 조건을 다시 본다.

- 200 `{ current }`.
- 422 `trial_low`(85% 미만), 422 `trial_stale`(`message`에 까닭), 422 `not_draft`(지금 판을 잰 결과).

## `POST /api/ops/taxonomy/revert`

본문 `{ "versionId": number | null /* 바탕 */ }`.

- 200 `{ current }`: 근거가 지금 조건과 같고 85% 이상.
- 422 `trial_stale`: 다시 재야 함. 화면은 '초안으로 불러오기'를 연다.
- 422 `already_current`.

## `POST /api/ops/taxonomy/draft/load`

본문 `{ "versionId": number | null, "replace": boolean }`. 그 판의 동의어·정의를 지금 판과 다른 분야만 초안에 넣는다. 초안이 있는데 `replace`가 false면 409 `draft_exists`.

## 작업 쪽(명령 없음, 매일 작업과 10분 요청 처리)

- 10분 요청 처리(`requests`): `taxonomy_trial`을 모델 재기와 같은 규칙으로 가져가 잰다. 판 파일을 아직 못 쓴 판(`file is null`)을 판 폴더에 쓴다.
- 매일 작업: 시작할 때 지금 판을 읽어 판 파일 경로를 `KINGO_TAXONOMY_FILE`로 분류기에 넘긴다(R2). 넣기 단계도 그 판으로 `fields`를 넣는다.
- 새 환경 변수: `KINGO_TAXONOMY_VERSIONS_DIR`(jobs, 기본 `etl/taxonomy/versions`), `KINGO_TAXONOMY_FILE`(분류기, 매일 작업이 넣음). `deploy/compose.yaml`에서 판 폴더를 jobs에 읽고 쓰기로 붙인다.
