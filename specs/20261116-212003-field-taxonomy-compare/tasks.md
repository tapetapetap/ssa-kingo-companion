---
description: "분야 목록 3안 비교와 공지 분야 판정 작업 목록"
---

# Tasks: 분야 목록 3안 비교와 공지 분야 판정

**Input**: `specs/20261116-212003-field-taxonomy-compare/`의 spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 사용자 요청으로 시험을 먼저 쓴다. 새 파일마다 `*.test.ts`를 둔다. 시험은 LLM·임베딩·학교 서버·센서·시계를 함수 주입으로 바꿔 끼우고, CI(Linux)에서 돈다.

**Organization**: 이야기(US1~US4)별로 나눈다. ponytail full이다. 새 의존성은 들이지 않는다(G1). 파일은 500줄을 넘지 않는다(G3).

**승인**: 구현 전 승인(2-1)은 사용자가 면제했다(2026-11-17 '내 승인은 생략하고 모두 추천으로 진행'). 묻지 않고 추천대로 정하고, 정한 것과 실사용 변화는 보고서(T041)에 남긴다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일을 다루고 끝나지 않은 앞 작업에 기대지 않아 함께 할 수 있다
- **[Story]**: 이 작업이 속한 이야기(US1~US4)
- `$T`: 저장소 밖 임시 폴더다. 본문이 든 라벨러 입력·출력과 보고서 초안을 둔다.
- 예시 글 규칙: 지시문·라벨 기준·분야 설명에 드는 예시는 개발용 정답셋 501건에 없는 글이나 짧게 지어낸 예다(research R3).

---

## Phase 1: Setup

- [x] T001 `tape/main`에서 친 `feat/field-taxonomy` 브랜치에 있는지 확인한다.
  - `etl/taxonomy/`와 `etl/gold/fields/` 폴더는 첫 파일이 들어갈 때 함께 커밋한다. `etl/.cache/`는 이미 `.gitignore`에 있다.
  - `$T` 폴더를 만든다. `ollama list`에 `gemma4:12b`와 `bge-m3`가 있는지 본다.

---

## Phase 2: Foundational (모든 이야기가 기대는 것)

**Purpose**: 세 안의 분야 목록을 읽고 검사하는 공통 모듈. US1의 check, US2의 지시문·후보, US3의 지표, US4의 고르기가 모두 쓴다.

- [x] T002 [P] `etl/taxonomy/taxonomy.test.ts`에 시험을 먼저 쓴다(data-model 1).
  - 시험용 목록: `etl/taxonomy/fixtures.ts`의 `validList(id)`가 검사를 통과하는 목록을 코드로 만든다. custom은 묶음 10개·분야 80개(CSRankings 27키 하나씩 + 직무 11 + 채움 42), csrankings는 연구 27(`CSR_AREAS`) + 직무 11, ncs는 분야 3개(`sourceCounts.minor` 3)다. 크기 한도는 ctx로 바꾸지 않는다.
  - 통과: `validList` 셋이 통과한다.
  - 실패: `validList` 결과를 하나씩 고쳐 규칙마다 위반 사례를 쓴다. id 겹침, 없는 묶음, 빈 설명, 241자 설명, 종류 이름과 같은 분야, courseMap 키 11개, 없는 분야 id, 1안 CSRankings 키 빠짐, 2안 분야 수 ≠ `sourceCounts.minor`, 3안 연구 분야 desc가 '('로 시작하지 않음, 3안 연구 분야의 묶음이 그 키의 CSRankings 묶음과 다름, chosen 꼴 틀림
  - LLM용 이름: 이름이 겹치면 '이름 (묶음 이름)'이 되고, 그래도 겹치면 실패한다.
  - 목록 글자 수(묶음 이름 + 분야 이름 + 설명)와 묶음 경로(2안 '대분류 › 중분류')
  - `findChosen`: 없으면 null, 하나면 그 안, 둘 이상이면 `고른 안이 둘 이상이에요: custom, ncs`를 던진다.
  - `fieldGate`: 통과, 판정 판 다름, 모델 다름, 정밀도 미달(84/100)과 경계(85/100은 통과)마다 contracts/cli.md의 이유 줄이 나온다.
- [x] T003 `etl/taxonomy/taxonomy.ts`를 만든다.
  - 타입: `Taxonomy`, `Group`, `Field`, `Chosen`(칸은 data-model 1). 상수: `TAXONOMY_IDS = ['custom', 'ncs', 'csrankings']`, `COURSE_ROWS`(12개 키), `TAXONOMY_DIR`
  - `loadTaxonomy(id, dir?)`: 파일 꼴을 검사한 뒤에만 타입을 붙인다. 없거나 꼴이 틀리면 이유를 담아 던진다. any를 쓰지 않는다.
  - `checkTaxonomy(t, ctx)` → 위반 문장 배열. ctx는 `{ csrAreas, kindNames }`다. csrAreas는 `src/data/courses/csrankings.ts`의 `CSR_AREAS`(id·group), kindNames는 `etl/notices/classify.ts`의 `KIND_LABEL` 값이고, 이 둘로 만든 `CHECK_CTX`를 내보낸다.
  - `readList(id, dir?)`: `loadTaxonomy` 뒤 `checkTaxonomy(t, CHECK_CTX)`가 비었을 때만 목록을 돌려주고, 아니면 위반을 모두 담아 던진다. compare.ts·gold.ts의 하위 명령이 목록을 읽을 때 쓴다(contracts/cli.md '공통').
  - `labelsOf(t)` → `{ idOf: Map<LLM용 이름, id>, nameOf: Map<id, LLM용 이름> }`, `listChars(t)`, `groupPath(t, groupId)`
  - `findChosen(list)`, `fieldGate(t, version, model)` → `{ ok: true } | { reason }`(research R12). 정밀도는 `num × 100 ≥ 85 × den`으로 비교한다(R10).
  - T002가 통과해야 한다.

**Checkpoint**: `npx vitest run etl/taxonomy`가 통과한다.

---

## Phase 3: User Story 1 - 분야 목록 세 안과 미리보기 (Priority: P1) 🎯 MVP

**Goal**: 세 안의 분야 목록 파일이 검사를 통과하고, 사용자·교수님이 안마다 미리보기로 눌러 본다.

