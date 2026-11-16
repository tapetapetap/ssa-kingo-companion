# Implementation Plan: 분야 목록 3안 비교와 공지 분야 판정

**Branch**: `feat/field-taxonomy` | **Date**: 2026-11-16 (2026-11-17 보완) | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/20261116-212003-field-taxonomy-compare/spec.md`

## Summary

분야 목록 세 안을 저장소 파일로 만든다.
- 1안: 직접 만든 2단 목록, 분야 100개 안팎
- 2안: NCS 소분류 270개. 공식 정보망 DB에서 뽑는다.
- 3안: CSRankings 27개 + 직무 11개

공지 분류기(`etl/notices`)에는 '분야 판정' 단계를 더한다. 두 단계다(사용자 결정 2026-11-16, research R17).
- 기회로 판정된 공지만 기존 판정과 따로 묻는다.
- 먼저 임베딩(Ollama `bge-m3`)으로 공지와 가까운 분야 30개를 후보로 고른다. 분야 벡터와 공지 벡터는 이 컴퓨터에 보관한다.
- 그다음 `gemma4:12b`에 후보만 넣어 묻는다. 답은 후보 안에서 고른 핵심 분야 0~2개와 관련 분야 0~5개다.
- 요청·보관 몸통은 기존 판정과 공통 함수 `makeChat`으로 함께 쓴다(research R2). 판정 판과 보관은 분야 판정만 따로 가진다.
- 부하 제한(요청 시간의 1/4 쉼, 온도 80°C 대기)은 분류기 안에 넣는다(R6).
  - 실행 하나에 하나만 만들어 실제 LLM·임베딩 요청 앞뒤에 늘 건다. 보관 답·보관 벡터는 쉬지 않는다.
  - 온도를 한 번이라도 못 읽으면 그 실행의 새 요청을 멈춘다.
  - 센서는 운영체제별이다(R18). 맥은 칩 다이 센서, 운영 서버(학교 데스크톱, Ubuntu)는 CPU 패키지 온도와 nvidia-smi다.

비교 명령 `compare.ts`가 하는 일은 이렇다.
- 표본 120건을 고정한다.
- 세 안의 412건 판정을 돌리고 실행 기록을 남긴다.
- 라벨러 입력을 만들고 정답을 합친다.
- 지표(후보 적중률 포함)를 계산하고, 사용자가 고른 안을 표시한다. 지표 계산은 `score.ts`의 순수 함수다.

미리보기와 비교 보고서는 구현하는 에이전트가 손으로 만드는 일회용 HTML이다. 세 목록 파일과 비교 결과 파일의 내용을 페이지에 넣어 비공개 아티팩트로 낸다(R11). 비공개 아티팩트는 claude.ai에 올린 웹 페이지로, 처음에는 사용자만 열 수 있다. 교수님께는 사용자가 페이지의 Share 메뉴로 공유한다.

고르기와 85% 기준은 따로다(R12).
- 사용자는 미달인 안도 고를 수 있다.
- `run.ts`가 결과 파일의 기회마다 분야 칸을 더하는 조건은 둘이다. 고른 안의 핵심 정밀도가 85% 이상이고, 고른 뒤 판정 판·모델이 바뀌지 않았어야 한다.

전체 시스템에서 이 단계의 자리는 [system.html](system.html)에 있다. 구현 전 승인(2-1)은 사용자가 면제했다(2026-11-17). 그래서 이 그림과 실사용 변화는 비교 보고서에 남긴다(R15).

## Technical Context

**Language/Version**: TypeScript strict. Node 22.18 이상의 타입 제거 실행(`node etl/…/*.ts`)으로 기존 ETL과 같다. 맥의 칩 온도 센서 읽기만 C 파일 하나(`thermal.c`, darwin 전용)이고, 시스템 `clang`으로 처음 쓸 때 빌드한다.

**Primary Dependencies**: 새 의존성 없음.
- Node 내장 `fetch`(Ollama HTTP: `/api/chat`, `/api/embed`), `node:crypto`(판·sha), `node:child_process`(센서·명령), `node:fs`
- Ollama 모델: `gemma4:12b`(판정), `bge-m3`(임베딩). 둘 다 이 맥에 있다.
- 맥: 기본 도구 `clang`, `ioreg`
- 리눅스(운영 서버): 커널의 `/sys/class/thermal`, 없을 때만 lm-sensors의 `sensors`, NVIDIA 드라이버의 `nvidia-smi`

**Storage**: 파일.
- 저장소: 분야 목록 `etl/taxonomy/*.json`, 결과 파일 `etl/out/cse-notices.json`과 그 계약(스펙 1 `contracts/cse-notices.schema.json`)
- 이 컴퓨터(커밋하지 않음): 표본·정답 `etl/gold/fields/*.csv`와 비교 결과 `etl/out/fields-compare.json`(갈린 예에 정답 라벨이 들어 있다). 정답셋이라 사용자가 올리기로 정하기 전까지 이 컴퓨터에만 둔다(스펙 1 FR-034, `.git/info/exclude`의 `etl/gold/`, 2026-11-17 구현 때 확인)
- 저장소 밖(`.gitignore`의 `etl/.cache/`): 분야 답 보관과 판정 실행 기록(`llm-fields/…/runs.jsonl`), 분야·공지 벡터(`embed/`), NCS 원본, 센서 실행 파일, 부하 기록
- 라벨러 입력은 저장소 밖 임시 폴더에 둔다.

**Testing**: vitest(`npm run check` = `tsc --noEmit && vitest run`, `etl` 포함). LLM·임베딩·학교 서버·센서·시계는 함수 주입으로 바꿔 끼워 시험한다(스펙 2와 같은 방식). 리눅스 센서는 고정 문자열과 임시 폴더로 시험한다.

**Target Platform**:
- 비교 판정(이 스펙): 이 맥(Apple M5 Pro, 24GB, macOS, Ollama 0.32.0)에서 사람이 돌리는 배치
- 운영: 학교 데스크톱(Ubuntu, Intel i7 12세대, NVIDIA GPU 예정)에서 `run.ts`가 돈다(2단계부터). 부하 제한은 같은 규칙이고 센서만 다르다.
- CI(Linux)는 테스트만 돌리고 센서·LLM·임베딩에 닿지 않는다.

**Project Type**: CLI 배치(ETL). 화면 변화는 없다. 미리보기는 앱 밖이다.

**Performance Goals**:
- 세 안 412건 × 3 판정이 부하 제한을 지키며 3시간 안에 끝난다(SC-006).
- 추정은 글당 4~7초, 합쳐 약 2.4시간이다(R13). 후보가 글마다 달라 지시문 앞부분을 다시 쓰는 몫이 줄었다.

**Constraints**:
- GPU 평균 80% 이하, 온도 80°C 이하. 사용자가 고정했고 끄는 설정이 없다.
- 학교 서버는 1초에 1건이다.
- 본문 원문은 커밋하지 않는다. 벡터 보관에도 본문 글자를 넣지 않는다.
- NCS는 공공누리 1유형이라 출처를 표시한다.
- CSRankings는 분야 이름·키만 쓴다.

**Scale/Scope**:
- 분야 목록 3개(분야 합 약 410개)
- 판정 1,236번, 임베딩: 분야 약 410개 + 공지 412건
- 정답 120건 × 3안 × 라벨러 2~3

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md`는 아직 템플릿이다. 그래서 스펙 2와 같은 방식으로 저장소 지침에서 관문을 뽑는다.

| # | 관문 (출처) | Phase 0 전 | Phase 1 후 |
|---|---|---|---|
| G1 | 새 의존성은 표준 API로 안 될 때만 (CLAUDE.md) | 통과 | 통과: 내장 API, 운영체제 기본 도구·드라이버 도구만 쓴다. bge-m3는 이미 있는 Ollama 모델이다 |
| G2 | TypeScript strict, `any` 금지 (CLAUDE.md) | 통과 | 통과: LLM 답·임베딩 답·라벨·목록 파일은 검사한 뒤에만 타입이 붙는다 |
| G3 | 파일 하나는 한 가지, 500줄 이하 (CLAUDE.md, 쓰기 훅) | 통과 | 통과: 역할마다 파일을 나눈다(아래 구조). 지표 계산은 처음부터 `score.ts`다. 표본·정답 명령(sample·label-input·gold)은 처음부터 `gold.ts`에, 그 시험은 `gold.test.ts`에 둔다. 시험 파일도 480줄을 넘기 전에 같은 기준으로 나눈다 |
| G4 | 분기·계산 로직은 테스트를 남긴다 (CLAUDE.md) | 통과 | 통과: 새 파일마다 `*.test.ts`. 저장소의 세 목록 파일도 시험이 검사한다 |
| G5 | 수집 원문과 키를 커밋하지 않는다 (CLAUDE.local.md) | 통과 | 통과: 본문은 `etl/.cache/`와 저장소 밖에만 둔다. 보관 답·벡터·정답·보고서에는 id·제목·링크·벡터만 있다. label-input과 gold는 저장소 안 폴더를 거절한다 |
| G6 | PR을 올리고 CI·리뷰 뒤 머지 (CLAUDE.local.md, 2026-11-16) | 통과 | 통과: `feat/field-taxonomy` → PR → 머지 |
| G7 | 사실은 로직 값만, 추정은 추정으로 (concept.md) | 통과 | 통과: LLM은 후보 안 분야 이름만 고르고 날짜·사실을 내지 않는다. 앱은 분야를 AI 추정으로 보인다(3단계) |
| G8 | 외부 자료 이용 조건, 학교 서버 1초 1건 (CLAUDE.local.md, 메모) | 통과 | 통과: NCS 제1유형 출처 표시, CSRankings 이름·키만, 요청 간격 1초 |
| G9 | 부하 제한 GPU 80%·온도 80°C 고정 (사용자 지시) | 통과 | 통과: `throttle.ts`가 모든 LLM·임베딩 요청을 감싸고 끄는 설정이 없다. 센서는 운영체제별(`sensors.ts`, R18) |
| G10 | 역량 매핑은 학과 직접 입력, AI 자동 연결 금지 (메모) | 해당 없음 | 해당 없음: 분야 판정은 공지 태그이고 과목·역량 연결이 아니다. 교과 지도 대응표는 목록끼리의 초안이다 |
| G11 | goldfish 리뷰(2-0)와 구현 전 승인(2-1) (전역 워크플로) | `/speckit-tasks` 뒤 | goldfish는 한다. 2-1은 사용자가 면제했다(2026-11-17). 실사용 변화는 보고서에 남긴다 |

## Project Structure

### Documentation (this feature)

```text
specs/20261116-212003-field-taxonomy-compare/
├── spec.md
├── plan.md              # 이 파일
├── research.md          # R1~R18, 부록 A(thermal.c)
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── cli.md           # 명령 약속
│   └── field-llm.md     # 분야 판정 요청 약속(임베딩 후보 + LLM)
├── label-guide.md       # 라벨 기준 한 장(작업 목록에서 쓴다)
├── system.html          # 전체 시스템 도식도(보고서에서 보임)
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks가 만든다
```

### Source Code (repository root)

```text
etl/
├── notices/
│   ├── llm.ts           # 바뀜: makeAsk 몸통을 makeChat(보관·request·gate·down·잘림 막기·promptTokens)으로 빼서 두 판정이 함께 씀
│   ├── llm.test.ts      # 기존 사례 그대로 통과 + makeChat 사례
│   ├── embed.ts         # 새: bge-m3 임베딩 요청, 분야·공지 글, 벡터 보관, 후보 30개 고르기
│   ├── embed.test.ts
│   ├── fields.ts        # 새: 분야 판정(지시문·스키마·답 정리·판·makeFieldAsk·readFieldAnswer)
│   ├── fields.test.ts
│   ├── throttle.ts      # 새: createThrottle(실행 하나에 하나, 판정마다 문, 쉼·온도 대기·1분 기록·stop)
│   ├── throttle.test.ts
│   ├── sensors.ts       # 새: 운영체제별 온도·GPU 읽기(darwin: thermal.c·ioreg, linux: /sys·sensors·nvidia-smi)
│   ├── sensors.test.ts  # 고정 문자열·임시 폴더
│   ├── thermal.c        # 새: 맥 칩 다이 센서 읽기(IOHID, 관리자 권한 없음, 코드는 research 부록 A)
│   ├── compare.ts       # 새: 하위 명령 진입. check·judge·score·choose, sample·label-input·gold는 gold.ts로 넘김
│   ├── compare.test.ts
│   ├── gold.ts          # 새: 표본·라벨러 입력·정답(sample·label-input·gold), 저장소 안 폴더 거절
│   ├── gold.test.ts
│   ├── score.ts         # 새: 지표 계산(비율 num·den, 후보 적중률, 실행 줄 고르기)
│   ├── score.test.ts
│   ├── run.ts           # 바뀜: 부하 제한, 고른 안이 있으면 분야 판정과 결과 칸
│   ├── run.test.ts      # 사례 추가
│   ├── eval.ts          # 바뀜: 부하 제한만
│   └── eval.test.ts     # 사례 추가
├── taxonomy/
│   ├── taxonomy.ts      # 새: 분야 목록 타입·읽기·검사·LLM용 이름·묶음 경로·findChosen·fieldGate
│   ├── taxonomy.test.ts # 시험용 목록 + 저장소의 세 목록 파일
│   ├── fixtures.ts      # 새: 시험용 목록을 코드로 만드는 validList(id), 시험만 쓴다
│   ├── ncs.ts           # 새: NCS 정보망 DB → ncs.json(한 번 돌리는 스크립트)
│   ├── ncs.test.ts      # 작은 XML 조각
│   ├── custom.json      # 새: 1안
│   ├── ncs.json         # 새: 2안
│   └── csrankings.json  # 새: 3안
├── gold/fields/          # 이 컴퓨터만(정답셋, 스펙 1 FR-034)
│   ├── sample.csv       # 새: 표본 120건
│   └── custom.csv · ncs.csv · csrankings.csv   # 새: 정답(A·B·최종)
└── out/
    ├── cse-notices.json     # 고른 안이 85%를 넘으면 분야 칸이 생김
    └── fields-compare.json  # 새: 비교 지표(이 컴퓨터에만, 스펙 1 FR-034)

specs/20261107-193624-cse-notice-opportunities/contracts/
└── cse-notices.schema.json  # 바뀜: taxonomy·fields·fieldRule 선택 칸(research R12)
```

**Structure Decision**: 기존 `etl/notices` 옆에 분야 목록 폴더 `etl/taxonomy`만 새로 만든다. 분야 목록은 2단계 백엔드(DB에 넣기)와 3단계 앱(취향 고르기)이 함께 읽는 자료라 분류기 코드와 나눈다. 임베딩(`embed.ts`)은 분류기 안에 두되 파일을 따로 둔다. 같은 벡터를 2단계 이후가 다시 쓰기 때문이다. 센서(`sensors.ts`)는 운영체제마다 달라 부하 규칙(`throttle.ts`)과 나눈다. 미리보기 HTML과 비교 보고서는 에이전트가 저장소 밖(`$T/report/`)에서 손으로 만들어 아티팩트로만 내고, 생성 코드도 저장소에 두지 않는다(research R11). docs/product/decisions.md에는 고른 안을 한 줄 더한다.

## Complexity Tracking

| 위반처럼 보이는 것 | 왜 필요한가 | 더 단순한 안을 버린 이유 |
|---|---|---|
| TypeScript 저장소에 C 파일 하나(`thermal.c`, darwin 전용) | 맥의 칩 다이 온도를 관리자 권한 없이 읽는 길이 IOKit HID뿐이다(사용자 고정 지시 G9). 리눅스는 커널이 글자로 보여 C가 필요 없다 | `powermetrics`는 sudo가 필요하다. npm 패키지는 새 의존성이다. 저장소 밖 임시 실행기는 실행할 때마다 잊을 수 있다(스펙 2 R12) |
| 분야 판정에 모델 둘(임베딩 + LLM) | 2안 270개를 지시문에 다 넣지 않으려면 후보를 줄여야 한다(사용자 결정 2026-11-16). 같은 벡터를 다음 단계가 다시 쓴다 | 전체 목록을 넣으면 2안 지시문이 수만 자라 세 안 조건이 달라진다(R17) |
