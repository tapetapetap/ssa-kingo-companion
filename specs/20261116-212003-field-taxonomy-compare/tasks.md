---
description: "분야 목록 3안 비교와 공지 분야 판정 작업 목록"
---

# Tasks: 분야 목록 3안 비교와 공지 분야 판정

**Input**: `specs/20261116-212003-field-taxonomy-compare/`의 spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 사용자 요청으로 시험을 먼저 쓴다. 새 파일마다 `*.test.ts`를 둔다. 시험은 LLM·학교 서버·센서·시계를 함수 주입으로 바꿔 끼우고, CI(Linux)에서 돈다.

**Organization**: 이야기(US1~US4)별로 나눈다. ponytail full이다. 새 의존성은 들이지 않는다(G1). 파일은 500줄을 넘지 않는다(G3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일을 다루고 앞 작업에 기대지 않아 함께 할 수 있다
- **[Story]**: 이 작업이 속한 이야기(US1~US4)
- `$T`: 저장소 밖 임시 폴더다. 본문이 든 라벨러 입력·출력과 보고서 초안을 둔다.
- 예시 글 규칙: 지시문·라벨 기준·분야 설명에 드는 예시는 개발용 정답셋 501건에 없는 글이나 짧게 지어낸 예다(research R3).

---

## Phase 1: Setup

**Purpose**: 작업 공간 준비

- [ ] T001 `tape/main`에서 친 `feat/field-taxonomy` 브랜치에 있는지 확인한다.
  - `etl/taxonomy/`와 `etl/gold/fields/` 폴더는 첫 파일이 들어갈 때 함께 커밋한다.
  - `etl/.cache/`는 이미 `.gitignore`에 있다.
  - `$T` 폴더를 만든다.

---

## Phase 2: Foundational (모든 이야기가 기대는 것)

**Purpose**: 세 안의 분야 목록을 읽고 검사하는 공통 모듈. US1의 check, US2의 지시문, US3의 지표, US4의 고르기가 모두 쓴다.

- [ ] T002 [P] `etl/taxonomy/taxonomy.test.ts`에 시험을 먼저 쓴다(data-model 1의 검사 규칙).
  - 통과: 작은 고정 목록 3개가 통과한다.
  - 실패: 규칙마다 위반 사례 하나씩 쓴다.
    - id 겹침, 없는 묶음, 빈 설명, 241자 설명, 종류 이름과 같은 분야
    - courseMap 키 11개, 없는 분야 id
    - 1안에서 CSRankings 키가 빠짐
    - 2안 분야 수 ≠ `sourceCounts.minor`
    - 3안 연구 분야 desc가 '('로 시작하지 않음
    - chosen 두 개, chosen 꼴 틀림
  - LLM용 이름: 이름이 겹치면 '이름 (묶음 이름)'이 되고, 그래도 겹치면 실패한다.
  - 목록 글자 수: 묶음 이름, 분야 이름, 설명 글자를 더한 값이다.
- [ ] T003 `etl/taxonomy/taxonomy.ts`를 만든다.
  - 타입: `Taxonomy`, `Group`, `Field`, `Chosen`. 칸은 data-model 1 그대로다.
  - 상수: `TAXONOMY_IDS = ['custom', 'ncs', 'csrankings']`, `COURSE_ROWS`(data-model 1의 12개 키)
  - `loadTaxonomy(id, dir?)`: 파일 꼴을 검사한 뒤에만 타입을 붙인다. any를 쓰지 않는다.
  - `checkTaxonomy(t, ctx)`: 위반 문장 배열을 돌려준다. ctx는 CSRankings 키 27개와 종류 이름 11개다. 각각 `src/data/courses/csrankings.ts`의 `CSR_AREAS`, `etl/notices/classify.ts`의 `KIND_LABEL`에서 가져온다.
  - `labelsOf(t)`: LLM용 이름↔id를 찾는 Map 둘을 돌려준다.
  - `listChars(t)`: 목록 글자 수를 돌려준다.
  - T002가 통과해야 한다.

**Checkpoint**: `npx vitest run etl/taxonomy`가 통과한다.

---

## Phase 3: User Story 1 - 분야 목록 세 안과 미리보기 (Priority: P1) 🎯 MVP

**Goal**: 세 안의 분야 목록 파일이 검사를 통과하고, 사용자·교수님이 안마다 미리보기로 눌러 본다.

**Independent Test**: quickstart S2. `compare.ts check`가 세 줄을 내고 0으로 끝난다. 미리보기에서 3개를 고르면 '다음'이 켜진다.

- [ ] T004 [P] [US1] `etl/notices/compare.test.ts`에 `check` 시험을 먼저 쓴다. 임시 폴더의 고정 목록 3개로 돌린다.
  - 통과하면 안마다 `<id>: 묶음 n · 분야 n · 교과 지도 n/12 · 목록 n자`를 출력하고 0을 돌려준다.
  - 위반이 있으면 모두 출력하고 1을 돌려준다.
  - 안 파일이 없으면 1을 돌려준다.
- [ ] T005 [US1] `etl/notices/compare.ts`를 만든다.
  - 진입점은 `main(args, deps)`이다. deps는 목록·정답·출력 폴더와 시험용 교체 함수다.
  - 하위 명령 표에 `check`를 넣는다(contracts/cli.md). 쓰는 법이 틀리면 2다.
  - 파일 끝 진입 줄은 `if (import.meta.main)`이다. 기존 `run.ts`·`eval.ts`와 같은 꼴이다.
  - T004가 통과해야 한다.
- [ ] T006 [P] [US1] 1안 `etl/taxonomy/custom.json`을 쓴다(FR-002, research R8, data-model 1).
  - 크기: 큰 분야 10~15개, 세부 분야 80~120개
  - CSRankings 27개 키를 모두 어떤 분야의 csr에 넣는다.
  - 직무 묶음: 백엔드, 프론트엔드, 모바일 앱, 클라우드·인프라, 데이터 엔지니어링, 데이터 분석, ML 엔지니어링, 보안 엔지니어링, 임베디드·펌웨어, 게임 개발, QA·테스트 등
  - 산업·응용 묶음: 핀테크, 헬스케어, 모빌리티, 커머스, 콘텐츠·미디어, 공공·사회 등
  - 전공 밖 묶음: 서비스 기획·PM, UX·UI 디자인, 창업, 마케팅·브랜딩, 경영·컨설팅, 외국어·국제, 글쓰기·발표, 교육 등
  - 분야마다 학생이 알아듣는 설명 한 줄(`descFrom: "made"`)
  - courseMap 12줄
  - `edition`은 쓴 날이다.
- [ ] T007 [P] [US1] 3안 `etl/taxonomy/csrankings.json`을 쓴다(FR-004, data-model 1).
  - 연구 분야: `src/data/courses/csrankings.ts`의 27개 분야 하나에 분야 하나다. name은 학생 말 이름이고, desc는 '(<원래 이름>) …'로 시작한다.
  - 직무: T006 직무 묶음과 같은 이름으로 10~15개다.
  - 묶음: CSRankings 4묶음(AI·시스템·이론·융합)과 '직무'다.
  - courseMap 12줄
  - 출처: CC BY-NC-ND 4.0, 분야 이름·키만
- [ ] T008 [US1] `etl/taxonomy/ncs.ts`를 만들고 돌린다(research R7).
  - 받기
    - 자료실 글: `POST https://www.ncs.go.kr/th06/bbs_lib_view.do?libDstinCd=01`(본문 `libSeq=20260205111407114`)에서 첨부가 `NCS정보망DB(대분류별,2026년2월).xlsx` 그대로인지 확인한다.
    - 파일: `POST https://www.ncs.go.kr/common/file/downloadFile.do`(본문 `sysDstinCd=01&fileMstky=20260205111403008&filedetlSeq=20260205111403797&downlDstinCd=09`)로 `etl/.cache/ncs/`에 받는다.
    - 요청은 1초 1건이고, 있으면 다시 받지 않는다.
  - 읽기
    - `unzip -p`로 `xl/sharedStrings.xml`은 한 번에 읽는다.
    - 시트 '01'~'24'는 흘려 읽으며 A~H 칸(대·중·소·세분류 코드와 이름)만 본다.
    - 머리줄이 research R7과 다르면 1로 끝난다.
  - 만들기
    - id: `ncs-<대>`, `ncs-<대><중>`, `ncs-<대><중><소>`
    - 설명: 세분류 이름을 코드 순서로 쉼표로 이음, 240자에서 자름, `descFrom: "source"`
    - `edition: "2026-02"`, 받은 표에서 센 `sourceCounts`
    - 출처: '한국산업인력공단 NCS(ncs.go.kr), 공공누리 제1유형(출처표시)'
  - courseMap
    - 같은 파일의 고정 표 `NCS_COURSE_MAP`(교과 지도 12줄 → 소분류 코드)이 정한다.
    - 표는 정보통신 대분류의 소분류 목록을 보고 이 작업에서 한 번 쓴다. 대응이 없는 줄은 빈 배열이다.
  - 출력: contracts/cli.md 꼴
  - 실패하면: 공식 DB를 받지 못하면 1로 끝낸다. 사용자에게 공공데이터포털 15153998(2025-11-25, 소분류 231개)로 대체할지 묻는다.
- [ ] T009 [US1] 확인 실행
  - `node etl/taxonomy/ncs.ts`와 `node etl/notices/compare.ts check`를 돌린다.
  - 세 안이 통과하는지 보고, 위반은 목록 파일을 고쳐 없앤다.
  - 출력을 이 파일 아래 '실행 기록'에 남긴다.
- [ ] T010 [US1] 미리보기 `$T/report/preview.html`을 만든다(research R11, FR-007).
  - 저장소 밖에서 에이전트가 손으로 만든다.
  - 세 목록 JSON을 페이지 안에 넣고, `?v=custom|ncs|csrankings`로 안을 고른다.
  - 화면: 묶음별 세부 분야 칩(이름 + 설명), 이름·설명 찾기, 고른 수, 3개 이상일 때만 켜지는 '다음'
  - 결과가 없으면 '맞는 분야가 없어요'를 보인다.
  - 고른 것은 저장하지 않는다.
  - 브라우저로 열어 quickstart S2를 확인한다.

**Checkpoint**: 세 안의 목록과 미리보기가 있다. 이것만으로 교수님과 목록을 이야기할 수 있다.

---

## Phase 4: User Story 2 - 분야 판정과 부하 제한 (Priority: P2)

**Goal**: 어느 안이든 넣으면 기회마다 핵심 0~2·관련 0~5 분야가 붙는다. 모든 실제 LLM 요청은 부하 제한 안에서 돈다.

**Independent Test**: quickstart S3. 다섯 건 판정, 다시 돌리면 보관, 설명을 바꾸면 새 판정 판, 서버가 꺼졌으면 못 물음으로 끝까지 돈다.

### Tests for User Story 2

- [ ] T011 [P] [US2] `etl/notices/fields.test.ts`에 시험을 먼저 쓴다(contracts/field-llm.md).
  - 지시문: 묶음 순서대로 `## 묶음`과 `- 이름: 설명` 줄이 나온다.
  - 스키마: enum이 LLM용 이름 전부이고, maxItems가 2와 5다.
  - 답 정리
    - 목록 밖 이름은 null(실패)
    - 중복은 하나로
    - 핵심과 관련이 겹치면 핵심에만
    - 넘치면 앞에서부터
    - JSON이 아니면 null
  - 판정 판
    - 설명 한 글자만 바뀌어도 바뀐다.
    - 재료에 user 틀과 think가 들어 있다.
  - 요청(가짜 post)
    - 보관이 있으면 post를 부르지 않는다.
    - 보관 폴더가 `<모델>/<id>-<판정 판>/<번호>.json`이고, 파일에 `taxonomy`·`prompt` 칸이 있다.
    - `prompt_eval_count`가 num_ctx의 95% 이상이면 실패이고 보관하지 않는다.
- [ ] T012 [P] [US2] `etl/notices/throttle.test.ts`에 시험을 먼저 쓴다. 가짜 시계·잠·센서를 넣는다.
  - `createThrottle()` 하나의 `gate`를 두 번 연속 써도 '가장 큰 오름폭'이 이어진다.
  - 쉼: `after(ms)`가 ms/4를 쉰다. 실패한 요청 뒤에도 같다.
  - 온도 대기: 온도 + 가장 큰 오름폭이 80 이상이면 5초마다 다시 읽고, 내려가면 true를 돌려준다. 오름폭은 요청 직후 온도 − 직전 온도로 갱신된다.
  - 온도를 한 번 못 읽으면 그 뒤 `before()`가 늘 false다. 센서는 다시 부르지 않고, `noTemp`가 부를 때마다 하나씩 는다.
  - stats: `requests`·`requestMs`가 `after`로 받은 값의 개수·합이다.
  - 기록: 5초 표본이 1분마다 평균 GPU·최고 온도 한 줄로 모인다. `stop()`이 실행 전체 평균·최고와 `부하: GPU 평균 n% · 칩 최고 n°C`를 돌려준다. 요청이 0이면 부하 줄은 빈 값이다.
  - 센서 출력 읽기: `PMU tdie*` 줄의 최댓값을 쓰고 다른 센서는 무시한다. `"Device Utilization %"=n`을 읽는다.
- [ ] T013 [P] [US2] `etl/notices/llm.test.ts`에 사례를 더한다. 기존 사례는 그대로 둔다.
  - `makeChat`을 직접 불러, 다른 지시문·답 검사와 `sub`·`meta`를 넣어도 같은 보관·down 규칙이 지켜지는지 본다.
  - `gate.before()`가 false면 요청 없이 'down'이다.
  - 보관 답에는 gate를 부르지 않는다.
  - 요청이 끝나면 답이든 실패든 `gate.after(ms)`가 불린다.

### Implementation for User Story 2

- [ ] T014 [US2] `etl/notices/llm.ts`에서 `makeAsk` 몸통을 `makeChat<T>`로 뺀다(research R2).
  - 넣는 것: model, host, dir, sub, meta, post, system, userMessage, schema, options, parse, isValid, gate
  - 잘림 막기: 답의 `prompt_eval_count`가 `options.num_ctx`의 95% 이상이면 실패다(research R5).
  - `makeAsk`는 `sub = PROMPT_VERSION`, `meta = { prompt: PROMPT_VERSION }`, 기존 지시문·스키마를 넣는 몇 줄이 된다. 인자에 `gate?`를 더한다.
  - 기존 `llm.test.ts`·`run.test.ts`·`eval.test.ts`가 고치지 않고 통과하고(SC-008), T013도 통과해야 한다.
- [ ] T015 [US2] `etl/notices/fields.ts`를 만든다.
  - 상수: `FIELD_OPTIONS = { temperature: 0, num_ctx: 32768 }`, `FIELD_CACHE_DIR = etl/.cache/llm-fields`
  - 함수: `systemFor(t)`, `schemaFor(t)`, `fieldVersion(t)`(재료는 contracts/field-llm.md '판정 판'), `parseFieldAnswer(text, labels)`
  - `makeFieldAsk({ taxonomy, model?, host?, dir?, post?, gate? })`: makeChat을 쓰고 `.model`·`.version`·`.taxonomyId`를 가진다. 본문은 llm.ts의 `userMessage`를 그대로 쓴다.
  - 지시문은 contracts/field-llm.md의 8가지다. 예시 글 규칙을 지킨다.
  - T011이 통과해야 한다.
- [ ] T016 [P] [US2] `etl/notices/thermal.c`를 research 부록 A의 코드 그대로 쓴다.
- [ ] T017 [US2] `etl/notices/throttle.ts`를 만든다(research R6).
  - `readChipTemp()`
    - `etl/.cache/bin/thermal`이 없거나 `thermal.c`보다 오래됐으면 `clang -O2 -framework IOKit -framework CoreFoundation`으로 빌드한다.
    - 돌려서 `PMU tdie*` 최댓값을 쓴다. 실패하면 null이다.
  - `readGpu()`: `ioreg -r -d 1 -c IOAccelerator`의 `Device Utilization %`를 읽는다. 실패하면 null이다.
  - `createThrottle(deps?)`: `{ gate: { before, after }, stop(), noTemp, stats }`
    - 5초 표본 타이머는 `unref()`다.
    - 1분 기록은 `etl/.cache/load/<시작 시각>.jsonl`에 쓴다.
    - deps(시계·잠·센서·기록 폴더)는 시험에서만 바꾼다.
  - T012가 통과해야 한다.
- [ ] T018 [US2] `run.ts`·`eval.ts` 진입 줄을 바꾼다. 진입 줄에서만 `createThrottle()` 하나를 만든다.
  - `makeAsk({ gate: t.gate })`로 넘기고, main이 끝나면 `t.stop()`을 부른다. 끝 코드가 0이 아니어도 부른다.
  - main에는 부하·온도 줄을 붙일 선택 인자(`extra?: () => { noTemp, loadLine }`)만 더한다. 시험의 기존 호출은 그대로 통과한다.
  - run.ts 요약 줄 순서는 contracts/cli.md다. 'LLM에 연결하지 못해' 줄의 K에서 noTemp는 뺀다.
  - eval.ts는 부하·온도 줄을 stderr에 낸다.
  - `run.test.ts`에 사례를 더한다.
    - extra가 있으면 온도 줄과 부하 줄이 순서대로 붙는다.
    - skipped에서 noTemp를 뺀 K로 연결 줄이 나온다.
- [ ] T019 [US2] `compare.test.ts`에 `judge` 시험을 더한다.
  - 가짜 정답셋 기회 3건, 가짜 본문, 가짜 field ask와 가짜 throttle stats를 쓴다.
  - 요약 숫자(보관·새로·실패·못 물음·분야 없음)를 확인한다.
  - `--limit` 동작을 확인한다.
  - 판정 판 폴더의 `runs.jsonl`에 data-model 3 꼴로 한 줄이 생긴다. limit은 값 또는 null이다.
  - 목록 검사에서 실패한 안은 1이다.
- [ ] T020 [US2] `compare.ts`에 `judge <id> [--limit N]`을 더한다(contracts/cli.md).
  - 정답셋: `eval.ts`의 `readCsv`·`decodeCsv`·`parseGold`로 `etl/gold/dev-501.csv`의 기회만 고른다.
  - 본문: `cse.ts`의 `bodyOf`(보관본, 없으면 1초 1건)를 쓴다.
  - 판정: 진입 줄에서 만든 throttle의 gate로 `makeFieldAsk`를 차례로 부른다.
  - 기록: 끝나면 `runs.jsonl`에 쓰고 요약·부하 줄을 출력한다.
  - T019가 통과해야 한다.
- [ ] T021 [US2] quickstart S3을 이 맥에서 돌린다. 출력과 `prompt_eval_count`를 '실행 기록'에 남긴다.
  - `judge custom --limit 5`를 두 번 돌린다(두 번째는 `새로 0`).
  - 설명 한 글자를 바꿔 돌리면 `새로 5`다. 바꾼 것은 되돌린다.
  - `OLLAMA_HOST=127.0.0.1:1 … judge custom --limit 10`이면 `보관 5 · 새로 0 · 실패 0 · 못 물음 5`다.
  - `judge ncs --limit 1`로 `prompt_eval_count`를 남긴다. num_ctx의 70%를 넘으면 `FIELD_OPTIONS.num_ctx`를 65536으로 올리고 research R5에 적는다.

**Checkpoint**: 분야 판정과 부하 제한이 실제로 돈다. 기존 판정 시험은 모두 그대로 통과한다.

---

## Phase 5: User Story 3 - 정답셋·지표·비교 보고서 (Priority: P3)

**Goal**: 세 안을 같은 412건, 같은 표본 120건, 같은 모델로 재고, 보고서에서 나란히 본다.

**Independent Test**: quickstart S4·S5. 세 정답 파일이 완성되고(갈림 `O` 없음), `fields-compare.json`에 세 안의 지표가 있으며, 보고서로 고를 수 있다.

### Tests for User Story 3

- [ ] T022 [P] [US3] `compare.test.ts`에 `sample` 시험을 쓴다.
  - 실제 종류 수(채용 182, 특강 88, 교육·캠프 53, 교과 25, 대회·공모전 24, 장학 14, 해커톤 13, 멘토링 6, 글로벌 3, 동아리·학회 3, 봉사 1)의 가짜 정답셋으로 배분이 research R9 숫자와 같다(합 120).
  - 같은 입력이면 같은 출력이다.
  - 칸·줄 순서·종류 이름이 data-model 4와 같다.
- [ ] T023 [P] [US3] `compare.test.ts`에 `label-input`과 `gold` 시험을 쓴다.
  - label-input
    - 저장소 안 폴더는 거절한다.
    - 40건씩 3묶음이다.
    - body는 `clip` 결과다.
  - gold의 A·B 출력 검사(research R9). 위반마다 글 번호와 이유를 내고 1이며, CSV를 쓰지 않는다.
    - 표본 글 빠짐, 표본 밖 글, 같은 글 두 번
    - 칸 안 id 중복, 목록 밖 id
    - 핵심 3개, 관련 6개, 겹침
  - C 없이 돌린 gold
    - CSV를 쓰고, 갈린 글은 갈림 `O`·최종 빈칸, 같은 글은 `X`·최종 = A다.
    - split 줄 꼴은 data-model 5다.
    - '분야 없음'은 `-`다.
  - C가 있는 gold
    - C에 빠진 글이나 남는 글이 있으면 1이다.
    - C가 '분야 없음'으로 정한 글은 최종 `-`·갈림 `C`이고 완성으로 친다.
- [ ] T024 [P] [US3] 지표 시험을 쓴다. 작은 고정 표본으로 research R10을 손으로 계산한 값과 비교한다.
  - 맞은 비율: 핵심 정밀도·재현율, 전체 재현율, 관련 정밀도(micro)
  - 라벨러 일치도: 둘 다 빈 핵심은 두 비율 모두 '맞음'이다.
  - 412건 지표: 빈칸 두 가지, 상위 3 비율, unusedIds, 교과 지도 연결
  - 실패율: 보관 없는 글을 실패로 센다. 표본에서는 빈 답으로 센다.
  - runs.jsonl: limit null·fresh ≥ 1인 마지막 줄을 고르고, `--limit`이나 모두 보관인 줄은 건너뛴다.
  - 보고서 목록: top 10과 같은 수의 순서, misses·splits 정렬·10건 제한
  - 분모 0이면 null이다.
  - score 거절: 갈림 `O` 남음, 전체 실행 기록 없음

### Implementation for User Story 3

- [ ] T025 [US3] 라벨 기준 한 장 `specs/20261116-212003-field-taxonomy-compare/label-guide.md`를 쓴다. 세 안이 함께 쓴다.
  - 분야는 '무엇에 관한 것인가'이고, 종류(채용·특강 등)는 분야가 아니다.
  - 핵심: 확신하는 것만 0~2개, 가까운 순
  - 관련: 조금이라도 관련 있으면 0~5개, 핵심과 겹치지 않음
  - 회사 이름만으로 고르지 않고 하는 일·배우는 것으로 고른다.
  - 맞는 분야가 없으면 비운다(빈 배열).
  - 본문이 없으면 제목과 게시판만 본다.
  - LLM 답과 다른 라벨러 답은 보지 않는다.
  - 출력 꼴: data-model 5, 분야는 id
  - 예시 2~3개: 예시 글 규칙을 지킨다.
- [ ] T026 [US3] `compare.ts`에 `sample`, `label-input`, `gold`를 더한다(contracts/cli.md, data-model 4·5). T022·T023이 통과해야 한다.
- [ ] T027 [US3] 지표 계산과 `compare.ts score`를 더한다(research R10·R16, data-model 6).
  - 쓰는 곳은 `etl/out/fields-compare.json`이다.
  - `systemChars`는 `systemFor(t).length`다.
  - compare.ts가 400줄을 넘으면 지표 계산을 `etl/notices/score.ts`(+ `score.test.ts`로 T024 옮김)로 뺀다.
  - T024가 통과해야 한다.
- [ ] T028 [US3] `node etl/notices/compare.ts sample`로 `etl/gold/fields/sample.csv`를 만든다. 종류별 배분을 '실행 기록'에 남긴다.
- [ ] T029 [US3] 세 안 412건 판정을 `custom` → `ncs` → `csrankings` 순으로 돌린다. 안을 섞지 않는다(R5).
  - 첫 안이 끝나면 실제 글당 시간으로 남은 시간을 다시 잰다. 세 안 합이 3시간을 넘을 것 같으면 사용자에게 알린다(SC-006).
  - 안마다 요약과 부하 줄을 '실행 기록'에 남긴다(SC-001, SC-005).
  - 다시 돌려 `새로 0`인지 본다(SC-007).
- [ ] T030 [US3] 안마다 `node etl/notices/compare.ts label-input <id> "$T"`를 돌린다.
- [ ] T031 [US3] 라벨러 A·B를 띄운다. 안마다 둘, 모두 6개다.
  - Claude 하위 에이전트(general-purpose)로 백그라운드에서 돌린다.
  - 주는 것: `label-guide.md`, 그 안의 목록 파일, `$T/<id>-1~3.jsonl`
  - 막는 것: LLM 보관 답(`etl/.cache/llm-fields`)과 다른 라벨러 출력은 읽지 않게 한다. 저장소 파일은 고치지 않게 한다.
  - 출력: `$T/<id>-A.json`, `-B.json`
  - 오면 `gold <id> A B`로 검사한다. 위반이 있으면 그 라벨러에게 고쳐 달라고 다시 보낸다.
- [ ] T032 [US3] 안마다 셋째 라벨러 C를 띄운다.
  - 주는 것: `$T/<id>-split.jsonl`(data-model 5 꼴), 같은 기준과 목록. LLM 답은 주지 않는다.
  - 출력: `$T/<id>-C.json`
  - `gold <id> A B C`로 `etl/gold/fields/<id>.csv`를 완성한다(SC-002).
- [ ] T033 [US3] `node etl/notices/compare.ts score`로 `etl/out/fields-compare.json`을 만든다. 지표 표를 '실행 기록'에 남긴다.
- [ ] T034 [US3] 비교 보고서를 만든다.
  - 에이전트가 손으로 `$T/report/index.html`과 T010의 `preview.html`을 만든다.
  - artifact-design 스킬을 먼저 불러 따른다.
  - 담을 것
    - fields-compare.json의 세 안 지표 표
    - 분야 분포 그림(top, unusedIds)
    - LLM과 정답이 갈린 예, 라벨러가 갈린 예(제목·링크만)
    - 안마다 미리보기 링크
    - 측정 조건: 모델, 412/120, 부하 제한, num_ctx, NCS 기준 월
  - 공지 본문 문장은 넣지 않는다.
  - 비공개 아티팩트로 올리고 링크를 사용자에게 준다. 교수님께는 Share로 공유해야 한다고 알린다(SC-003은 사용자가 고를 때 끝난다).

**Checkpoint**: 사용자와 교수님이 보고서로 안을 고를 수 있다.

---

## Phase 6: User Story 4 - 고른 안을 결과 파일에 넣기 (Priority: P4)

**Goal**: 고른 안이 85% 이상이고 판정 판이 같으면 결과 파일 기회마다 분야 칸이 생긴다.

**Independent Test**: quickstart S6. choose가 기록하고, 조건이 맞을 때만 결과 파일에 분야 칸이 생기며, 기존 칸과 시험이 그대로다.

### Tests for User Story 4

- [ ] T035 [P] [US4] `compare.test.ts`에 `choose` 시험을 쓴다.
  - 정밀도가 0.81이어도 그 안에만 `chosen: { date, corePrecision, prompt, model }`을 쓰고 '미달'을 출력한다.
  - 0.88이면 '통과'를 출력한다.
  - 다른 안의 chosen은 지운다.
  - 거절(1, 파일 그대로)
    - fields-compare.json이 없음, 그 안이 없음
    - 판정 판이나 모델이 지금과 다름
    - 정밀도 null
- [ ] T036 [P] [US4] `etl/notices/run.test.ts`에 사례를 더한다.
  - 고른 안이 없으면 결과 파일과 요약이 지금과 똑같다.
  - 조건 충족(0.85 이상, 같은 판정 판)과 가짜 field ask
    - 머리에 `taxonomy { id, prompt }`가 붙는다.
    - 답을 받은 기회에 `fields`·`fieldRule`이 붙는다.
    - 실패·못 물음인 기회에는 `fields`가 없다.
    - 요약에 분야 판정 줄이 붙는다.
  - 미달이거나 판정 판이 다름: field ask를 부르지 않는다. 결과 파일은 그대로이고, 요약에 이유 줄이 붙는다.
  - 기회 아님 글에는 분야를 묻지 않는다(US2 시나리오 2).
  - 고른 안을 찾는 함수가 chosen 둘 이상을 받으면 오류다(진입 줄은 1로 끝난다).
  - 기존 스키마 사례(305행)를 넓힌다: 스키마에 `taxonomy`·`fields`·`fieldRule`이 선택 칸으로 있다.

### Implementation for User Story 4

- [ ] T037 [US4] `compare.ts`에 `choose <id>`를 더한다(research R12). T035가 통과해야 한다.
- [ ] T038 [US4] 결과 파일에 분야를 넣는다.
  - `etl/notices/run.ts`
    - main에 선택 인자 `{ fieldAsk?, taxonomy?: { id, prompt } }`를 더한다.
    - 있으면 `buildResult`가 남긴 기회마다 판정해 data-model 7의 칸을 더하고 요약 줄을 붙인다.
    - `ResultFile`·`Opportunity` 타입에 선택 칸(`taxonomy?`, `fields?`, `fieldRule?`)을 더한다.
  - 진입 줄
    - `etl/taxonomy/`에서 chosen을 찾는다. 둘 이상이면 1로 끝난다.
    - research R12의 조건을 보고, 맞으면 같은 throttle의 gate로 `makeFieldAsk`를 만들어 넘긴다.
    - 안 맞으면 이유 줄만 넘긴다.
  - 스키마: `specs/20261107-193624-cse-notice-opportunities/contracts/cse-notices.schema.json`에 선택 칸 셋을 더한다(research R12).
  - T036이 통과해야 한다.

**Checkpoint**: 코드는 다 들어갔다. 실제 고르기는 사용자가 정한 뒤 T044에서 한다.

---

## Phase 7: Polish & 마무리

- [ ] T039 [P] `docs/product/decisions.md`에 2026-11-16 결정 한 덩이를 적는다.
  - 예시 자료 삭제와 처음부터 다시 만들기, 순서 1~8
  - 분야 목록 3안 비교
  - 분야 두 단계(핵심·관련)
  - 부하 제한을 분류기 안에 고정
  - 고르기와 85% 기준 분리
- [ ] T040 검사를 돌린다.
  - `npm run check`와 `npm run build`가 통과해야 한다.
  - 화면 변화는 없지만 CI가 도는 `npm run audit:layout`·`npm run audit:copy`도 한 번 돌린다.
- [ ] T041 리뷰를 돌린다.
  - `ponytail-review`로 diff의 과설계를 점검하고 고친다. 이어서 `/code-review`(high)로 정확성·보안을 점검하고 고친다.
  - 볼 것
    - 본문이 저장소 파일·보관 답·보고서에 들어가지 않는지
    - label-input의 저장소 안 폴더 거절
    - 학교 서버 간격
    - 지시문·라벨 기준·목록 설명의 예시 제목이 `etl/gold/dev-501.csv`에 없는지
  - 고치지 않는 것은 이유를 적는다.
- [ ] T042 tasks.md를 완료 표시로 고치고 커밋한다. 커밋은 `영역: 무엇을 왜` 한 줄이고, 한 커밋에 한 가지 이유다.
- [ ] T043 PR을 올리고 머지한다(CLAUDE.local.md).
  - `tape`에 push하고 PR을 연다.
  - CI(check·build·audit:layout·audit:copy)와 Claude 리뷰를 확인하고, 고치거나 이유를 답한다.
  - 통과하면 `gh pr merge --merge --delete-branch`로 머지하고, 로컬 브랜치를 지우고 `main`을 당긴다.
- [ ] T044 (사용자가 안을 고른 뒤) 새 브랜치에서 작은 PR을 올려 머지까지 한다.
  - `node etl/notices/compare.ts choose <id>`를 돌린다. 기록은 늘 되고, 출력에 85% 통과·미달이 나온다.
  - 통과면 `node etl/notices/run.ts`로 `etl/out/cse-notices.json`을 갱신한다.
  - 미달이면 무엇을 고칠지(목록·지시문) 사용자와 정한다. 그 안만 judge → 바뀐 id 글 재라벨 → score → choose를 다시 한다(spec FR-021).
  - `docs/product/decisions.md`에 고른 안·날짜·정밀도를 한 줄 적는다.

---

## Dependencies & Execution Order

- **Setup(T001)** → **Foundational(T002–T003)** → 이야기들
- **US1(T004–T010)**: Foundational 뒤에 한다. T006·T007·T008은 서로 기대지 않는다.
- **US2(T011–T021)**: Foundational 뒤에 시작할 수 있다.
  - 순서: T014(makeChat) → T015 → T020, T016 → T017 → T018
  - 실제 판정(T021)에는 US1 목록 custom·ncs가 있어야 한다.
- **US3(T022–T034)**
  - T029는 US1 세 목록, US2 판정, T021의 num_ctx 확인 뒤에 한다.
  - T031은 T025·T028·T030 뒤, T032는 T031 뒤에 한다.
  - T033은 T029·T032 뒤, T034는 T033·T010 뒤에 한다.
- **US4(T035–T038)**: US2(T014·T015·T017) 뒤에 한다. 지표 파일 모양(T027)이 있어야 T037을 시험할 수 있다.
- **Polish(T039–T043)**: 모든 이야기 뒤에 한다. T044는 사용자가 고른 뒤 따로 한다.

### Parallel Opportunities

- T002 ∥ T004: 다른 파일의 시험이다.
- T006 ∥ T007 ∥ T008: 세 목록 파일이다.
- T011 ∥ T012 ∥ T013 ∥ T016: US2 시험과 C 파일이다.
- T022 ∥ T023 ∥ T024, T035 ∥ T036: 시험 묶음이다.
- T031: 라벨러 6명이 함께 돈다. 서로의 출력을 보지 않는다.
- T029(LLM 판정, 1~2시간)가 도는 동안 T025·T030·T031을 함께 할 수 있다. 라벨러는 LLM 답을 보지 않는다.

## Parallel Example: User Story 2

```text
함께: T011 fields.test.ts · T012 throttle.test.ts · T013 llm.test.ts 사례 · T016 thermal.c
그 뒤: T014 makeChat → T015 fields.ts → T017 throttle.ts → T018 진입 줄 → T019·T020 judge → T021 이 맥에서 확인
```

## Implementation Strategy

1. **MVP(US1)**: 세 목록과 미리보기. 이것만으로 교수님과 목록의 크기·이름·묶음을 이야기할 수 있다.
2. **US2**: 판정 단계와 부하 제한. 기존 판정의 실제 요청에도 부하 제한이 걸린다.
3. **US3**: 판정 실행과 라벨링을 함께 돌린 뒤 지표·보고서를 만들고, 사용자·교수님이 고른다.
4. **US4**: 코드는 같은 PR에 넣는다. 고르기와 결과 파일 갱신은 사용자 결정 뒤 작은 PR(T044)로 한다.

## 실행 기록

(T009, T021, T028, T029, T033의 출력을 여기에 적는다)
