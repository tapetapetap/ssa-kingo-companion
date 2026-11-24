# Implementation Plan: 2단계 백엔드 뼈대(API 서버와 DB)

**Branch**: `spec/backend-skeleton` | **Date**: 2026-11-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/20261117-052701-backend-skeleton/spec.md`

**상태**: 2026-11-18 밤 위임으로 초안을 쓰고, 같은 날 사용자가 spec '사용자 확인 필요' 20개를 추천값으로 정했다. 2026-11-19 goldfish 리뷰 지적을 반영했다([goldfish-review.md](goldfish-review.md)). 그 뒤 계획을 다시 검토해 고친 곳: 포트를 여는 문지기(R16, 실험으로 확인), 사람 판정과 보이는 값(R22), 확인할 것의 이유(R11), 백업 도구(R15), Node 판과 경로 표(R1·R2, CI가 Node 22).

## Summary

학교 데스크톱 한 대의 Docker Compose(db, ollama, api, proxy, jobs)에 TypeScript 서버를 올린다. 서버는 Node 표준 http와 Postgres + pgvector만 쓰고, 서버의 새 의존성은 DB 드라이버 `postgres` 하나다. 운영자 화면은 디자인 시스템 패키지 `@astryxdesign/core`(astryx)를 쓴다(R17). 1단계 분류기의 결과 파일·분야 목록·벡터 보관을 넣어, 3단계 앱과 운영자 화면에 [contracts/api.md](contracts/api.md)대로 준다.

- 가장 추천: 규칙 점수로 추천 후보 10개를 고르고 서버 안 LLM이 하나를 고른다. 답이 검사를 통과하지 못하거나 모델이 없으면 규칙 1위다(research R8).
- 나의 분석: 사실 칸은 규칙이 바로 쓰고, 흐름 2~4줄만 매일 작업에서 LLM이 근거 줄 키와 함께 쓴다(R10).
- 모델 요청은 1단계 부하 제한과 Postgres 잠금으로 한 번에 하나만 간다(R7).
- 학생 자료를 다루는 api와 db는 바깥 인터넷이 없는 네트워크에만 두고, 포트는 문지기(proxy)가 연다(R16).

## Technical Context

**Language/Version**: TypeScript, Node 24 이상(빌드 없이 타입 제거로 실행, 1단계와 같음. CI는 `.nvmrc`의 24, 2026-11-24에 22에서 올림), ESM

**Primary Dependencies**: Node 표준(`node:http`, `node:crypto`), `postgres`(새, R3), 1단계 모듈(tasks T082의 파일 목록: `etl/notices/throttle.ts`·`sensors.ts`·`embed.ts`·`llm.ts`·`fields.ts`·`cse.ts`·`gold.ts`·`classify.ts`, `etl/taxonomy/taxonomy.ts`). 운영자 화면은 Vite + React + `@astryxdesign/core`(R17)

**Storage**: Postgres 17 + pgvector(`vector(1024)`), 표 26개([data-model.md](data-model.md))

**Testing**: vitest와 `*.test.ts`(저장소 방식). DB 시험은 진짜 Postgres(로컬 Docker, CI 서비스 컨테이너)에서 시험 파일마다 새 스키마. 모델은 가짜 함수 주입

**Target Platform**: Ubuntu 학교 데스크톱(i7 12세대, GPU 없음)의 Docker Compose와 systemd timer. 개발은 맥(Docker의 db, 맥에서 바로 도는 Ollama)

**Project Type**: 웹 서비스(API) + 운영 명령 + 매일 작업 + 운영자 웹 페이지 하나

**Performance Goals**: SC-005(바꾼 뒤 5분 안에 새 가장 추천, GPU일 때), SC-006(매일 작업 2시간 안, 학생 100명, GPU일 때), SC-007(학생 1,000명·공지 3,000건에서 앱 요청 95%가 1초 안)

**Constraints**: 모델 요청 한 번에 하나, GPU 평균 80%, 온도 80°C(FR-044). 학생 자료는 서버 밖으로 나가지 않음(FR-042). 학교 공지 서버 1초 1건. 서버 기록에 비밀번호·토큰·글 없음(FR-047). 예시 자료 0(FR-001)

**Scale/Scope**: 3단계 시범 수십 명, 길게 봐도 학과 하나(1,000명 이하), 공지 3,000건 이하, API 경로 40개 안팎

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md`는 아직 빈 틀이다. 그래서 프로젝트가 지켜 온 규칙(사용자의 작업 지침, 과설계를 막는 ponytail 규칙, 기획 문서, spec)으로 문을 본다.

