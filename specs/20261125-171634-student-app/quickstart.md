# Quickstart: 3단계가 되는지 확인하는 순서

## 준비

```bash
docker compose -f deploy/compose.dev.yaml up -d
npm ci && npm run check && npm run build:app && npm run build:ops
npm run cli -- migrate
npm run cli -- ingest etl/out/cse-notices.json --taxonomy custom
printf 'app-dev-pass' | npm run cli -- account create student@example.com
```

`.env`는 [2단계 quickstart](../20261117-052701-backend-skeleton/quickstart.md)와 같다. 이 맥의 8080은 다른 앱이 쓰므로 `PORT=8091`로 띄운다.

## 1. 앱(US1~4)

1. `PORT=8091 npm run server` 뒤 크롬 기기 모드(390px)로 <http://localhost:8091/notices>를 연다. 로그인으로 가고, 마치면 공지 목록으로 온다(중간 걸음마다 새로 고침해 같은 걸음에서 이어지는지).
2. 홈에서 '이걸 보고 골랐어요'와 선반, 공지에서 거르기·찾기·끝까지 내리기, 자세히 뒤 뒤로 가기의 자리.
3. 세 행동, 되돌리기, '이미 해 봤어요' 뒤 활동 넣기, 내 목록 두 탭.
4. '나'의 모든 칸과 `.md`, 계정 지우기.
5. 네트워크를 끄고 새로 고침: 앱이 열리고 '인터넷에 연결되지 않았어요'. 개발자 도구의 Cache Storage에 `/api/` 응답이 없다.
6. `npm run e2e:app`이 통과한다.

## 2. 알림(US5)

```bash
npm run cli -- push-keys   # 두 줄을 .env에 옮긴다. KINGO_PUBLIC_URL=http://localhost:8091
```

1. `localhost`에서 '나 → 알림'을 켠다(`push_subscriptions` 1행).
2. 시험 계정의 관심 있어요 공지 마감을 오늘·3일 뒤로 바꾸고(개발 DB) `npm run cli -- notify`: 알림 한 통. 다시 돌리면 0통.
3. 알림을 눌러 맞는 화면. 로그아웃 뒤 `notify`: 0통이고 구독 0행.
4. HTTPS 주소가 생기면 아이폰(홈 화면 추가)·안드로이드에서 1~3을 다시 한다(FR-070 (5)).

VAPID subject가 `http://localhost`면 일부 푸시 서버가 거절할 수 있다. 그때는 `KINGO_PUBLIC_URL`에 아무 `https://` 개발 주소를 쓴다.

## 3. 운영자(US6~8)

1. <http://localhost:8091/ops/>에 운영자 계정으로 들어가 메뉴 일곱 개를 연다.
2. `daily_runs`에 실패 둘을 넣으면 띠, 성공 하나를 더하면 사라짐.
3. '한 번 더 돌리기' → `npm run cli -- requests` → 상태가 끝남으로.
4. 임베딩 지도: `npm run cli -- daily --skip-classifier` 뒤 지도가 보이고, 두 번 돌린 `field_maps.data`가 같다.
5. 모델: 정답셋(`etl/gold`, 이 맥에만)으로 `requests`를 밤 시간 밖에 돌리면 재지 않고, 시험의 가짜 시각으로 재는 것은 자동 검사로 본다. 실제 재기는 22:00 뒤 한 번 돌려 지금 모델의 핵심 정밀도가 27/31(87.0%)인지 본다.

## 4. 학교 데스크톱(T087 뒤)

1. `deploy/kingo.env`·`deploy/kingo.push.env`, `KINGO_GOLD_HOST_DIR`에 정답셋(`dev-501.csv`와 `fields/`의 `sample.csv`·`sample-2.csv`·`sample-3.csv`·`custom.csv`·`custom-2.csv`·`custom-3.csv`. 쓰는 것은 마지막 회차의 둘이고 앞 회차는 회차를 찾는 데 쓴다)과 본문 보관본(`etl-cache` 볼륨)을 옮긴다.
2. `systemctl enable --now kingo-notify.timer kingo-requests.timer`.
3. `docker compose exec api`에서 바깥 주소에 닿지 않는지(2단계와 같음).
