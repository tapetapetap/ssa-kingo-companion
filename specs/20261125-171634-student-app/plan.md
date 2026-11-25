# Implementation Plan: 3단계 새 학생 앱과 마감 알림, 운영자 모니터링·임베딩 지도·모델 바꾸기

**Branch**: `spec/student-app` | **Date**: 2026-11-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/20261125-171634-student-app/spec.md`

## Summary

2단계 서버 위에 학생 앱(`web/app`, Vite + React + astryx)을 더하고 서버가 `/`에서 준다. 마감 알림은 구독을 api가 받고 jobs가 09:00에 `web-push`로 보낸다(R4~R8). 운영자 화면에 모니터링·임베딩 지도·모델 바꾸기를 더한다(R9~R15). 학생 API는 로그인 방식 알려 주기와 기기 구독, `/api/me`의 칸 둘, 로그인할 때 앞 세션 지우기만 더한다.

이 계획에서 가장 조심할 것은 둘이다. (1) 모델을 바꿔도 앞 판정이 그대로여야 한다: 보관 답이 모델별 폴더라 그냥 바꾸면 공지 전부를 다시 판정한다(R14). (2) 구독 주소는 학생이 보내는 값이고 jobs는 안쪽 서버에 닿는다: 정한 푸시 서버만 받는다(R5).

## Technical Context

**Language/Version**: TypeScript, Node 24(타입 제거로 실행), 앱은 Vite 8 + React 19

**Primary Dependencies**: 새 실행 의존성 `web-push@4.0.0`(정확한 판). 새 dev 의존성 `axe-core`(접근성 자동 검사). 나머지는 있는 것(`@astryxdesign/core`, `postgres`, `playwright`)

**Storage**: Postgres 17 + pgvector. 새 표 8개(마이그레이션 009·010, [data-model.md](data-model.md))

**Testing**: vitest(순수 함수·API·DB), Playwright 스크립트(`e2e:app`), 실제 기기는 손

**Target Platform**: 휴대폰 브라우저(iOS 16.4+, 안드로이드 크롬)와 PC 브라우저. 서버는 2단계와 같음

**Project Type**: 웹 앱 + API + 운영 명령 + 운영자 웹 페이지

**Performance Goals**: 홈·공지 첫 화면 2초(SC-002), 행동 표시 0.1초, 알림 09:10까지(SC-005), 지도 1분(SC-009)

**Constraints**: api는 바깥에 닿지 않음. 학생 자료·공지를 기기에 보관하지 않음(FR-004). 부하 제한 GPU 80%·80°C와 한 번에 하나(2단계 FR-044) 그대로. 학교 서버 1초 1건. 저장소에 키·학생 자료·정답셋 없음

**Scale/Scope**: 시범 수십 명, 앱 화면 부품 13개(주소 16개), 새 API 경로 11개, 새 명령 3개

## Constitution Check

`.specify/memory/constitution.md`는 빈 틀이라 2단계와 같은 문으로 본다.

| 문 | 이 plan | 결과 |
|---|---|---|
| 새 의존성은 꼭 필요할 때만 | 실행은 `web-push` 하나(사용자 결정 A안: 암호화를 직접 쓰지 않음), dev는 `axe-core` 하나(SC-003) | 통과(R4, R19) |
| 학생 자료는 서버 밖으로 안 나감 | 알림만 바깥으로 간다: 공지 제목·마감만, 암호화, 학생이 켠 것만, 동의 문구에 적음(사용자 결정) | 통과(R4~R8) |
| 예시 자료 없음 | 앱에 예시 없음. e2e 자료는 시험 스키마에만 | 통과(R19) |
| 시험 먼저 | 순수 함수·API·명령은 시험 먼저. 화면은 e2e | 통과 |
| 비밀·개인정보는 저장소 밖 | 키는 `kingo.push.env`, 정답셋은 읽기 전용 볼륨. 출력만 하는 `push-keys` | 통과 |
| 부하 제한 하나 | 재기는 글마다 모델 잠금, 밤 시간만 | 통과(R15) |
| 과설계 없음 | 라우터·상태·차트 라이브러리 없음, 답 하나로 모니터링 네 메뉴 | 통과 |

설계 뒤 다시 봤다: 그대로 통과다.

## Project Structure

### Documentation (this feature)

```text
specs/20261125-171634-student-app/
├── spec.md
├── plan.md              # 이 파일
├── research.md          # R1~R20
├── data-model.md
├── quickstart.md
├── contracts/{api.md, app.md, cli.md, design.md, screens.md}
├── stack-diagram.html
└── tasks.md
```

### Source Code (repository root)

```text
web/app/                    # 새 학생 앱
├── vite.config.ts, index.html
├── public/                 # sw.js, manifest.webmanifest, 아이콘
└── src/
    ├── main.tsx            # 들어올 때 규칙(contracts/app.md 1·2), 틀, 메뉴
    ├── route.ts            # 주소 ↔ 화면, 자리 기억
    ├── api.ts              # 요청과 오류(web/ops/src/api.ts와 같은 꼴)
    ├── theme.ts            # kingo 테마
    ├── lib/                # date.ts(D-n·학기 제안), list.ts(내 목록 순서), push.ts, draft.ts, values.ts
    ├── parts/              # NoticeCard, ActionBar, FieldPicker, ActivityForm, States(빈·실패·불러오는 중)
    └── screens/            # Login, Consent, Answers, Fields, Home, Notices, NoticeDetail, List, Me, Prompt, Analysis, Activity, Push
