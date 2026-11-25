# Research: 3단계 새 학생 앱·마감 알림·운영자 기능

결정마다 정한 것, 까닭, 버린 것을 적는다. 2단계 결정은 [2단계 research](../20261117-052701-backend-skeleton/research.md)의 R번호로 부르지 않고 '2단계 R7'처럼 적는다.

## R1. 앱 틀: `web/app`, Vite + React + astryx, 덩어리 하나

- **정한 것**: `web/ops`와 같은 꼴(`web/app/vite.config.ts`, `base: '/'`, `outDir: 'dist'`, 개발 서버는 `/api`를 넘김). 라우터·상태·데이터 라이브러리를 들이지 않는다. 주소는 History API로 다루는 작은 모듈(`web/app/src/route.ts`)이고, 화면 사이에 남길 것(공지 목록의 받은 쪽·스크롤 자리)은 그 모듈의 메모리 Map에 주소를 열쇠로 둔다. 덩어리를 나누지 않는다(새 판이 올라간 뒤 옛 앱이 없는 덩어리를 부르는 일이 없다).
- **까닭**: 화면 12개, 주소 꼴 12개다. 저장소의 새 의존성을 `web-push` 하나로 둔다(사용자 결정 A안).
- **버린 것**: react-router(화면 수에 비해 큼), 옛 `src/` 되살리기(예시 자료 구조).

## R2. 파일 내주기: `/ops/`를 넓혀 `/`까지

- **정한 것**: `server/http.ts`의 `opsFile`을 `staticFile(dir, rel)`로 바꿔 함께 쓴다. 순서는 (1) `GET /ops…` → `web/ops/dist`, (2) `/api/…` → 경로 표, (3) 그 밖의 `GET` → `web/app/dist`. (3)에서 파일이 없고 마지막 조각에 확장자가 없으면 `index.html`, 확장자가 있으면 404다. 폴더 밖을 가리키면 404다. `GET`이 아닌 (3)은 404다.
- 머리: 모든 파일에 `x-content-type-options: nosniff`, `referrer-policy: same-origin`. `index.html`에는 `content-security-policy: default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'`(astryx가 인라인 style을 쓴다). `/assets/*`는 `cache-control: public, max-age=31536000, immutable`, 나머지(`index.html`, `sw.js`, manifest)는 `no-cache`.
- `TYPES`에 `.webmanifest`(application/manifest+json), `.png`, `.svg`, `.woff2`를 더한다.
- **까닭**: 이미 있는 코드의 일반화다. 문지기(Caddy)가 파일을 주면 배포 자리가 둘이 된다.

## R3. 서비스 워커: 직접 쓴 파일 하나

- **정한 것**: `web/app/public/sw.js`. (1) 화면 이동 요청은 네트워크 먼저, 실패하면 보관한 `/index.html`. (2) `/assets/*`는 보관 먼저. (3) `/api/*`와 `/ops/*`는 건드리지 않는다(보관 0). (4) `push`: 받은 JSON `{ title, body, url, tag }`로 알림을 띄운다. 꼴이 틀리면 제목 '킹고 컴패니언', 글 '확인할 공지가 있어요', 주소 `/list`로 띄운다(iOS는 push마다 알림이 보여야 한다). (5) `notificationclick`: 열린 앱 창이 있으면 그 창을 `url`로 옮기고 앞으로, 없으면 새 창. `url`은 같은 출처의 경로만 따른다. (6) `install`에서 `skipWaiting`, `activate`에서 앞 판 보관 지우기와 `clients.claim`. 보관 이름은 빌드 때 바뀌지 않는 고정 이름 `kingo-shell-1`이고 `index.html`은 이동 때마다 새로 담는다.
- **버린 것**: `vite-plugin-pwa`(B안).

## R4. 웹 푸시: `web-push@4.0.0`(정확한 판), 보내기는 jobs

