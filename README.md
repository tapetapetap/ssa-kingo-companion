# 킹고 컴패니언 (SSA)

개인 데이터로 비교과와 교과 선택을 아우르는 학교생활에서 지금 할 수 있는 최선의 선택을 돕는 에이전트의 데스크톱 웹 프로토타입이다. 지난 활동을 기록하고, 지금의 나를 알게 하고, 가장 좋은 다음 활동을 추천한다. 신청 버튼은 학생이 직접 누른다.

**라이브:** <https://tapetapetap.github.io/ssa-kingo-companion/>

> 이 저장소는 원래 학교 개발용 계정(`zest-sw`)의 비공개 저장소에서 관리하던 것을 개인 계정으로 새로 클론해 옮긴 것이다. 커밋 기록은 그대로 두었다.

화면(`src/`)은 아직 예시 데이터와 화면 안의 규칙으로만 동작한다. 공지 추천 서버는 아래 [서버(2단계)](#서버2단계)에 있고, 화면과는 3단계에서 잇는다.

## 화면

주소는 해시(`#/…`)다. 사이드바는 메뉴 5개 1단이고, 하위 화면은 페이지 머리 아래 구역 탭이 맡는다.

| 화면 | 주소 | 하위·흐름 |
|---|---|---|
| 홈 | `#/home` | 가입 인터뷰는 처음 한 번 홈 자리에서 열린다 |
| 추천 | `#/recommend` | 탭 `?tab=all`(전체 기회), 모달 `?open=<기회 id>`, 신청 준비 `#/recommend/prepare/<id>` |
| 교과 지도 | `#/courses` | 과목 서랍 `?drawer=course:<학수번호>`, 진로 방향은 화면 안에서 고른다 |
| 내 활동 | `#/activities` | 일정 `/schedule`, 기록 `/records`, 회고 인터뷰 `/records/interview[/<활동 id>]`, 경험 카드 묶음 `/records/portfolio` |
| 나의 분석 | `#/analysis` | `/techtree`, `/map`, `/flow`, `/strengths` |
| 내 프로필 | `#/profile` | `/friends`, `/recruit`, `/hall`. 사이드바 아래 학생 카드로 연다 |
| 설정 | `#/settings/<id>` | 톱니바퀴로 연다 |
| 컴포넌트 목록 | `#/_kit` | 개발용, 사이드바에 없다 |

옛 주소는 새 자리로 넘어간다(`src/app/router.ts` 의 `MOVED`).

## 개발

Node.js 24 이상(`.nvmrc`: 24).

```sh
npm ci                 # 처음 한 번
npm run dev            # 개발 서버
npm run check          # 타입 검사 + 단위 테스트
npm run build          # 배포 빌드 (dist/)
npm run audit:layout   # 모든 경로 × 크기 × 학생 상태 레이아웃 검사 (Playwright, 처음 한 번 npx playwright install chromium)
npm run audit:copy     # 보이는 글자의 기호·금지어·가운뎃점 사슬 검사
npm run audit:entries  # 같은 목적지로 가는 진입점 수 검사
```

`main` 은 `check` 와 `build` 가 통과하는 상태로 둔다. CI(`.github/workflows/ci.yml`)가 PR 마다 `check`, `build`, `audit:layout`, `audit:copy` 를 돌린다. PR 마다 Claude Code 의 code-review 플러그인(`.github/workflows/claude-review.yml`)이 정확성·보안 리뷰를 인라인 댓글로 남긴다(저장소 시크릿 `CLAUDE_CODE_OAUTH_TOKEN` 과 Claude GitHub App 필요). 작업은 브랜치에서 하고 PR 로 병합한다. 커밋 메시지는 `영역: 무엇을 왜` 한 줄이다.

폭별 확인은 `/qa-frame.html?w=1440&path=%23%2Frecommend` 로 한다(1280, 1440, 1920 에서 완성, 1024 는 깨지지만 않으면 된다).

## 서버(2단계)

`server/`는 공지 추천 서버(Node 24 이상, Postgres + pgvector, Ollama)다. `web/ops/`는 운영자 판정 검토 화면(`/ops/`)이다. 설계는 [specs/20261117-052701-backend-skeleton](specs/20261117-052701-backend-skeleton)에 있고, 끝까지 돌려 보는 순서는 그 폴더의 [quickstart.md](specs/20261117-052701-backend-skeleton/quickstart.md)에 있다.

### 개발 맥

```sh
cp .env.example .env                              # 개발 DB 값이 채워져 있다. 커밋하지 않는다
docker compose -f deploy/compose.dev.yaml up -d   # 개발·시험용 DB(127.0.0.1:54329)
npm run cli -- migrate
npm run cli -- ingest etl/out/cse-notices.json --taxonomy custom
npm run cli -- account create dev1@example.com    # 비밀번호는 표준 입력
npm run build:ops                                 # 운영자 화면(web/ops/dist)
npm run server                                    # http://localhost:8080, /ops/
```

Ollama는 맥에서 바로 띄우고 `gemma4:12b`와 `bge-m3`를 받아 둔다. Ollama가 꺼져 있어도 가장 추천은 규칙으로 나온다. 운영자 화면은 `KINGO_OPERATORS_FILE`(꼴: `deploy/operators.example.json`)에 있는 계정만 들어간다. DB 시험이 들어 있는 `npm run check`도 개발 DB가 떠 있어야 돈다.

### 학교 데스크톱

`deploy/`의 compose 묶음(db, ollama, api, proxy, jobs)으로 띄운다. 바깥에 열리는 것은 문지기(Caddy, `KINGO_PORT`, 기본 8080)뿐이고 api·db는 바깥 인터넷에 닿지 않는 내부 네트워크에 있다. 매일 03:00에 `kingo-daily.timer`가 매일 작업을 돌린다. 처음 올리는 순서는 quickstart의 '6. 학교 데스크톱'이다.

- 호스트 값: `deploy/.env`(`KINGO_PORT`, `KINGO_BACKUP_HOST_DIR`). 컨테이너 값: `deploy/kingo.env`(꼴: `deploy/kingo.env.example`). 둘 다 커밋하지 않는다.
- 명령은 jobs 컨테이너에서 부른다: `docker compose -f deploy/compose.yaml run --rm jobs node server/cli.ts <명령>`

### 명령

`npm run cli -- <명령>`(학교 데스크톱은 위의 jobs 컨테이너). 꼴과 답은 [contracts/cli.md](specs/20261117-052701-backend-skeleton/contracts/cli.md)에 있다.

| 명령 | 하는 일 |
|---|---|
| `migrate` | 스키마 바꾸기를 번호 순서로 적용 |
| `ingest <결과 파일> --taxonomy <id> [--switch] [--dry-run]` | 분류기 결과 파일과 분야 목록을 검사하고 넣기. 운영자가 고친 값은 남는다 |
| `account create\|password\|delete <이메일>` | 개발 계정 만들기·비밀번호 다시 정하기·지우기(학생 자료까지) |
| `daily [--skip-classifier]` | 매일 작업 한 번: 다시 판정 표시 → 분류기 → 넣기 → 백업 → 사실 칸 → 흐름 → 가장 추천 다시 고르기 |
| `backup` / `restore <백업 파일>` | 백업 한 번(7일 지난 것은 지움) / 빈 DB에 되살리기 |
| `status` | DB·마지막 매일 작업·마지막 넣기·모델 서버·api가 닿는지 다섯 줄로 |
| `export-gold <폴더>` | 운영자가 고친 공지를 정답셋 후보 CSV로 내보내기(저장소 밖 폴더만) |

## PR 리뷰

PR 을 열거나 커밋을 더 올리면 두 가지가 돈다.

| 무엇 | 어디서 | 막는가 |
|---|---|---|
| 타입 검사, 단위 테스트, 빌드, 레이아웃 검사, 문구 검사 | `.github/workflows/ci.yml` | 실패하면 병합하지 않는다 |
| Claude Code 리뷰(정확성·보안) | `.github/workflows/claude-review.yml` | 인라인 댓글로 남긴다. 확인하고 고치거나 이유를 답한다 |

Claude 리뷰는 같은 저장소 브랜치에서 연 PR 에서만 돈다(포크 PR 에는 시크릿이 넘어가지 않는다).

## 문서 지도

| 알고 싶은 것 | 문서 |
|---|---|
| 무엇을 왜 만드나 | 팀 Notion [서비스 철학·컨셉 정리](https://app.notion.com/p/3f4b044fa973801d8d70e04f32e80648) |
| 무엇을 언제 정했나 | 팀 Notion [결정 로그](https://app.notion.com/p/c9390f302a6c4b15803edee55e252813) |
| 기능별 설계 | [specs/](specs) |
| 조사 자료 | [docs/research/](docs/research) |
| 화면 점검 기록 | [docs/qa/](docs/qa) |

`docs/history/` 는 v0.5 이전 기획이라 보존만 하고 따르지 않는다. 루트 `qa/` 는 이전 버전 검수 기록이다.

## 코드 위치

```
src/
  app/          앱 틀: 사이드바, 해시 라우터, 전역 상태(useApp), 컴포넌트 목록(kit/)
  components/   공용 UI. components/index.ts 에서만 가져온다
  domain/       추천 규칙, 발견 생성 같은 순수 로직과 테스트, 공용 타입
  data/         예시 데이터
  screens/      화면별 폴더. <이름>/index.tsx 의 default export 가 그 화면이다
  styles/       tokens.css (색·간격·글자 토큰), base.css
scripts/        audit-layout, audit-copy
```

색, 간격, 글자는 `src/styles/tokens.css` 변수만 쓴다. 상태는 `useApp()` 하나로 읽고 쓴다.

## 데이터 원칙

- 저장소에는 예시 데이터만 둔다. 실제 학생 기록, 학번과 이름, 토큰과 키는 넣지 않는다.
- 채용 공고 요건은 2026-10-08 직접 확인한 카카오뱅크 공개 공고 3건이며 직무 참고용이다.
- 프로필은 기본 비공개다. 발견과 역량 근거는 공개하지 않고, 학생이 확인한 발견만 추천에 쓴다.

## 버전

v0.7 까지는 모바일(390px) 기준이었다. 2026-10-12 결정으로 데스크톱 웹으로 다시 지었고, 지금은 v3.x 다. 태그는 `prototype-v0.3` ~ `prototype-v0.7` 이 있고, 옛 화면 코드는 `git show prototype-v0.7:src/App.tsx` 처럼 본다. 변경 이유는 팀 Notion [결정 로그](https://app.notion.com/p/c9390f302a6c4b15803edee55e252813)에 있다.
