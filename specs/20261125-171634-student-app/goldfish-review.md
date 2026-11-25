# Goldfish Review — 3단계 새 학생 앱과 마감 알림, 운영자 모니터링·임베딩 지도·모델 바꾸기

- 날짜: 2026-11-25
- 리뷰어 상태: comprehension 완료 · readiness NO-GO(첫 판정과 재리뷰 모두)

## Comprehension의 다시 쓰기

성균관대 학과 공지를 분류·추천하는 2단계 서버 위에, 학생이 처음 쓰는 휴대폰 우선 웹앱(`web/app`)을 만든다. 학생은 로그인, 동의, 학년·학기와 진로 답, 분야 3개 고르기를 거쳐 가장 추천 하나와 선반을 보고, 공지를 찾고, 관심 있어요·나중에 보기·관심 없음을 남기고, 자기 자료를 고친다.
관심 있어요 공지의 마감 3일 전과 당일, 나중에 보기 공지의 다시 볼 날 오전 9시에 기기마다 하루 한 통으로 묶은 웹 푸시를 보낸다. 바깥 연결은 앱 서버(api)가 아니라 작업 쪽(jobs)만 한다.
운영자 PC 화면에는 모니터링(실패 띠, 한 번 더 돌리기), 임베딩 지도, 모델 재기·바꾸기(핵심 정밀도 85% 이상만)를 더한다. 모델을 바꿔도 앞서 판정한 공지는 그대로다.
저장한 공지를 놓치지 않게 하고, 학생에게 열기 전에 운영자가 멈춤과 틀린 판정을 알게 하려는 것이다. 학생 공개는 HTTPS·SSO·동의 문구·데스크톱 확인·실제 기기 확인 다섯 조건을 채운 뒤다.

### 기존 시스템

서버에는 공지·분야·학생 자료·가장 추천·나의 분석 API와 운영자 판정 검토 화면(`web/ops`)이 있고 학생 화면은 없다. `src/`에는 예시 자료로 도는 옛 시안이 있다. 로그인은 개발 로그인뿐이고 SSO는 없다.
매일 작업은 다시 판정 표시, 분류기, 넣기, 백업, 사실 칸, 흐름, 다시 고르기 순으로 돌고 기록을 남긴다. 모델 요청은 부하 제한을 지키며 한 번에 하나만 간다.
앱 서버는 바깥 인터넷에 닿지 않고 jobs만 바깥에 닿는다. 분류기의 보관 답은 모델별 폴더에 있어 지금은 모델을 바꾸면 전부 다시 판정한다. 자료 저장소는 Postgres 17과 pgvector다.

## 지적과 처리