- **정한 것**: `web-push` 4.0.0(2026-11-06, ESM, 의존성 넷)을 정확한 판으로 둔다. 타입이 없어 쓰는 것만 `server/push/web-push.d.ts`에 선언한다(`sendNotification`, `generateVAPIDKeys`, `WebPushError.statusCode`). 부르는 곳은 `server/push/send.ts` 하나다(`server/outbound.test.ts`가 지킨다). 제한 시간 10초, `TTL`은 그날 24:00까지 남은 초, `urgency: 'normal'`, 암호화 aes128gcm(기본). 다시 보내기·따라가기(redirect)는 없다(라이브러리가 따라가지 않는다).
- 키: `KINGO_PUSH_PUBLIC_KEY`·`KINGO_PUSH_PRIVATE_KEY`(`node server/cli.ts push-keys`가 두 줄을 출력만 한다. 파일에 쓰지 않는다), `KINGO_PUBLIC_URL`(예: `https://kingo.example.ac.kr`). VAPID subject는 `KINGO_PUBLIC_URL`이다(개인 이메일을 쓰지 않는다). 셋 중 하나라도 없으면 알림이 '준비 중'이다. 공개 키만 api가 준다. 개인 키는 api에 주지 않는다: compose가 jobs에만 `kingo.push.env`를 더 읽게 하고(`env_file: [kingo.env, {path: kingo.push.env, required: false}]`), 공개 키와 `KINGO_PUBLIC_URL`은 `kingo.env`에 둔다.
- **까닭**: api는 inner에만 있어 바깥에 닿지 못하고(2단계 R16), jobs는 이미 inner·outer에 걸쳐 있다.

## R5. 받는 푸시 서버 목록

- **정한 것**: `https:`, 포트 없음(443), 사용자 이름·비밀번호 없음, host가 `fcm.googleapis.com` 또는 `.push.apple.com`·`.push.services.mozilla.com`·`.notify.windows.com`으로 끝남, 길이 1,000자 이하. 아니면 422 `invalid`(field `endpoint`). 보낼 때 한 번 더 본다. `p256dh`는 base64url 65바이트, `auth`는 16바이트를 확인한다.
- **까닭**: 구독 주소는 학생이 보내는 값이고 jobs는 안쪽 DB·Ollama에도 닿는다(SSRF).

## R6. 구독은 로그인(세션)에 붙는다

- **정한 것**: `push_subscriptions.token_hash`가 `sessions`를 `on delete cascade`로 가리킨다. 로그아웃·계정 지우기는 있는 코드로 함께 지워진다. 30일 만료는 보내기 직전에 `last_used_at`으로 거르고 만료된 세션을 지운다(`notify`의 첫 일). 세션마다 하나(unique), 주소마다 하나(unique): 같은 주소를 다른 학생이 켜면 앞 행을 지우고 새로 넣는다. 학생마다 10대를 넘으면 오래된 것부터 지운다.
- `POST /api/login`은 요청 쿠키에 앞 세션이 있으면 그 세션을 지운 뒤 새 세션을 만든다(한 기기를 두 학생이 쓰는 경우).
- 지금 판의 동의를 마친 학생에게만 보낸다.

## R7. 알림 보내기 `notify`

- **정한 것**: `node server/cli.ts notify`. `kingo-notify.timer`가 09:00(Asia/Seoul, `Persistent=true`)에 부른다. 09:00 전이거나 21:00 뒤면 아무것도 보내지 않고 0으로 끝난다. 프로세스 사이 advisory 잠금 `kingo:notify` 하나.
- 대상 질의 하나(한국 날짜 `today`): `actions.kind='like'`이고 `notices.deadline in (today, today+3)`, 또는 `kind='later'`이고 `revisit_on = today`. 공통: `is_notice and not down and closes_on >= today`. `notices.deadline`은 사람 판정이 반영된 보이는 값이다(2단계 R22).
- 기기마다: (1) 대상을 다시 질의한다(보내기 직전), (2) `push_sent`에 공지마다 `sending`으로 넣는다(`on conflict do nothing`), 넣어진 것만 묶는다, 없으면 건너뛴다, (3) 보낸다, (4) 2xx면 `sent`, 404·410이면 구독을 지우고 `gone`, 그 밖과 시간 초과는 `failed`. 프로세스가 (3)에서 죽으면 `sending`으로 남고 다시 보내지 않는다(많아야 한 번).
- 첫 바퀴가 끝나고 `failed`가 있으면 10분 뒤 한 번 더 보낸다(`failed` 행을 `sending`으로 바꾸고 같은 길). 그 뒤 그만둔다.
- 끝에 30일 지난 `push_sent`를 지운다. 출력은 숫자 한 줄(보냄·실패·사라짐·건너뜀)이고 제목·주소를 남기지 않는다.

## R8. 알림 글

- **정한 것**(순수 함수 `message(items)`): 제목은 대상이 하나면 그 공지 제목(40자에서 '…'), 둘 이상이면 '오늘 마감 1개, 3일 뒤 마감 2개'처럼 종류별 개수(있는 것만, 오늘 → 3일 뒤 → 다시 볼 공지). 글은 하나면 '오늘 마감'·'3일 뒤 마감'·'다시 볼 날이에요', 둘 이상이면 제목 셋까지 줄마다와 '외 n개'. `url`은 하나면 `/notices/<id>`, 아니면 `/list`. `tag`는 `kingo-<날짜>`(같은 날 다시 와도 겹쳐 보이지 않게).

