# Contract: 명령

Node 22.18 이상에서 TypeScript 파일을 바로 돌린다(타입 제거 실행).

- 종료 코드: 0 성공, 1 실행 실패·거절, 2 쓰는 법 틀림
- 출력: 사람에게 보이는 글(진행, 거절 이유)은 표준 오류(stderr)로, 표나 요약은 표준 출력으로 낸다.
- 환경 변수: 기존과 같다(`KINGO_LLM_MODEL`, `OLLAMA_HOST`). 임베딩 모델은 상수다(research R17).
- 부하 제한(research R6): 각 명령의 파일 끝 진입 줄(`if (import.meta.main) …`)에서 실행 하나에 throttle 하나를 만든다.
  - 판정마다 `t.gate()`로 문을 만들어 ask·임베딩에 넣고, main에 그 문과 `load: t.stop`을 넘긴다.
  - main이 어떻게 끝나든 진입 줄이 `t.stop()`을 한 번 더 부른다.
  - 시험이 main에 넣는 ask·문은 가짜라 센서와 Ollama에 닿지 않는다.
- 비율 표시: 백분율을 소수 첫째 자리까지 내림하고 `(num/den)`을 붙인다(예 `84.9% (147/173)`). 분모가 0이면 `해당 없음`이다(research R10).

## 기존 명령 (바뀌는 동작만)

### `node etl/notices/run.ts [기준일]`

- `main(args, get, out, dir, ask?, x?)`. x는 `{ gate?, field?, load? }`이고 모두 선택이다. 없으면 지금과 같다(기존 시험이 그대로 통과한다).
  - gate: 기회 판정 ask를 만든 문. noTemp를 읽는다.
  - field: `{ ask, gate }`(분야를 넣는다) 또는 `{ reason }`(넣지 않은 이유)
  - load: throttle의 stop. 요약을 찍을 때 한 번 부른다.
- 모든 LLM·임베딩 요청에 부하 제한이 걸린다. 보관 답은 쉬거나 기다리지 않는다.
- 분야 판정
  - 진입 줄이 `findChosen`으로 `etl/taxonomy/*.json`에서 고른 안을 찾는다. 둘 이상이면 `고른 안이 둘 이상이에요: custom, ncs`를 표준 오류에 내고 1로 끝난다.
  - 고른 안이 있으면 그 안의 판정기를 만들고 `fieldGate`(research R12)를 본다.
  - 통과하면 `buildResult`가 남긴 기회마다 분야를 판정해 결과 파일에 `taxonomy`, `fields`, `fieldRule`을 더한다(data-model 7). 머리의 taxonomy는 `{ id: ask.taxonomyId, prompt: ask.version }`이다.
  - 통과하지 못하면 분야 판정을 하지 않고 요약에 이유를 한 줄 낸다.
    - `고른 안 custom을 고른 뒤 판정 판이 바뀌어(1a2b3c4d → 5e6f7a8b) 분야를 넣지 않았어요. 다시 재고 고르세요`
    - `고른 안 custom은 gemma4:12b로 쟀는데 지금 모델은 <모델>이라 분야를 넣지 않았어요`
    - `고른 안 custom의 핵심 정밀도 81.0% (81/100) < 85%라 분야를 넣지 않았어요`
  - 고른 안이 없으면 지금과 같은 파일이다.
- 요약: 표준 출력에 지금처럼 한 번에 낸다. 지금의 요약 한 줄 뒤에 해당하는 줄만 이 순서로 붙인다.
  1. `LLM에 연결하지 못해 K건은 규칙만 썼어요 (<모델>)`: 지금 줄과 같다. K = 기회 판정의 못 물음 − 기회 판정 문의 noTemp. K가 0이면 없다.
  2. `온도를 읽지 못해 N건은 묻지 않았어요`: N = 두 문의 noTemp 합. 보내지 않은 요청 수라 한 글이 두 번 셀 수 있다.
  3. `분야 판정 n(보관 a · 새로 b · 실패 c · 못 물음 d · 분야 없음 e)`, 또는 넣지 않은 이유 한 줄
  4. `부하: GPU 평균 n% · 칩 최고 n°C`(리눅스는 `CPU 최고`): 실제 요청이 하나라도 있었을 때만

### `node etl/notices/eval.ts …`