| 문 | 이 plan | 결과 |
|---|---|---|
| 새 의존성은 꼭 필요할 때만 | 서버는 `postgres` 하나(표준에 Postgres 클라이언트가 없음). HTTP·비밀번호·세션·마이그레이션·스케줄은 표준과 OS로. 운영자 화면의 `@astryxdesign/core`는 3단계 학생 앱이 쓸 것을 먼저 들이는 것이다 | 통과(R2~R5, R14, R17) |
| 학생 자료는 서버 밖으로 안 나감 | api·db는 internal 네트워크에만 있고, 모델은 자체 Ollama만. 포트는 Caddy 문지기가 연다 | 통과(R16) |
| 예시 자료 없음 | 서버 자료는 넣기와 로그인으로만 생김. 시험 자료는 시험 안에만 | 통과(FR-001) |
| 시험 먼저 | 파일마다 `*.test.ts`, DB 시험은 진짜 Postgres | 통과(R19) |
| 비밀·개인정보는 저장소 밖 | `.env`, 운영자 목록, 백업은 저장소 밖. 정답셋 내보내기는 저장소 안 경로를 거절 | 통과(R17, R20) |
| 부하 제한 하나 | 1단계 부하 제한 + 프로세스 사이 잠금 | 통과(R7) |
| 과설계 없음 | 인터페이스는 로그인 방식 하나(구현 둘: dev, test). 큐 서버·ORM·HTTP 프레임워크 없음 | 통과 |

설계 뒤 다시 봤다: 그대로 통과다. 남는 무게는 아래 Complexity Tracking과 위험에 적었다.

## Project Structure

### Documentation (this feature)

```text
specs/20261117-052701-backend-skeleton/
├── spec.md
├── plan.md              # 이 파일
├── research.md          # R1~R23 결정
├── data-model.md        # 표와 상태 변화
├── quickstart.md        # 되는지 확인하는 순서
├── contracts/
│   ├── api.md           # 앱·운영자 화면 ↔ 서버
│   ├── cli.md           # 운영 명령
│   └── llm.md           # 서버가 모델에 보내는 요청 둘
└── tasks.md             # /speckit-tasks가 만든다
```

### Source Code (repository root)

```text
server/
├── main.ts              # api 시작: 모드 확인, 경로 표, 다시 고르기 일꾼
├── http.ts              # 경로 표(`/api/notices/:id` 꼴), JSON·쿠키, 오류, 로그인·운영자 확인
├── config.ts            # 환경 변수, 운영자 목록 파일
├── limits.ts            # 첫 숫자 값(R21)
├── log.ts               # JSON 기록, 금지어를 남기지 않음
├── model.ts             # Ollama 호출: 부하 제한 하나를 여닫고 모델 잠금 안에서 보냄(R7, contracts/llm.md)
├── cli.ts               # 운영 명령(contracts/cli.md)
├── db/
│   ├── sql.ts           # 연결, 트랜잭션, 모델 잠금
│   ├── migrate.ts
│   └── migrations/      # 001_base.sql …
├── auth/                # 로그인 방식(dev), 비밀번호, 세션, 동의
├── ingest/              # 결과 파일 검사, 넣기, 요약
├── notices/             # 열린 공지, 목록·찾기, 카드 행동, 내 목록
├── me/                  # 처음 질문, 고른 분야, 프롬프트, 직접 넣은 활동
├── analysis/            # 사실 칸, 흐름, md
├── pick/                # 규칙 점수, 후보 10개, LLM 고르기, 일꾼, 선반
├── ops/                 # 판정 검토, 사람 판정, 고친 기록, 정답셋 내보내기
└── jobs/                # 매일 작업, 백업, 상태 보기
web/ops/                 # 운영자 판정 검토 PC 페이지(Vite + React + astryx). 빌드 결과는 web/ops/dist
deploy/
├── compose.yaml         # db, ollama, api, proxy, jobs와 네트워크 inner·outer
├── compose.dev.yaml     # 개발·시험용 DB 하나
├── consent.dev.md       # 개발용 동의 문구
├── operators.example.json
├── Caddyfile            # 8080 → api:8080
├── Dockerfile
└── kingo-daily.service, kingo-daily.timer
.env.example
```