**Independent Test**: quickstart S2. `compare.ts check`가 세 줄을 내고 0으로 끝난다. 미리보기에서 3개를 고르면 '다음'이 켜진다.

- [x] T004 [P] [US1] `etl/notices/compare.test.ts`에 `check` 시험을 먼저 쓴다. `validList` 셋을 임시 폴더에 써서 `deps.taxonomyDir`로 돌린다.
  - 통과하면 안마다 `<id>: 묶음 n · 분야 n · 교과 지도 n/12 · 목록 n자`를 출력하고 0을 돌려준다.
  - 위반이 있으면 모두 출력하고 1이다. 안 파일이 없거나 chosen이 둘이어도 1이다.
- [x] T005 [US1] `etl/notices/compare.ts`를 만든다.
  - 진입점은 `main(args, deps)`이다. deps 칸은 contracts/cli.md '공통'이다.
  - 하위 명령 표에 `check`를 넣는다. 쓰는 법이 틀리면 2다.
  - 파일 끝 진입 줄은 `if (import.meta.main)`이다. 기존 `run.ts`·`eval.ts`와 같은 꼴이다. T004가 통과해야 한다.
- [x] T006 [P] [US1] 1안 `etl/taxonomy/custom.json`을 쓴다(FR-002, research R8, data-model 1).
  - 묶음 11개와 분야 초안 90개: research R8의 1안 표(묶음 id·이름, 묶음마다 csr에 넣을 키, 쪼개는 기준, 분야 id 꼴)를 따른다. 검사 한도는 큰 분야 10~15개, 세부 분야 80~120개이고, CSRankings 27개 키가 모두 어떤 분야의 csr에 있어야 한다.
  - 직무 묶음(`g-job` 개발 직무): research R8 직무 표의 11개를 이름·id 그대로 쓴다.
  - 분야마다 학생이 알아듣는 설명 한 줄(`descFrom: "made"`), courseMap 12줄(research R8의 csr 규칙), `edition`은 쓴 날이다.
- [x] T007 [P] [US1] 3안 `etl/taxonomy/csrankings.json`을 쓴다(FR-004, data-model 1).
  - 연구 분야: `src/data/courses/csrankings.ts`의 27개 분야 하나에 분야 하나다. id는 키 그대로, name은 `CSR_AREAS`의 label 그대로, csr은 `[키]`이고, desc는 '(<원래 영어 이름>) …'로 시작한다(research R8).
  - 직무: research R8 표의 11개를 이름·id 그대로 쓴다(T006과 같다).
  - 묶음: `g-ai` AI, `g-systems` 시스템, `g-theory` 이론, `g-inter` 융합, `g-job` 개발 직무(research R8). courseMap 12줄(research R8의 csr 규칙). 출처: CC BY-NC-ND 4.0, 분야 이름·키만
- [x] T008 [P] [US1] `etl/taxonomy/ncs.test.ts`에 시험을 먼저 쓴다. 작은 XML 조각을 쓴다(research R7).
  - `readShared(xml)`: `<si><t>`와 서식 조각(`<si><r><t>`)을 이어 읽는다.
  - `readRows(xml, shared)`: 칸 주소로 A~H만 고른다. `t="s"`는 공유 문자열, `t="inlineStr"`는 `<is><t>`, 빈 칸은 빈 글자다.
  - `buildNcs(rows, edition)`: 머리줄이 R7과 다르면 던진다. id 규칙, 세분류 이름을 코드 순서로 `, `로 이음, 240자를 넘으면 그 안에 드는 마지막 이름까지(말줄임표 없음, 첫 이름이 240자를 넘으면 그 이름을 240자에서 자름), `descFrom: "source"`, `sourceCounts`, courseMap은 `NCS_COURSE_MAP`
- [x] T009 [US1] `etl/taxonomy/ncs.ts`를 만들고 돌린다(research R7). T008이 통과해야 한다.
  - 받기: 자료실 글에서 첨부가 `NCS정보망DB(대분류별,2026년2월).xlsx` 그대로인지 확인하고, 첨부를 `etl/.cache/ncs/`에 받는다. 주소와 본문은 R7이다. 1초 1건이고, 있으면 다시 받지 않는다.
  - 읽기: `unzip -p`로 `xl/sharedStrings.xml`을 한 번에 읽는다. 시트 이름 '01'~'24'는 workbook.xml과 rels로 시트 파일에 잇는다. 시트 XML은 한 줄이라 `</row>`로 끊어 흘려 읽는다.
  - 만들기: T008의 함수로 만들고 `edition: "2026-02"`, 출처 '한국산업인력공단 NCS(ncs.go.kr), 공공누리 제1유형(출처표시)'을 넣는다.
  - courseMap: 같은 파일의 고정 표 `NCS_COURSE_MAP`(교과 지도 12줄 → 소분류 코드)이 정한다. 정보통신 대분류(20)의 소분류 목록만 보고 이 작업에서 한 번 쓴다. 줄 이름과 소분류 이름이 같은 일을 가리킬 때만 넣는다(research R7). 대응이 없는 줄은 빈 배열이다.
  - 출력은 contracts/cli.md 꼴이다. 공식 DB를 받지 못하거나 모양이 다르면 이유를 내고 1로 끝난다. 대체 자료는 쓰지 않는다(research R7).
- [x] T010 [US1] `taxonomy.test.ts`에 저장소 목록 시험을 더한다. T006·T007·T009 뒤에 한다.
  - `etl/taxonomy/*.json` 세 파일이 `loadTaxonomy`, `checkTaxonomy`(위반 0), `findChosen`(던지지 않음)을 통과한다.
  - 파일이 없으면 실패한다. CI도 이 세 파일로 검사한다.
- [x] T011 [US1] 확인 실행
  - `node etl/taxonomy/ncs.ts`, `node etl/notices/compare.ts check`, `npx vitest run etl/taxonomy`를 돌린다.
  - 위반은 목록 파일을 고쳐 없앤다. 출력을 이 파일 아래 '실행 기록'에 남긴다.