쓰는 법과 평가 결과(지표 표)는 그대로다.
- `main(args, get, goldDir, cacheDir, ask?, x?)`. x는 `{ gate?, load? }`다.
- LLM 요청에 부하 제한이 걸린다. 판정이 끝나면 실제 요청이 있었을 때 부하 줄을 표준 오류에 낸다.
- 못 물은 글이 있으면 지금처럼 비교를 거절하고 1로 끝난다. 이유는 까닭마다 한 줄씩 표준 오류에 낸다.
  - `LLM에 연결하지 못한 글이 K건이라 비교하지 않았어요 (<모델>)`: 지금 줄이다. K는 run.ts와 같다.
  - `온도를 읽지 못한 글이 N건이라 비교하지 않았어요`: N은 문의 noTemp다.

## 새 명령

### `node etl/taxonomy/ncs.ts`

NCS 공식 사이트의 'NCS 정보망 DB(대분류별, 2026년 2월 기준)' 엑셀을 받아 `etl/taxonomy/ncs.json`을 만든다(research R7).
- 받기: 1초에 1건씩 `etl/.cache/ncs/`에 받는다. 이미 받은 파일은 다시 받지 않는다.
- 출력: `대분류 24 · 중분류 81 · 소분류 270 · 세분류 1096 (기준 2026-02)`
- 실패: 받지 못하거나 시트·칸 모양이 research R7과 다르면 이유를 출력하고 1로 끝난다. 이때 `ncs.json`은 그대로 둔다.

### `node etl/notices/compare.ts …` 공통

- `main(args, deps)`. 하위 명령은 check, sample, judge, label-input, gold, score, choose다. 그 밖이나 인자 수가 틀리면 쓰는 법을 내고 2로 끝난다. sample·label-input·gold는 `gold.ts`에 있고 compare.ts가 넘겨 부른다(plan G3).
- 목록 읽기: sample을 뺀 모든 하위 명령은 `readList(id, dir)`(`etl/taxonomy/taxonomy.ts`, loadTaxonomy 뒤 checkTaxonomy)로 목록을 읽는다. 파일이 없거나 꼴이 틀리거나 규칙을 어기면 이유를 모두 내고 1로 끝난다.
- deps(시험용 교체, 모두 선택)
  - 폴더: `taxonomyDir`, `goldDir`, `outFile`, `llmDir`(분야 답 보관), `embedDir`(벡터 보관), `cacheDir`(본문 보관), `repoRoot`(저장소 안 검사의 기준)
  - `fieldAsk(t)`: judge의 판정기를 만든다. `gate`: 그 판정기의 문. `load`: throttle의 stop
  - `now`: 시각. `model`: LLM 모델 이름(기본은 makeAsk와 같은 규칙)
- 진입 줄은 throttle 하나와 문 하나를 만들고, 그 문으로 `makeEmbed`와 `fieldAsk = t => makeFieldAsk({ taxonomy: t, gate, embed })`를 만들어 넘긴다.
- 본문: `cacheDir`의 보관본만 읽는다. compare.ts는 학교 서버를 부르지 않는다(spec FR-027).

### `node etl/notices/compare.ts check`

세 분야 목록을 `checkTaxonomy`로 검사하고, chosen이 많아야 하나인지 `findChosen`으로 본다(data-model 1의 규칙).
- 통과하면 안마다 한 줄씩 출력하고 0으로 끝난다. 예: `custom: 묶음 11 · 분야 90 · 교과 지도 12/12 · 목록 7,800자`
  - 목록 글자 수는 묶음 이름, 분야 이름, 설명 글자를 더한 값이다. 지시문에는 그중 후보 30개만 들어간다.
- 파일이 없거나 꼴이 틀리거나 규칙을 어기면, 어긴 것을 모두 출력하고 1로 끝난다.

### `node etl/notices/compare.ts sample`

`etl/gold/dev-501.csv`의 기회 412건에서 표본 120건을 뽑아 `etl/gold/fields/sample.csv`에 쓴다(research R9). 종류별 배분을 출력한다. 같은 입력이면 같은 파일이 나온다.

### `node etl/notices/compare.ts judge <안 id> [--limit N]`

