# Tasks: 분야 판정 다듬기(1단계 후속)

**Input**: Design documents from `specs/20261118-121436-field-refine/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rules.md, contracts/cli.md, quickstart.md

**Tests**: 시험을 먼저 쓴다(사용자 요청). 고치는 파일 옆 `*.test.ts`에 실패하는 시험을 더한 뒤 구현한다.

**Organization**: 이야기(US1~US4)별로 묶는다. 실행 작업(판정, 라벨러, 지표)도 작업으로 적는다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일이고 앞 작업을 기다리지 않아 함께 할 수 있다
- **[Story]**: 그 작업이 속한 이야기(US1~US4)
- 경로는 저장소 뿌리 기준이다. `<밖>`은 저장소 밖 작업 폴더(세션 임시 폴더의 `labels-r2/`)다.

## Phase 1: Setup

**Purpose**: 기준선과 로컬 자료 확인

- [X] T001 브랜치 `feat/field-refine`(tape/main 기준)에서 `npm run check`가 통과하는지 확인한다(고치기 전 기준선)
- [X] T002 `.gitignore`의 `etl/out/fields-compare.json`을 `etl/out/fields-compare*.json`으로 넓히고, `etl/out/fields-compare.json`을 `etl/out/fields-compare-1-20261117.json`으로 복사해 둔다(research R7. 복사본이 `git status`에 나오지 않는지 본다)
- [X] T003 Ollama를 켜고 `ollama list`에 `gemma4:12b`와 `bge-m3`가 있는지 확인한다

---

## Phase 2: Foundational

**Purpose**: 모든 이야기가 기대는 선행 작업은 없다. 회차 인자는 US3에서 만든다.

**Checkpoint**: Phase 1이 끝나면 US1을 시작한다.

---

## Phase 3: User Story 1 - 규칙 셋과 'AI 일반' (Priority: P1) 🎯 MVP

**Goal**: 라벨 기준과 지시문이 같은 규칙 셋을 갖고, 1안에 'AI 일반'이 생긴다.

**Independent Test**: `node etl/notices/compare.ts check`에 `custom: 묶음 11 · 분야 91 · 교과 지도 12/12`가 나오고, 라벨 기준과 지시문에 네 줄(고쳐 쓴 '기술 분야' 줄과 규칙 셋: 직무와 산업, 고루 다루는 공지, 넓은·좁은 분야)이 같은 뜻으로 있다.

### Tests for User Story 1

- [X] T004 [P] [US1] `etl/taxonomy/taxonomy.test.ts`의 '저장소 목록 파일'에 시험을 더한다: 1안의 `g-ai` 묶음의 첫 분야가 `ai-general`(이름 'AI 일반', csr `['ai']`)이다. 지금은 실패한다(분야 수 91과 `edition`은 다음에 목록을 고치면 깨지기만 해 시험에 못 박지 않고 T010의 check 출력으로 본다)
- [X] T005 [P] [US1] `etl/notices/fields.test.ts`에 시험을 더한다: `fieldParts(t).system`에 contracts/rules.md 2절의 네 줄이 글자 그대로 있고, 옛 줄 '회사 이름만으로 고르지 않고, 하는 일과 배우는 것으로 고른다.'가 없다. 지금은 실패한다

### Implementation for User Story 1

- [X] T006 [US1] `etl/taxonomy/custom.json`을 data-model 1대로 고친다: `ai-general`을 `ml` 앞에 더하고, `courseMap.ai` 맨 앞에 `ai-general`을 넣고, `edition`을 `2026-11-19`로 바꾼다. 파일의 들여쓰기·줄 꼴은 `saveTaxonomy`가 쓰는 꼴 그대로 둔다
- [X] T007 [US1] `etl/notices/fields.ts`의 `FIELD_SYSTEM`에서 '회사 이름만으로…' 한 줄을 contracts/rules.md 2절의 네 줄로 바꾼다. 주석의 '라벨 기준과 같은 뜻' 줄에 이 스펙의 rules.md를 가리킨다
- [X] T008 [P] [US1] `specs/20261116-212003-field-taxonomy-compare/label-guide.md`를 contracts/rules.md 1절대로 고친다(맨 위 고침 줄, 고르는 법 네 줄, 예시 4~7)
- [X] T009 [P] [US1] `specs/20261116-212003-field-taxonomy-compare/contracts/field-llm.md`를 고친다: 맨 위에 고침 줄, 지시문 뼈대 6번을 rules.md 2절의 네 줄 뜻으로, '판정 판'의 candidates 줄을 rules.md 4절 값으로, '답 정리' 뒤에 '핵심 굳히기' 절(rules.md 3절을 가리키는 세 줄)
- [X] T010 [US1] `npx vitest run etl/taxonomy etl/notices/fields.test.ts`가 통과하고 `node etl/notices/compare.ts check`가 `custom: 묶음 11 · 분야 91 · 교과 지도 12/12 · …`를 내는지 확인한다

**Checkpoint**: 목록과 규칙 글이 바뀌었다. 판정 판은 US2까지 끝나야 정해진다.

---

## Phase 4: User Story 2 - 핵심 굳히기 (Priority: P2)

**Goal**: 분류기가 받은 답의 핵심을 임베딩 3위 안으로 굳힌다. 보관 답은 LLM 답 그대로다.

**Independent Test**: `npx vitest run etl/notices/fields.test.ts etl/notices/embed.test.ts`에서 rules.md 3절 표의 네 경우와 `makeFieldAsk`의 굳힌 답·보관 답이 통과한다.

### Tests for User Story 2

- [X] T011 [P] [US2] `etl/notices/embed.test.ts`의 `CANDIDATE_RULE` 기대값(기존 시험)을 rules.md 4절 값으로 바꾼다(`coreTop: 3`이 `CORE_TOP`도 함께 본다). 지금은 실패한다
- [X] T012 [US2] `etl/notices/fields.test.ts`에 시험을 더한다. 지금은 실패한다
  - `settle`: rules.md 3절 표의 네 줄을 `it.each`로
  - `makeFieldAsk`: 가짜 임베딩으로 3위를 정해 두고, LLM 답의 핵심 하나가 3위 밖이면 받은 답에서는 관련 맨 앞에 있고 보관 파일의 답은 LLM 답 그대로다. 다시 부르면 `cached: true`이고 받은 답은 같은 굳힌 답이다
  - 보관 답이 있는 글에서 임베딩이 `down`이면(공지 벡터 보관 없음) 결과가 `down`, `fail`이면 `fail`이다
  - 분야가 30개 이하인 목록은 임베딩을 부르지 않고 LLM 답을 그대로 돌려준다
  - `versionOf({ ...parts, candidates: { ...CANDIDATE_RULE, coreTop: 5 } })`가 `fieldVersion(t)`와 다르다
  - 기존 시험 둘을 굳히기에 맞게 고친다. '보관이 있으면 LLM도 임베딩도 부르지 않는다'는 두 판정기가 같은 `embedDir`을 쓰게 한다(굳히려면 보관한 분야·공지 벡터를 읽는다. 그대로 두면 저장소의 실제 보관 폴더를 읽고 쓴다). '분야가 30개를 넘으면…'의 끝 기대값은 `{ core: [], related: ['fill-3', 'fill-29'] }`다(가짜 임베딩의 3위는 `fill-0`·`fill-1`·`fill-2`다)

### Implementation for User Story 2

- [X] T013 [US2] `etl/notices/embed.ts`에 `export const CORE_TOP = 3`을 더하고 `CANDIDATE_RULE`에 `coreTop: CORE_TOP`과 `core: '핵심은 유사도 상위 coreTop개 안, 밖이면 관련 맨 앞'`을 더한다
- [X] T014 [US2] `etl/notices/fields.ts`에 `settle(a: FieldAnswer, top: string[]): FieldAnswer`를 더한다(rules.md 3절)
- [X] T015 [US2] `etl/notices/fields.ts`의 `makeFieldAsk`가 굳힌 답을 돌려주게 한다: `makeChat`이 준 결과가 답이면, 분야가 `EMBED_K`개를 넘는 목록에서 분야 벡터와 공지 벡터(`vectors()`, `noticeVector`)로 `topCandidates(f, v, CORE_TOP)`을 구해 `settle`을 지난 답을 돌려준다. 벡터가 `fail`·`down`이면 그 결과를 돌려준다. `model`·`version`·`taxonomyId` 속성은 그대로 붙인다
- [X] T016 [US2] `npx vitest run etl/notices`가 통과하는지 확인한다(`run.test.ts`의 가짜 판정기는 `makeFieldAsk`를 지나지 않아 그대로 통과해야 한다). 이어서 US1·US2에서 고친 것(`custom.json`, `FIELD_SYSTEM`, `CANDIDATE_RULE`, `settle`, `makeFieldAsk`, 라벨 기준)을 ponytail-review와 code-review로 보고 지적을 고친다. 이 리뷰가 끝나야 T033(판정)과 T023(라벨러)을 시작한다(아래 '얼림')

**Checkpoint**: 판정 판이 정해졌다. T016의 리뷰까지 끝나면 T033(412건 판정)을 백그라운드로 시작할 수 있다.

---

## Phase 5: User Story 3 - 둘째 표본과 정답 (Priority: P3)

**Goal**: 첫 표본에 없는 글로 둘째 표본 120건을 뽑고, 1안의 2회차 정답을 만든다.

**Independent Test**: `sample --round 2`를 두 번 돌려 같은 파일이고 `sample.csv`와 겹치는 글이 0건이다. `etl/gold/fields/custom-2.csv`에 갈림 `O`가 없다.

### Tests for User Story 3

- [X] T017 [US3] `etl/notices/gold.test.ts`와 `etl/notices/compare.test.ts`에 시험을 더한다. 지금은 실패한다
  - `--round`: `--round`만 있거나 `--round 0`·`--round x`이거나 두 번 나오면 쓰는 법을 내고 2다. `--round 1`은 안 준 것과 같다
  - `sample --round 2`: 1회차 표본의 글이 하나도 없고, 종류 배분이 남은 글 수에 `allocate`를 부른 값이며, 두 번 돌리면 같은 파일이다. `sample.csv`가 없으면 1이고 파일을 쓰지 않는다. 남은 글이 없으면 1이다. 남은 글이 없는 종류는 출력과 파일에 없다. 남은 글이 120건보다 적으면 남은 글 모두다
  - `label-input <안> <폴더> --round 2`가 `sample-2.csv`의 글로 입력을 쓴다
  - `gold … --round 2`가 `<안>-2.csv`를 쓰고 `<안>.csv`를 건드리지 않는다. `readGoldFile(t, dir, 2)`가 그 파일을 읽는다
  - 회차를 주지 않은 기존 시험은 고치지 않고 통과한다

### Implementation for User Story 3

- [X] T018 [US3] `etl/notices/compare.ts`의 `main`이 인자에서 `--round N`을 먼저 떼어 `Ctx.round`에 넣는다(contracts/cli.md '공통'). `USAGE`를 cli.md의 쓰는 법 줄로 바꾼다. `outFile` 기본값은 회차에 따라 `fields-compare.json` 또는 `fields-compare-N.json`이다(시험이 `outFile`을 주면 그 값을 쓴다)
- [X] T019 [US3] `etl/notices/gold.ts`에 회차를 넣는다: 파일 이름 함수 `roundFile`(`sample.csv`·`sample-N.csv`, `<안>.csv`·`<안>-N.csv`), `sample(goldDir, round)`(N회차는 앞 회차 표본의 글을 뺀다, research R5), `readSample(goldDir, round)`, `labelInput`·`gold`가 `GoldCtx.round`를 쓰고, `readGoldFile(t, goldDir, round)`. 출력 문구는 cli.md대로다
- [X] T020 [US3] `npx vitest run etl/notices/gold.test.ts etl/notices/compare.test.ts`가 통과하는지 확인한다
- [X] T021 [US3] `node etl/notices/compare.ts sample --round 2`를 두 번 돌려 `shasum etl/gold/fields/sample-2.csv`가 같은지, `sample.csv`와 글 번호가 겹치지 않는지(겹침 0건), 줄 수가 120인지 확인한다
- [X] T022 [US3] `node etl/notices/compare.ts label-input custom <밖>/r2 --round 2`로 라벨러 입력 세 파일을 만든다
- [X] T023 [US3] 라벨러 A와 B를 따로 띄운다(Claude 하위 에이전트, 서로 다른 실행). 주는 것은 라벨 기준(`specs/20261116-212003-field-taxonomy-compare/label-guide.md`), `etl/taxonomy/custom.json`, `<밖>/r2/custom-1.jsonl`~`-3.jsonl`, 출력 경로(`<밖>/r2/custom-A.json`, `custom-B.json`)뿐이다. 라벨러마다 입력 세 파일 120건을 모두 읽고 출력 파일 하나를 쓴다. `etl/.cache`, `etl/gold`, `etl/out`, 다른 라벨러의 출력은 읽지 말라고 적는다
- [X] T024 [US3] `node etl/notices/compare.ts gold custom <밖>/r2/custom-A.json <밖>/r2/custom-B.json --round 2`를 돌려 갈림 수를 적는다. 검사에 걸리면 그 라벨러에게 위반 줄을 주고 다시 받는다
- [X] T025 [US3] 라벨러 C를 띄운다. 주는 것은 라벨 기준, `etl/taxonomy/custom.json`, `<밖>/r2/custom-split.jsonl`, 출력 경로(`<밖>/r2/custom-C.json`)다. 그 뒤 `gold custom A B C --round 2`로 `etl/gold/fields/custom-2.csv`를 완성한다
- [X] T026 [US3] `custom-2.csv`에 갈림 `O`가 없는지, `shasum etl/gold/fields/custom.csv`가 작업 전과 같은지, 라벨러 셋이 읽은 파일에 금지한 폴더가 없는지(하위 에이전트 보고의 읽은 파일 목록) 확인한다

**Checkpoint**: 2회차 정답이 있다.

---

## Phase 6: User Story 4 - 다시 판정, 지표, 보고 (Priority: P4)

**Goal**: 1안을 다시 판정해 2회차로 재고, 통과 여부와 다음 선택지를 알린다.

**Independent Test**: `node etl/notices/compare.ts score --round 2`가 `custom` 한 열의 지표 표와 통과 줄을 낸다. `etl/taxonomy/custom.json`의 `chosen`은 `null` 그대로다.

### Tests for User Story 4

- [X] T027 [P] [US4] `etl/notices/score.test.ts`에 시험을 더한다. 지금은 실패한다: `scoreTaxonomy`에 굳히기 전 답(`rawAnswers`, 선택 칸)을 주면 `metrics.rawCorePrecision`·`rawCoreRecall`이 그 답으로 센 값이고 나머지 지표는 `answers`(굳힌 답)로 센 값이다. 안 주면 두 값이 `corePrecision`·`coreRecall`과 같다(기존 시험의 입력은 고치지 않는다). `wilson`은 44/50 → `[76, 95]`, 36/41 → `[74, 95]`, 41/41 → `[91, 100]`, 0/5 → `[0, 44]`, 0/0 → `null`이다
- [X] T028 [US4] `etl/notices/compare.test.ts`에 시험을 더한다. 지금은 실패한다
  - 기존 도우미 둘을 고친다. `scored()`는 표본 글 1·2의 공지 벡터를 `noticeVector`로 `embedDir`에 만든다(굳히려면 필요하다. 가짜 벡터가 모두 같아 3위는 목록 앞 셋이고 정답 분야가 그 안이라 기존 기대값은 그대로다). `chooseSetup()`은 `goldDir: tmp()`를 준다(고르기 막기가 표본 파일을 보는데, 안 주면 이 컴퓨터의 `etl/gold`를 본다)
  - score가 보관 답을 굳혀서 센다: 가짜 벡터로 한 글의 핵심이 3위 밖이게 두면 `corePrecision`의 분모가 줄고 `rawCorePrecision`은 그대로다. 공지 벡터가 없는 글은 실패로 센다
  - `score custom`은 `custom`만 재고 다른 안의 정답·실행 기록이 없어도 0이다. 없는 안 id는 1이다
  - `score --round 2`는 `<안>-2.csv`가 있는 안만 재고, 하나도 없으면 `2회차 정답 파일이 있는 안이 없어요`와 1이다. 지표 파일의 `round`가 2다
  - 표에 '핵심 정밀도(굳히기 전)', '핵심 재현율(굳히기 전)' 줄이 있고 이름과 값 사이가 떨어져 있다. 표 뒤 줄이 cli.md 꼴이다(통과, 미달, 분모 0, 다음 회차 표본 파일이 있을 때의 `참고(2회차 표본이 있어요)`)
  - `choose custom --round 2`가 2회차 지표 파일을 읽어 `chosen`을 쓰고(칸은 그대로) 출력이 `custom 고름 · 2회차 핵심 정밀도 …`다. 회차 없는 출력은 지금과 같다
  - `choose custom`은 `sample-2.csv`가 있으면 cli.md의 거절 글을 내고 1이며 목록 파일이 그대로다

### Implementation for User Story 4

- [X] T029 [US4] `etl/notices/score.ts`: `ScoreInput`에 선택 칸 `rawAnswers`를 더하고(없으면 `answers`) `scoreTaxonomy`가 `rawCorePrecision`·`rawCoreRecall`을 낸다. `export function wilson(r: Ratio): [number, number] | null`을 더한다(95%, z = 1.96, 정수 %, 아래 끝 내림·위 끝 올림, 0~100으로 자름, 분모 0이면 `null`)
- [X] T030 [US4] `etl/notices/compare.ts`의 `score`를 cli.md대로 고친다: 재는 안 고르기(준 안, 1회차 세 안, N회차는 정답 파일이 있는 안), 보관 답을 `settle`로 굳히기(목록이 `EMBED_K`개 이하면 그대로, 공지 벡터가 없으면 답 없음), `ROWS`에 두 줄과 첫 칸 폭 24, 표 뒤 줄(통과·미달·참고), 지표 파일의 `round`. `main`의 `score` 분기가 안 id 여러 개를 받는다
- [X] T031 [US4] `etl/notices/compare.ts`의 `choose`가 회차의 지표 파일을 읽고, 다음 회차의 표본 파일이 있으면 거절하고, 2회차부터 출력에 회차를 넣는다(cli.md). `chosen`의 칸은 그대로다
- [X] T032 [US4] `npm run check`가 통과하는지 확인한다
- [X] T033 [US4] `node etl/notices/compare.ts judge custom`을 돌린다(412건, 백그라운드, 40분 안팎. US2가 끝나면 시작할 수 있다). 끝나면 요약 줄을 적는다: 실패 0·못 물음 0, GPU 평균 80% 이하, 칩 최고 80°C 이하. 실패가 있으면 다시 돌려 채운다
- [X] T034 [US4] `node etl/notices/compare.ts score --round 2`를 돌려 지표 표와 통과 줄을 적는다. 이어서 `node etl/notices/compare.ts score custom`(1회차 참고 값)을 돌려 적는다
- [X] T035 [US4] 2회차에서 LLM의 굳힌 핵심과 정답 핵심이 다른 글을 모두 뽑아 무리로 나눈다. 지표 파일의 `misses`는 10건까지라 쓰지 않고, 저장소 밖 일회용 스크립트(research R8)로 표본 120건의 굳힌 답과 정답을 다시 맞춘다. 무리마다 수와 예(제목)를 적는다(분석 글과 스크립트는 저장소 밖)
- [ ] T036 [US4] 결과를 두 곳에 적는다(spec FR-017, research R8). ① 기획 문서 '킹고 컴패니언 새 기획'의 '1단계' 목록: 굳히기 전·후 핵심 정밀도와 재현율, 95% 구간, 통과 여부, 틀린 곳의 무리, 다음 선택지 ② 새 Claude Docs 문서 '분야 판정 다듬기 결과'(비공개): 같은 숫자에 갈린 예(제목, 링크, LLM이 붙인 분야와 정답 분야의 이름)와 1회차 참고 값을 더한다. 미달이면 다음 선택지에 3안을 2회차로 재기와 3회차 표본을 넣는다. 참고로 '산업·전공 밖 묶음 분야는 굳히기에서 내리지 않았다면'의 정밀도·재현율도 함께 낸다(통과 판단에는 쓰지 않는다, 2026-11-19 사용자 결정 '굳히기 그대로'). 본문 문장은 어디에도 넣지 않는다
- [X] T037 [US4] `etl/taxonomy/custom.json`의 `chosen`이 `null`인지 확인한다(고르기는 사용자·교수님이 한다)

**Checkpoint**: 통과 여부가 나왔고 사용자가 고를 수 있다.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T038 `npm run check`와 `npm run build`가 통과하는지 확인한다
- [X] T039 ponytail-review로 과설계를 본다(T016에서 보지 않은 US3·US4 코드: 회차, 지표, 고르기. 새 추상화·쓰이지 않는 인자·겹치는 코드). 지적은 고친다
- [ ] T040 code-review로 정확성을 본다(회차 파일 이름, score의 굳히기, 표 뒤 줄, 고르기 막기). 지적은 고친다. 판정 판 재료나 `settle`을 건드리는 지적은 아래 '얼림'을 따른다
- [ ] T041 quickstart.md의 1~6을 순서대로 확인한다
- [ ] T042 `git status`에 `etl/gold`, `etl/.cache`, `etl/out/fields-compare*.json`, 라벨러 입력이 없는지 확인하고, PR을 올려 CI와 Claude 리뷰를 확인한 뒤 머지하고 브랜치를 지운다

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 → US1 → US2 → (T033 판정 시작 가능) → US3 → US4 → Phase 7
- T033(판정)은 US1·US2의 코드(T006, T007, T013~T015)와 그 리뷰(T016)만 있으면 된다. 40분쯤 걸리므로 US2 Checkpoint에서 백그라운드로 먼저 시작하고, 그동안 US3과 US4의 코드를 한다
- T023(라벨러 A·B)은 T006(목록), T008(라벨 기준), T016(리뷰), T022(입력)가 있어야 한다. 판정과 겹쳐도 된다(Ollama를 쓰지 않는다)
- T034(지표)는 T026(정답), T030~T031(코드), T033(판정)이 모두 끝나야 한다

### 얼림 (research R9)

- T016의 리뷰가 끝나고 T033(판정)을 시작한 뒤에는 `custom.json`, `FIELD_SYSTEM`, `CANDIDATE_RULE`, `settle`, 라벨 기준을 바꾸지 않는다
- 그래도 바꿔야 하면 이렇게 한다
  - T034(2회차 지표) 전: 고치고 T033부터 다시 한다(라벨 기준을 고쳤으면 T023부터)
  - T034 뒤, rules.md에 적은 동작과 코드가 달라서 코드만 고친 경우: T033·T034를 다시 하고 보고(T036)에 앞 값과 고친 까닭을 적는다
  - T034 뒤, 규칙·값·지시문·목록 자체를 바꾸는 경우: 3회차 표본(`--round 3`)으로 잰다

### User Story Dependencies

- US1: 선행 없음
- US2: US1과 다른 곳을 고치지만(같은 `fields.ts`), 판정 판이 둘 다 끝나야 정해져 US1 다음에 한다
- US3: 코드는 US1·US2와 따로다. 라벨은 US1의 목록·라벨 기준이 있어야 한다
- US4: US1~US3이 모두 있어야 잰다

### Within Each User Story

- 시험을 먼저 쓰고 실패를 본 뒤 구현한다
- 실행 작업(T021~T026, T033~T037)은 코드가 통과한 뒤에 한다

### Parallel Opportunities

- T004·T005, T008·T009, T011은 서로 다른 파일이다
- T033(판정, 백그라운드)과 US3 전체
- T023의 라벨러 A·B는 함께 돈다

## Parallel Example: User Story 3

```text
T033 judge custom (백그라운드, 40분)   ← US2 Checkpoint에서 시작
T017~T020 회차 코드와 시험
T021~T022 표본과 라벨러 입력
T023 라벨러 A  ┐ 함께
T023 라벨러 B  ┘
```

## Implementation Strategy

### MVP First (User Story 1 Only)

US1만으로도 라벨 기준과 지시문이 같은 규칙을 갖는다. 다만 값은 US4까지 가야 나온다.

### Incremental Delivery

1. US1 + US2 → 판정 판 확정 → 판정 시작
2. US3 → 2회차 정답
3. US4 → 지표와 보고
4. Phase 7 → PR 하나로 올려 머지한다(문서, 목록, 코드가 한 판정 판을 이루어 나누지 않는다)

## Notes

- 안을 고르는 `choose`는 돌리지 않는다(spec FR-016). 시험에서만 부른다
- 파일은 500줄을 넘기지 않는다(쓰기 훅). `gold.test.ts`와 `compare.test.ts`가 480줄에 가까워지면 회차 시험을 `round.test.ts`로 나눈다
- 정답·표본·지표 파일과 라벨러 입력은 커밋하지 않는다

## 결과 (2026-11-19)

- 판정: 412건 · 실패 0 · 못 물음 0 · 글당 5.5초 · 49분 · GPU 평균 62.9% · 칩 최고 72.8°C(판정 판 6389b68e)
- 2회차 정답: 라벨러 일치 88.3%(같음), 갈림 38건은 셋째가 정함
- **2회차 굳힌 핵심 정밀도 70.0% (35/50) · 95% 구간 56~81% · 85% 기준 미달**. 굳히기 전 57.4% (62/108), 재현율 35.7%(굳히기 전 63.2%)
- 틀린 핵심 15개: 회사 채용의 직무·산업 판단 9, 가까운 분야 혼동 3, 고루 다루는 공지에 핵심을 붙임 3
- 고른 표시(`chosen`)는 그대로 비어 있다. 다음 선택지는 기획 문서와 밤 개발 보고에 적었다

## 3회차 (2026-11-19)

- [X] R3-1 contracts/rules.md 1·2절, `FIELD_SYSTEM`, label-guide.md의 '직무와 산업'을 3회차 규칙으로 고친다(예시 4·5 포함)
- [X] R3-2 `sample --round 3`(겹침 0 확인), `label-input custom <밖>/r3 --round 3`
- [X] R3-3 `judge custom`(새 판, 백그라운드)
- [X] R3-4 라벨러 A·B(따로 폴더) → `gold … --round 3` → C → `custom-3.csv`
- [X] R3-5 `score --round 3`, 틀린 글 분석, 보고(밤 개발 보고 문서·기획 문서), PR

### 3회차 결과 (2026-11-23)

- 판정: 412건(판 73a2661c), 첫 실행 실패 2건을 다시 돌려 채움(실패 0·못 물음 0). 139분, GPU 평균 33.8%, **칩 최고 82.5°C**(98분 기록 중 1분이 80°C를 넘음. 부하 제한의 '온도 + 오름폭' 대기가 요청 도중 오른 온도를 막지 못했다)
- 3회차 정답: 라벨러 일치 92.5%(같음), 갈림 30건은 셋째가 정함
- **3회차 굳힌 핵심 정밀도 87.0% (27/31) · 95% 구간 71~95% · 85% 기준 통과**. 굳히기 전 79.5% (39/49), 핵심 재현율 36.4%(굳히기 전 52.7%), 412건 중 핵심 빈 글 76.6%
- 틀린 핵심 4개: 가까운 분야 혼동 3(AI 보안↔AI 일반, 데이터 분석↔데이터 과학·통계, LLM↔가상·증강현실), 채용설명회에 직무를 붙임 1
- 고른 표시(`chosen`)는 그대로 비어 있다. 고르기는 사용자·교수님이 한다(`choose custom --round 3`)