## R9. 운영자 요청과 10분 타이머

- **정한 것**: 표 `op_requests`와 `node server/cli.ts requests`. `kingo-requests.timer`가 10분마다 부른다(`OnCalendar=*:0/10`). 한 번 부르면 (1) `daily`가 기다리면 `runDaily`를 돌린다, (2) `model_trial`이 기다리거나 멈춰 있고 밤 시간이면 `runTrial`을 밤 시간이 끝날 때까지 돌린다. 타이머 서비스는 `Type=oneshot`이라 도는 동안 다시 시작되지 않는다.
- 매일 작업 하나만: `runDaily`의 처음에 advisory 잠금 `kingo:daily`를 세션으로 잡고(기다림), 끝나면 놓는다. 정해진 매일 작업과 한 번 더 돌리기가 겹치면 뒤의 것이 기다린다.
- `running`으로 남은 채 죽은 요청: `requests`가 시작할 때 자기 잠금(`kingo:requests`)을 잡은 뒤 남은 `running`을 `daily`는 `failed`('도중에 끝났어요'), `model_trial`은 `paused`로 되돌린다.
- **버린 것**: api에서 컨테이너 켜기(docker 소켓은 루트 권한), 앱 안 스케줄러.

## R10. 매일 작업에 더하는 것

- **정한 것**: 단계 순서 `rejudge → classifier → ingest → map(새) → backup → facts → flow → counts(새) → repick`. `map`은 R13, `counts`는 어제(한국) 숫자를 `daily_counts`에 남긴다(R12). 둘 다 실패해도 다음을 잇는다(있는 `step` 틀).
- 분류기 숫자: 분류기에 `KINGO_RUN_JSON=1`을 주면 표준 출력 마지막에 `요약JSON: {…}` 한 줄을 더 낸다(`fetched, opportunity, not, review, merged, deadlineBlank, llm: {cached, fresh, failed, skipped}, field: {cached, fresh, failed, notAsked, empty} | null, fieldReason`). `steps.classifier`에 그대로 담는다. 없거나 읽지 못하면 비운다(단계는 실패가 아니다).
- 잠금: 앞의 R9.

## R11. 운영자 숫자 `GET /api/ops/monitor` 하나

- **정한 것**: 네 메뉴(개요, 수집·판정, 매일 작업, 서비스 지표)가 답 하나를 나눠 쓴다(계약은 contracts/api.md). 실패 띠는 순수 함수 `alerts(runs, now)`가 만든다: 최근 두 매일 작업에서 분류기(또는 넣기)가 실패 → 그 단계, 최근 두 번 `(llm.failed + llm.skipped + field.failed + field.notAsked) * 10 > 판정 수` → '판정 실패', 마지막 `ended_at`이 36시간보다 앞 → '매일 작업이 멈췄어요'. `since`는 잇단 실패의 첫 작업 때다. 건너뜀(skipped)은 실패로 세지 않되 앞 단계 실패로 건너뛴 넣기는 분류기 실패로 센다. 작업이 한 번도 없으면 띠 없이 '아직 없음'.
- 수정 비율: `verdict_log` 최근 30일의 `edit`·`confirm` 공지(겹치지 않게) 가운데 `edit`이 있는 공지.
- 모델 서버 상태: api가 Ollama `/api/tags`를 부른다(`server/model.ts`에 `installedModels`를 둬 바깥 연결 시험을 지킨다), 3초.

## R12. 서비스 숫자

- **정한 것**: 표 `daily_counts(day, name, n)`. `counts(sql, day, now)`가 계산하는 이름: `consented`(지금 판 동의를 마친 학생 누적), `consented_new`(그날 `students.created_at`이고 동의한 학생), `active7`(그날 끝에서 7일 안에 쓴 세션의 학생 수), `like`·`later`·`dislike`(그날 `actions.at`), `push_sent`·`push_failed`(`push_sent`의 날짜), `push_devices`(구독 수). `server_error`는 500을 낼 때 api가 그날 행을 1 올린다(`createServer`에 `onError` 고리, 실패는 무시). 오늘 값은 답할 때 그 자리에서 계산하고 지난 날은 남긴 값을 준다.
- 관심 행동은 '지금 상태'만 있어 되돌린 것은 세지 않는다(2단계 결정).

## R13. 임베딩 지도

