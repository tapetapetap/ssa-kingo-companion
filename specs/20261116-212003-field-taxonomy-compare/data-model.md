# Data Model: 분야 목록 3안 비교와 공지 분야 판정

날짜는 `YYYY-MM-DD`, 시각은 ISO 8601이다. 분야는 어디서나 id로 적고, LLM에게 물을 때만 이름으로 바꾼다(research R3). '목록 판'은 `edition`, '판정 판'은 `prompt`라는 이름으로 적는다(spec 배경 '두 가지 판').

## 1. 분야 목록 파일 `etl/taxonomy/<id>.json` (저장소)

```jsonc
{
  "id": "custom",                    // custom | ncs | csrankings
  "name": "직접 만든 2단 목록",
  "edition": "2026-11-16",           // 목록 판: 만든 날. NCS는 받은 DB의 기준 월("2026-02")
  "sources": [{ "name": "CSRankings", "url": "https://csrankings.org", "license": "CC BY-NC-ND 4.0, 분야 이름·키만 씀" }],
  "sourceCounts": null,              // NCS만: { "major": 24, "middle": 81, "minor": 270, "detail": 1096 } (받은 표에서 센 값)
  "groups": [{ "id": "g-ai", "name": "AI", "parent": null }],
  "fields": [{
    "id": "llm", "name": "LLM·생성형 AI", "group": "g-ai",
    "desc": "큰 언어 모델을 만들고 쓰는 일: 프롬프트, 파인튜닝, RAG, 에이전트",
    "descFrom": "made",              // made(새로 씀) | source(분류표 글자 그대로)
    "csr": ["nlp"],                  // 대응하는 CSRankings 키(선택)
    "ncs": null                      // NCS 소분류 코드 6자리(2안만, 예 "200102")
  }],
  "courseMap": { "ai": ["ai-core"], "ml": ["ml"], "vision": ["vision", "nlp-search"], "arch": [], "os": [], "network": [], "security": [], "db": [], "pl": [], "se": [], "theory": [], "graphics": [] },
  "chosen": null                     // 고른 뒤: { "date": "2026-11-20", "corePrecision": 0.88, "prompt": "1a2b3c4d", "model": "gemma4:12b" } (compare.ts choose만 쓴다)
}
```

**안마다 다른 규칙**

- 2안(NCS)
  - 묶음 id: 대분류 `ncs-<대>`, 중분류 `ncs-<대><중>`(parent는 대분류)
  - 분야 id: `ncs-<대><중><소>`
  - 이름: 코드명 그대로
  - 설명: 세분류 이름 나열(research R7)
- 3안(CSRankings)
  - 연구 분야의 `name`은 학생이 알아듣는 이름이다(예 "컴퓨터 비전").
  - `desc`는 원래 이름 괄호로 시작한다(예 "(Computer vision) 사진·영상에서 …").
  - LLM 지시문과 미리보기에는 name과 desc가 함께 보인다.

**교과 지도 줄 키** (`src/data/courses/swe.ts`의 id, spec 배경 '교과 지도')

| 키 | 줄 이름 | 키 | 줄 이름 |
|---|---|---|---|
| ai | 인공지능 | db | 데이터베이스 |
| ml | 머신러닝 | pl | 프로그래밍 언어 |
| vision | 비전·언어·검색 | se | 소프트웨어공학 |
| arch | 컴퓨터 구조·병렬 | theory | 알고리즘·이론 |
| os | 운영체제·임베디드 | graphics | 그래픽스·HCI |
| network | 네트워크·모바일 | security | 보안 |

**검사 규칙** (`checkTaxonomy`, 하나라도 어기면 `compare.ts check`가 실패한다)

| 규칙 | 근거 |
|---|---|
| groups·fields의 id가 안 안에서 겹치지 않는다 | FR-001 |
| field.group은 있는 묶음이고, group.parent는 null이거나 있는 묶음이다 | FR-001 |
| desc가 비어 있지 않고 240자 이하다 | FR-001, R5(지시문 길이) |
| 이름이 안 안에서 겹치면 LLM에게 줄 이름은 '이름 (묶음 이름)'이다. 그렇게 해도 겹치면 실패다 | R3 |
| 1안은 큰 분야(parent가 null인 묶음) 10~15개, 분야 80~120개다. CSRankings 27개 키가 모두 어떤 분야의 csr에 있다 | FR-002 |
| 2안은 분야 수가 `sourceCounts.minor`와 같고, 모든 분야에 ncs 코드가 있으며, descFrom이 source다 | FR-003 |
| 3안은 csr이 있는 분야가 27개(키마다 하나)이고 그 desc가 '('로 시작한다. 직무 분야는 10~15개다 | FR-004 |
| 분야 이름이 분류기 종류 11가지(채용, 특강, 해커톤, 대회·공모전, 교육·캠프, 동아리·학회, 봉사, 멘토링, 글로벌, 장학, 교과)와 같지 않다 | FR-005 |
| courseMap은 위 12개 키를 정확히 가진다. 값은 있는 분야 id의 배열이고, 빈 배열은 '없음'이다 | FR-006 |
| chosen은 세 파일 중 많아야 하나에만 있다 | FR-020, R12 |

