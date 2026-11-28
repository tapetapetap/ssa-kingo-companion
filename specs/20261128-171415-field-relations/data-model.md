# Data Model: 운영자 '분야 체계'

마이그레이션 `server/db/migrations/011_taxonomy.sql` 하나. 학생 표는 건드리지 않는다.

## 분야 목록 파일(바탕) — 칸 하나 더함

- `fields[].aliases?: string[]` — 동의어. 없거나 빈 목록이면 지금과 같다(R4). `shapeError`(etl/taxonomy/taxonomy.ts)는 있으면 문자열 목록인지 본다. 바탕 파일 셋에는 넣지 않는다(빈 것과 같음).
- 판 파일(`<id>-<판 이름>.json`)은 이 꼴 그대로이고 `chosen`이 그 판의 근거다(R3).

## 새 표

### `taxonomy_drafts` — 초안 줄

| 칸 | 꼴 | 뜻 |
|---|---|---|
| taxonomy_id | text | 활성 목록 id |
| field_id | text | 분야 id. (taxonomy_id, field_id) 기본 키 |
| aliases | text[] not null | 고친 동의어(0~10개, 1~30자) |
| description | text not null | 고친 정의(1~200자) |
| by_operator | text not null | 고친 운영자 |
| updated_at | timestamptz not null | 고친 때. 동시 고치기 검사(R7) |

- 바탕(또는 지금 판)과 값이 같아지면 줄을 지운다(되돌리기, FR-014).
- 바탕에서 없어진 분야의 줄은 남기되 '없어진 분야'로 보이고 합칠 때 뺀다(edge case).

### `taxonomy_versions` — 적용한 판

| 칸 | 꼴 | 뜻 |
|---|---|---|
| id | bigint identity | |
| taxonomy_id | text not null | |
| name | text not null | `YYYY-MM-DD-N`(한국 날짜). (taxonomy_id, name) 유일 |
| list | jsonb not null | 전체 목록(바탕 꼴, chosen 포함) |
| field_version | text not null | `fieldVersion(list)` |
| base_version | text not null | 판을 만들 때 바탕 파일의 `fieldVersion(loadTaxonomy(바탕))`. 지금 바탕과 다르면 `baseChanged` |
| trial_id | bigint references model_trials | 근거 재기 |
| by_operator | text not null | |
| at | timestamptz not null default now() | |
| file | text | 쓴 판 파일 경로. null이면 아직 못 씀 |

### `taxonomy_changes` — 지금 판 바꾼 기록

| 칸 | 꼴 | 뜻 |
|---|---|---|
| id | bigint identity | 마지막 줄이 지금 판 |
| taxonomy_id | text not null | |
| kind | text check in ('apply','revert') | |
| version_id | bigint references taxonomy_versions | null이면 바탕 |
| by_operator | text not null | |
| at | timestamptz not null default now() | |

## 바뀌는 표

- `op_requests.kind`: `'taxonomy_trial'` 더함. `op_requests.snapshot jsonb`(초안 재기만, 뜬 전체 목록) 더함. 체크: `(kind = 'taxonomy_trial') = (snapshot is not null)`. `model`은 초안 재기에서 지금 모델 이름. 그래서 지금 체크 `(kind = 'model_trial') = (model is not null)`(010_ops.sql:4)를 떨구고 `(kind in ('model_trial','taxonomy_trial')) = (model is not null)`로 다시 만든다.
- 색인: `op_requests_one_trial` — `create unique index on op_requests ((true)) where kind in ('model_trial','taxonomy_trial') and status in ('waiting','running','paused')`.
- `model_trials`: `base_version text`(잴 때 바탕의 `fieldVersion`, 앞 줄은 null) 칸을 더한다. 초안 재기 결과도 여기에 든다. `request_id`의 kind로 구별한다. `metrics`에 `promptChars: { avg, max }`(표본 글마다의 분야 판정 지시문 `systemFor` 글자 수의 평균·최대, 사용자 결정) 더함. 낡음은 `field_version`(잰 목록)·`base_version`(잰 때의 바탕)·모델·정답셋 판·재는 방법 판을 지금과 비교한다.

## 판 하나의 상태

```text
초안 ──(초안 재기 요청)──▶ 재기 기다림 ──▶ 재는 중 ──▶ 결과
  ▲                                          │         │
  │                              (밤 끝·매일 작업) 멈춤   ├─ 85% 미만 / 조건 다름 → 적용 닫힘
  └────── 앞 판 불러오기(되돌리기 불가일 때) ◀─────────┘  └─ 85% 이상 & 같은 조건 → 적용 → 새 판 = 지금 판, 초안 비움
```

## 서버 자료 `fields` 표

- 넣기 단계가 지금 판의 이름·묶음·설명·벡터를 넣는다(지금과 같은 길, 목록만 `currentTaxonomy`). 동의어 칸은 없다(R9).
