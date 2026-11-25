# 명령 계약: 3단계에서 더하는 것

있는 계약은 [2단계 cli.md](../../20261117-052701-backend-skeleton/contracts/cli.md)다. 끝 코드 규칙은 같다(0 성공, 1 거절·실패, 2 쓰는 법이 틀림). 모두 `--json`.

| 명령 | 하는 일 | 출력 한 줄 |
|---|---|---|
| `push-keys` | 알림 키 쌍을 만들어 출력만 한다(DB에 닿지 않음) | `KINGO_PUSH_PUBLIC_KEY=…` 줄과 `KINGO_PUSH_PRIVATE_KEY=…` 줄 |
| `notify` | 그날 알림을 보낸다(R7). 09:00~21:00(한국) 밖이면 보내지 않고 0 | `알림 보냄 3 · 실패 0 · 사라짐 1 · 건너뜀 2` |
| `requests` | 운영자 요청을 처리한다(R9) | `요청 없음` 또는 `매일 작업 끝` / `모델 재기 멈춤 60/240` |

설정(`deploy/kingo.env`): `KINGO_PUBLIC_URL`, `KINGO_PUSH_PUBLIC_KEY`. (`deploy/kingo.push.env`, jobs만): `KINGO_PUSH_PRIVATE_KEY`. (compose) `KINGO_GOLD_HOST_DIR` → `/gold`, `KINGO_GOLD_DIR=/gold`.

systemd: `kingo-notify.service`·`.timer`(09:00 Asia/Seoul, Persistent), `kingo-requests.service`·`.timer`(10분마다). `kingo-requests.service`의 `TimeoutStartSec`는 9시간이다.

분류기(`etl/notices/run.ts`)가 읽는 새 환경: `KINGO_LLM_OLDER`, `KINGO_FIELD_MEASURED`, `KINGO_RUN_JSON`. 셋 다 없으면 지금과 같다(맥에서 손으로 돌릴 때).
