# Goldfish Review — 2단계 백엔드 뼈대(API 서버와 DB)

- 날짜: 2026-11-19
- 리뷰어 상태: comprehension 완료 · readiness NO-GO(첫 판정과 재리뷰 모두. 재리뷰의 Blocker 1개와 Major는 사용자 위임으로 고쳤다)
- 사용자 판단: 사용자가 2026-11-18에 맡긴 대로('추천대로 결정. 기획을 검토하며 순서대로 조금씩 구현을 시작해줘') 새로 정해야 하는 것은 추천안으로 정해 문서에 넣었다. 그런 행은 처리를 `수정(사용자 결정)`으로 두고 근거에 '위임'이라 적었다. 구현 전 요약에서 사용자가 확인한다.

## Comprehension의 다시 쓰기

(리뷰어 원문이다. 경로만 저장소 뿌리 기준으로 바꿔 적었다.)

- 예시 자료로 돌던 옛 프로토타입을 버리고 앱을 다시 만드는 8단계 가운데 2단계로, 3단계 학생 앱이 쓸 API 서버와 DB(Node 표준 http, Postgres + pgvector)를 실제 자료만으로 만든다.
- 서버는 분류기가 낸 결과 파일·분야 목록·벡터를 검사해 넣고(어긋나면 아무것도 바꾸지 않음), 학생 계정·동의·처음 질문·고른 분야·카드 행동·나에 대한 프롬프트·직접 넣은 활동을 내부 학생 번호에 붙여 저장한다.
- 그 위에서 공지 목록과 내 목록, 홈의 선반 셋과 '가장 추천', '나의 분석', 운영자 판정 검토를 준다. 가장 추천은 규칙 점수로 후보 10개를 고른 뒤 서버 안 LLM이 하나를 고르고, 답이 검사에 걸리거나 모델이 없으면 규칙 1위다. 운영자가 고친 사람 판정은 분류기 값보다 앞선다.
- 학교 데스크톱 한 대의 Docker Compose에서 매일 03:00에 분류기 → 넣기 → 백업 → 분석 → 다시 고르기가 돈다. 모델 요청은 부하 제한 하나로 한 번에 하나만 가고, 학생 자료는 자체 모델 서버 말고는 밖으로 나가지 않는다.
- 까닭은 셋이다. 학생이 처음 쓰는 3단계가 실제 자료 위에서 돌아야 하고, LLM 판정이 틀릴 수 있어(1단계 핵심 정밀도 최고 62.7%) 규칙 대체와 사람 검토가 필요하며, 학생 정보는 학교 안 장비에만 두기로 했다.

**기존 시스템**

- **앱**: 예시 자료로 도는 옛 프로토타입(Vite + React)이 `src`에 있다. 2026-11-16에 처음부터 다시 만들기로 했고 이 기능은 건드리지 않는다. 서버·DB·로그인은 아직 없다(저장소에 server, web, deploy 폴더가 없음을 확인했다).
- **분류기**(`etl`, 이 기능은 고치지 않음): 학교 소프트웨어학과 공지 서버를 1초 1건으로 읽고, 규칙과 로컬 Ollama(gemma4:12b)로 글마다 기회 여부·종류·마감을 정한다. 90일 창의 결과 파일 `etl/out/cse-notices.json`을 통째로 다시 쓰고, 정하지 못한 글은 확인 필요(`review`)로 남긴다. 2026-11-10 파일은 기회 126건(35건 마감 없음)이다.
- **1단계**(main에 머지됨): 분야 목록 세 안(custom, ncs, csrankings)을 같은 공지로 쟀는데 핵심 정밀도가 모두 85% 미만이었다. 그래서 지금 결과 파일에는 분야 칸이 없고 목록을 고르는 중이다. bge-m3 1024차원 벡터 보관, 부하 제한(요청 뒤 1/4 쉼, 온도 80°C), 센서 읽기, 분야 목록 검사가 모듈로 있고 서버가 가져다 쓴다.
- **실행과 시험**: Node 22(`.nvmrc`)에서 빌드 없이 TypeScript를 돌리고 vitest `*.test.ts`로 시험한다. constitution은 빈 틀이다.
- **문서만으로 알 수 없던 것**: '기준일'의 뜻, 그리고 분류기 안에서 기회 판정과 분야 판정이 따로 묻고 따로 보관된다는 점이다. 코드와 1단계 계약을 보고 알았고 아래 지적에 넣었다.