- [ ] T012 [US1] 미리보기 `$T/report/preview.html`을 만든다(research R11, FR-007).
  - 저장소 밖에서 에이전트가 손으로 만든다. 세 목록 JSON을 페이지 안에 넣고, `?v=custom|ncs|csrankings`로 안을 고른다.
  - 화면: 묶음별 세부 분야 칩(이름 + 설명), 이름·설명 찾기, 고른 수, 3개 이상일 때만 켜지는 '다음'. 결과가 없으면 '맞는 분야가 없어요'
  - 고른 것은 저장하지 않는다. 브라우저로 열어 quickstart S2를 확인한다.

**Checkpoint**: 세 안의 목록과 미리보기가 있다. 이것만으로 교수님과 목록을 이야기할 수 있다.

---

## Phase 4: User Story 2 - 분야 판정, 임베딩 후보, 부하 제한 (Priority: P2)

**Goal**: 어느 안이든 넣으면 기회마다 후보 30개 안에서 핵심 0~2·관련 0~5 분야가 붙는다. 모든 실제 LLM·임베딩 요청은 부하 제한 안에서 돈다.

**Independent Test**: quickstart S3. 다섯 건 판정, 다시 돌리면 보관, 설명을 바꾸면 새 판정 판, 서버가 꺼졌으면 못 물음으로 끝까지 돈다.

### Tests for User Story 2

- [ ] T013 [P] [US2] `etl/notices/fields.test.ts`에 시험을 먼저 쓴다(contracts/field-llm.md).
  - 지시문: 후보만 나오고, 묶음 순서대로 `## 묶음 경로`와 `- LLM용 이름: 설명` 줄이다. 이름이 겹친 분야는 줄에도 '이름 (묶음 이름)'이 나와 enum과 같다.
  - 스키마: enum이 후보의 LLM용 이름이고, maxItems가 2와 5다.
  - 답 정리: 후보 밖 이름(목록 안이어도)·JSON 아님은 null, 중복은 하나로, 겹치면 핵심에만, 넘치면 앞에서부터
  - 판정 판: `fieldParts(t)`의 칸이 contracts/field-llm.md '판정 판'과 같다. 설명 한 글자, candidates의 k나 model 하나만 바꿔도 `versionOf`가 바뀐다(llm.test.ts의 PROMPT_PARTS 사례와 같은 꼴).
  - makeFieldAsk(가짜 post·가짜 embed)
    - 보관이 있으면 post도 embed도 부르지 않는다.
    - 보관 폴더가 `<모델>/<id>-<판정 판>/<번호>.json`이고, 파일에 `taxonomy`·`prompt`·`promptTokens` 칸이 있다.
    - 분야가 30개 이하면 embed를 부르지 않고 모두 후보다.
    - 공지 벡터가 'fail'이면 'fail', 'down'이면 'down'이고 post를 부르지 않는다.
    - 분야 벡터는 판정기 하나에 한 번만 갖추고, 성공과 'fail'만 기억한다.
  - `readFieldAnswer`: makeFieldAsk가 쓴 파일을 읽는다. 꼴 틀림·목록 밖 id·다른 판이면 null이다.
- [ ] T014 [P] [US2] `etl/notices/embed.test.ts`에 시험을 먼저 쓴다(research R17).
  - 요청: `/api/embed`에 `{ model, input, truncate: true, keep_alive }`를 보낸다. 분야 글은 32개씩 나눠 보낸다.
  - 실패 구분: 시간 초과·HTTP 오류·꼴 틀림(개수, 차원)은 'fail'. 연결 실패·404는 'down'이고 그 뒤로 부르지 않는다. gate.before()가 false면 'down'이고 잠그지 않는다. post 뒤에는 결과와 상관없이 gate.after(ms)다.
  - 글: 분야는 '묶음 경로 > 이름: 설명', 공지는 '제목\n본문 앞 1,500자'(본문이 없으면 제목만)
  - 보관: 분야는 `<모델>/<안 id>-<목록 sha>.json`(설명이 바뀌면 sha가 바뀐다), 공지는 `<모델>/notices/<번호>.json`(글 sha가 다르면 다시 받는다). 두 파일에 본문 글자가 없다.
  - 후보: 코사인 상위 30개, 같은 점수는 목록 순서, 30개 이하면 모두
  - `readFieldVectors`·`readNoticeVector`: 요청 없이 읽고, 없거나 꼴이 틀리면 null이다.
- [ ] T015 [P] [US2] `etl/notices/throttle.test.ts`에 시험을 먼저 쓴다. 가짜 시계·잠·센서를 넣는다(research R6).
  - 쉼: `after(ms)`가 ms/4를 쉰다. 실패한 요청 뒤에도 같다.
  - 온도 대기: 온도 + 가장 큰 오름폭이 80 이상이면 5초마다 다시 읽고, 내려가면 true다. 오름폭은 0에서 시작하고 max(지금 값, after 온도 − before 온도)로만 갱신된다(온도가 내려간 요청 뒤에도 줄지 않는다).
  - 문 둘(`gate()` 두 번): 가장 큰 오름폭과 온도 못 읽음은 함께 쓰고, noTemp는 따로 센다.
  - 온도를 한 번 못 읽으면 그 뒤 `before()`가 늘 false다. 센서는 다시 부르지 않고, 그 문의 noTemp가 부를 때마다 하나씩 는다.
  - 기록: 첫 실제 요청(before()가 true) 전에는 시작하지 않는다. 가짜 `every`로 5초 표본을 손으로 돌리면 1분마다 한 줄(평균 GPU, 최고 온도, 최고 GPU 온도)로 모이고, 못 읽은 표본은 뺀다. stop() 때 1분이 안 찬 마지막 묶음도 한 줄로 남는다.
  - `stop()`: requests·requestMs(after로 받은 개수·합), gpuAvg, tempMax(before·after 읽기와 표본 모두의 최고), logFile, line을 돌려준다. 두 번 불러도 같은 값이다. 요청이 0이면 gpuAvg·tempMax·logFile은 null이고 line은 빈 글자다. GPU를 못 읽었으면 `GPU 평균 -`, 리눅스면 `CPU 최고`다.
