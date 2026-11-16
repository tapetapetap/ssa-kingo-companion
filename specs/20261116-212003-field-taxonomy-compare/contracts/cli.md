# Contract: 명령

Node 22.18 이상에서 TypeScript 파일을 바로 돌린다(타입 제거 실행).

- 종료 코드: 0 성공, 1 실행 실패·거절, 2 쓰는 법 틀림
- 출력: 사람에게 보이는 글은 표준 오류(stderr)로, 표나 요약 한 줄은 표준 출력으로 낸다.
- 환경 변수: 기존과 같다(`KINGO_LLM_MODEL`, `OLLAMA_HOST`).
- 부하 제한: 각 명령의 파일 끝 진입 줄(`if (import.meta.main) …`)에서 실행 하나에 하나만 만든다(research R6). 시험이 main에 넣는 ask에는 걸리지 않는다.

## 기존 명령 (바뀌는 동작만)

### `node etl/notices/run.ts [기준일]`

- 모든 LLM 요청에 부하 제한이 걸린다. 보관 답은 쉬거나 기다리지 않는다.
- 분야 판정
  - 진입 줄이 `etl/taxonomy/*.json`에서 `chosen`이 있는 안을 찾는다. 둘 이상이면 `고른 안이 둘 이상이에요: custom, ncs`를 출력하고 1로 끝난다.
  - 고른 안이 research R12의 조건(핵심 정밀도 ≥ 0.85, 판정 판·모델 같음)을 만족하면, 기회마다 분야를 판정해 결과 파일에 `taxonomy`, `fields`, `fieldRule`을 더한다(data-model 7).
  - 만족하지 못하면 분야 판정을 하지 않고 이유를 한 줄 출력한다. 고른 안이 없으면 지금과 같은 파일이다.
- 요약: 표준 출력에 지금의 요약 한 줄을 그대로 내고, 그 뒤에 해당하는 줄만 이 순서로 붙인다.
  1. `LLM에 연결하지 못해 K건은 규칙만 썼어요 (<모델>)`: 지금 줄과 같다. K는 못 물은 수에서 온도 때문에 못 물은 수를 뺀 값이다.
  2. `온도를 읽지 못해 N건은 묻지 않았어요`
  3. `분야 판정 n(보관 a · 새로 b · 실패 c · 못 물음 d · 분야 없음 e)`, 또는 넣지 않은 이유 한 줄
  4. `부하: GPU 평균 n% · 칩 최고 n°C`: 실제 요청이 하나라도 있었을 때만

### `node etl/notices/eval.ts …`

쓰는 법과 평가 결과(지표 표)는 그대로다.
- LLM 요청에 부하 제한이 걸린다.
- 실제 요청이 있었으면 부하 줄과 온도 줄을 표준 오류에 더한다.
- 온도를 읽지 못해 못 물은 글이 있으면, 서버에 닿지 못한 때와 같이 비교를 거절한다(지금 동작).

## 새 명령

### `node etl/taxonomy/ncs.ts`

NCS 공식 사이트의 'NCS 정보망 DB(대분류별, 2026년 2월 기준)' 엑셀을 받아 `etl/taxonomy/ncs.json`을 만든다(research R7).
- 받기: 1초에 1건씩 `etl/.cache/ncs/`에 받는다. 이미 받은 파일은 다시 받지 않는다.
- 출력: `대분류 24 · 중분류 81 · 소분류 270 · 세분류 1096 (기준 2026-02)`
- 실패: 받지 못하거나 시트·칸 모양이 research R7과 다르면 이유를 출력하고 1로 끝난다. 이때 `ncs.json`은 그대로 둔다.

### `node etl/notices/compare.ts check`

세 분야 목록을 `checkTaxonomy`로 검사한다(data-model 1의 규칙).
- 통과하면 안마다 한 줄씩 출력하고 0으로 끝난다. 예: `custom: 묶음 12 · 분야 104 · 교과 지도 12/12 · 목록 9,100자`
  - 목록 글자 수는 묶음 이름, 분야 이름, 설명 글자를 더한 값이다. 지시문 크기를 미리 가늠하려는 값이고, 실제 지시문 글자 수는 score가 `systemChars`로 남긴다.
