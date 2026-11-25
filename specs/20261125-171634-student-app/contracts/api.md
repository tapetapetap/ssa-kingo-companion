# API 계약: 3단계에서 더하는 것

있는 계약은 [2단계 api.md](../../20261117-052701-backend-skeleton/contracts/api.md)이고 뜻이 바뀌는 것은 없다(칸이 더해질 뿐이다). 공통 규칙(같은 출처, 오류 꼴, 해요체 글)은 그대로다.

## 학생

| 요청 | 본문 | 답 |
|---|---|---|
| `GET /api/login/methods` | | 로그인 없이 `{ methods: string[] }`. 개발 모드 `["dev"]` |
| `POST /api/login` | (있던 것) | 요청 쿠키의 앞 세션을 지우고 새 세션. 나머지는 있던 것 |
| `GET /api/me` | | `{ dept, next, analysisOff, tag, push: { ready, on } }` |
| `GET /api/me/push/key` | | `{ key }`. 준비 전이면 404 `not_found`('알림은 아직 준비 중이에요') |
| `PUT /api/me/push` | `{ endpoint, keys: { p256dh, auth } }` | 204. 이 세션의 구독을 바꾼다. 거절: `consent_required`, `invalid`(주소가 정한 푸시 서버가 아님, 키 꼴), 준비 전 `not_found` |
| `DELETE /api/me/push` | | 204. 이 세션의 구독만 지운다 |

`GET /api/me/push/key`는 로그인이 있어야 한다.

## 운영자(모두 `requireOperator`)

| 요청 | 본문 | 답 |
|---|---|---|
| `GET /api/ops/monitor` | | 아래 꼴 |
| `POST /api/ops/daily` | `{}` | 202 `{ request }`. 거절: 409 `already`(열린 `daily` 요청이 있음. 정해진 매일 작업이 도는 중인 것은 거절하지 않는다) |
| `GET /api/ops/map` | | `{ at, stale, fields, notices, pairs, empty, unused, noVector }` 또는 `{ at: null, reason }` |
| `GET /api/ops/models` | | `{ current, initial, installed, request, trials, changes }` |
| `POST /api/ops/models/trial` | `{ model }` | 202 `{ request }`. 거절: 409 `already`, `invalid`(설치되지 않음, 지금 모델이면 되고 결과만 새로 잼) |
| `POST /api/ops/models/trial/cancel` | `{}` | 204(`canceled`). `waiting`·`paused`만. 도는 중이면 409 `running`, 열린 재기가 없으면 422 `invalid` |
| `POST /api/ops/models/current` | `{ trialId }`(숫자, 또는 처음 모델의 고른 기록 `"initial"`) | 200 `{ current }`. 거절: 422 `trial_low`(85% 미만), `trial_stale`(조건이 지금과 다름), `invalid`(없는 결과, 이미 지금 모델, 설치되지 않음) |

새 오류 코드: `already` 409, `running` 409, `trial_low` 422, `trial_stale` 422.

`request`: `{ id, kind, model, by, at, status, done, total, startedAt, endedAt, error }`. 그 종류의 마지막 요청(끝난 것 포함)이고 한 번도 없으면 `null`이다. `daily`가 `done`인데 실패한 단계가 있으면 `error`에 단계 이름이 있다.

### `GET /api/ops/monitor`

```json
{
  "alerts": [{ "kind": "classifier", "text": "수집·판정이 잇달아 실패했어요", "since": "2026-11-23T03:00:00.000+09:00", "reason": "분류기가 1로 끝났어요" }],
  "health": { "db": true, "model": { "ok": true, "names": ["gemma4:12b", "bge-m3"] }, "lastDaily": { "startedAt": "…", "endedAt": "…", "failed": [] } },
  "today": { "fetched": 5, "opportunity": 2, "not": 2, "review": 1, "failed": 0, "reviewOpen": 35 },
  "load": { "gpuAvg": 78.9, "tempMax": 71.9 },
  "editRate": { "num": 3, "den": 12 },
  "request": null,
  "dailyRunning": false,
  "days": [{ "day": "2026-11-24", "startedAt": "…", "seconds": 5400, "steps": { "classifier": { "ok": true, "skipped": false, "seconds": 5000, "error": null, "fetched": 5 } }, "load": { "gpuAvg": 78.9, "tempMax": 71.9, "requests": 40 } }],
  "counts": [{ "day": "2026-11-24", "consented": 3, "consented_new": 0, "active7": 2, "like": 1, "later": 0, "dislike": 2, "push_sent": 1, "push_failed": 0, "push_devices": 1, "server_error": 0 }]
}
```

- `days`는 최근 14일의 매일 작업(하루에 여럿이면 여럿, 최근 것부터). 7일 흐름은 화면이 앞 7일을 쓴다. `today`는 마지막 매일 작업의 분류기 숫자와 확인할 것 수다. 값이 없으면 `null`이다. `today.failed`는 R11 실패 식의 분자다.
- `dailyRunning`은 `kingo:daily` 잠금이 잡혀 있는가(`pg_locks`)다. 화면은 열린 요청이 있을 때만 버튼을 잠근다. 07:00 뒤에 돈 작업은 `steps.repick.daytime`이 참이고 화면에 '낮 실행'으로 보인다.
- `counts`는 오늘(그 자리 계산)과 지난 13일이다.
- `alerts.kind`: `classifier`(분류기 실패와 그로 인해 건너뛴 넣기), `ingest`, `judge`, `stale`.
- `alerts.text`는 화면에 그대로 쓴다.

### `GET /api/ops/map`

`fields`: `[{ id, name, group, groupName, x, y }]`, `notices`: `[{ id, title, kind, deadline, postedOn, source, x, y, rank, first, core: [id], review: boolean }]`, `pairs`: `[{ a, b, sim }]`, `empty`: `[{ field, notices: [id] }]`, `unused`: `[id]`. `groupName`은 가장 위 묶음(큰 분야)이다. `stale`은 만든 때가 마지막 매일 작업의 `started_at`보다 앞이면 참이다(지도는 작업 중간에 만들어진다). `reason`은 마지막 매일 작업의 `steps.map.error`이고, 매일 작업이 없었으면 '아직 매일 작업이 돌지 않았어요'다. 그 뒤 내려갔거나 공지가 아니게 된 공지는 빠진다.

### `GET /api/ops/models`

`current`: `{ model, since, by, trial }`(바꾼 기록이 없으면 `since`·`by`·`trial`은 null), `initial`: `{ model, num, den, usable }`(분야 목록의 고른 기록. `usable`은 지금 조건과 같고 설치돼 있는가), `installed`: `[{ name, size, parameterSize }]`(임베딩 모델 제외), `trials`: `[{ id, model, at, stale, passes, metrics }]`(최근 20개), `changes`: `[{ old, new, by, at }]`(최근 20개).

## 알림 본문(서버 → 서비스 워커)

```json
{ "title": "제5회 AI 해커톤", "body": "3일 뒤 마감", "url": "/notices/cse%3A228336", "tag": "kingo-2026-11-27" }
```

4KB를 넘지 않는다. 학생을 가리키는 값이 없다.

## 판이 어긋날 때

API는 있던 칸과 뜻을 바꾸지 않고 더하기만 한다. 앱은 모르는 오류 코드를 받으면 서버의 글 대신 '새로 고쳐 주세요'와 새로 고침 버튼을 보인다(`message`가 있으면 글은 그대로 보인다).

## 정적 파일

`GET /ops…`는 있던 것이다. 그 밖의 `GET`(`/api/` 제외)은 학생 앱이다(research R2).