교과 지도 대응표는 분야 목록끼리의 대응 초안이다. 과목과 역량을 잇는 것이 아니다(학과 확인 대상 아님).

## 2. 분야 판정

**답(메모리)**: `FieldAnswer = { core: string[]; related: string[] }`. core는 0~2개, related는 0~5개이고, 둘은 겹치지 않는다. 둘 다 빈 배열이면 '분야 없음'이다.

**결과**: `FieldOutcome = { answer: FieldAnswer; cached: boolean } | 'fail' | 'down'`. 기존 기회 판정의 Outcome과 같은 꼴이다. 'down'은 세 경우를 모두 뜻한다: 서버에 닿지 못함, 모델 없음, 온도를 읽지 못해 묻지 않음.

**보관 파일**: `etl/.cache/llm-fields/<모델>/<안 id>-<판정 판>/<글 번호>.json` (저장소 밖)

```json
{ "model": "gemma4:12b", "taxonomy": "custom", "prompt": "1a2b3c4d", "at": "2026-11-17T01:02:03.000Z", "answer": { "core": ["llm"], "related": ["nlp-search", "data-eng"] } }
```

본문 문장은 없다. 꼴이 틀리거나 목록 밖 id가 있으면(손으로 고친 파일 등) 읽지 않고 다시 묻는다. makeChat은 `sub = "<안 id>-<판정 판>"`, `meta = { taxonomy, prompt }`로 이 꼴을 만든다(research R2).

**셈**: `FieldStats = { cached; fresh; failed; skipped; noTemp; empty }`. skipped는 down 전체이고, noTemp는 그중 온도 때문에 못 물은 수다. empty는 '분야 없음' 수다.

## 3. 판정 실행 기록 `etl/.cache/llm-fields/<모델>/<안 id>-<판정 판>/runs.jsonl` (저장소 밖)

`compare.ts judge` 실행 한 번에 한 줄씩 남긴다(research R16).

```json
{ "start": "…", "end": "…", "limit": null, "total": 412, "cached": 0, "fresh": 412, "failed": 0, "notAsked": 0, "noTemp": 0, "empty": 17, "requests": 412, "requestMs": 1401000, "gpuAvg": 75.8, "tempMax": 76.9, "loadLog": "etl/.cache/load/2026-11-17T01-00-00.jsonl" }
```

score는 limit이 null이고 fresh ≥ 1인 마지막 줄을 쓴다.

## 4. 표본 `etl/gold/fields/sample.csv` (저장소)

- 칸: 링크, 게시판, 제목, 게시일, 종류. 종류는 dev-501.csv의 한글 이름 그대로다.
- 120줄이다. 줄 순서와 배분은 research R9를 따른다.
- 같은 dev 정답셋으로 다시 만들면 같은 파일이 나온다.

## 5. 정답 `etl/gold/fields/<안 id>.csv` (저장소)

칸은 링크, 제목, A 핵심, A 관련, B 핵심, B 관련, 최종 핵심, 최종 관련, 갈림, 메모다.

| 값 | 뜻 |
|---|---|
| `id1\|id2` | 분야 id를 `\|`로 잇는다 |
| `-` | '분야 없음'으로 정했다 |
| 빈칸 | 아직 안 정했다(최종 칸에만 있을 수 있다) |
| 갈림 `X` | A와 B의 (핵심, 관련) 집합이 같다. 최종 = A |
| 갈림 `O` | 갈렸고 셋째(C)를 기다린다. 최종은 빈칸 |
| 갈림 `C` | 갈렸고 C가 정했다. 최종 = C의 답 |

- A·B·최종 모두 core ≤ 2, related ≤ 5이고 서로 겹치지 않으며, 그 안의 id만 쓴다.
- 갈림 `O`가 하나라도 있으면 그 안의 정답은 미완이고 score가 거절한다.
- 메모 칸에는 C의 note만 옮긴다.
- 본문은 넣지 않는다(FR-024).

**라벨러 입력(저장소 밖 임시 폴더)**: `<dir>/<안 id>-<묶음 번호>.jsonl`. 한 줄에 `{ no, link, board, title, body: string[] }` 하나이고, body는 LLM과 같은 `clip` 결과다.

**라벨러 출력(저장소 밖)**: `[{ "no": 228336, "core": ["llm"], "related": ["data-eng"], "note": "" }]`. 분야 없음은 빈 배열이다. A·B 출력은 research R9의 출력 검사를 통과해야 한다.