- [ ] T016 [P] [US2] `etl/notices/sensors.test.ts`에 시험을 먼저 쓴다. 고정 문자열과 임시 폴더를 쓴다(research R18).
  - darwin: `parseThermal`은 `PMU tdie*` 줄의 최댓값이고 다른 센서는 무시한다. `parseIoreg`는 `"Device Utilization %"=n`을 읽는다.
  - linux: `parseZones`는 `x86_pkg_temp`만 보고 밀리도를 도로 바꾸며 여럿이면 최댓값이다. `parseSensors`는 `sensors -j` 꼴에서 coretemp `Package id`를 읽는다. `parseNvidiaSmi`는 `45, 62` 줄을 읽고 여럿이면 최댓값, `N/A`·빈 글자는 null이다.
  - `readTemp('linux', { sys, run })`: 임시 폴더의 thermal_zone 둘(하나만 x86_pkg_temp)이면 그 값, 없으면 가짜 `sensors -j` 출력, 둘 다 없으면 null이다. `readGpu('linux', { run })`: nvidia-smi 출력이면 `{ util, temp }`, 실패면 null이다. 그 밖의 platform은 null이다.
  - `readTemp('darwin', { run, bin, src })`: bin이 src보다 새로우면 clang을 부르지 않고 bin 출력을 읽는다. bin이 없거나 src보다 오래됐으면 clang을 부른 뒤 읽는다. clang이 null이면 null이다. `readGpu('darwin', { run })`: ioreg 출력이면 `{ util, temp: null }`, 실패면 null이다(research R18).
- [ ] T017 [P] [US2] `etl/notices/llm.test.ts`에 사례를 더한다. 기존 사례는 그대로 둔다(research R2).
  - `makeChat`을 직접 불러, 다른 request·isValid·`sub`·`meta`를 넣어도 같은 보관·down 규칙이 지켜진다.
  - request가 'fail'이나 'down'이면 post 없이 그 결과이고 down을 잠그지 않는다.
  - `gate.before()`가 false면 요청 없이 'down'이고 잠그지 않는다. 다음 글에서 before()를 다시 부르고, true면 보낸다.
  - 보관 답에는 gate를 부르지 않는다. post 뒤에는 답·실패·down 모두 `gate.after(ms)`가 불린다.
  - 잘림 막기: `prompt_eval_count`가 num_ctx의 95% 이상이면 'fail'이고 보관하지 않는다. 값이 없으면 검사하지 않는다.
  - 보관 파일에 `promptTokens`가 있다(없으면 null). `readKept`·`modelDir`를 내보낸다.

### Implementation for User Story 2

- [ ] T018 [US2] `etl/notices/llm.ts`에서 `makeAsk` 몸통을 `makeChat<T>`로 뺀다(research R2).
  - 넣는 것: model, host, dir, sub, meta, post, options, isValid, request, gate
  - `makeAsk`는 `sub = PROMPT_VERSION`, `meta = { prompt: PROMPT_VERSION }`, 기존 지시문·스키마를 넣는 몇 줄이 된다. 인자에 `gate?`를 더한다.
  - 기존 `llm.test.ts`·`run.test.ts`·`eval.test.ts`가 고치지 않고 통과하고(SC-008), T017도 통과해야 한다.
- [ ] T019 [US2] `etl/notices/embed.ts`를 만든다(research R17). T014가 통과해야 한다.
  - 상수: `EMBED_MODEL = 'bge-m3'`, `EMBED_K = 30`, `NOTICE_CHARS = 1500`, `EMBED_CACHE_DIR = etl/.cache/embed`, `CANDIDATE_RULE`
  - `makeEmbed({ model?, host?, post?, gate? })` → `((texts) => Promise<number[][] | 'fail' | 'down'>) & { model }`
  - `fieldText(t, f)`, `noticeText(row, lines)`, `fieldVectors(t, embed, dir?)`, `noticeVector(row, lines, embed, dir?)`, `readFieldVectors(t, model, dir?)`, `readNoticeVector(model, no, dir?)`, `topCandidates(fv, vector, k = EMBED_K)`
- [ ] T020 [US2] `etl/notices/fields.ts`를 만든다. T018·T019 뒤에 하고 T013이 통과해야 한다.
  - 상수: `FIELD_OPTIONS = { temperature: 0, num_ctx: 32768 }`, `FIELD_CACHE_DIR = etl/.cache/llm-fields`
  - 함수: `systemFor(t, ids)`, `schemaFor(t, ids)`, `fieldParts(t)`(재료는 contracts/field-llm.md '판정 판'), `fieldVersion(t) = versionOf(fieldParts(t))`, `parseFieldAnswer(text, t, ids)`, `isFieldAnswer(t)`, `readFieldAnswer(t, model, no, dir?)`
  - `makeFieldAsk({ taxonomy, embed, model?, host?, dir?, embedDir?, post?, gate? })`: makeChat을 쓰고 `.model`·`.version`·`.taxonomyId`를 가진다. 본문은 llm.ts의 `userMessage`를 그대로 쓴다.
  - 지시문은 contracts/field-llm.md의 8가지다. 예시 글 규칙을 지킨다.
- [ ] T021 [P] [US2] `etl/notices/thermal.c`를 research 부록 A의 코드 그대로 쓴다.
- [ ] T022 [US2] `etl/notices/sensors.ts`를 만든다(research R18). T016이 통과해야 한다.
  - 해석 함수 다섯과 `readTemp(platform = process.platform, o?)`, `readGpu(platform = process.platform, o?)`. o는 `{ run, sys, bin, src }`이고 시험에서만 바꾼다. 꼴과 기본값은 research R18이다.
  - darwin: `etl/.cache/bin/thermal`이 없거나 `thermal.c`보다 오래됐으면 `clang -O2 -framework IOKit -framework CoreFoundation`으로 빌드한다. 실패하면 null이다.
- [ ] T023 [US2] `etl/notices/throttle.ts`를 만든다(research R6). T015가 통과해야 한다.
  - `createThrottle(deps?)` → `{ gate(), stop() }`. 문은 `{ before, after, noTemp }`, stop은 `LoadSummary`를 돌려준다.
  - deps(`now`·`sleep`·`every`·`readTemp`·`readGpu`·`logDir`·`platform`, 꼴은 research R6)는 시험에서만 바꾼다. 기본 `every`는 setInterval에 `unref()`, 1분 기록은 `etl/.cache/load/<시작 시각>.jsonl`이다.