- 어기면 어긴 규칙을 모두 출력하고 1로 끝난다.

### `node etl/notices/compare.ts sample`

`etl/gold/dev-501.csv`의 기회 412건에서 표본 120건을 뽑아 `etl/gold/fields/sample.csv`에 쓴다(research R9). 종류별 배분을 출력한다. 같은 입력이면 같은 파일이 나온다.

### `node etl/notices/compare.ts judge <안 id> [--limit N]`

412건의 본문(보관본, 없으면 학교 서버에 1초 1건)으로 그 안의 분야를 판정한다.
- 부하 제한이 걸린다. `--limit`은 앞 N건만 돌리는 확인용이다.
- 끝나면 그 안·판정 판 폴더의 `runs.jsonl`에 실행 기록을 한 줄 더한다(data-model 3).
- 출력: `custom 분야 판정 412(보관 0 · 새로 412 · 실패 0 · 못 물음 0 · 분야 없음 17) · 글당 3.4초 · 31분`. 그 뒤에 부하 줄이 붙고, 온도를 읽지 못했으면 온도 줄도 붙는다.
- 안 id가 없거나 목록 검사를 통과하지 못하면 1로 끝난다.

### `node etl/notices/compare.ts label-input <안 id> <폴더>`

표본 120건의 라벨러 입력을 `<폴더>/<안 id>-1.jsonl` ~ `-3.jsonl`(40건씩)에 쓴다(data-model 5). 본문이 들어가므로 `<폴더>`가 저장소 안이면 거절하고 1로 끝난다.

### `node etl/notices/compare.ts gold <안 id> <A.json> <B.json> [<C.json>]`

라벨러 출력을 검사하고 `etl/gold/fields/<안 id>.csv`를 쓴다.
- 검사: A·B가 research R9의 출력 검사를 어기면 위반을 모두 출력하고 1로 끝난다. 이때 CSV는 쓰지 않는다.
- C가 없을 때: CSV를 쓴다(갈린 글은 갈림 `O`, 최종 빈칸). 갈린 글만 `<A.json과 같은 폴더>/<안 id>-split.jsonl`에 셋째 입력으로 쓴다. 출력은 `갈림 n건`이다.
- C가 있을 때: C가 갈린 글과 같은 글 집합인지, 꼴과 개수 규칙을 지키는지 본다. 어기면 1로 끝난다. 지키면 갈린 글의 최종을 채우고 갈림을 `C`로 바꾼다.

### `node etl/notices/compare.ts score`

세 안의 보관 답, 실행 기록, 정답으로 지표를 계산해 `etl/out/fields-compare.json`을 쓰고 지표 표를 출력한다(research R10·R16).
- 끝까지 실패한 글은 거절하지 않고 실패로 센다.
- 아래 경우에는 1로 끝난다.
  - 어느 안의 정답에 갈림 `O`가 남아 있다.
  - 어느 안에 전체 실행 기록(limit null, fresh ≥ 1)이 없다. 이때 무엇이 없는지 출력한다.

### `node etl/notices/compare.ts choose <안 id>`

`fields-compare.json`에서 그 안의 지표를 읽어 고른다(research R12).
- 거절: 그 안의 지표가 없음, 판정 판·모델이 지금 목록·모델과 다름, 핵심 정밀도가 null. 이유를 출력하고 1로 끝난다.
- 그 밖: 정밀도와 상관없이 그 안 파일에 `chosen: { date, corePrecision, prompt, model }`을 쓰고 다른 안의 chosen을 지운다. 0으로 끝난다.
- 출력: `custom 고름 · 핵심 정밀도 0.88 · 85% 기준 통과`. 미달이면 `… · 85% 기준 미달: 결과 파일에 분야를 넣지 않아요`다.
