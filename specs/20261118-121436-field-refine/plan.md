# Implementation Plan: 분야 판정 다듬기(1단계 후속)

**Branch**: `feat/field-refine` | **Date**: 2026-11-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/20261118-121436-field-refine/spec.md`

## Summary

1단계 분류기의 분야 판정을 다듬어 새 표본으로 다시 잰다. 고치는 것은 넷이다.

1. 라벨 기준과 지시문에 규칙 셋(직무·산업, 고루 다루는 공지, 넓은·좁은 분야)을 같은 뜻으로 넣는다([contracts/rules.md](contracts/rules.md)).
2. 1안에 'AI 일반'을 더한다(research R4).
3. 순수 함수 `settle`로 핵심을 굳힌다. 보관 답은 LLM 답 그대로다(R1).
4. 표본·정답·지표에 회차(`--round N`)를 넣고, 지표에 굳히기 전 값과 통과 줄을 더한다(R5, R6).

그 뒤 1안 412건을 다시 판정하고, 둘째 표본 120건에 라벨러 셋으로 정답을 달아 지표를 낸다. 안을 고르는 일은 하지 않는다.

## Technical Context

**Language/Version**: TypeScript, Node 22.18 이상(빌드 없이 타입 제거로 실행, 이 맥은 v26)

**Primary Dependencies**: 없음(Node 표준과 지금 있는 `etl/` 모듈). 판정은 Ollama의 gemma4:12b, 임베딩은 bge-m3(1단계와 같음)

**Storage**: 파일. 저장소: `etl/taxonomy/custom.json`. 이 컴퓨터에만: `etl/gold/fields/*`, `etl/out/fields-compare*.json`, `etl/.cache/*`

**Testing**: vitest, 파일 옆 `*.test.ts`. LLM·임베딩·센서는 가짜를 넣는다(1단계와 같음)

**Target Platform**: 이 맥(판정과 라벨). 운영(학교 데스크톱)에서는 `run.ts`가 같은 굳히기를 쓴다

**Project Type**: 명령줄 도구(분류기와 비교 명령)

**Performance Goals**: 412건 판정 40분 안팎(글당 5.7초, 쉼 포함). 굳히기는 요청을 더하지 않는다

**Constraints**: GPU 평균 80%·칩 80°C(사용자 고정), 학교 서버 요청 없음(보관본), 본문·정답 커밋 금지, 파일 500줄 이하

**Scale/Scope**: 기회 412건, 표본 120건 × 2회차, 1안 분야 91개. 고치는 파일 8개 안팎

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md`는 아직 템플릿이다. 1단계와 같은 방식으로 저장소 지침과 사용자 지시에서 관문을 뽑는다.

| # | 관문 (출처) | Phase 0 전 | Phase 1 후 |
|---|---|---|---|
| G1 | 새 의존성은 표준 API로 안 될 때만 (작업 규칙) | 통과 | 통과: 의존성 변화 없음 |
| G2 | TypeScript strict, `any` 금지 | 통과 | 통과 |
| G3 | 파일 하나는 한 가지, 500줄 이하 (쓰기 훅) | 통과 | 통과: 고친 뒤에도 `gold.ts` 300줄, `compare.ts` 260줄, `run.test.ts`는 건드리지 않는다. 시험은 그 파일의 `*.test.ts`에 더한다 |
| G4 | 분기·계산 로직은 시험을 남긴다 | 통과 | 통과: `settle`, 회차 파일 이름, 2회차 표본, 안을 준 score, 통과 줄, Wilson 구간 |
| G5 | 수집 원문·정답·키를 커밋하지 않는다 (작업 규칙, 1단계 FR-024, 스펙 1 FR-034) | 통과 | 통과: 정답·지표 파일은 gitignore, 라벨러 입력은 저장소 밖(명령이 거절) |
| G6 | PR을 올리고 CI·리뷰 뒤 머지 (작업 규칙) | 통과 | 통과: `feat/field-refine` → PR → 머지 |
| G7 | 부하 제한 GPU 80%·온도 80°C 고정 (사용자 지시) | 통과 | 통과: judge가 1단계 부하 제한을 그대로 지난다. 굳히기는 요청이 없다 |
| G8 | 시스템은 안을 대신 고르지 않는다 (1단계 FR-020) | 통과 | 통과: score는 통과 줄만 내고 `chosen`을 쓰지 않는다 |
| G9 | 고른 표본으로 그 규칙을 재지 않는다 (spec FR-015) | 통과 | 통과: 통과 기준은 2회차 값 하나, 굳히기 값 3은 2회차를 보기 전에 고정. 판정을 시작한 뒤에는 판정 판 재료를 바꾸지 않는다(R9). 다음 회차 표본이 있으면 낮은 회차 값으로 고르지 못한다(R5) |
| G10 | goldfish 리뷰(2-0)와 구현 전 승인(2-1) (전역 워크플로) | `/speckit-tasks` 뒤 | goldfish는 한다. 2-1: 사용자가 이 내용(spec Status에 옮겨 적은 규칙과 순서)을 '추천대로'로 승인하고 구현을 시작하라고 했다(2026-11-18). 화면 변화가 없어 2-0.5는 건너뛴다 |

## Project Structure

### Documentation (this feature)

```text
specs/20261118-121436-field-refine/
├── spec.md
├── plan.md              # 이 파일
├── research.md          # R1~R9
├── data-model.md        # 바뀌는 것만
├── quickstart.md
├── contracts/
│   ├── rules.md         # 규칙 셋의 글, 굳히기, 판정 판 재료
│   └── cli.md           # --round, score, choose (바뀌는 것만)
└── tasks.md             # /speckit-tasks가 만든다
```

### Source Code (repository root)

```text
etl/
├── taxonomy/
│   ├── custom.json          # 'AI 일반', edition, courseMap.ai
│   └── taxonomy.test.ts     # 저장소 목록 검사(분야 91개)
└── notices/
    ├── embed.ts             # CORE_TOP, CANDIDATE_RULE에 coreTop·core
    ├── fields.ts            # FIELD_SYSTEM 규칙 글, settle, makeFieldAsk가 굳힌 답을 돌려줌
    ├── gold.ts              # 회차: sample, readSample, labelInput, gold, readGoldFile
    ├── score.ts             # rawCorePrecision·rawCoreRecall, wilson
    ├── compare.ts           # --round, score [<안>…], 통과 줄, choose 회차와 막기
    └── *.test.ts            # 위 파일들의 시험
specs/20261116-212003-field-taxonomy-compare/
├── label-guide.md           # 고르는 법 네 줄(고쳐 쓴 '기술 분야' 줄과 규칙 셋), 예시 4~7
└── contracts/field-llm.md   # 지시문 뼈대, 판정 판 재료, 굳히기 절
.gitignore                   # etl/out/fields-compare*.json
```

**Structure Decision**: 새 파일을 만들지 않는다. 굳히기는 답을 다루는 `fields.ts`에, 회차는 표본·정답을 다루는 `gold.ts`와 명령을 나누는 `compare.ts`에 둔다. 화면·서비스·인프라가 바뀌지 않아 스택 그림은 만들지 않는다(전체 흐름은 1단계 [system.html](../20261116-212003-field-taxonomy-compare/system.html)과 같고, data-model의 '상태 변화'에 이번 순서를 적었다).

## 실사용에서 달라지는 것

- 학생: 달라지는 화면이 없다. 결과 파일의 분야 칸은 사용자·교수님이 안을 고른 뒤에 붙는다.
- 분류기: 받은 답의 핵심이 줄고(임베딩 3위 밖 핵심은 관련으로), 채용 공지에 산업 분야가 붙기 시작한다. 세 안의 판정 판이 바뀌어, 다음에 분야를 넣을 때는 새 판으로 잰 값이 있어야 한다.
- 사용자·교수님: 2회차 지표와 통과 줄을 보고 안을 고른다. 통과면 `choose custom --round 2` 한 번으로 결과 파일에 분야가 붙는다. 회차 없이 `choose custom`만 치면 2회차 표본이 있어 거절된다(1회차 값은 규칙을 고른 표본의 값이다).

## Complexity Tracking

위반 없음.