- [ ] T024 [P] [US2] `run.test.ts`·`eval.test.ts`에 사례를 먼저 더한다. 기존 사례는 그대로 둔다.
  - run: `x.gate`에 noTemp 2, 가짜 ask가 'down' 3건이면 연결 줄의 K가 1이고 온도 줄 N이 2다. `x.load`의 line은 끝에 붙고, 빈 글자면 줄이 없다. 줄 순서는 contracts/cli.md이고 `console.log`는 한 번이다.
  - eval: `x.load`의 부하 줄이 표준 오류에 나온다. 온도 때문에 못 물은 글이 있으면 `온도를 읽지 못한 글이 N건이라 비교하지 않았어요`를 내고 1이다.
- [ ] T025 [US2] `run.ts`·`eval.ts`를 고친다(contracts/cli.md). T024가 통과해야 한다.
  - main에 선택 인자 x를 더한다. run은 `{ gate?, field?, load? }`(field는 T045에서 채운다), eval은 `{ gate?, load? }`다.
  - `formatSummary(s, llm, x?)`에 셋째 인자를 더해 새 줄을 붙인다. 기존 두 인자 호출은 그대로다.
  - 진입 줄에서만 `createThrottle()` 하나와 문 하나를 만들어 `makeAsk({ gate })`와 x에 넘긴다. main이 어떻게 끝나든 `finally`에서 `t.stop()`을 부른다.
- [ ] T026 [US2] `compare.test.ts`에 `judge` 시험을 더한다.
  - 가짜 정답셋(기회 3건, 기회 아님 1건), 가짜 본문(하나는 없음), 가짜 fieldAsk·gate·load를 쓴다.
  - 요약 숫자(보관·새로·실패·못 물음·분야 없음)를 본다. 보관본이 없는 글은 못 물음이고, 그 글에는 판정기(fieldAsk가 만든 함수)를 부르지 않는다.
  - `--limit` 동작, 판정 판 폴더의 `runs.jsonl` 한 줄(data-model 3, limit은 값 또는 null)
  - '글당 n초'는 requestMs / (새로 + 실패)이고, 둘 다 0이면 '글당 -'다. 온도 줄(noTemp가 있을 때)과 부하 줄(line이 있을 때)이 붙는다.
  - 모두 못 물음이어도 0이다. 목록 검사 실패·없는 안은 1, 쓰는 법 틀림은 2다.
- [ ] T027 [US2] `compare.ts`에 `judge <id> [--limit N]`을 더한다(contracts/cli.md). T026이 통과해야 한다.
  - 정답셋: `eval.ts`의 `readCsv`·`decodeCsv`·`parseGold`로 `etl/gold/dev-501.csv`의 기회만 고른다.
  - 본문: 보관본만 읽는다. `cse.ts`의 `bodyOf`에 늘 거절하는 get을 넣어 부르고, 학교 서버에는 묻지 않는다(FR-027).
  - 판정: `deps.fieldAsk(t)`를 차례로 부른다. 끝나면 `deps.load()`로 부하 값을 받아 `runs.jsonl`에 쓰고 요약을 낸다.
  - 진입 줄: throttle 하나, 문 하나, 그 문으로 `makeEmbed`와 `makeFieldAsk`를 만든다. `finally`에서 `t.stop()`이다.
- [ ] T028 [US2] quickstart S3을 이 맥에서 돌린다. 출력을 '실행 기록'에 남긴다.
  - `judge custom --limit 5`를 두 번 돌린다(두 번째는 `새로 0 · … · 글당 -`). 벡터 파일에 본문 글자가 없는지 본다.
  - 설명 한 글자를 바꿔 돌리면 `새로 5`다. 바꾼 것은 되돌린다.
  - `OLLAMA_HOST=127.0.0.1:1 … judge custom --limit 10`이면 `보관 5 · 새로 0 · 실패 0 · 못 물음 5`이고 0으로 끝난다.
  - `judge ncs --limit 1`을 돌리고 보관 파일의 `promptTokens`를 남긴다. num_ctx의 70%를 넘으면 `FIELD_OPTIONS.num_ctx`를 65536으로 올리고 research R5에 적는다.

**Checkpoint**: 분야 판정, 임베딩 후보, 부하 제한이 실제로 돈다. 기존 판정 시험은 모두 그대로 통과한다.

---

## Phase 5: User Story 3 - 정답셋·지표·비교 보고서 (Priority: P3)

**Goal**: 세 안을 같은 412건, 같은 표본 120건, 같은 모델로 재고, 보고서에서 나란히 본다.

**Independent Test**: quickstart S4·S5. 세 정답 파일이 완성되고(갈림 `O` 없음), `fields-compare.json`에 세 안의 지표가 있으며, 보고서로 고를 수 있다.

### Tests for User Story 3

- [ ] T029 [US3] `etl/notices/gold.test.ts`에 `sample` 시험을 쓴다. compare.ts의 main으로 부른다.
  - 실제 종류 수(채용 182, 특강 88, 교육·캠프 53, 교과 25, 대회·공모전 24, 장학 14, 해커톤 13, 멘토링 6, 글로벌 3, 동아리·학회 3, 봉사 1)의 가짜 정답셋으로 배분이 research R9 숫자와 같다(합 120).
  - 같은 입력이면 같은 출력이다. 칸·줄 순서·종류 이름이 data-model 4와 같다.
- [ ] T030 [US3] `gold.test.ts`에 `label-input`·`gold` 시험을, `compare.test.ts`에 `score` 거절 시험을 쓴다. label-input·gold는 T029와 같은 파일이라 이어서 한다.
  - score 거절(1, 무엇이 없는지 출력): 정답 파일 없음이나 갈림 `O` 남음, 전체 실행 기록 없음, 분야 벡터 파일 없음. 분야가 30개 이하인 안(시험용 ncs 목록, 분야 3개)은 벡터 없이 통과한다.
  - label-input: 저장소 안 폴더는 아무것도 쓰지 않고 1이다. 본문이 없는 표본 글이 있으면 1이다. 40건씩 3묶음이고, body는 `clip` 결과다.
  - gold: A.json의 폴더가 저장소 안이면 읽기 전에 1이다.
  - gold의 A·B 출력 검사(research R9): 표본 글 빠짐, 표본 밖 글, 같은 글 두 번, 칸 안 id 중복, 목록 밖 id, 핵심 3개, 관련 6개, 겹침. 위반마다 글 번호와 이유를 내고 1이며 CSV를 쓰지 않는다.
  - C 없이 돌린 gold: CSV를 쓰고, 갈린 글은 갈림 `O`·최종 빈칸, 같은 글은 `X`·최종 = A다. split 줄 꼴은 data-model 5이고, '분야 없음'은 `-`다. split에 넣을 본문이 없으면 1이다.
  - C가 있는 gold: C에 빠진 글이나 남는 글이 있으면 1이다. C가 '분야 없음'으로 정한 글은 최종 `-`·갈림 `C`이고 완성으로 친다.
