# Quickstart: 2단계가 되는지 확인하기

구현이 끝난 뒤 이 순서대로 돌려 본다. 명령과 답의 꼴은 [contracts/cli.md](contracts/cli.md), [contracts/api.md](contracts/api.md), 표는 [data-model.md](data-model.md)를 본다.

## 준비

- Docker(Compose 포함), Node 22.18 이상, 저장소 루트에서 `npm install`
- 개발 맥: Ollama를 맥에서 바로 띄우고 `gemma4:12b`, `bge-m3`를 받아 둔다. 학교 데스크톱: compose의 `ollama` 서비스
- `.env`: `.env.example`을 `.env`로 복사한다(커밋되지 않는다). 개발 DB 값이 채워져 있어 그대로 쓴다. npm 스크립트(`npm run server`, `npm run cli`)가 이 파일을 읽는다
- 1단계 결과 파일 `etl/out/cse-notices.json`과 분야 목록 `etl/taxonomy/<id>.json`, 1단계 벡터 보관(`etl/.cache/embed`)

```sh
docker compose -f deploy/compose.dev.yaml up -d   # 개발·시험용 DB(127.0.0.1:54329)
npm run cli -- migrate
```

## 1. 넣기(US1, SC-001, SC-002)

```sh
npm run cli -- ingest etl/out/cse-notices.json --taxonomy custom
npm run cli -- ingest etl/out/cse-notices.json --taxonomy custom
```

- 첫 번째: 요약에 `새 126`(2026-11-10 파일 기준)이 나오고, 공지 수와 분야 수가 파일과 같다.
- 두 번째: `새 0 · 바뀜 0`.
- 결과 파일의 복사본에 분야 칸을 손으로 더해(머리에 `"taxonomy": { "id": "custom", "prompt": "00000000" }`, 한 기회에 `"fields": { "core": ["web-x"], "related": [] }`와 `"fieldRule": "LLM: gemma4:12b"`) 넣으면 거절되고, DB의 공지 수가 그대로다(지금 결과 파일에는 분야 칸이 없다).
- `--taxonomy ncs`로 다시 넣으면 `--switch`를 붙이라는 글과 함께 거절된다.

## 2. 첫 흐름(US2, SC-003)

```sh
npm run cli -- account create dev1@example.com   # 비밀번호는 표준 입력
npm run server   # 개발 모드, http://localhost:8080
```

curl로 `login → consent → answers → fields → home`을 차례로 부른다(쿠키는 `-c`·`-b` 파일. 상태를 바꾸는 요청은 `content-type: application/json`과 서버 주소와 같은 `origin` 머리가 있어야 한다).

- 로그인 직후 `next`는 `consent`, 동의 전 `PUT /api/me/answers`는 `consent_required`다.
- 분야 2개는 `too_few_fields`, 3개는 저장되고 `next`가 `home`이다.
- 바로 `GET /api/home`에 `pick`이 있다. Ollama를 꺼도 `method: "규칙"`으로 있다(SC-004).
- 비밀번호를 5번 틀리면 맞게 해도 15분 동안 `locked`다.

## 3. 홈·공지·내 목록(US3·US4)

- 관심 있어요 하나 → `GET /api/me/list`에 있고, `similar` 선반이 차기 시작한다.
- 다시 볼 날을 모레로 나중에 보기 → 그 전날(내일)까지 공지 목록과 홈에 없고 내 목록에 있다. 다시 볼 날부터 다시 나온다. 다시 볼 날을 닫히는 날 뒤로 보내면 `invalid`.
- 가장 추천 공지에 관심 없음 → 바로 홈을 열면 그 공지가 아니고 `repicking: true`.
- 홈과 공지 목록 답에 점수·유사도 칸이 없다(SC 계약 시험).

## 4. 나의 분석(US5, SC-013)

