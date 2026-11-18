# Data Model: 분야 판정 다듬기 (바뀌는 것만)

1단계 [data-model.md](../20261116-212003-field-taxonomy-compare/data-model.md)에서 바뀌는 것만 적는다. 번호는 1단계 문서의 절 번호다.

## 1. 분야 목록 파일 `etl/taxonomy/custom.json`

- `edition`: `2026-11-19`(목록을 고친 날)
- `fields`에 한 줄을 인공지능 묶음 맨 앞(`ml` 앞)에 더한다.

  ```json
  { "id": "ai-general", "name": "AI 일반", "group": "g-ai", "desc": "AI 전반을 넓게 다루는 것: 한 갈래로 좁혀지지 않는 AI 개론·입문, 여러 AI 기술을 함께 다루는 교육·행사", "descFrom": "made", "csr": ["ai"], "ncs": null }
  ```

- `courseMap.ai`: `["ai-general", "rl", "ai-agent", "ai-security"]`
- 분야 91개. 검사 규칙은 그대로다. `ncs.json`, `csrankings.json`은 바꾸지 않는다.
- `chosen`의 칸은 그대로다(날짜, 핵심 정밀도, 판정 판, 모델). 회차는 적지 않는다.

## 2. 분야 판정

- **답의 두 꼴**: 보관 파일의 답은 LLM 답(정리한 것) 그대로다. 분류기와 지표가 쓰는 답은 굳힌 답이다([contracts/rules.md](contracts/rules.md) 3절). 꼴은 둘 다 `{ core: string[], related: string[] }`이고 규칙(핵심 2개·관련 5개까지, 겹침 없음)도 같다.
- **판정 판 재료**: `candidates`(`CANDIDATE_RULE`)에 `coreTop: 3`과 `core` 글이 더해지고 `system`(지시문)이 바뀐다. 1안은 `taxonomy`도 바뀐다. 세 안의 판정 판이 모두 새 값이다.
- **보관 폴더**: `etl/.cache/llm-fields/<모델>/<안 id>-<새 판정 판>/`. 앞 판 폴더는 남는다.
- **분야 벡터**: 1안은 목록 sha가 바뀌어 새 파일이 생긴다. 공지 벡터는 그대로 쓴다.

## 4. 표본

- 1회차: `etl/gold/fields/sample.csv`(바꾸지 않는다)
- N회차(N ≥ 2): `etl/gold/fields/sample-N.csv`. 칸과 줄 순서 규칙은 1회차와 같다. 1~N−1회차 표본의 글은 들어가지 않는다.

## 5. 정답

- 1회차: `etl/gold/fields/<안 id>.csv`(바꾸지 않는다. 옛 라벨 기준으로 단 것이다)
- N회차: `etl/gold/fields/<안 id>-N.csv`. 칸과 검사 규칙은 1회차와 같다. 2회차는 `custom-2.csv`만 만든다.

## 6. 비교 결과

- 1회차: `etl/out/fields-compare.json`, N회차: `etl/out/fields-compare-N.json`. 둘 다 이 컴퓨터에만 둔다(`.gitignore`의 `etl/out/fields-compare*.json`).
- 더하는 칸
  - 맨 위 `round`: 회차(수)
  - `taxonomies[].metrics.rawCorePrecision`, `rawCoreRecall`: 굳히기 전 답으로 센 핵심 정밀도·재현율(비율 `{ num, den }`)
- `taxonomies`에는 잰 안만 있다(2회차는 보통 `custom` 하나).
- `misses`와 `splits.examples`는 지금처럼 10건까지다. 갈린 글을 모두 볼 때는 research R8의 일회용 스크립트를 쓴다.
- 기준 값(`corePrecision` 등 나머지 지표)은 모두 굳힌 답으로 센다. 쏠림·빈칸·안 쓰인 분야도 굳힌 답이다.

## 7. 결과 파일 `etl/out/cse-notices.json`

- 칸은 그대로다. `fields`에 들어가는 값이 굳힌 답이다. 이번 기능에서는 고른 안이 없어 분야 칸이 붙지 않는다.

## 상태 변화

```text
1안 목록·지시문·굳히기 규칙 고침 → 리뷰(이 뒤로 바꾸지 않는다, research R9) → 새 판정 판
  → judge custom(412건 새로 물음) → 보관 답(LLM 답)
  → sample --round 2 → label-input → 라벨러 A·B → gold → (갈린 글) 라벨러 C → gold → custom-2.csv
  → score --round 2 → fields-compare-2.json + 통과 줄
  → (사용자·교수님이 고르면) choose custom --round 2 → custom.json의 chosen → run.ts가 결과 파일에 분야를 넣음
```