## 지적과 처리

| # | 리뷰어 | 심각도 | 위치 | 요지 | 처리 | 근거·변경 |
|---|---|---|---|---|---|---|
| 1 | comprehension | Major | spec.md › 배경, 범위 밖, SC-003 | 운영자 화면을 이 기능에서 만드는지가 엇갈린다 | 수정 | US7·FR-049가 이미 정했다(2026-11-17 사용자 결정). 배경은 '학생 화면은 만들지 않고 운영자 판정 검토 PC 화면 하나만 만든다', 범위 밖은 '학생 화면', SC-003은 '학생 화면 일곱' |
| 2 | comprehension | Major | spec.md › US1-4, FR-005·006·044 | 기준일, 분류기 보관, 가장 크게 오른 폭을 풀이 없이 쓴다 | 수정 | 결과 파일 계약의 `since`와 `etl/notices/run.ts`, 1단계 FR-015에서 확인해 용어에 네 줄(기준일, 분류기 보관, 가장 크게 오른 폭, 활성 목록) |
| 3 | comprehension | Major | spec.md › FR-054, research R11 | '다시 판정'이 무엇을 다시 묻는지, 언제 답이 달라지는지 없다 | 수정(사용자 결정) | 위임 — 추천안: 원문이 고쳐진 공지에 쓴다. 그 글의 본문 보관본, 기회 판정 답, 분야 판정 답을 지워 분류기가 본문을 새로 받아 다시 묻는다. 본문이 그대로면 답도 같다(temperature 0). FR-054, R11, data-model rejudge_marks, T080 |
| 4 | comprehension | Major | spec.md › FR-004·005·007·027·051 | 공지가 아닌 글(확인 필요)의 처리가 세 군데서 빈다 | 수정(사용자 결정) | 위임 — 추천안: 요약의 새·바뀜·그대로는 기회만 세고 확인 필요는 따로 센다. 빠진 확인 필요 글도 내려감이다. 공지가 아니게 된 글은 학생 쪽에서 내려간 공지와 똑같이 다룬다. FR-004·007, R11, data-model 3절, api.md NoticeCard, cli.md, T018·T022·T038 |
| 5 | comprehension | Major | spec.md › FR-003·008, cli.md ingest, R14 | 분야 목록을 바꾸는 길이 없고 '지금 분야 목록'이 두 가지로 읽힌다 | 수정(사용자 결정) | 위임 — 추천안: 지금 분야 목록은 DB의 활성 목록. 다른 목록은 `ingest --switch`로만 갈아타고, 그때 고른 분야·활동의 분야·사람 판정의 분야를 지운다. 매일 넣기는 활성 목록 id로 하고 목록 파일을 날마다 다시 읽는다. FR-003, R11·R14, cli.md, data-model taxonomies, T018·T022·T034·T083 |
| 6 | comprehension | Major | spec.md › FR-012, Edge Cases, SC-008, quickstart 7 | 운영 모드 동작이 문서마다 다르다 | 수정 | cli.md가 이미 정한 대로(`account delete`는 운영 모드에서도 된다) FR-012를 맞춤. `login_off` 검사는 시험용 로그인 방식을 켠 운영 모드의 자동 시험이라고 SC-008, quickstart 7, T027에 적음 |
| 7 | comprehension | Major | spec.md › FR-038 | '학생이 행동함'의 뜻에 따라 동작이 달라진다 | 수정 | FR-033(a)의 거르기와 같은 말로 고침(관심 있어요, 관심 없음, 다시 볼 날 전인 나중에 보기). 다시 볼 날이 된 공지는 그대로 둔다. data-model 6절, T048 |
| 8 | comprehension | Major | spec.md › FR-053, research R17, cli.md | 정답셋 후보 파일의 꼴과 저장소 밖에 두는 까닭이 없다 | 수정(사용자 결정) | 위임 — 추천안: `gold-candidates-YYYY-MM-DD.csv`와 칸 표(cli.md). 서버에 게시판 칸이 없어 1단계 정답셋 꼴과 같지 않은 '후보'다. 까닭은 본문이 아니라 정답 라벨이라서다(스펙 1 FR-034). FR-053, R17, T074 |
| 9 | comprehension | Major | plan.md › Summary·Technical Context, research R17 | 'astryx'와 '아침 보고서 1번'이 풀이 없이 나오고 의존성 설명과 부딪힌다 | 수정 | 2026-11-18 사용자 결정(화면은 astryx 컴포넌트로 바로 코드로, Figma 없이, 강조색은 홍보팀 확인 전에는 쓰지 않음)을 R17에 옮겨 적음. 패키지 `@astryxdesign/core`(0.7 판)를 더한다고 plan Summary·Constitution Check·T076에 적음 |
| 10 | comprehension | Major | spec.md › 배경, 용어 | 기준으로 삼는 기획 문서가 어디 있는지 없다 | 수정 | 기획 문서는 저장소 밖 Claude Docs 문서다. 주소를 spec 배경과 research 머리에 적고, 기대는 기술 결정을 research 머리에 옮김. 절 이름을 '서버와 데이터'로 맞춤 |
| 11 | comprehension | Major | spec.md › FR-035, research R8 | 이유에서 막는 '날짜'의 범위와 까닭이 없다 | 수정(사용자 결정) | 위임 — 추천안: 날짜·요일·남은 날 수를 모두 막는다(정규식은 contracts/llm.md). 모델이 적은 날짜는 틀릴 수 있고 가장 추천은 다음 다시 고르기까지 그대로 보여 날 수가 낡는다. 규칙 문장도 날 수를 쓰지 않게 예를 '마감이 가까워요'로 바꿈. FR-035, R8, api.md 예, T045·T046 |
| 12 | comprehension | Nit | data-model.md › picks | `prompt_version`이 학생의 프롬프트 판으로 읽힌다 | 수정 | 칸 옆에 'LLM 지시문의 판(해시)'이라고 적음 |
| 13 | comprehension | Nit | contracts/api.md › GET /api/me/analysis | 줄의 출처 값이 예시에만 있다 | 수정 | FR-029에 출처 값 다섯, R10에 줄 종류별 표 |
| 14 | comprehension | Nit | spec.md › US7 | '원문과 나란히'가 본문을 보여 주는 것으로 읽힌다 | 수정 | '원문 링크와 함께'로 고치고 FR-006에 본문을 두지 않는 까닭 |
| 15 | comprehension | Nit | research.md › 머리, R11·R16·R17·R20 | 다른 문서와 표기가 어긋난다 | 수정 | 사실 어긋남. 상태 줄, 명령 이름(`node server/cli.ts …`), `web/ops/`, R20 변수 표, `compose.dev.yaml`을 맞춤 |
| 16 | comprehension | Nit | plan.md › Constitution Check, 구현 전에 할 것 | 작업 절차 이름이 풀이 없이 나온다 | 수정 | '2-0', '2-0.5', '2-1'을 풀어 씀(문서만 읽는 리뷰, 화면 디자인, 구현 전 승인) |
| 17 | readiness | Blocker | research.md › R7, tasks T051·T047 | 오래 도는 api 프로세스에서 부하 제한을 언제 만들고 멈추는지 없다 | 수정(사용자 결정) | 위임 — 추천안: `openModel()`이 부하 제한 하나를 열고 `close()`가 요약을 `model_bursts`에 남긴다. 일꾼은 줄에 일이 있는 동안 하나를 쓰고 줄이 비면 닫는다. 온도를 못 읽으면 그 다시 고르기만 규칙이고 다음 일은 새로 연다. 매일 작업은 실행 하나에 하나. `etl/throttle.ts`는 고치지 않는다(1~3행, 33행, 51~56행 확인). R7, data-model model_bursts, contracts/llm.md, T047·T049·T051·T053 |
| 18 | readiness | Blocker | tasks.md › T063, research R14, data-model prompts | 프롬프트 벡터를 어디서 만드는지 없다 | 수정(사용자 결정) | 위임 — 추천안: 요청은 모델을 부르지 않는다(글을 쓰고 벡터를 비우고 다시 고르기를 건다). 일꾼이 그 학생 차례에 빈 벡터를 채우고, 실패하면 비운 채 고른다. 매일 작업이 모든 학생을 줄에 넣어 다음 날 다시 만든다. R9, data-model prompts, api.md, T047·T053·T063 |
| 19 | readiness | Major | tasks.md › T011·T012, research R19 | 시험 스키마로 나뉘지 않는 pgvector 확장과 advisory lock을 다루지 않는다 | 수정(사용자 결정) | 위임 — 추천안: 확장은 `public`에 두고 시험 연결의 `search_path`는 `<시험 스키마>, public`. 확장 만들기는 `pg_advisory_xact_lock` 안에서. 모델 잠금 키는 스키마 이름으로 만든다. R7·R19, T011·T012·T051 |
| 20 | readiness | Major | tasks.md › T004 | `deploy.yml`도 `npm run check`를 돌리는데 DB 서비스가 없다 | 수정 | `.github/workflows/deploy.yml` 27행에서 확인. T004에 `deploy.yml`을 넣음 |
| 21 | readiness | Major | tasks.md › T003 | `.gitignore`의 `.env.*`가 `.env.example`도 막는다 | 수정 | `.gitignore` 12~13행에서 확인. T003과 R20에 `!.env.example` |
| 22 | readiness | Major | research.md › R20·R23, tasks T001·T003·T006, quickstart 준비 | 설정 변수의 표와 `.env`를 읽는 방법이 없다 | 수정(사용자 결정) | 위임 — 추천안: R20에 변수 표(기본값, 필수 여부). npm 스크립트가 `node --env-file-if-exists=.env`로 읽는다. 개발 DB는 사용자·비밀번호·DB 이름 모두 `kingo`. `.env`는 저장소 폴더에 두되 커밋하지 않는다. T001·T002·T003·T006, quickstart |
| 23 | readiness | Major | tasks.md › T018·T022·T072, data-model notices | 확인 필요 글을 넣기가 어떻게 다루는지 빈 곳이 있다 | 수정(사용자 결정) | 4번과 같은 결정(위임). 넣는 단계는 T022(US1), 이유 붙이기는 T072(US7). T018에 확인 필요 글이 든 가짜 파일의 기대 값 |
| 24 | readiness | Major | tasks.md › T021·T018 | 벡터 넣기가 코드와 맞지 않거나 비어 있다 | 수정(사용자 결정) | 위임 — 추천안: 길이 1024가 아닌 벡터는 그 벡터만 넣지 않는다(넣기 전체를 거절하지 않는다, FR-006). 본문은 `gold.ts`의 `cachedBody`로 읽는다. 빈 벡터는 다음 넣기가 다시 만들고 '그대로'로 센다. `embed.ts` 82행, `gold.ts` 41행 확인. R11, FR-006, T018·T021 |
| 25 | readiness | Major | research.md › R20·R14, tasks T085 | `KINGO_ETL_CACHE`가 무엇인지 없고 jobs 컨테이너의 볼륨 목록이 없다 | 수정(사용자 결정) | 1단계 코드는 그 변수를 읽지 않아(`run.ts` 252행) 변수를 뺌. 위임 — 추천안: 분류기의 고정 경로(`/app/etl/.cache`, `/app/etl/out`)에 볼륨을 붙인다. R16에 서비스별 볼륨 표, T085·T086 |
| 26 | readiness | Major | tasks.md › T085·T086, research R14, quickstart 6 | 이미지에 넣을 것과 실행 명령이 덜 정해졌다 | 수정(사용자 결정) | 위임 — 추천안: api와 jobs가 같은 이미지. 저장소를 통째로 복사하고 `npm ci`(분류기의 `jsdom`까지)와 `npm run build:ops`. 매일 작업의 진입은 `node server/cli.ts daily` 하나. quickstart 6의 `status`는 jobs 컨테이너에서. R14·R16, T085 |
| 27 | readiness | Major | research.md › R8, spec FR-040, data-model field_state | '분야 판정 없음'을 무엇으로 판단하는지 없다 | 수정(사용자 결정) | 위임 — 추천안: 열린 공지 가운데 `field_state`가 `judged`·`human`인 것이 하나도 없을 때. 분야가 붙지 않은 공지는 `fields`가 `null`이고 분야 점수 0. R8, FR-040, data-model, api.md, T045·T048·T057 |
| 28 | readiness | Major | research.md › R8·R10, tasks T051·T052·T064 | 새 LLM 요청 둘의 계약이 없다 | 수정(사용자 결정) | 위임 — 추천안: `contracts/llm.md`를 더함(요청 몸통, 지시문 뼈대, 재료 글의 꼴, 스키마, 답 검사 표와 날짜 정규식, 시험). 모델 이름은 1단계와 같은 `KINGO_LLM_MODEL`. T046·T051·T052·T058·T064 |
| 29 | readiness | Major | research.md › R8, spec FR-039, tasks T050·T052·T054 | 규칙 문장, 학생 벡터의 평균, 비슷한 공지의 가까움에 선택이 남았다 | 수정(사용자 결정) | 위임 — 추천안: R8에 조건별 문구 표(앞 조각·끝 조각, 조건이 없을 때의 문장), 학생 벡터는 세 묶음을 길이 1로 맞춰 있는 것끼리 평균, 비슷한 공지는 관심 있어요 공지와의 유사도 가운데 가장 큰 값. T045·T048·T052 |
| 30 | readiness | Major | research.md › R10, api.md 나의 분석 | 나의 분석 글의 꼴이 예시 조각뿐이다 | 수정(사용자 결정) | 위임 — 추천안: R10에 줄 종류별 글의 틀·출처·증빙 표와 md 전체 예, 줄 순서, 빈 칸의 글. 근거 키가 같은 흐름 문장은 앞의 것만. api.md 예의 종류 글자를 `KIND_LABEL`로 고침. T057·T058 |
| 31 | readiness | Major | research.md › R14·R11, tasks T080·T083 | 매일 작업에 정해지지 않은 곳이 넷이다 | 수정(사용자 결정) | 위임 — 추천안: 07:00에 매일 작업은 끝나고 남은 학생은 줄에 남아 일꾼이 잇는다(R14의 '규칙 1위'는 틀린 글이었다). 요약 값은 DB에서 센다(`picks`, `repick_queue`, `model_bursts`). 넣기는 활성 목록 id로. 다시 판정이 지울 세 경로를 1단계 상수·함수로 적음(`llm.ts` 21·79행, `fields.ts` `fieldFolder`, `cse.ts` 15행 확인). R11·R14, FR-043, plan 위험, T080·T083 |
| 32 | readiness | Major | research.md › R15, tasks T081, cli.md restore | 백업의 값과 경계가 없다 | 수정(사용자 결정) | 위임 — 추천안: `kingo-YYYY-MM-DD.dump`(한국 날짜), 같은 날은 덮어씀, 이름의 날짜가 7일 이상 앞선 파일만 지움. 빈 DB는 `students`와 `notices` 표가 없거나 둘 다 0행. R15, cli.md, T081 |
| 33 | readiness | Major | tasks.md › T082 | 정적 확인의 조건이 다른 작업과 부딪히고 `status`의 확인 항목이 문서마다 다르다 | 수정(사용자 결정) | 위임 — 추천안: 검사에서 `*.test.ts`와 `server/test/`를 빼고, 바깥 요청은 `server/model.ts`와 `server/jobs/status.ts` 둘만. `server/`가 `etl/`에서 가져올 수 있는 이름 목록을 T082에 적음. `status`의 다섯 줄을 cli.md에 적음. T014·T082·T084 |
| 34 | readiness | Major | contracts/api.md › 운영자 판정 검토, research R17 | 운영자 쪽 꼴과 동작이 비어 있다 | 수정(사용자 결정) | 위임 — 추천안: `OpsNotice` 전체 예, 운영자 목록 파일의 꼴과 읽는 때(시작할 때 한 번), 고치면 확인한 것으로 남김, `reason=review`는 `review:`로 시작하는 이유 모두, `by_operator`는 목록의 `subject` 글. api.md, R17, data-model, T068·T069·T071 |
| 35 | readiness | Major | tasks.md › T074, cli.md export-gold | 내보내는 파일의 꼴이 없고 1단계 정답셋 꼴을 그대로 따를 수도 없다 | 수정(사용자 결정) | 8번과 같은 결정(위임). 저장소 안 경로 검사는 `gold.ts`의 `insideRepo`를 내보내 쓴다(46행 확인) |
| 36 | readiness | Major | tasks.md › T076·T077, research R17 | 운영자 화면의 틀과 빌드가 정해지지 않았다 | 수정(사용자 결정) | astryx를 쓰는 것은 사용자 결정(2026-11-18). 위임 — 추천안: 빌드 명령 `build:ops`, 결과 폴더 `web/ops/dist`, `tsconfig` 범위, 정적 파일은 로그인 없이 주고 자료는 `/api/ops`가 막음, 로그인 칸은 운영자 페이지 안에. R17, plan, T076·T077 |
| 37 | readiness | Major | contracts/api.md › 공통·공지·나의 분석 | 거절과 경계 응답이 여러 곳 빠졌다 | 수정(사용자 결정) | 위임 — 추천안: 500은 `server_error`, 거르기에 맞는 것이 없으면 `no_match`, 찾는 말 50자 초과는 `too_long`, 남의 활동 번호는 `not_found`, 분석이 꺼졌을 때는 `analysis_off`(409), `suggestActivity`의 네 칸, 증빙 주소 검사, 내 목록 순서, 쿠키 Max-Age. api.md, T009·T027·T038·T039·T059 |
| 38 | readiness | Major | tasks.md › T034·T059 | 목록이 바뀔 때 활동의 분야와 사람 판정의 분야를 정리하는 작업이 없다 | 수정 | spec Edge Cases가 이미 정했다(활동의 분야만 빠지고 활동은 남는다). FR-008, R11, data-model, T059·T063·T072에 작업과 시험 |
| 39 | readiness | Major | quickstart.md › 1·7, tasks T024·T089, spec SC-007 | 그대로는 할 수 없는 확인과 잴 작업이 없는 기준이 있다 | 수정 | 결과 파일에 분야 칸이 없음을 확인(`"fields"` 0곳). quickstart 1은 분야 칸을 손으로 더한 복사본, 7은 자동 시험(T027)을 가리킴. SC-007 재기를 T089에, R23 시험을 T027에 |
| 40 | readiness | Nit | plan.md › Project Structure | research의 결정 범위가 실제와 다르다 | 수정 | 사실 오류. R1~R23 |
| 41 | readiness | Nit | research.md › 머리 | 문서 상태 줄이 낡았다 | 수정 | 15번과 같은 곳 |
| 42 | readiness | Nit | quickstart.md › 3 | 다시 볼 날의 표현이 spec과 어긋난다 | 수정 | FR-026대로 '그 전날까지 없고 다시 볼 날부터 다시 나온다' |