- **정한 것**: `server/ops/map.ts`. 분야 좌표는 코사인 거리로 정확한 t-SNE(직접 쓴 약 60줄: perplexity는 `min(15, (n-1)/3)`, 반복 1,000, 초기값은 고정 씨앗 난수, 학습률 100, 앞 100번 과장 4배). 공지 좌표는 가까운 분야 다섯의 좌표를 무게 `s_i − s_6`(여섯째와의 차, 모두 0이면 같은 무게)로 섞은 가운데. 좌표는 0~1로 맞추고 소수 4자리로 반올림해 저장한다(같은 컴퓨터에서 같은 자료면 같은 글자). 입력은 분야 `ord`, 공지 `id` 순으로 정렬한다.
- 담는 공지: `is_notice and not down and posted_on >= today-90`. 벡터 없는 것은 수만 센다. 공지마다 첫 핵심 분야의 순위(없으면 null)와 1위 분야를 담는다. 거르기에 쓸 값(게시일·출처·종류·큰 분야·확인할 것)은 답할 때 `notices`·`review_items`에서 붙인다.
- 목록: 헷갈리는 쌍은 분야 벡터 코사인이 큰 10쌍, 빈 곳은 핵심이 없는 공지를 1위 분야로 묶어 3건 이상, 안 쓰인 분야는 담긴 공지의 핵심·관련에 없는 분야. 멀리 붙은 공지는 화면이 순위 > k로 고른다.
- 저장: 표 `field_maps`에 JSON 한 줄, 최근 7개만 둔다. 분야가 12개보다 적으면 만들지 않고 까닭을 남긴다.
- 크기: 분야 100개·공지 1,000개에서 t-SNE 1,000번은 1천만 번 남짓 계산이라 1분 안이다.
- **버린 것**: PCA(시안과 다르고 무리가 뭉갬), UMAP 라이브러리(새 의존성), 분야·공지를 한 번에 t-SNE(시안에서 따로 뭉침).

## R14. 지금 모델과 모델 바꾸기

- **정한 것**: 지금 모델 = `model_changes` 마지막 줄의 `new_model`, 없으면 `KINGO_LLM_MODEL || DEFAULT_MODEL`. `server/model.ts`에 `currentModel(sql)`. `openModel`을 부르는 세 곳(daily, ingest, repick 일꾼)이 열 때마다 읽는다.
- 분류기 자식 프로세스에 넘기는 환경: `KINGO_LLM_MODEL=<지금 모델>`, `KINGO_LLM_OLDER=<앞 모델들, 최근 것부터 쉼표>`(기록에 나온 모델 모두 + 첫 기본 모델), `KINGO_FIELD_MEASURED=<{prompt, model, num, den}>`(지금 모델이 된 재기 결과. 없으면 주지 않음).
- `etl/notices/llm.ts`의 `makeChat`: 지금 모델의 보관 답이 없으면 `older` 모델의 보관 답을 차례로 읽는다(같은 판·같은 꼴 검사). 찾으면 다시 묻지 않고 `{ answer, cached: true, model: <그 모델> }`을 준다. `Outcome`에 `model`을 더하고, 기회 판정 근거(`rule`)와 분야 근거(`fieldRule`)는 이 이름을 쓴다.
- `fieldGate`: `chosen.model`이 다르면 `KINGO_FIELD_MEASURED`가 같은 판·같은 모델이고 85% 이상일 때 통과한다(없으면 지금처럼 이유).
- `rejudgePaths(no, models)`: 지금 모델과 앞 모델 모두의 보관 답을 지운다(아니면 앞 모델 답을 다시 읽어 '다시 판정'이 되지 않는다).
- 재기 답은 `etl/.cache/trial/` 아래 따로 둔다. 바꾼 뒤 첫 매일 작업에서 앞 공지가 새 모델 답을 읽지 않는다.
- **버린 것**: 지금 모델 하나의 보관만 읽기(바꾸는 날 공지 전부를 다시 판정해 FR-055를 어김).

## R15. 모델 재기