- [ ] T031 [P] [US3] `etl/notices/score.test.ts`에 지표 시험을 쓴다. 작은 고정 표본으로 research R10을 손으로 계산한 값과 비교한다.
  - `ratio`·`passes`·`pct`: 84/100은 미달, 85/100은 통과, 147/173은 `84.9% (147/173)`(내림), 분모 0은 `해당 없음`
  - `scoreTaxonomy`: 맞은 비율 넷(micro), 후보 적중률 둘(candidates에 없는 글은 적중 0), 라벨러 일치도(둘 다 빈 핵심은 두 비율 모두 '맞음'), 빈칸 둘, 상위 3 비율, unused·unusedIds, 실패율(보관 없는 글은 실패, 표본에서는 빈 답), courseMapRows(개수)
  - 보고서 목록: top 10(같은 수는 id 순), misses·splits(글 번호 순, 10건 제한)
  - `pickRun`: limit null인 줄 가운데 cached가 가장 작은 줄, 같으면 마지막 줄. `--limit` 줄만 있거나 줄이 없으면 null
  - 시간: secPerAsk(새로 + 실패가 0이면 null), wallMinutes

### Implementation for User Story 3

- [ ] T032 [US3] 라벨 기준 한 장 `specs/20261116-212003-field-taxonomy-compare/label-guide.md`를 쓴다. 세 안이 함께 쓴다.
  - 분야는 '무엇에 관한 것인가'이고, 종류(채용·특강 등)는 분야가 아니다.
  - 핵심: 확신하는 것만 0~2개, 가까운 순. 관련: 조금이라도 관련 있으면 0~5개, 핵심과 겹치지 않음
  - 회사 이름만으로 고르지 않고 하는 일·배우는 것으로 고른다. 맞는 분야가 없으면 비운다(빈 배열).
  - 본문이 없으면 제목과 게시판만 본다. 그 안의 전체 목록에서 고른다(후보는 없다).
  - LLM 답과 다른 라벨러 답은 보지 않는다. 출력 꼴은 data-model 5이고 분야는 id다.
  - 메모(note)에는 본문 문장을 옮기지 않고 판단 이유만 한 줄로 쓴다(FR-024).
  - 예시 2~3개: 예시 글 규칙을 지킨다.
- [ ] T033 [US3] `etl/notices/gold.ts`에 `sample`, `label-input`, `gold`를 만들고 compare.ts 하위 명령 표에 잇는다(contracts/cli.md, data-model 4·5, plan G3).
  - 저장소 안 폴더 검사(심볼릭 링크를 푼 경로가 `repoRoot` 아래)는 함수 하나로 두 명령이 함께 쓴다.
  - T029와 T030의 label-input·gold 사례가 통과해야 한다(score 거절 사례는 T034).
- [ ] T034 [US3] `etl/notices/score.ts`와 `compare.ts score`를 만든다(research R10·R16, data-model 6). T031이 통과해야 한다.
  - score.ts의 꼴
    - `ratio(num, den)` → `{ num, den }`, `passes(r, pct = 85)`, `pct(r)`(표시 글자)
    - `pickRun(lines)` → 고른 줄 또는 null
    - `scoreTaxonomy(input)` → data-model 6 `taxonomies`의 한 칸
    - input = `{ t, nos, answers: Map<번호, FieldAnswer>, gold, candidates: Map<번호, string[]>, docs: Map<번호, { link, title }>, run }`
  - compare.ts score(T030의 거절 시험도 통과해야 한다)
    - 세 안마다 보관 답(`readFieldAnswer`), 벡터(`readFieldVectors`·`readNoticeVector` → `topCandidates`, 분야 30개 이하면 모두), 실행 기록, 정답을 읽어 넣는다.
    - `etl/out/fields-compare.json`을 쓰고 지표 표를 낸다. `listChars`는 `listChars(t)`다.
    - 거절(1): 정답 없음·갈림 `O` 남음, 전체 실행 기록 없음, 분야 벡터 파일 없음(분야 30개 이하 안은 보지 않는다)
- [ ] T035 [US3] `node etl/notices/compare.ts sample`로 `etl/gold/fields/sample.csv`를 만든다. 종류별 배분을 '실행 기록'에 남긴다.
- [ ] T036 [US3] 세 안 412건 판정을 `custom` → `ncs` → `csrankings` 순으로 돌린다. 안을 섞지 않는다(R5).
  1. 안마다 전체 실행(`--limit` 없이)을 한 번 돌린다. 첫 안이 끝나면 실제 글당 시간으로 남은 시간을 다시 잰다. 세 안 합이 3시간을 넘을 것 같으면 보고서에 적고 계속한다(SC-006, R13).
  2. 실패와 못 물음이 남으면 그 안만 한 번 더 돌려 채운다. 이 실행은 cached가 커서 시간 계산에 쓰이지 않는다(R16).
  3. 그 뒤 한 번 더 돌려 `새로 0`인지 본다(SC-007). 끝까지 실패하는 글은 다시 묻고 실패로 남는다.
  4. 안마다 요약, 부하 줄, `runs.jsonl` 줄을 '실행 기록'에 남긴다(SC-001, SC-005).
- [ ] T037 [US3] 안마다 `node etl/notices/compare.ts label-input <id> "$T"`를 돌린다.
- [ ] T038 [US3] 라벨러 A·B를 띄운다. 안마다 둘, 모두 6개다.
  - Claude 하위 에이전트(general-purpose)로 백그라운드에서 돌린다.
  - 주는 것: `label-guide.md`, 그 안의 목록 파일, `$T/<id>-1~3.jsonl`
  - 막는 것: LLM 보관 답(`etl/.cache/llm-fields`)·벡터와 다른 라벨러 출력은 읽지 않게 한다. 저장소 파일은 고치지 않게 한다.
  - 출력: `$T/<id>-A.json`, `-B.json`. 오면 `gold <id> A B`로 검사하고, 위반이 있으면 그 라벨러에게 고쳐 달라고 다시 보낸다.