web/ops/src/                # Monitor.tsx, Daily.tsx, Service.tsx, EmbedMap.tsx, Models.tsx, Shell.tsx(메뉴·띠) 더함
server/
├── http.ts                 # staticFile, 앱 내주기, onError
├── push/                   # web-push.d.ts, endpoint.ts(R5), routes.ts, targets.ts, message.ts, send.ts(notify)
├── ops/                    # monitor.ts, alerts.ts, counts.ts, requests.ts, map.ts, tsne.ts, models.ts, trial.ts
├── jobs/daily.ts           # map·counts 단계, kingo:daily 잠금, 분류기 환경
├── model.ts                # currentModel, installedModels, openUnlocked
└── db/migrations/009_push.sql, 010_ops.sql
etl/notices/{llm,fields,run}.ts, etl/taxonomy/taxonomy.ts   # 앞 모델 보관 답 읽기, 실제 판정한 모델 이름, 요약JSON, fieldGate
scripts/e2e-app/run.mjs
deploy/                     # kingo-notify.*, kingo-requests.*, compose(gold·push env), Dockerfile(build:app), kingo.env.example, consent.dev.md(dev-2)
```

**Structure Decision**: 2단계의 `web/ops`·`server`·`deploy` 자리를 그대로 쓰고 `web/app`만 더한다. `etl/`은 모델 바꾸기에 필요한 네 파일만 고친다. 옛 `src/`는 건드리지 않는다.

기술 스택 그림: [stack-diagram.html](stack-diagram.html)(푸시 서버가 새 바깥 의존성이라 만든다).

## 만드는 순서와 PR

| PR | 담는 것 | 이야기 |
|---|---|---|
| A | 앱 내주기(R2), 앱 뼈대·테마·주소·상태 화면, 로그인 방식, 처음 흐름, e2e 틀 | US1 |
| B | 홈, 공지 목록·자세히 | US2 |
| C | 카드 행동, 내 목록 | US3 |
| D | 나, 나의 분석, 활동, 새 학기 | US4 |
| E | 설치, 구독, `notify`, 동의 문구 dev-2 | US5 |
| F | 운영자 요청, 매일 작업 더하기, 모니터링 화면 | US6 |
| G | 임베딩 지도 | US7 |
| H | 앞 모델 보관 답, 모델 재기, 모델 화면 | US8 |
| I | 다듬기: impeccable, 문구, 성능, 문서 | |

PR마다: 시험 → 구현 → (화면이 바뀌면) `impeccable audit`·`polish` → `ponytail-review` → `/code-review` → PR → CI → Claude 리뷰 → 머지. E와 H는 `/security-review`도 한다(E는 바깥 주소, H는 모델·정답셋).

## 구현 전에 할 것

- `/speckit-tasks` → goldfish 리뷰 → 구현 전 승인(2-1): 2026-11-25에 사용자가 모두 추천안대로 승인했다.
- 동의 문구 초안(Claude Docs)에 FR-040 문장을 더한다.
- agent context 갱신은 없다(2단계와 같음).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| 앞 모델 보관 답을 읽는 길(`KINGO_LLM_OLDER`) | 모델을 바꿔도 앞 판정이 그대로여야 한다(FR-055) | 지금 모델 폴더만 읽으면 바꾸는 날 공지 전부를 다시 판정한다. 결과를 DB에서 되읽게 하면 분류기가 DB에 묶인다 |
| 직접 쓴 t-SNE 약 60줄 | 지도 시안([운영자 임베딩 지도](https://claude.ai/artifact/8Mdj7g1CwejvUDQdkgM3Ki))이 t-SNE다 | 라이브러리는 새 의존성이고 PCA는 지도 시안과 다르다 |
| 10분 타이머와 요청 표 | api가 컨테이너를 켤 수 없다 | docker 소켓을 api에 주면 루트 권한이다 |

## 위험

| 위험 | 대응 |
|---|---|
| 푸시를 HTTPS 주소 전에 실제 기기로 못 봄 | 개발 컴퓨터로 만들고 FR-070 (5)를 출시 조건으로 둔다 |
| 학교 방화벽이 푸시 서버로 나가는 연결을 막음 | 전산 문의에 네 주소를 함께 적는다(후속 작업). 막히면 알림만 '준비 중' |
| CPU 재기가 여러 밤 걸림 | 이어 하기와 진행 표시(R15). 모델마다 최대 240건(분야 120 + 기회 120) |
| astryx의 휴대폰 화면 부품이 모자람 | 시안이 astryx로 그려져 있어 쓴 부품을 그대로 쓴다. 모자라면 astryx 토큰으로 작은 부품을 짠다 |
| 명세가 커서 검토가 길어짐 | PR 아홉으로 나누고 A~D까지면 학생 화면이 온전히 돈다 |
