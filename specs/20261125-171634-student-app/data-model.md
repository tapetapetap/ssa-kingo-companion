# Data Model: 3단계

있는 표는 [2단계 data-model](../20261117-052701-backend-skeleton/data-model.md)이다. 새 마이그레이션은 둘이다.

## 009_push.sql

| 표 | 칸 | 규칙 |
|---|---|---|
| `push_subscriptions` | `id` bigint identity PK, `student_id` bigint → students cascade, `token_hash` bytea unique → sessions cascade, `endpoint` text unique(≤1,000자), `p256dh` text, `auth` text, `created_at` timestamptz | 세션마다 하나, 주소마다 하나. 학생마다 10개(넘으면 `created_at` 오래된 것부터 지움) |
| `push_sent` | `student_id` bigint → students cascade, `endpoint_hash` bytea(주소의 sha256), `notice_id` text, `kind` text in (`due3`, `due0`, `revisit`), `day` date, `status` text in (`sending`, `sent`, `failed`, `gone`), `attempts` int 기본 1, `at` timestamptz | PK (`student_id`, `endpoint_hash`, `notice_id`, `kind`, `day`). `day` 30일 지나면 지움 |
| `daily_counts` | `day` date, `name` text, `n` int | PK (`day`, `name`). 학생을 가리키는 값 없음 |

`notice_id`는 공지를 외래 키로 가리키지 않는다(기록일 뿐이고 30일 뒤 지운다). `push_sent.status` 변화: `sending` → `sent` | `gone` | `failed`, `failed` → `sending`(다시 보내기, `attempts` 2) → `sent` | `gone` | `failed`.

## 010_ops.sql

| 표 | 칸 | 규칙 |
|---|---|---|
| `op_requests` | `id` PK identity, `kind` text in (`daily`, `model_trial`), `model` text(`model_trial`만, 그 밖 null), `by_operator` text, `at`, `status` text in (`waiting`, `running`, `paused`, `done`, `failed`), `done` int 기본 0, `total` int 기본 0, `started_at`, `ended_at`, `error` text | 종류마다 열린 것(`waiting`·`running`·`paused`) 하나: 부분 unique 인덱스 `(kind) where status in (…)` |
| `model_trials` | `id` PK identity, `request_id` → op_requests, `model` text, `taxonomy_id` text, `field_version` text, `prompt_version` text, `gold_version` text, `trial_version` int, `metrics` jsonb, `started_at`, `ended_at` | `metrics`: `{ corePrecision, coreRecall, relatedPrecision, oppRight, oppMissed }`(모두 `{num, den}`. `oppRight`는 '기회 여부', `oppMissed`는 '기회 놓침'), `fieldSample`, `oppSample`, `secPerAsk`, `gpuAvg`, `tempMax`. 라벨·제목·본문 없음 |
| `model_changes` | `id` PK identity, `old_model` text, `new_model` text, `trial_id` → model_trials, `by_operator` text, `at` | 지금 모델은 마지막 행 |
| `field_maps` | `id` PK identity, `at`, `taxonomy_id` text, `edition` text, `data` jsonb | 최근 7개 |

`model_bursts.who` check에 `trial`을 더한다.

`op_requests` 상태 변화: `waiting` → `running` → `done` | `failed`. `model_trial`은 `running` → `paused`(밤 시간 끝) → `running` …. 죽은 `running`은 다음 `requests`가 `daily`는 `failed`, `model_trial`은 `paused`로 되돌린다.

## `field_maps.data`

```json
{
  "fields": [{ "id": "llm", "x": 0.4123, "y": 0.8831 }],
  "notices": [{ "id": "cse:228336", "x": 0.41, "y": 0.87, "rank": 3, "first": "llm" }],
  "pairs": [{ "a": "llm", "b": "nlp", "sim": 0.91 }],
  "empty": [{ "field": "web-fe", "notices": ["cse:1"] }],
  "unused": ["hci"],
  "noVector": 2
}
```

`rank`는 첫 핵심 분야의 순위(1부터)이고 핵심이 없으면 `null`이다. `first`는 벡터가 가장 가까운 분야 id(1위 분야)다. 이름·제목은 담지 않고 답할 때 붙인다.

## 답에 더하는 칸(`GET /api/me`)

`tag`(학생 번호의 SHA-256 앞 8자), `push`: `{ ready: boolean, on: boolean }`. `ready`는 공개 키가 있는가, `on`은 이 세션에 구독이 있는가.

## 첫 숫자 값(`server/limits.ts`에 더함)

`pushDevices 10`, `pushKeepDays 30`, `pushTitleChars 40`, `pushFrom 9`, `pushUntil 21`, `pushRetryMinutes 10`, `endpointChars 1000`, `alertRuns 2`, `alertFailPercent 10`, `alertStaleHours 36`, `monitorDays 14`, `editRateDays 30`, `mapDays 90`, `mapKeep 7`, `mapPairs 10`, `mapEmptyMin 3`, `mapMinFields 12`, `trialOppSample 120`, 밤 시간 `trialNight [22:00, 02:50]`, `trialMorningEnd 7`.

앱의 값(`web/app/src/lib/values.ts`): 홈 다시 부르기 5초, 되돌리기 5초, 나중에 보기 기본 3일.