- [ ] T039 [US3] 안마다 셋째 라벨러 C를 띄운다.
  - 주는 것: `$T/<id>-split.jsonl`(data-model 5 꼴), 같은 기준과 목록. LLM 답은 주지 않는다.
  - 출력: `$T/<id>-C.json`. `gold <id> A B C`로 `etl/gold/fields/<id>.csv`를 완성한다(SC-002).
- [ ] T040 [US3] `node etl/notices/compare.ts score`로 `etl/out/fields-compare.json`을 만든다. 지표 표를 '실행 기록'에 남긴다.
- [ ] T041 [US3] 비교 보고서를 만든다.
  - 에이전트가 손으로 `$T/report/index.html`과 T012의 `preview.html`을 만든다. artifact-design 스킬을 먼저 불러 따른다.
  - 담을 것
    - fields-compare.json의 세 안 지표 표. 후보 적중률은 후보 비율(30 / 분야 수)과 함께 보인다.
    - 분야 분포 그림(top, unusedIds), LLM과 정답이 갈린 예, 라벨러가 갈린 예(제목·링크만), 안마다 미리보기 링크
    - 측정 조건: 모델, 임베딩 모델·K, 412/120, 부하 제한, num_ctx, NCS 기준 월
    - '실사용에서 달라지는 것': 분류기 요약 줄, 결과 파일 칸, 부하 제한으로 늘어난 시간, 결과 파일을 읽는 쪽이 잃는 것(없음). 2-1 게이트 대신 여기에 남긴다.
    - 전체 시스템 도식도(`system.html`) 링크, 이 작업에서 추천대로 정한 것
  - 공지 본문 문장은 넣지 않는다.
  - 비공개 아티팩트로 올리고 링크를 사용자에게 준다. 교수님께는 Share로 공유해야 한다고 알린다(SC-003은 사용자가 고를 때 끝난다).

**Checkpoint**: 사용자와 교수님이 보고서로 안을 고를 수 있다.

---

## Phase 6: User Story 4 - 고른 안을 결과 파일에 넣기 (Priority: P4)

**Goal**: 고른 안이 85% 이상이고 판정 판·모델이 같으면 결과 파일 기회마다 분야 칸이 생긴다.

**Independent Test**: quickstart S6. choose가 기록하고, 조건이 맞을 때만 결과 파일에 분야 칸이 생기며, 기존 칸과 시험이 그대로다.

### Tests for User Story 4

- [ ] T042 [US4] `compare.test.ts`에 `choose` 시험을 쓴다.
  - 정밀도가 81/100이어도 그 안에만 `chosen: { date, corePrecision: { num, den }, prompt, model }`을 쓰고 '미달'을 출력한다. 88/100이면 '통과'를 출력한다.
  - 다른 안의 chosen은 지운다.
  - 거절(1, 파일 그대로): fields-compare.json이 없음, 그 안이 없음, 판정 판이나 모델이 지금과 다름, 정밀도 분모 0
- [ ] T043 [P] [US4] `etl/notices/run.test.ts`에 사례를 더한다.
  - x.field가 없으면 결과 파일과 요약이 지금과 똑같다.
  - x.field = `{ ask, gate }`(가짜 field ask)
    - 머리에 `taxonomy { id: ask.taxonomyId, prompt: ask.version }`가 붙는다.
    - 답을 받은 기회에 `fields`·`fieldRule`이 붙고, 실패·못 물음인 기회에는 `fields`가 없다.
    - 요약에 분야 판정 줄이 붙고, 온도 줄의 N에 분야 문의 noTemp가 더해진다.
  - x.field = `{ reason }`: field ask가 없고 결과 파일은 그대로이며, 요약에 이유 줄이 붙는다.
  - 기회 아님 글에는 분야를 묻지 않는다(US2 시나리오 2).
  - 기존 스키마 사례(305행)를 넓힌다: 스키마에 `taxonomy`·`fields`·`fieldRule`이 선택 칸으로 있고 꼴이 research R12다.

### Implementation for User Story 4

- [ ] T044 [US4] `compare.ts`에 `choose <id>`를 더한다(research R12). T042가 통과해야 한다.
- [ ] T045 [US4] 결과 파일에 분야를 넣는다. T043이 통과해야 한다.
  - `etl/notices/run.ts`
    - x.field가 `{ ask }`면 `buildResult`가 남긴 기회마다 판정해 data-model 7의 칸을 더하고 요약 줄을 붙인다.
    - `ResultFile`·`Opportunity` 타입에 선택 칸(`taxonomy?`, `fields?`, `fieldRule?`)을 더한다.
  - 진입 줄
    - `findChosen(TAXONOMY_IDS.map(id => loadTaxonomy(id)))`가 던지면 그 문구를 내고 1로 끝난다.
    - 고른 안이 있으면 같은 throttle의 새 문으로 `makeEmbed`·`makeFieldAsk`를 만든다. `fieldGate(chosen, ask.version, ask.model)`가 통과면 `field: { ask, gate }`, 아니면 `field: { reason }`이다.
  - 스키마: `specs/20261107-193624-cse-notice-opportunities/contracts/cse-notices.schema.json`에 선택 칸 셋을 더한다(research R12).

**Checkpoint**: 코드는 다 들어갔다. 실제 고르기는 사용자가 정한 뒤 T051에서 한다.

---

## Phase 7: Polish & 마무리

- [ ] T046 [P] `docs/product/decisions.md`에 2026-11-16 결정 한 덩이를 적는다.
  - 예시 자료 삭제와 처음부터 다시 만들기, 순서 1~8
  - 분야 목록 3안 비교, 분야 두 단계(핵심·관련), 판정 두 단계(임베딩 후보 30개 → LLM, bge-m3)
  - 부하 제한을 분류기 안에 고정, 운영 서버(학교 데스크톱)에서는 CPU 패키지 온도와 nvidia-smi
  - 고르기와 85% 기준 분리