412건의 본문 보관본(`etl/.cache/cse`)으로 그 안의 분야를 판정한다(임베딩 후보 → LLM, contracts/field-llm.md). 학교 서버에는 묻지 않는다.
- 부하 제한이 걸린다. `--limit`은 정답셋 순서로 앞 N건만 돌리는 확인용이다.
- 보관본이 없는 글은 묻지 않고 못 물음으로 센다(2026-11-17에 412건 모두 보관본이 있음을 확인했다).
- 끝나면 그 안·판정 판 폴더의 `runs.jsonl`에 실행 기록을 한 줄 더한다(data-model 3).
- 출력(표준 출력): `custom 분야 판정 412(보관 0 · 새로 412 · 실패 0 · 못 물음 0 · 분야 없음 17) · 글당 3.4초 · 31분`
  - 글당 시간 = requestMs / (새로 + 실패). 둘 다 0이면 `글당 -`다.
  - 전체 시간은 1분 미만이면 `40초`처럼 초로, 아니면 반올림한 분으로 쓴다.
  - 그 뒤에 온도 줄(`온도를 읽지 못해 N건은 묻지 않았어요`, noTemp가 있을 때)과 부하 줄(요청이 있었을 때)이 붙는다.
- 모든 글이 실패나 못 물음이어도 기록을 쓰고 0으로 끝난다. 안 id가 없거나 목록 검사를 통과하지 못하면 1이다.

### `node etl/notices/compare.ts label-input <안 id> <폴더>`

- 표본 120건의 라벨러 입력을 `<폴더>/<안 id>-1.jsonl` ~ `-3.jsonl`(sample.csv 순서로 40건씩)에 쓴다(data-model 5).
- 본문이 들어가므로 `<폴더>`가 저장소 안이면(심볼릭 링크를 푼 경로가 저장소 뿌리 아래) 아무것도 쓰지 않고 1로 끝난다.
- 표본 글의 본문 보관본이 없으면 그 글 번호를 내고, 아무것도 쓰지 않고 1로 끝난다.

### `node etl/notices/compare.ts gold <안 id> <A.json> <B.json> [<C.json>]`

라벨러 출력을 검사하고 `etl/gold/fields/<안 id>.csv`를 쓴다.
- 셋째 입력(본문이 듦)을 A.json과 같은 폴더에 쓰므로, 그 폴더가 저장소 안이면 읽기 전에 1로 끝난다(label-input과 같은 검사).
- 검사: A·B가 research R9의 출력 검사를 어기면 위반(글 번호와 이유)을 모두 출력하고 1로 끝난다. 이때 CSV는 쓰지 않는다.
- C가 없을 때: CSV를 쓴다(갈린 글은 갈림 `O`, 최종 빈칸). 갈린 글만 `<A.json과 같은 폴더>/<안 id>-split.jsonl`에 셋째 입력으로 쓴다. 그 글의 본문 보관본이 없으면 1이다. 출력은 `갈림 n건`이다.
- C가 있을 때: C가 갈린 글과 같은 글 집합인지, 꼴과 개수 규칙을 지키는지 본다. 어기면 1로 끝난다. 지키면 갈린 글의 최종을 채우고 갈림을 `C`로 바꾼다.

### `node etl/notices/compare.ts score`

세 안의 보관 답, 벡터, 실행 기록, 정답으로 지표를 계산해 `etl/out/fields-compare.json`을 쓰고 지표 표(행은 지표, 열은 세 안)를 출력한다(research R10·R16).
- 요청을 보내지 않는다.
- 끝까지 실패한 글은 거절하지 않고 실패로 센다. 공지 벡터가 없는 표본 글은 후보가 없는 것으로 센다. 분야가 30개 이하인 안은 모든 분야가 후보라 벡터를 읽지 않는다.
- 아래 경우에는 무엇이 없는지 출력하고 1로 끝난다.
  - 어느 안의 정답 파일이 없거나 갈림 `O`가 남아 있다.
  - 어느 안에 전체 실행 기록(limit null)이 없다.
  - 어느 안의 분야 벡터 파일이 없다(벡터 보관만 지운 경우다. 그 안의 답 폴더도 지우고 judge를 다시 돌린다).

### `node etl/notices/compare.ts choose <안 id>`

`fields-compare.json`에서 그 안의 지표를 읽어 고른다(research R12).
- 거절: 그 안의 지표가 없음, 판정 판·모델이 지금 목록·모델과 다름, 핵심 정밀도의 분모가 0. 이유를 출력하고 1로 끝난다. 파일은 그대로다.
- 그 밖: 정밀도와 상관없이 그 안 파일에 `chosen: { date, corePrecision: { num, den }, prompt, model }`을 쓰고 다른 안의 chosen을 지운다. 0으로 끝난다.
- 출력: `custom 고름 · 핵심 정밀도 88.0% (88/100) · 85% 기준 통과`. 미달이면 `… · 85% 기준 미달: 결과 파일에 분야를 넣지 않아요`다.