- 시험은 파일 옆 `*.test.ts`다(1단계와 같음).
- `etl/`의 동작은 바꾸지 않는다. 서버가 1단계 모듈을 가져다 쓴다(필요한 이름의 `export`만 더한다: `gold.ts`의 `insideRepo`).
- 옛 프로토타입(`src/`)은 건드리지 않는다. 3단계 새 앱이 들어올 때 정리한다.

기술 스택 그림: [stack-diagram.html](stack-diagram.html)

**Structure Decision**: 저장소 하나에 `server/`, `web/ops/`, `deploy/`를 더하고 `etl/`은 그대로 둔다. 서버와 분류기가 같은 코드(부하 제한, 센서, 임베딩, 분야 목록 검사)를 나눠 쓰려면 한 저장소가 가장 단순하다.

## 만드는 순서

tasks는 이 순서를 바탕으로 한다. 이야기의 우선순위는 spec 그대로이고, 만드는 순서만 의존 관계를 따른다.

1. 바탕: compose의 db, 마이그레이션, `http.ts`, 기록, 설정, 시험 틀(시험 파일마다 새 스키마)
2. US1 넣기
3. US2 로그인·동의·처음 질문·분야
4. US4 공지·카드 행동·내 목록(홈의 선반과 거르기가 카드 행동을 쓰므로 US3 앞)
5. US3 홈: 규칙 점수와 선반 먼저, LLM 고르기와 다시 고르기 일꾼은 그다음
6. US5 나의 분석: 사실 칸 먼저, 흐름은 그다음
7. US7 운영자 판정 검토: API 먼저, 화면은 디자인 단계 뒤
8. US6 학교 데스크톱: compose 전체, systemd timer, 백업과 되살리기, 3일 운영

## 구현 전에 할 것

- `/speckit-tasks` → goldfish 리뷰(문서만 읽는 리뷰어 둘이 설계 문서를 검토하는 단계).
- 화면 디자인: 운영자 판정 검토 PC 화면 하나. 학생 화면은 3단계다. 2026-11-18 사용자 결정(astryx 컴포넌트로 바로 코드로, Figma 없이, 강조색은 기본 테마)을 따른다(R17).
- 스택 그림: [stack-diagram.html](stack-diagram.html)(2026-11-18). 학교 데스크톱의 Docker Compose 안에서 inner 네트워크(api·db·ollama)와 두 네트워크에 걸친 proxy·jobs, 바깥으로 나가는 길(jobs → 학교 공지 서버)을 그렸다.
- 구현 전 승인: 실사용 변화(학생 화면은 그대로, 운영자 판정 검토가 생김, 매일 작업이 학교 데스크톱에서 돎)와 전체 시스템 도식도를 함께 낸다.
- agent context 갱신은 없다. 이 저장소의 Spec Kit(0.12.2)에는 그 스크립트가 없다.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 운영자 화면 하나에 Vite + React + astryx | 3단계 학생 앱과 같은 틀이라 운영자 화면을 다시 만들지 않는다 | 서버가 그리는 HTML 폼은 빠르지만 3단계 앱과 따로 놀아 다시 만들게 된다 |
| 프로세스 사이 잠금(advisory lock) | 분류기·매일 작업·다시 고르기 일꾼이 한 모델을 함께 쓴다(FR-044) | 한 프로세스 안 잠금으로는 다른 컨테이너의 요청을 막지 못한다 |

## 위험

| 위험 | 대응 |
|---|---|
| CPU만으로 gemma4:12b가 느려 매일 작업이 밤 안에 끝나지 않음 | 07:00에 매일 작업은 끝내고 남은 학생은 일꾼이 낮에 잇는다. 그동안 학생은 앞의 가장 추천이나 규칙 1위를 본다(R14). 학교 데스크톱에서 작은 모델과 비교(R7) |
| 결과 파일 계약을 손 검사로 옮기다 어긋남 | 계약 시험이 스키마 규칙마다 맞는 예와 어긋난 예를 둔다(R11) |
| 통합 로그인 방식이 늦게 옴 | 그전에는 실제 학생 자료를 받지 않는다(spec 사용자 확인 2번). 로그인 자리만 바꿔 끼우면 된다(R6) |
| 화면 디자인 결정이 바뀜 | 운영자 화면만 영향받는다. API 계약은 그대로다 |
| 문지기(proxy)가 죽으면 앱이 닿지 않음 | compose의 `restart: unless-stopped`와 상태 보기 명령이 proxy까지 본다 |