**셋째 입력(저장소 밖)**: `<A.json과 같은 폴더>/<안 id>-split.jsonl`. 한 줄에 `{ no, link, board, title, body, a: { core, related, note }, b: { core, related, note } }` 하나다. 셋째 출력은 라벨러 출력과 같은 꼴이고, 갈린 글과 정확히 같은 글 집합이어야 한다.

## 6. 비교 결과 `etl/out/fields-compare.json` (저장소)

```jsonc
{
  "at": "2026-11-17T09:00:00.000Z", "model": "gemma4:12b", "total": 412, "sample": 120,
  "taxonomies": [{
    "id": "custom", "name": "직접 만든 2단 목록", "edition": "2026-11-16", "prompt": "1a2b3c4d",
    "groups": 12, "fields": 104, "systemChars": 9100,
    "run": { "start": "…", "end": "…", "gpuAvg": 75.8, "tempMax": 76.9 },
    "metrics": {
      "corePrecision": 0.88, "coreRecall": 0.71, "totalRecall": 0.83, "relatedPrecision": 0.62,
      "agreeExact": 0.55, "agreeOverlap": 0.86,
      "blankCore": 0.09, "blankAll": 0.04, "top3Share": 0.31, "unused": 18, "unusedShare": 0.17,
      "failRate": 0.0, "secPerAsk": 3.4, "wallMinutes": 31.5, "courseMapRows": 12
    },
    "top": [{ "field": "backend", "count": 61 }],
    "unusedIds": ["…"],
    "misses": [{ "link": "…", "title": "…", "llm": { "core": [], "related": [] }, "gold": { "core": [], "related": [] } }],
    "splits": { "count": 31, "examples": [{ "link": "…", "title": "…", "a": { "core": [], "related": [] }, "b": { "core": [], "related": [] } }] }
  }]
}
```

- 값은 0~1 비율이다. 분모가 0이면 null이다.
- top은 10개다. misses와 splits.examples는 10건까지만 담는다. 정하는 법은 research R10을 따른다.
- 공지는 제목과 링크만 쓴다.

## 7. 결과 파일 `etl/out/cse-notices.json`에 더하는 칸

고른 안이 있고 research R12의 조건을 만족할 때만 더한다.

```jsonc
{
  "source": "…", "collectedAt": "…", "since": "…",
  "taxonomy": { "id": "custom", "prompt": "1a2b3c4d" },            // 새 칸: 분야 목록 id와 판정 판
  "opportunities": [{
    "id": "cse:228336", "title": "…", "url": "…", "postedAt": "…", "host": "…", "kind": "job",
    "deadline": "…", "rule": "LLM: gemma4:12b", "deadlineRule": "…",
    "fields": { "core": ["backend"], "related": ["cloud"] },         // 새 칸: 답을 받았을 때만
    "fieldRule": "LLM: gemma4:12b"                                    // 새 칸: fields가 있을 때만
  }],
  "review": []
}
```

- fields가 없으면 판정을 못 한 것(실패나 못 물음)이다. 다음 실행에서 다시 묻는다.
- `fields: { core: [], related: [] }`는 LLM이 '분야 없음'으로 답한 것이다.
- 기존 칸의 이름과 값은 바뀌지 않는다(FR-022).
- 결과 파일 계약(`specs/20261107-193624-cse-notice-opportunities/contracts/cse-notices.schema.json`)에 세 칸을 선택 칸으로 더한다(research R12).

## 8. 부하 기록 `etl/.cache/load/<시작 시각>.jsonl` (저장소 밖)

- 한 줄에 1분씩 `{ "at": "…", "gpu": 76.4, "temp": 71.2 }`를 남긴다. gpu는 그 1분 동안 5초마다 읽은 값의 평균이고, temp는 최고값이다.
- 실행이 끝나면 요약에 `부하: GPU 평균 n% · 칩 최고 n°C`가 붙는다. 이 평균은 실행 전체의 5초 값 평균이다(SC-005).

## 상태 변화

- **분야 판정**: 보관 없음 → (새로 물음) → 보관됨. 실패는 보관하지 않아서 다음 실행에서 다시 묻는다. 판정 판이 바뀌면 다른 폴더라 다시 '보관 없음'이다.
- **고른 안**
  1. 처음에는 모든 안이 `chosen: null`이다.
  2. `choose <id>`를 하면 그 안에만 `chosen: { date, corePrecision, prompt, model }`이 생긴다. 정밀도와 상관없이 생긴다.
  3. 다른 안을 고르면 앞의 표시는 지워진다.
  4. 결과 파일에 분야를 넣을지는 run.ts가 chosen을 보고 정한다. 조건은 정밀도 ≥ 0.85이고 판정 판·모델이 같은 것이다.