- **정한 것**: `server/ops/trial.ts`. 정답셋 폴더 `KINGO_GOLD_DIR`(컨테이너 `/gold`, `${KINGO_GOLD_HOST_DIR}`를 읽기 전용으로 붙임, 기본 `etl/gold`). 분야 표본은 활성 목록의 정답 파일이 있는 가장 큰 회차(`readSample`·`readGoldFile`, 1단계), 기회 표본은 `dev-501.csv`에서 `sampleBySha1`로 고른 120건. 본문 보관본(`etl/.cache`)이 없는 글이 있으면 '본문 보관본이 n건 없어요'로 실패한다.
- 재는 방법: 분야는 `makeFieldAsk({ dir: trial, model })`가 준 굳힌 답을 `scoreTaxonomy`에 표본만 넣어 핵심 정밀도·핵심 재현율·관련 정밀도를 쓴다. 기회는 `makeAsk({ dir: trial, model })`와 `judge`·`eval.score`의 기회 정밀도·재현율을 쓴다. 글 하나마다 `withModelLock`을 잡고 놓는다. 부하 제한은 프로세스의 `createThrottle` 하나.
- 이어 하기: 답이 trial 폴더에 남아 다시 묻지 않는다. 멈추는 때는 밤 시간 끝(글과 글 사이에서 본다). 진행 `done/total`을 요청 행에 적는다.
- 조건 판: 분야 목록은 `fieldVersion(t)`(목록·지시문·후보 규칙이 다 들어감), 기회는 `PROMPT_VERSION`, 정답셋은 쓴 파일들의 sha1 앞 8자. 지금 값과 하나라도 다르면 낡은 결과다. `TRIAL_VERSION` 상수로 재는 방법의 판도 함께 둔다.
- 85%는 있는 `passes`(정수 비교)를 쓴다.
- 지금 모델의 결과가 같은 조건으로 없으면 먼저 지금 모델을 잰다(같은 요청 안에서).

## R16. 로그인 방식 알려 주기와 학생 표시

- **정한 것**: `GET /api/login/methods` → `{ methods: ['dev'] }`(로그인 없이). `/api/me`에 `tag`(학생 번호 SHA-256 앞 8자)와 `push`(`{ ready, on }`)를 더한다. `tag`는 앱이 '쓰던 글'을 다른 학생에게 보이지 않으려고 견주는 값이고 화면에 보이지 않는다.

## R17. 쓰던 글과 안내 표시

- **정한 것**: 로그인이 끊겨 저장하지 못한 프롬프트·활동은 `sessionStorage`(탭을 닫으면 사라짐)에 `{ tag, path, body }`로 두고, 로그인 뒤 `tag`가 같으면 그 화면에 채우고 지운다. 다르면 지운다. 안내 표시(홈 화면 추가·알림 묻기·새 학기)는 `localStorage`의 참·거짓과 학기 글(`2026-2`)뿐이다. 둘 다 못 쓰면 안내가 다시 보일 뿐이다.

## R18. 화면 기준과 디자인 단계

- **정한 것**: astryx 컴포넌트로 바로 코드로 쓴다(2026-11-18 결정). 색·글꼴은 디자인 후보 추천안의 테마 `kingo`(은행잎 초록 `#4e741b`)를 astryx 테마로 옮긴다. 시안의 원본 파일은 임시 폴더에서 지워졌고 아티팩트(렌더된 페이지)만 남아 있어, 구현 때 아티팩트를 읽어 옮긴다. 구현 뒤 `impeccable audit`·`critique`·`polish`와 `kingo-toss-ux`·`kingo-ux-writing` 점검을 한다(메모리 '화면 작업 디자인 단계 생략 금지').
- 휴대폰은 아래 메뉴 막대, 너비 900px부터는 왼쪽 메뉴와 가운데 600px 본문.

## R19. 시험

- **정한 것**: 순수 함수(D-n, 학기 제안, 내 목록 순서, 알림 글, 띠, 지도)와 API는 vitest. 앱 화면은 Playwright 스크립트 `scripts/e2e-app/run.mjs`(있는 `playwright` 의존성): 시험 DB 스키마에 공지·분야·개발 계정을 넣고 서버를 띄워 처음 흐름부터 '나'까지 돌린다. 접근성은 dev 의존성 `axe-core`를 페이지에 넣어 심각·중대 위반 0을 본다. 너비 320·390·768에서 가로 넘침 0. CI에 `build:app`과 `e2e:app`을 더한다.
- 푸시는 `sendNotification`을 주입해 시험하고, 실제 전송은 개발 컴퓨터 크롬과 실제 기기에서 손으로 확인한다(quickstart).
- 옛 `src/`의 `audit:layout`·`audit:copy`는 그대로 두고, 문구 검사는 `web/app`의 글도 보게 규칙만 같이 쓴다(`e2e-app`이 화면 글자를 모아 `scripts/audit-copy/rules.mjs`로 본다).

## R20. 하지 않는 것

- 알림 때 고르기, 종류별 켜고 끄기, 공지 오프라인 보기, 덩어리 나누기, 화면 문구 다국어, 실시간 갱신(웹소켓).