- 직접 넣은 활동 하나 → `GET /api/me/analysis`에 `act:<번호>` 줄이 생기고 판이 오른다.
- 핵심 분야가 같은 공지 두 곳에 관심 없음(관심 없는 분야예요) → `disliked:<분야>` 줄. 한 곳이면 없다.
- 같은 분야 관심 있어요를 더 눌러도 판이 그대로다.
- 줄 빼기 → 분석과 가장 추천의 `cited`에서 바로 빠진다. 되살리면 돌아온다.
- 활동을 하나 더 넣은 뒤 `npm run cli -- daily --skip-classifier` → 흐름 2~4줄이 생기고 모든 `refs`가 지금 사실 줄 키다. Ollama를 끄고 다시 돌리면 앞 흐름이 남고 요약에 실패 수가 남는다.
- `GET /api/me/analysis.md`가 `md`와 같은 글이다.

## 5. 운영자 판정 검토(US7, SC-014)

- 운영자 목록에 없는 계정의 `/api/ops/review`는 `forbidden`이다.
- 확인할 것의 한 공지 종류와 핵심 분야를 고침 → 학생의 `GET /api/notices/:id`에 바로 바뀌고 `fields.by`가 '운영자'다.
- 같은 결과 파일을 다시 넣음 → 고친 값이 남고 요약에 `사람 판정 유지 1`.
- `/ops/` 화면에서 같은 일을 손으로 한 번 끝까지 해 본다(화면 디자인 단계 뒤).

## 6. 학교 데스크톱(US6, SC-006, SC-009, SC-012)

```sh
cd /opt/kingo   # 저장소를 둔 곳. systemd service의 WorkingDirectory도 여기다
docker compose -f deploy/compose.yaml --profile setup run --rm ollama-pull   # 처음 한 번: 모델 받기
docker compose -f deploy/compose.yaml up -d db ollama
docker compose -f deploy/compose.yaml run --rm jobs node server/cli.ts migrate     # 판을 올릴 때마다 api 시작 전에
docker compose -f deploy/compose.yaml run --rm jobs node etl/notices/run.ts       # 첫 결과 파일
docker compose -f deploy/compose.yaml run --rm jobs node server/cli.ts ingest etl/out/cse-notices.json --taxonomy custom   # 활성 목록
docker compose -f deploy/compose.yaml up -d api proxy
sudo systemctl enable --now kingo-daily.timer
docker compose -f deploy/compose.yaml run --rm jobs node server/cli.ts status   # 운영 db는 포트를 열지 않아 jobs 컨테이너에서 본다
```

- 3일 동안 손대지 않고 `status`와 `daily_runs`에 날마다 요약이 남는지 본다.
- 바깥 연결: api 컨테이너 안에서 바깥 주소로 연결을 시도하면 실패한다(`inner`가 internal 네트워크). 앱은 proxy가 연 8080으로 닿는다. 학교 공지 서버에는 jobs의 분류기만 1초 1건이다.
- 부하: 요약의 GPU 평균 80% 이하, 최고 온도 80°C 이하. 리눅스 CPU 패키지 온도가 실제로 읽히는지 본다(1단계가 넘긴 확인).
- 백업 되살리기: db 컨테이너에서 `createdb -U kingo kingo_restore`로 빈 DB를 만들고, jobs에서 `DATABASE_URL`을 그 DB로 바꿔 `restore /backup/<어제 파일>` → 학생·행동·분석 행 수가 백업 때와 같다. 끝나면 그 DB를 지운다.

## 7. 지키는 것(SC-008, SC-010, SC-011)

- `npm run check`(타입 검사와 vitest. DB 시험은 Docker의 Postgres를 씀)가 통과한다.
- 운영 모드(`KINGO_MODE=prod`)로 띄우면 켜진 로그인 방식이 없어 서버가 시작하지 않고 이유가 나온다. 운영 모드에서 개발 로그인이 `login_off`인 것과 개발용 동의 문구로는 시작하지 않는 것은 자동 시험이 본다(시험용 로그인 방식을 켠 운영 모드 서버, tasks T027).
- 계정 지우기 뒤 그 학생의 행이 모든 학생 표에서 0이다. 7일 뒤 백업 폴더에서도 그 이전 파일이 지워져 있다.
- 서버 기록(`docker compose logs api`)에 비밀번호·토큰·프롬프트·분석 글·활동 이름이 없다(시험이 금지어를 찾음).