## 재리뷰

대상: readiness(Blocker 17·18번을 고쳤다). 첫 VERDICT NO-GO → 재리뷰 VERDICT NO-GO. 17·18번은 재지적되지 않았다. 새 지적은 43~61번이다.
스킬 규칙상 재리뷰의 Blocker는 사용자 판단이지만, 사용자가 2026-11-19에 '내 입력을 기다리지 말고 추천대로 진행해 둬'라고 해서 추천안으로 고치고 `수정(사용자 결정)`으로 적었다. 더 재리뷰하지 않는다.

| # | 리뷰어 | 심각도 | 위치 | 요지 | 처리 | 근거·변경 |
|---|---|---|---|---|---|---|
| 43 | readiness | Blocker | tasks T021·T023·T011·T049·T051 | 넣기의 임베딩이 부하 제한·모델 잠금을 지나는 길이 작업 순서에 없다 | 수정(사용자 결정) | 위임 — 추천안: 넣기는 `embed` 함수를 받는다. 넣기 단계(Phase 3)는 `createThrottle` 문을 넣은 `makeEmbed`, T051 뒤 새 작업 T054b가 `openModel()`의 `embed`로 바꾸고 잠금 시험을 더한다. R7 |
| 44 | readiness | Major | api.md 공통, T009 | '같은 출처'의 비교 대상과 빈 본문 처리 | 수정(사용자 결정) | 위임: `Origin`의 host = `Host`(스킴 안 봄), 빈 본문은 `{}` |
| 45 | readiness | Major | R11, cli.md, T018·T021 | 벡터를 다시 읽거나 만드는 조건과 세 수 | 수정(사용자 결정) | 위임: DB에 벡터가 없는 기회·분야만, 세 수는 이번에 채우려 한 기회만, 만든 벡터는 분류기 보관에도, 확인 필요 글은 벡터 없음·`off`, `--dry-run`은 모델 안 부름 |
| 46 | readiness | Major | R5·R6, api.md, T027 | 운영 모드 HTTP 로그인 답과 잠금 뒤 실패 수 | 수정(사용자 결정) | 위임: 403 `https_required`, 잠금 뒤 첫 시도에서 0부터 |
| 47 | readiness | Major | api.md 공지·카드 행동, T038·T039 | 공지 아닌 글·닫힌 공지의 자세히와 행동 | 수정(사용자 결정) | 위임: 행동 없는 공지 아닌 글은 `not_found`, 열린 공지가 아니면 새 행동은 `invalid`, 지우기는 됨 |
| 48 | readiness | Major | api.md, R8 | 정렬 동점과 경계 여섯 | 수정(사용자 결정) | 위임: 동점은 글 번호 큰 순, cursor는 불투명, 마감 임박은 핵심만, 선반은 겹침을 뺀 뒤 10개, 마감 없는 공지는 닫히는 날로, 같은 점수 조건은 표 순서, 남은 날 14일은 마감 조각 없음, 모두 걸러지면 `no_match` |
| 49 | readiness | Major | R13 | 1~2월의 학기 표기 | 수정(사용자 결정) | 위임: 앞 해의 2학기 |
| 50 | readiness | Major | R9, data-model, T047 | 다시 고르기 줄 행을 지우는 때와 계산 중 다시 걸림 | 수정(사용자 결정) | 위임: 집을 때 지우지 않고 끝난 뒤 `queued_at`이 같을 때만 지움, 던지면 행을 둠, `cause` 값 목록 |
| 51 | readiness | Major | contracts/llm.md | 지시문에 FR-033(c) 빠짐, 재료의 빈 값, 판의 스키마 | 수정 | FR-033(c)는 spec에 이미 있다. 뼈대 5번으로 옮기고 '없음' 표기, 판은 `maximum: 10` 틀 스키마 |
| 52 | readiness | Major | R10, spec FR-030 | 증빙 글자가 두 문서에서 다르다 | 수정 | FR-030의 '증빙 링크'·'증빙 없음'으로 맞추고 예에 증빙 링크 줄을 더함 |
| 53 | readiness | Major | data-model analyses, T062·T064 | 사라진 줄을 가리키는 흐름과 `flow_version` | 수정(사용자 결정) | 위임: 사실 칸을 다시 쓸 때 그 흐름 문장을 빼고, `flow_version`은 오른 뒤의 판 |
| 54 | readiness | Major | api.md 운영자, data-model | 운영자 고치기의 경계 셋 | 수정(사용자 결정) | 위임: 공지인데 종류가 없게 되면 `invalid`, 넣기의 기록은 `edit`·`ingest`, 확인할 것에 행이 없던 공지는 행을 만들지 않음 |
| 55 | readiness | Major | R14 | 분류기 출력의 끝 줄이 늘 부하 줄은 아니다 | 수정 | `run.ts` 117행, `throttle.ts` 124행 확인. `부하:`로 시작하는 줄이 있으면 그 줄, 없으면 비움 |
| 56 | readiness | Major | data-model 5, cli.md, T080 | 요약의 꼴과 건너뛴 단계 | 수정(사용자 결정) | 위임: 단계 이름과 칸, 요약 키, `status` 출력 예. 분류기가 실패하면 넣기는 `skipped`(spec US6-2와 맞춤) |
| 57 | readiness | Major | T082 | 가져올 수 있는 이름 목록이 다른 문서와 맞지 않는다 | 수정 | 파일 단위 목록으로 바꾸고 `sensors.ts`를 더함. 바깥 요청 함수 호출 자리도 봄. plan 목록도 맞춤 |
| 58 | readiness | Major | quickstart 6, T085·T086 | 운영 묶음을 처음 띄우는 순서 | 수정(사용자 결정) | 위임: `migrate` → 분류기 → 첫 `ingest` → api, 되살리기용 DB 만드는 법, service의 `WorkingDirectory=/opt/kingo`와 `-f` |
| 59 | readiness | Major | quickstart 1·2·4 | 확인 절차 셋이 계약·작업 순서와 어긋난다 | 수정 | 결과 파일 계약(`taxonomy` 객체, `fieldRule`)에 맞춘 예, T036은 홈 줄을 T055로, 4절에 '활동을 하나 더 넣은 뒤' |
| 60 | readiness | Major | T076·T077·T084·T091·T092 | 끝났는지 확인할 방법이나 대상 경로가 없다 | 수정 | `ops-screen.md` 목차, 정적 파일 시험, `status.test.ts`, 고칠 문서와 적을 곳 |
| 61 | readiness | Nit | api.md 홈 | 예시 이유가 날짜 검사에 걸린다 | 수정 | 사실 어긋남. '고른 분야와 맞고 마감이 가까워요' |

## 집계

지적 61개 중 문서를 바꾼 것 61개