| # | 리뷰어 | 심각도 | 위치 | 요지 | 처리 | 근거·변경 |
|---|---|---|---|---|---|---|
| 1 | comprehension | Major | spec 배경·용어, FR-014·015·017·032·048 | 2단계 용어(닫히는 날, 내려간 공지, 선반 등)가 정의되지 않음 | 수정 | 2단계 FR-005·021·039·043·044·050·051에서 확인해 용어에 옮김. 마감 없이 닫힌 공지의 표시도 적음 |
| 2 | comprehension | Major | spec FR-052~056, R15 | 모델 재기의 낱말과 방법이 정의되지 않음 | 수정 | 1단계·다듬기 스펙과 `etl/notices/gold.ts`·`score.ts`에서 확인해 링크와 뜻을 옮김 |
| 3 | comprehension | Major | spec Assumptions, plan 위험, quickstart 3·4 | 재는 글 수와 정답셋 파일이 어긋남 | 수정 | `gold.ts:13`(dev-501.csv)과 `gold.ts:78`(최대 120건) 확인. 수와 파일 목록을 맞춤 |
| 4 | comprehension | Major | spec US6-3·Edge, api.md | 정해진 매일 작업이 도는 중일 때의 동작이 두 가지 | 사용자 판단 | 추천: 화면은 요청이 열려 있을 때만 버튼을 잠근다. 정해진 작업이 도는 중이면 요청을 받아 기다린다. 잠금 상태를 monitor 답의 `dailyRunning`으로 준다. 요청은 작업이 끝나면 단계 실패가 있어도 `done`이고 실패한 단계를 함께 보인다. 재지적 |
| 5 | comprehension | Major | spec US6-3·FR-045, R9 | 10분 약속과 모델 재기가 부딪침 | 사용자 판단 | 추천: 재기가 글과 글 사이에서 `daily` 요청을 보면 `paused`로 물러나고 매일 작업을 먼저 돌린다 |
| 6 | comprehension | Major | spec FR-052, R9·R15 | "매일 작업이 끝난 뒤"의 판단 기준이 없음 | 사용자 판단 | 추천: 오늘 03:00 이후에 시작해 끝난 `daily_runs`가 있고 `kingo:daily` 잠금이 비었을 때. 매일 작업이 없던 날은 아침 시간이 없다 |
| 7 | comprehension | Major | spec FR-045, R10 | 한 번 더 돌리기의 범위와 낮에 돌 때의 영향 | 사용자 판단 | 추천: 매일 작업 전체를 돈다. 07:00 뒤면 다시 고르기를 줄에만 넣고 끝내며 화면은 "낮 실행"으로 표시하고 LLM이 고른 수를 세지 않는다. 분류기가 도는 동안 학생의 다시 고르기가 늦어진다고 확인 창에 적는다 |
| 8 | comprehension | Major | spec FR-044, R11 | 실패 띠 10%의 분모가 없음 | 사용자 판단 | 추천: 새로 물은 것만 센다. 분모 = `llm.fresh+failed+skipped + field.fresh+failed+notAsked`, 분자 = 그중 failed·skipped·notAsked. 분모 0이거나 숫자가 없으면 그 작업은 세지 않는다 |
| 9 | comprehension | Major | spec FR-033·034·043, push_sent, R12 | 알림의 중복 기준과 세는 단위가 둘 | 사용자 판단 | 추천: 중복 기준에 기기를 넣는다. 숫자는 통으로 센다(학생·기기·날의 서로 다른 수) |
| 10 | comprehension | Major | spec FR-035, R7 | 다시 보내기와 21:00 경계 | 사용자 판단 | 추천: 다시 보낼 때도 21:00을 본다. 오늘 `failed`이고 `attempts=1`인 행을 다시 보내며, 손으로 다시 돌려도 같다. 2번이면 그만둔다 |
| 11 | comprehension | Major | app.md 규칙 7 | `no_match`의 글이 두 자리에서 하나 | 수정 | 2단계 `api.md`의 `empty` 뜻을 확인해 홈과 목록의 글을 나눔 |
| 12 | comprehension | Major | spec US7·FR-047, plan, R13 | "시안"이 세 뜻, `s_i`·1위 분야 설명 없음 | 수정 | 지도 시안 링크, `s_i` 뜻, `first` 칸 설명을 적음 |
| 13 | comprehension | Major | spec Edge "앱 판이 바뀜", R3 | 앱 판이 어긋날 때의 동작과 보관 지우기 | 사용자 판단 | 추천: API는 있던 뜻을 바꾸지 않는다(칸을 더하기만). 앱이 모르는 오류를 받으면 "새로 고쳐 주세요"를 보인다. `/assets` 보관은 새 `index.html`이 가리키지 않는 것을 지운다 |
| 14 | comprehension | Major | spec FR-003, api.md | 학생 API에 더하는 것과 재기 취소가 명세와 다름 | 수정 | FR-003과 plan을 계약대로 고침. 취소는 28번에서 정함 |
| 15 | comprehension | Major | spec FR-056, models/current | 되돌리기가 두 가지로 읽힘 | 사용자 판단 | 추천: 되돌리기는 통과한 결과를 다시 고르는 것이다. 처음 모델은 분야 목록의 고른 기록(87.0%)을 결과로 친다. 조건이 달라졌으면 다시 재야 한다. 급할 때는 서버 컴퓨터의 설정으로만 바꾼다 |
| 16 | comprehension | Nit | plan, R1, app.md | 화면 수가 다름 | 수정 | `screens/` 13개, 주소 16개로 맞춤 |
| 17 | comprehension | Nit | plan, spec, R18 | 작업 절차 이름이 풀이 없이 나옴 | 기록 |  |
| 18 | comprehension | Nit | api.md monitor | `today`가 마지막 매일 작업의 값 | 기록 | 화면에 작업 날짜를 함께 보이면 된다 |
| 19 | comprehension | Nit | R17, FR-019 | 학기 글의 해를 정하는 법 | 수정 | `server/analysis/lines.ts`의 `termStart`(1~2월은 앞 해)와 같다고 적음 |
| 20 | readiness | Blocker | R15, T073 | 지금 모델을 잴 때 분류기 보관 폴더에 써서 앞 판정이 뒤집힘 | 수정 | FR-052가 이미 "따로 두어"라고 정함. 모든 재기는 trial에만 쓰고 분류기 폴더는 읽기만. T072·T073에 시험 |
| 21 | readiness | Blocker | R15, api.md, T075·T077 | api가 지금 정답셋 판을 알 길이 없음 | 사용자 판단 | 추천: jobs의 `requests`가 10분마다 정답셋 판을 계산해 DB의 `op_state`(열쇠·값·때)에 적고 api가 읽는다. 값이 없으면 모든 결과가 낡은 것이다. 재지적 |
| 22 | readiness | Blocker | R15, T073 | 코드에 없는 지표(기회 정밀도·재현율) | 수정 | `etl/notices/eval.ts` DEFS 확인. "기회 여부"·"기회 놓침"으로 고침(spec US8-3·FR-054, data-model) |
| 23 | readiness | Major | R15, T073 | embed·gate를 얻는 길이 없고 잠금이 교착됨 | 사용자 판단 | 추천: `server/model.ts`에 `openUnlocked(sql, who, model)` → `{ embed, gate, close }`를 둔다(잠그지 않고, 닫을 때 `model_bursts`에 기록). 재기는 글마다 `withModelLock` 안에서 이것을 쓴다. `embedDir`은 분류기 보관 벡터를 읽고 없을 때만 trial에 쓴다. 재지적(Blocker) |
| 24 | readiness | Major | R15 | 재는 도중 fail·down의 처리 | 사용자 판단 | 추천: fail은 그 밤에 한 번 더 묻고 남으면 결과에 실패 수로 적는다(분야는 빈 답, 기회는 규칙). 실패가 5%를 넘으면 결과를 내지 않고 `failed`. down은 `paused`, 모델 없음(404)은 `failed`. 재지적 |
| 25 | readiness | Major | data-model model_trials | 여러 밤의 시간·부하 합산, 행 수명, total | 사용자 판단 | 추천: `op_requests`에 누적(요청 수·걸린 시간·GPU 합·최고 온도)을 두고 끝날 때 `model_trials` 행을 넣는다. `total`은 이번 요청에서 물을 글 수(지금 모델을 함께 재면 합). 새로 물은 글이 없으면 시간은 비운다. 재지적 |
| 26 | readiness | Major | R9, T074 | "매일 작업이 끝난 뒤"의 판정 | 사용자 판단 | 6번과 같음. 재지적 |
| 27 | readiness | Major | R9 | 재기 중 한 번 더 돌리기가 늦음 | 사용자 판단 | 5번과 같음. 재지적(Blocker) |
| 28 | readiness | Major | api.md trial/cancel | 취소한 요청의 상태 | 사용자 판단 | 추천: 상태 `canceled`를 더하고 열린 요청에서 뺀다. FR-052에 취소를 올린다 |
| 29 | readiness | Major | R11, FR-051 | 임베딩 모델을 거르는 기준 | 사용자 판단 | 추천: `/api/tags`의 `details.family`에 `bert`가 들거나 이름이 `EMBED_MODEL`로 시작하거나 `details.parameter_size`가 없으면 뺀다. 재지적 |
| 30 | readiness | Major | api.md models·monitor | `request`와 `current`의 빈 값 | 사용자 판단 | 추천: `request`는 그 종류의 마지막 요청(끝난 것 포함), 바꾼 기록이 없으면 `since`·`by`·`trial`은 null |
| 31 | readiness | Major | R11, api.md | 판정 실패 분모와 `today.failed` | 사용자 판단 | 8번과 같음. `today.failed`는 그 분자. 재지적 |
| 32 | readiness | Major | R12, T058 | 알림 숫자 단위와 동의 판을 넘기는 길 | 사용자 판단 | 9번과 같음. 동의 판은 `cli.ts`가 `readConsent(consentFile)`로 읽어 `DailyDeps.consentVersion`과 `notify`에 넘긴다. "건너뜀"은 이미 보낸 것이 있어 보내지 않은 기기 수. 매일 작업이 안 돈 날은 값이 없음. 재지적 |
| 33 | readiness | Major | data-model push.ready ↔ R4 | 준비 조건이 다르고 키 없을 때 notify | 사용자 판단 | 추천: api의 준비는 공개 키와 `KINGO_PUBLIC_URL`. `notify`는 키가 하나라도 없으면 보내지 않고 "알림 키가 없어요"와 끝 코드 1. 재지적 |
| 34 | readiness | Major | T054 | .dockerignore가 빠져 개인 키가 이미지에 들어감 | 수정 | `deploy/Dockerfile`의 `COPY . .`와 `.dockerignore` 확인. T003·T054에 더함 |
| 35 | readiness | Major | app.md 규칙 5 | 닫힌 나중에 보기가 맨 위로 옴 | 수정 | `server/notices/routes.ts:148` 확인. 닫힘·내려감을 먼저 봄. T027 시험 |
| 36 | readiness | Major | R3, T051·T055 | 처음 연 뒤 오프라인이면 껍데기가 안 열림 | 수정 | spec Edge가 정한 동작. `install`에서 껍데기를 담고 T055에 첫 방문 경우 |
| 37 | readiness | Major | T036 | 뺀 줄을 풀어 쓸 말이 하나뿐 | 수정 | `server/analysis/lines.ts`의 키 확인. `disliked`·`flow`·없는 분야의 말을 적음 |
| 38 | readiness | Major | api.md map | `stale` 기준과 `reason` 출처 | 수정 | 단계 차례(R10)로 `started_at`과 견줌. `steps.map.error` |
| 39 | readiness | Major | T010·T067, R18 | 테마 값과 화면 배치가 저장소 밖에만 | 수정 | 테마 값은 contracts/design.md로 옮김. 지도 기간 선택지를 적음. 재지적(화면 배치): 추천은 PR A 전에 추천안 화면 캡처와 화면마다 영역·부품 목록을 이 폴더에 둠 |
| 40 | readiness | Major | quickstart | 명령이 .env를 읽지 못함 | 수정 | `package.json`의 `cli` 확인. `npm run cli --`로 고침 |
| 41 | readiness | Major | R7 | 10분 뒤 다시 보내기의 대상 | 사용자 판단 | 10번과 같음 |
| 42 | readiness | Nit | plan | stack-diagram.html이 없음 | 수정 | 만들어 더함 |
| 43 | readiness | Nit | T050 | web-push를 가져오는 자리 | 수정 | `send.ts` 하나로 적음 |
| 44 | readiness | Nit | app.md | 종류·분야 여럿의 꼴 | 수정 | `server/notices/routes.ts` 확인. 쉼표 |
| 45 | readiness(재) | Major | R14·R15, T068·T069·T073 | `older`의 뜻이 둘(모델 이름, 폴더) | 사용자 판단 | 추천: `makeChat`에 `older: { dir, model }[]`. 환경은 `run.ts`만 읽어 넘긴다 |
| 46 | readiness(재) | Major | T012·T036·T039, R19 | 문구 검사가 서버 글까지 걸러 e2e가 실패 | 사용자 판단 | 추천: 서버가 준 글(공지 제목·주최, 분석 줄)을 담는 요소에 `data-server-text`를 달아 검사에서 뺀다 |
| 47 | readiness(재) | Major | spec US7-1·확인 11 ↔ T067 | 지도 점의 색이 정해지지 않음 | 사용자 판단 | 확인 필요 11번. 추천: 지도 시안의 상태 색과 모양 |
| 48 | readiness(재) | Major | FR-012·015, T023·T029 | 홈의 가장 추천에 행동한 뒤의 동작 | 사용자 판단 | 추천: 행동을 저장하면 카드 자리에 "다른 추천을 고르는 중이에요"와 되돌리기를 5초 보이고, 5초 뒤 홈을 다시 부른다. 되돌리기는 앞 행동이 있으면 그것을 다시 저장하고 없으면 지운다 |
| 49 | readiness(재) | Major | R15, T077 | `KINGO_GOLD_HOST_DIR` 기본값 | 사용자 판단 | 추천: 호스트 값은 `deploy/.env`, 기본 `./gold`(빈 폴더를 저장소 밖 규칙으로 만듦). 컨테이너는 늘 `/gold`, 맥에서는 `KINGO_GOLD_DIR` 없으면 `etl/gold` |
| 50 | readiness(재) | Major | R9, T059 | 기다리는 동안 systemd 제한 시간 | 사용자 판단 | 추천: 매일 작업은 잠금을 30분까지만 기다리고 안 되면 "다른 매일 작업이 돌고 있어요"로 끝난다. `TimeoutStartSec`는 6h |
| 51 | readiness(재) | Major | FR-039, T051 | 아이콘 원본과 manifest 값 | 사용자 판단 | 추천: 강조색 바탕에 흰 글자 "킹고" 아이콘(SVG 하나에서 만듦, 학교 로고·상징물은 쓰지 않음). `short_name` 킹고, `start_url` `/`, `display` standalone, `theme_color` #4e741b, `background_color` #f1f1f1 |
| 52 | readiness(재) | Major | T080, SC-002 | 성능 측정 조건 | 사용자 판단 | 추천: 내려받기 1.6Mbps·왕복 150ms·CPU 4배 느림, 보관 없이 5번 열어 가운데 값, 첫 공지 제목이 보일 때까지. 행동은 누른 때부터 표시가 바뀔 때까지 |
| 53 | readiness(재) | Major | plan Source Code | 고칠 etl 파일 목록이 tasks와 다름 | 수정 | tasks T057·T068~T070 확인. `classify.ts`를 뺌 |

## 재리뷰

readiness만 다시 돌렸다(Blocker 20·22번을 고쳤기 때문). 첫 VERDICT NO-GO → 재리뷰 NO-GO. 재리뷰의 Blocker 셋은 21번(정답셋 판), 23번(embed·잠금, 첫 리뷰에서는 Major), 27번(한 번 더 돌리기, 첫 리뷰에서는 Major)과 같은 문제이고 모두 아직 고치지 않은 `사용자 판단`이다. 고친 20·22번은 다시 나오지 않았다. 새 지적은 45~53번이고, `재지적`은 4·21·23~27·29·31~33·39번이다.

## 집계

지적 53개 중 문서를 바꾼 것 21개