- [ ] T047 검사를 돌린다.
  - `npm run check`와 `npm run build`가 통과해야 한다.
  - 화면 변화는 없지만 CI가 도는 `npm run audit:layout`·`npm run audit:copy`도 한 번 돌린다.
- [ ] T048 리뷰를 돌린다.
  - `ponytail-review`로 diff의 과설계를 점검하고 고친다. 이어서 `/code-review`(high)로 정확성·보안을 점검하고 고친다.
  - 볼 것
    - 본문이 저장소 파일·보관 답·벡터 보관·보고서에 들어가지 않는지
    - label-input과 gold의 저장소 안 폴더 거절, 학교 서버 간격
    - 지시문·라벨 기준·목록 설명의 예시 제목이 `etl/gold/dev-501.csv`에 없는지
  - 고치지 않는 것은 이유를 적는다.
- [ ] T049 tasks.md를 완료 표시로 고치고 커밋한다. 커밋은 `영역: 무엇을 왜` 한 줄이고, 한 커밋에 한 가지 이유다.
- [ ] T050 PR을 올리고 머지한다(CLAUDE.local.md).
  - `tape`에 push하고 PR을 연다.
  - CI(check·build·audit:layout·audit:copy)와 Claude 리뷰를 확인하고, 고치거나 이유를 답한다.
  - 통과하면 `gh pr merge --merge --delete-branch`로 머지하고, 로컬 브랜치를 지우고 `main`을 당긴다.
- [ ] T051 (사용자가 안을 고른 뒤) 새 브랜치에서 작은 PR을 올려 머지까지 한다.
  - `node etl/notices/compare.ts choose <id>`를 돌린다. 기록은 늘 되고, 출력에 85% 통과·미달이 나온다.
  - 통과면 `node etl/notices/run.ts`로 `etl/out/cse-notices.json`을 갱신한다.
  - 미달이면 결과 파일은 그대로 두고, 무엇을 고칠지(목록·지시문) 사용자와 정해 새 작업(새 스펙)으로 한다(spec FR-021).
  - `docs/product/decisions.md`에 고른 안·날짜·정밀도를 한 줄 적는다.

---

## Dependencies & Execution Order

- **Setup(T001)** → **Foundational(T002–T003)** → 이야기들
- **US1(T004–T012)**: Foundational 뒤에 한다. T006·T007·T008은 서로 기대지 않는다(직무는 research R8에 고정). T009는 T008 뒤, T010은 T006·T007·T009 뒤다.
- **US2(T013–T028)**: Foundational 뒤에 시작할 수 있다.
  - 순서: T018(makeChat)·T019(embed) → T020(fields), T021 → T022(sensors) → T023(throttle) → T025 → T027
  - 실제 판정(T028)에는 US1 목록 custom·ncs가 있어야 한다.
- **US3(T029–T041)**
  - T036은 US1 세 목록, US2 판정, T028의 num_ctx 확인 뒤에 한다.
  - T038은 T032·T035·T037 뒤, T039는 T038 뒤에 한다.
  - T040은 T034·T036·T039 뒤, T041은 T040·T012 뒤에 한다.
- **US4(T042–T045)**: US2(T018·T020·T023·T025) 뒤에 한다. 지표 파일 모양(T034)이 있어야 T044를 시험할 수 있다.
- **Polish(T046–T050)**: 모든 이야기 뒤에 한다. T051은 사용자가 고른 뒤 따로 한다.

### Parallel Opportunities

- T004 ∥ T006 ∥ T007 ∥ T008: check 시험, 두 목록 파일, NCS 시험이다. T004는 T002가 만든 `fixtures.ts`를 쓴다.
- T013 ∥ T014 ∥ T015 ∥ T016 ∥ T017 ∥ T021 ∥ T024: US2 시험과 C 파일이다.
- T031 ∥ T029·T030(gold.test.ts), T042 ∥ T043: 시험 파일이 다르다.
- T038: 라벨러 6명이 함께 돈다. 서로의 출력을 보지 않는다.
- T036(LLM 판정, 2~3시간)이 도는 동안 T032·T037·T038을 함께 할 수 있다. 라벨러는 LLM 답을 보지 않는다.

## Implementation Strategy

1. **MVP(US1)**: 세 목록과 미리보기. 이것만으로 교수님과 목록의 크기·이름·묶음을 이야기할 수 있다.
2. **US2**: 판정 단계, 임베딩 후보, 부하 제한. 기존 판정의 실제 요청에도 부하 제한이 걸린다.
3. **US3**: 판정 실행과 라벨링을 함께 돌린 뒤 지표·보고서를 만들고, 사용자·교수님이 고른다.
4. **US4**: 코드는 같은 PR에 넣는다. 고르기와 결과 파일 갱신은 사용자 결정 뒤 작은 PR(T051)로 한다.

## 실행 기록

(T011, T028, T035, T036, T040의 출력을 여기에 적는다)

### T011 (2026-11-17, 이 맥)

NCS 원본은 2026-11-16에 R7 주소에서 받은 파일을 `etl/.cache/ncs/`로 옮겨 다시 받지 않았다. 시트 01~24와 머리줄 A~T가 R7과 같았다. 시트 20(정보통신)은 245,455줄을 모두 읽었다(dimension과 같음).

```text
$ node etl/taxonomy/ncs.ts
대분류 24 · 중분류 81 · 소분류 274 · 세분류 1109 (기준 2026-02)
$ node etl/notices/compare.ts check
custom: 묶음 11 · 분야 90 · 교과 지도 12/12 · 목록 4,414자
ncs: 묶음 105 · 분야 274 · 교과 지도 2/12 · 목록 11,440자
csrankings: 묶음 5 · 분야 38 · 교과 지도 12/12 · 목록 2,411자
$ npx vitest run etl/taxonomy
 Test Files  2 passed (2)
      Tests  50 passed (50)
```

- 받은 표는 소분류 274·세분류 1,109개다(공식 소개는 270·1,096개). 받은 표를 따른다(research R7).
- NCS 교과 지도 대응(`NCS_COURSE_MAP`): 인공지능 → 인공지능(200107), 보안 → 정보보호(200106)만 넣었다. 개인정보보호는 보안의 일부라, 유선·무선통신구축은 설비 공사 직무라 네트워크 줄과 애매해 넣지 않았다.
