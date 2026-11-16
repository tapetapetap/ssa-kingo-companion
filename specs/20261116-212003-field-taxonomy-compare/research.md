# Research: 분야 목록 3안 비교와 공지 분야 판정

결정마다 '결정 / 이유 / 버린 것' 순서로 적는다. 확인한 날은 모두 2026-11-16이다.

## R1. 분야는 기존 판정과 따로 묻는다

- **결정**: 기회로 판정된 공지에만 분야 질문을 한 번 더 한다. 기존 판정(기회 여부·종류·주최)의 지시문·스키마·보관 답은 그대로 둔다.
- **이유**: 기존 지시문을 바꾸면 판정 판이 바뀌어 개발용 501건을 다시 받고 스펙 2의 지표를 다시 재야 한다. 따로 물으면 분야 판정만 재면 된다. 기회만 물으므로 늘어나는 요청은 412건이다.
- **버린 것**: 한 질문에 분야 칸을 더하기. 요청 수는 줄지만 이미 잰 판정이 흔들린다.

## R2. 요청·보관 몸통은 두 판정이 함께 쓴다

- **결정**: `etl/notices/llm.ts`의 `makeAsk` 몸통을 공통 함수 `makeChat<T>`로 뺀다. 기회 판정과 분야 판정이 같은 몸통을 쓴다.
  - makeChat이 맡는 일: 보관 읽기, Ollama 요청, 120초 시간 초과는 실패, 연결 실패·404는 down, `.tmp`에 쓴 뒤 이름 바꿔 보관
  - 넣는 것: model, host, post
  - 보관 위치: `dir`(보관 뿌리), `sub`(모델 폴더 아래 폴더 이름)
  - 보관 파일에 더할 칸: `meta`(분야 판정은 `{ taxonomy, prompt }`)
  - 요청 내용: system, userMessage(행 → 글자), schema, options
  - 답 다루기: `parse`(답 글자 → T 또는 null), `isValid`(보관 파일 검사)
  - 부하 제한 연결: `gate`(R6의 요청 전후 고리, 없으면 바로 보낸다)
  - 기존 `makeAsk`는 `sub = PROMPT_VERSION`, `meta = { prompt: PROMPT_VERSION }`으로 지금과 같은 폴더·파일을 만든다.
- **이유**:
  - 같은 규칙을 두 번 쓰면 한쪽만 고쳐지는 일이 생긴다. 쓰는 곳이 실제로 둘이다.
  - 기존 `llm.test.ts`·`run.test.ts`·`eval.test.ts`가 고치지 않고 통과해야 한다(SC-008).
  - 지금 makeAsk는 폴더 이름과 파일의 `prompt` 칸에 같은 `PROMPT_VERSION`을 쓴다(llm.ts 163·199행). 분야 판정은 폴더가 `<안 id>-<판정 판>`이라, 폴더 이름과 파일 칸을 따로 넣어야 한다.
- **버린 것**: 분야 판정에 `makeAsk`를 복사하기.

## R3. 답 형식과 정리

- **결정**: Ollama 구조화 출력(`format`)에 JSON 스키마를 준다.
  - `핵심`은 분야 이름 enum 배열(최대 2), `관련`은 같은 enum 배열(최대 5)이다.
  - 이름은 안 안에서 겹치지 않게 만든다. 겹치면 '이름 (묶음 이름)'이다.
  - 답을 받은 뒤 다시 검사한다(spec Edge Cases).
    - 목록 밖 이름이 하나라도 있으면 실패
    - 같은 이름은 한 번만
    - 핵심과 관련에 같이 있으면 핵심에만
    - 넘치면 앞에서부터 자른다.
- **예시 글**: 지시문·라벨 기준·분야 설명의 예시는 개발용 정답셋 501건에 없는 글이나 짧게 지어낸 예를 쓴다. 표본 120건은 그 501건 안에서 뽑으므로 표본이 정해지기 전에 써도 겹치지 않는다. 마무리 점검(T041)에서 예시 제목이 `dev-501.csv`에 없는지 확인한다.
- **이유**:
  - enum이 있으면 모델이 목록 밖 이름을 거의 내지 못한다. 그래도 서버나 모델에 따라 스키마가 덜 지켜질 수 있어 다시 검사한다.
  - 이름으로 묻는 것은 id보다 모델이 뜻을 잘 읽기 때문이다. 보관과 결과 파일에는 id로 바꿔 넣는다.
- **버린 것**:
  - id로 묻기: 뜻이 없는 글자라 틀리기 쉽다.
  - 자유 글로 받아 가까운 이름 찾기: 틀린 연결을 만든다.

## R4. 판정 판

- **결정**: 판정 판 = sha1(JSON.stringify({ system, user, schema, think: false, options, limits, key, taxonomy }))의 앞 8자다.
  - user: 사용자 메시지 틀. 기존 `USER`와 같다.
  - limits·key: 본문 자르기 기준
  - taxonomy: groups의 `[id, name, parent]` 목록과 fields의 `[id, name, group, desc]` 목록
  - 스펙 2 `contracts/llm.md`의 '판'(글 내용만 뺀 요청 전체)과 같은 범위다. 기존 `PROMPT_PARTS`(llm.ts 76행)에 user·think가 있는 것과도 맞춘다.
- **보관**: `etl/.cache/llm-fields/<모델>/<안 id>-<판정 판>/<글 번호>.json`이다. 사람이 폴더를 알아보도록 안 id를 앞에 붙인다.
- **목록 판과의 구분**: 목록 판(`edition`, 만든 날·NCS 기준 월)은 사람이 읽는 표시다. 답을 다시 받을지는 판정 판만 정한다.
- **버린 것**: 파일 수정 시각으로 판 정하기(내용이 같아도 바뀐다).

## R5. 문맥 길이와 실행 순서

- **결정**:
  - 분야 판정의 `num_ctx`는 세 안 모두 같은 값이다. 32768에서 시작한다.
  - 본문 자르기는 기존 판정과 같다(앞 60줄 + 날짜·신청 낱말 줄, 120줄, 한 줄 300자, 합쳐 8,000자).
  - 세 안은 한 안씩 차례로 412건을 다 돌린다.
  - **잘림 막기**: Ollama 답의 `prompt_eval_count`가 `num_ctx`의 95% 이상이면 요청이 잘렸을 수 있다. 그 답은 실패로 보고 보관하지 않는다. `compare.ts check`는 안마다 목록 글자 수(묶음·분야 이름과 설명)를 출력하고, score는 실제 지시문 글자 수를 `systemChars`로 남긴다.
  - **문맥 키우기**: T021에서 ncs 안의 글 1건을 먼저 돌려 `prompt_eval_count`를 실행 기록에 남긴다. 그 값이 `num_ctx`의 70%를 넘으면 세 안 모두 `num_ctx`를 65536으로 올린 뒤 412건 판정(T029)을 시작한다. 판정 판이 바뀌지만 그때는 아직 잰 것이 없다.
- **이유**:
  - 2안은 분야가 270개라 지시문만 수만 자일 수 있다. 넘치면 Ollama가 앞부분(분야 목록)을 오류 없이 잘라 2안 지표만 조용히 나빠질 수 있다.
  - 세 안을 같은 설정으로 재야 비교가 공정하다.
  - 지시문(분야 목록)이 같은 요청을 이어 보내면 Ollama가 앞부분 계산을 다시 쓴다. 그래서 안을 섞지 않는다.
- **버린 것**:
  - 2안만 문맥을 늘리기(설정이 달라진다)
  - 2안을 대분류부터 두 번 묻기(요청이 두 배이고 방식이 다르다)

## R6. 부하 제한

- **결정**: `etl/notices/throttle.ts`의 `createThrottle()`이 실행 하나에 하나 만들어진다. 기회 판정과 분야 판정이 함께 쓰고 끄는 설정은 없다.
  - **연결**: 실제 요청 앞뒤에 건다. makeChat이 보관 답이 없을 때만 `gate.before()`를 부르고, 요청이 끝나면(답이든 실패든) `gate.after(ms)`를 부른다. 그래서 보관 답은 쉬거나 기다리지 않는다.
  - **쉼(GPU)**: `after(ms)`는 그 요청을 기다린 시간 ms의 1/4을 쉰다. 답이든 실패든 같다.
  - **온도 대기(칩)**:
    - `before()`가 칩 다이 센서(`PMU tdie*`) 최댓값을 읽는다.
    - 지금까지 요청 하나에 오른 가장 큰 폭(요청 직후 온도 − 직전 온도의 최댓값)을 더해 80°C 이상이면, 5초마다 다시 읽으며 기다린다.
  - **온도를 읽지 못함**: 한 번이라도 읽지 못하면 그 실행이 끝날 때까지 `before()`가 false를 돌려준다. 그러면 makeChat은 요청 없이 'down'을 돌려주고, throttle은 `noTemp`를 하나 센다.
  - **센서 읽기**
    - `etl/notices/thermal.c`(부록 A)를 처음 쓸 때 시스템 `clang -O2 -framework IOKit -framework CoreFoundation`으로 `etl/.cache/bin/thermal`에 빌드한다. 실행 파일이 c 파일보다 오래되면 다시 빌드한다.
    - 실행하면 `이름\t온도` 줄이 나오고, `PMU tdie`로 시작하는 줄의 최댓값을 쓴다.
    - 관리자 권한은 필요 없다.
  - **기록**
    - 5초마다 GPU 사용률(`ioreg -r -d 1 -c IOAccelerator`의 `"Device Utilization %"`)과 칩 온도를 읽는다.
    - 1분마다 그 1분의 평균 GPU와 최고 온도를 `etl/.cache/load/<시작 시각>.jsonl`에 한 줄씩 남긴다.
    - 타이머는 `unref()`라 프로세스가 끝나는 것을 막지 않는다.
  - **끝**: `stop()`이 기록을 멈추고 `{ gpuAvg, tempMax, logFile }`과 요약 줄 `부하: GPU 평균 n% · 칩 최고 n°C`를 돌려준다. gpuAvg는 실행 전체 5초 값의 평균이다(SC-005).
  - **만드는 곳**: `run.ts`·`eval.ts`·`compare.ts`의 파일 끝 진입 줄(`if (import.meta.main) …`)에서만 만든다. 시험이 main에 넣는 ask에는 throttle이 없어서 CI에서 센서와 Ollama를 부르지 않는다.
- **이유**:
  - 사용자가 고정한 수치(GPU 80%, 칩 80°C)다.
  - 스펙 2 research R12에서 이 방식으로 GPU 평균 76%, 최고 76.7°C를 지켰다. 그때 GPU 평균은 실행 전체 평균이었다. 처음에 최근 다섯 글의 오름폭으로 막았을 때는 80.8°C까지 올랐다.
  - 요청 앞뒤에 걸어야 보관 답을 버리지 않는다(FR-013). 또 '이번 실행에서 가장 큰 폭'(FR-015 b)을 두 판정이 함께 쓸 수 있다.
  - 이 컴퓨터(Apple M5 Pro)에서 센서(`PMU tdie1`…, 쉴 때 약 32°C)와 `Device Utilization %` 모두 sudo 없이 읽히는 것을 확인했다.
- **버린 것**:
  - Ask를 바깥에서 통째로 감싸기: 보관 답인지 미리 알 수 없어 보관 답까지 버린다.
  - `powermetrics`(sudo 필요), npm 패키지(새 의존성)
  - 저장소 밖 임시 실행기: 실행할 때마다 잊을 수 있다.

## R7. NCS 분류표

- **받는 곳**(확인함)
  - 자료실 글: `POST https://www.ncs.go.kr/th06/bbs_lib_view.do?libDstinCd=01`, 본문 `libSeq=20260205111407114`. 제목은 'NCS 정보망 DB(대분류별, 2026년 2월 기준)', 2026-02-05에 올라왔다.
  - 첨부: `POST https://www.ncs.go.kr/common/file/downloadFile.do`, 본문 `sysDstinCd=01&fileMstky=20260205111403008&filedetlSeq=20260205111403797&downlDstinCd=09`
  - 파일 `NCS정보망DB(대분류별,2026년2월).xlsx`, 약 200MB. `etl/.cache/ncs/`에 한 번 받고, 있으면 다시 받지 않는다. 요청은 1초에 1건이다.
- **파일 모양**(확인함)
  - 시트 24개(이름 '01'~'24', 대분류별)
  - 머리줄 A~T: 대분류코드, 대분류코드명, 중분류코드, 중분류코드명, 소분류코드, 소분류코드명, 세분류코드, 세분류코드명, 능력단위분류번호, … 지식기술태도의의
  - 코드는 단계마다 2자리 글자다(예: '01').
  - 시트 XML을 풀면 1GB가 넘는다(정보통신 시트만 약 210MB). 그래서 `unzip -p`로 시트를 흘려 읽으며 A~H 칸만 본다. 공유 문자열(약 48MB)은 한 번에 읽는다.
- **id 규칙**
  - 묶음: 대분류 `ncs-<대>`(예 `ncs-20`), 중분류 `ncs-<대><중>`(예 `ncs-2001`, parent는 대분류)
  - 분야: `ncs-<대><중><소>`(예 `ncs-200102`)
  - 이름은 코드명 그대로다.
- **설명 칸**: 소분류 정의 칸은 표에 없다. 그 소분류에 딸린 세분류 이름을 코드 순서로 쉼표로 잇는다. `descFrom: "source"`이고 240자를 넘으면 앞에서 자른다. 새로 쓴 문장은 넣지 않는다.
- **목록 판**: `edition: "2026-02"`(받은 DB의 기준 월)이고, 2025-12 개편이 반영된 표다.
- **개수 기록**: `sourceCounts: { major, middle, minor, detail }`에 받은 표의 대·중·소·세분류 수를 적는다. `checkTaxonomy`는 분야 수가 `sourceCounts.minor`와 같은지 본다. CI는 저장소의 `ncs.json`만으로 검사한다.
  - 공식 사이트 소개문은 '대분류(24개) → 중분류(81개) → 소분류(270개) → 세분류(1,096개)'다. 받은 표와 다르면 받은 표를 따르고 보고서에 적는다.
- **교과 지도 대응**: `ncs.ts` 안의 고정 표 `NCS_COURSE_MAP`(교과 지도 12줄 → NCS 소분류 코드)이 정한다. T008에서 정보통신 대분류의 소분류 목록을 보고 한 번 쓰며, 다시 돌려도 같은 값이 나온다. 대응이 없는 줄은 빈 배열이다.
- **이용 조건**: NCS 홈페이지 저작권정책에 따르면, 한국산업인력공단이 저작재산권 전부를 가진 저작물은 공공누리 제1유형(출처표시)으로 자유 이용할 수 있다. 학습모듈만 제2유형(상업 이용 불가)이다. 분류 이름은 제1유형이라 출처를 밝히고 저장소에 넣을 수 있다. 받은 원본은 저장소에 넣지 않는다.
- **대체 자료**: 공공데이터포털 '한국기술교육대학교 원격훈련심사센터 NCS 분류(2025-11-25, 이용허락범위 제한 없음)'는 원격훈련 심사용으로 거른 표다(대분류 24, 중분류 79, 소분류 231, 세분류 867). 공식 DB를 받지 못할 때만 사용자에게 묻고 쓴다.
- **버린 것**: 세분류 1,096개를 분야로 쓰기. 취향 고르기와 LLM 판정 모두에 너무 많다(브레인스토밍에서 사용자 동의).

## R8. 1안과 3안 초안, 그리고 다듬기를 미루는 이유

- **결정**: 1안과 3안은 이 스펙에서 손으로 초안을 쓰고, 세 안을 한 번씩만 잰다. 재기 전에 공지에 맞춰 다듬지 않는다. 고른 안이 85%에 못 미치면 그때 다듬는다(spec FR-021, 브레인스토밍 설계 '못 미치면 목록이나 지시문을 다듬고 다시 재요').
  - 1안: 큰 분야 12개 안팎에 세부 분야 100개 안팎이다.
    - 기술: CSRankings 27개 분야(`src/data/courses/csrankings.ts`)를 학생이 알아듣는 이름으로 풀고, 키마다 하나 이상 대응시킨다.
    - 직무: 백엔드, 프론트엔드, 모바일 앱, 클라우드·인프라, 데이터 엔지니어링, 데이터 분석, ML 엔지니어링, 보안 엔지니어링, 임베디드·펌웨어, 게임 개발, QA·테스트 등
    - 산업·응용: 핀테크, 헬스케어, 모빌리티, 커머스, 콘텐츠·미디어, 공공·사회 등
    - 전공 밖: 서비스 기획·PM, UX·UI 디자인, 창업, 마케팅·브랜딩, 경영·컨설팅, 외국어·국제, 글쓰기·발표, 교육 등
  - 3안: CSRankings 27개와 직무 12개 안팎(1안 직무와 같은 이름)이다. 연구 분야는 학생 말 이름을 `name`에, 원래 이름을 `desc` 맨 앞 괄호에 둔다(예 `desc: "(Computer vision) 사진·영상에서 …"`).
  - 세 안 모두 분류기 종류 11가지는 분야로 두지 않는다(FR-005).
- **이유**:
  - 재기 전에 1안·3안만 공지에 맞춰 다듬으면 NCS(고칠 수 없는 표준)와 조건이 달라진다.
  - 다듬은 뒤에는 판정 판이 바뀌어 412건을 다시 돌려야 해서 시간도 두 배가 된다.
  - 무엇을 다듬을지는 보고서의 빈 분야·쏠림 표가 보여 준다.
- **버린 것**:
  - 표본 밖 292건으로 먼저 다듬고 재기: 공정성과 시간 문제
  - 공지 제목을 모아 분야 만들기: 공지에 많은 채용 쪽으로 쏠린다.

## R9. 표본과 정답 라벨

- **표본 배분**: 개발용 정답셋(`etl/gold/dev-501.csv`)의 기회 412건을 종류별로 센다. 실제 수는 채용 182, 특강 88, 교육·캠프 53, 교과 25, 대회·공모전 24, 장학 14, 해커톤 13, 멘토링 6, 글로벌 3, 동아리·학회 3, 봉사 1이다.
  1. 몫(120 × 종류 수 / 412)이 1 미만인 종류에 먼저 1건씩 준다.
  2. 남은 자리를 나머지 종류에 큰 나머지 방식으로 나눈다.
  3. 같은 나머지는 종류 이름 순서로 정한다.
  - 지금 수로는 채용 53, 특강 25, 교육·캠프 15, 교과 7, 대회·공모전 7, 장학 4, 해커톤 4, 멘토링 2, 글로벌 1, 동아리·학회 1, 봉사 1이다(합 120).
- **뽑기**: 종류 안에서는 `sampleBySha1`(eval.ts) 순서로 뽑는다.
- **표본 파일**: `etl/gold/fields/sample.csv`
  - 칸: 링크, 게시판, 제목, 게시일, 종류. 종류는 dev-501.csv의 한글 이름 그대로다.
  - 줄 순서: 위 배분 표의 종류 순서, 종류 안에서는 뽑은 순서
- **라벨러 입력**: 게시판, 제목, LLM과 같은 방식으로 자른 본문(`clip`)이다. 본문이 든 입력 파일은 저장소 밖 임시 폴더에 만든다.
- **라벨러**: Claude 하위 에이전트다.
  - 안마다 A·B 둘이 40건씩 세 묶음을 서로 모른 채 단다.
  - 갈린 글은 셋째(C)가 정한다. C의 입력은 한 줄에 `{ no, link, board, title, body, a: { core, related, note }, b: { core, related, note } }`다.
  - 셋 다 LLM 답은 보지 않는다.
- **A·B 출력 검사**: 위반이 하나라도 있으면 글 번호와 이유를 모두 출력하고 1로 끝난다(gold 명령).
  - 글 집합이 표본 120건과 같다(빠진 글·남는 글 없음).
  - 글마다 한 번만 나온다.
  - 칸 안에 같은 id가 두 번 나오지 않는다.
  - 핵심 ≤ 2, 관련 ≤ 5이고 서로 겹치지 않는다.
  - 그 안에 있는 id만 쓴다.
- **정답 파일**: `etl/gold/fields/<안 id>.csv`. 칸은 링크, 제목, A 핵심, A 관련, B 핵심, B 관련, 최종 핵심, 최종 관련, 갈림, 메모다.
  - 분야 칸: id를 `|`로 잇는다. `-`는 '분야 없음'으로 정한 것이고, 빈칸은 '아직 안 정함'이다. 빈칸은 최종 칸에만 있을 수 있다.
  - 갈림: `X`(A·B 같음, 최종 = A), `O`(갈림, C를 기다림, 최종 빈칸), `C`(갈림, 최종 = C의 답)
  - C 없이 돌린 gold도 CSV를 쓰고, 갈린 글만 C 입력 파일로 낸다. 갈림 `O`가 남아 있으면 score가 거절한다.
- **이유**:
  - 사용자의 교차 라벨 방식이다. 수백 줄을 사람에게 맡기지 않고 갈린 줄만 보인다.
  - 세 안 모두 같은 120건, 같은 기준, 같은 라벨러 방식이라야 라벨러 일치도로 '목록이 헷갈리는지'를 비교할 수 있다.
  - '분야 없음'이 정답일 수 있으므로(spec Edge Cases) '없음'과 '미정'을 다른 표시로 나눈다.
- **버린 것**:
  - 사람이 120건 × 3안을 직접 라벨: 사용자 부담
  - LLM 답을 보여 주고 고치게 하기: 정답이 LLM 쪽으로 기운다.
  - 보통의 큰 나머지 방식: 봉사가 0건이 되어 '종류마다 1건 이상'을 어긴다.

## R10. 지표 계산

- **맞은 비율**은 표본 120건의 분야 붙임을 모두 합쳐 계산한다(micro). 보관 답이 없는 표본 글은 LLM 답이 빈 것으로 센다.
  - 핵심 정밀도 = Σ|LLM 핵심 ∩ 정답 핵심| / Σ|LLM 핵심|
  - 핵심 재현율 = Σ|LLM 핵심 ∩ 정답 핵심| / Σ|정답 핵심|
  - 전체 재현율 = Σ|LLM 전체 ∩ 정답 전체| / Σ|정답 전체|. 전체 = 핵심 ∪ 관련이다.
  - 관련 정밀도 = Σ|LLM 관련 ∩ 정답 전체| / Σ|LLM 관련|
  - 분모가 0이면 null('해당 없음')이다.
- **라벨러 일치도**(120건): A·B의 핵심이 똑같은 글의 비율과, 하나 이상 겹친 글의 비율을 센다. 둘 다 핵심을 비운 글은 두 비율 모두에 '맞음'으로 넣는다. 그래서 겹침 비율은 늘 똑같음 비율 이상이다.
- **412건 지표**: 빈칸·쏠림·실패는 412건으로 센다. 보관 답이 없는 글은 실패로 센다.
  - 빈칸: 핵심이 빈 글의 비율, 핵심과 관련이 모두 빈 글의 비율
  - 쏠림: 핵심으로 가장 많이 붙은 분야 3개의 붙임 수 / 전체 핵심 붙임 수. 핵심과 관련 어디에도 안 붙은 분야의 수, 전체 분야 대비 비율, id 목록(`unusedIds`)도 낸다.
  - 실패율: score 때 보관 답이 없는 글 수 / 412
- **판정 시간과 부하**: R16의 실행 기록에서 읽는다.
  - 글당 시간 = 그 실행의 requestMs / requests
  - 전체 시간 = 그 실행의 끝 − 시작(쉰 시간·온도 대기 포함)
- **교과 지도 연결**: 대응표에서 대응이 있는 줄 수 / 12
- **보고서용 목록**
  - top: 핵심으로 많이 붙은 분야 10개. 같으면 id 순서다.
  - misses: 표본 중 LLM 핵심 집합과 최종 정답 핵심 집합이 다른 글. 글 번호 오름차순으로 앞 10건이다.
  - splits.examples: 갈림이 `C`인 글. 글 번호 오름차순으로 앞 10건이다.
  - 제목과 링크만 담는다.

## R11. 미리보기와 보고서 (비공개 아티팩트)

- **비공개 아티팩트**: claude.ai에 올린 웹 페이지다. 처음에는 올린 사람(사용자)만 열 수 있다. 교수님은 사용자가 페이지의 Share 메뉴로 공유해야 연다.
- **누가 무엇으로 만드나**: 미리보기와 비교 보고서는 구현하는 에이전트가 손으로 만드는 일회용 HTML이다(저장소 밖 `$T/report/`).
  - 미리보기 `preview.html`: 세 분야 목록 파일(`etl/taxonomy/*.json`)의 내용을 페이지 안에 넣는다. `?v=custom|ncs|csrankings`로 안을 고른다.
    - 큰 분야 묶음, 세부 분야 칩(이름 + 설명), 찾기, 고른 수가 있다.
    - 3개 이상 고르면 '다음'이 켜진다.
    - 고른 것은 저장하지 않는다.
  - 보고서 `index.html`: `etl/out/fields-compare.json`의 내용을 페이지 안에 넣어 그린다. 공지는 제목과 링크만 보인다.
  - 두 파일을 한 아티팩트로 올린다. 저장소에는 넣지 않는다.
- **이유**: 미리보기는 고르기 위한 일회용 화면이다. 실제 화면은 3단계에서 새 디자인으로 만든다(spec Assumptions). 아티팩트는 사용자가 교수님께 그대로 공유할 수 있다.
- **버린 것**:
  - 앱 안 경로로 넣기: 지금 앱은 3단계에서 지운다.
  - 안마다 HTML 세 장: 같은 코드가 세 번이다.
  - 생성 스크립트를 저장소에 두기: 한 번 쓰고 버리는 화면이다.

## R12. 고르기, 85% 기준, 결과 파일

- **고르기**: `node etl/notices/compare.ts choose <안 id>`는 fields-compare.json에서 그 안의 지표를 읽는다.
  - 거절하는 경우: 그 안의 지표가 없음, 판정 판·모델이 지금 목록·모델과 다름, 핵심 정밀도가 null. 이때 1로 끝난다.
  - 그 밖에는 정밀도와 상관없이 그 안 파일에 `chosen: { date, corePrecision, prompt, model }`을 쓰고 다른 안의 chosen을 지운다.
  - 출력: `custom 고름 · 핵심 정밀도 0.88 · 85% 기준 통과`(미달이면 `… · 85% 기준 미달: 결과 파일에 분야를 넣지 않아요`)
- **결과 파일**: `run.ts`는 진입 줄에서 chosen인 안을 찾는다.
  - chosen이 둘 이상이면 오류로 1로 끝난다.
  - 분야를 넣는 조건: `chosen.corePrecision ≥ 0.85`이고, chosen의 판정 판·모델이 지금 목록·모델과 같다. 이때 기회마다 분야를 판정해 data-model 6의 칸을 더한다.
  - 조건이 안 맞으면 분야 판정을 하지 않는다. 결과 파일은 지금과 같고, 요약에 이유를 한 줄 적는다(예: `고른 안 custom의 핵심 정밀도 0.81 < 0.85라 분야를 넣지 않았어요`).
- **스키마**: 결과 파일 계약 `specs/20261107-193624-cse-notice-opportunities/contracts/cse-notices.schema.json`은 최상위와 opportunity 모두 `additionalProperties: false`다. 그래서 아래 선택 칸을 더한다. 스펙 2가 같은 파일을 고친 전례가 있다.
  - 최상위: `taxonomy { id, prompt }`
  - opportunity: `fields { core 최대 2, related 최대 5 }`, `fieldRule`(패턴 `^LLM: .+$`)
- **결정 로그**: 고른 사실은 구현하는 사람이 `docs/product/decisions.md`에 한 줄 적는다.
- **이유**: 고르기는 사람이 하고, 85% 기준은 결과 파일에 넣을지만 정한다(spec FR-020·021). 목록을 고친 뒤 옛 정밀도로 넣는 일을 판정 판 비교가 막는다. run.ts는 비교 결과 파일에 묶이지 않는다.
- **버린 것**:
  - choose가 미달을 거절하기: 고르기와 기준이 섞인다.
  - run.ts가 fields-compare.json을 직접 읽기: 실행마다 비교 결과에 묶인다.

## R13. 실행 시간 추정

- 스펙 2에서 gemma4:12b는 글당 약 2.2초였다(지시문 약 4,000자).
- 분야 판정은 지시문이 더 길다. 하지만 한 안씩 이어 보내면 앞부분 계산을 다시 쓰므로, 글마다 새로 계산하는 것은 본문뿐이다.
- 글당 3~5초로 잡으면 412 × 3 × 4초 × 1.25(쉼) ≈ 1.7시간이다. 온도 대기를 더해도 SC-006(3시간) 안이다.
- 첫 안을 돌린 뒤 실제 글당 시간으로 다시 추정하고, 넘을 것 같으면 보고한다.

## R14. 에이전트 맥락 갱신 스크립트

- 이 저장소의 `.specify/scripts/bash/`에는 agent context 갱신 스크립트가 없다(check-prerequisites, common, create-new-feature, setup-plan, setup-tasks뿐). 건너뛴다. 프로젝트 지침은 `CLAUDE.md`가 맡는다.

## R15. 전체 시스템 도식도

- **결정**: 이번 단계는 새 서비스를 들이지 않는다. 다만 사용자가 '구현 직전에 설계대로면 전체 시스템이 어떻게 생기는지' 도식도를 요청했다. 그래서 목표 구조 전체를 `system.html`(stack-diagram 스킬)로 이 폴더에 두고, 이번 단계가 만드는 부분을 표시한다.
  - 흐름: 출처 → 이 맥의 분류기(수집·규칙·LLM 판정·분야 판정·부하 제한) → 결과 파일·분야 목록 → 2단계 DB·API 서버 → 3단계 새 앱(취향 고르기, 추천, 에이전트가 아는 나)
  - 공개: plan.md에서 링크하고 2-1 게이트에서 보인다. 같은 그림을 비공개 아티팩트로도 올린다. 공개 갤러리에는 올리지 않는다.

## R16. 판정 실행 기록

- **결정**: `compare.ts judge`는 실행이 끝날 때마다 그 안·판정 판 폴더의 `runs.jsonl`에 한 줄을 더한다.
  - 꼴: `{ start, end, limit, total, cached, fresh, failed, notAsked, noTemp, empty, requests, requestMs, gpuAvg, tempMax, loadLog }`
  - limit: `--limit` 값, 전체면 null
  - requests·requestMs: 서버에 실제로 보낸 요청 수와 그 순수 대기 시간 합(쉼·온도 대기 제외). throttle이 `gate.after(ms)`로 받은 값을 더해 `stats`로 내준다. 그래서 기존 Outcome 꼴(`{ answer, cached } | 'fail' | 'down'`)은 바뀌지 않는다.
- **score가 읽는 법**: limit이 null이고 fresh ≥ 1인 마지막 줄을 그 안의 판정 시간·부하로 쓴다. 그런 줄이 없으면 그 안은 '판정 안 됨'으로 1로 끝난다. 실패율은 R10대로 score 때의 보관 상태로 센다. 그래서 같은 판을 다시 돌려 모두 보관이었던 확인 실행(SC-007)은 시간 계산에 쓰지 않는다.
- **이유**: 보관 답 파일에는 시간·부하가 없다. 실패는 보관하지 않으므로 보관 상태만으로는 판정 시간을 알 수 없다. 끝까지 실패하는 글은 거절하지 않고 실패로 센다(SC-001이 실패를 2%까지 허용).
- **버린 것**:
  - 보관 파일의 `at` 차이로 시간 추정: `--limit` 실행과 섞인다.
  - judge 출력을 사람이 옮겨 적기: 다시 계산할 수 없다.

## 부록 A. 칩 온도 읽기 C 코드 (`etl/notices/thermal.c`)

스펙 2 임시 실행기(2026-11-10, 저장소 밖)와 같은 코드다. IOKit의 비공개 HID 함수 선언을 직접 적고, Apple 벤더 페이지(PrimaryUsagePage `0xff00`)의 온도 센서(PrimaryUsage `5`)를 찾는다. 서비스마다 이름(`Product` 속성)과 온도 이벤트(종류 15, 값 필드 `15 << 16`)를 읽어 `이름\t온도` 줄로 낸다. 2026-11-16 이 맥에서 빌드하고 돌려 `PMU tdie1`… 줄이 나오는 것을 확인했다.

```c
#include <CoreFoundation/CoreFoundation.h>
#include <stdio.h>
typedef struct __IOHIDEvent *IOHIDEventRef;
typedef struct __IOHIDServiceClient *IOHIDServiceClientRef;
typedef struct __IOHIDEventSystemClient *IOHIDEventSystemClientRef;
extern IOHIDEventSystemClientRef IOHIDEventSystemClientCreate(CFAllocatorRef);
extern int IOHIDEventSystemClientSetMatching(IOHIDEventSystemClientRef, CFDictionaryRef);
extern CFArrayRef IOHIDEventSystemClientCopyServices(IOHIDEventSystemClientRef);
extern IOHIDEventRef IOHIDServiceClientCopyEvent(IOHIDServiceClientRef, int64_t, int32_t, int64_t);
extern CFStringRef IOHIDServiceClientCopyProperty(IOHIDServiceClientRef, CFStringRef);
extern double IOHIDEventGetFloatValue(IOHIDEventRef, int32_t);
int main(void) {
  int page = 0xff00, usage = 5; // Apple 벤더 페이지, 온도 센서
  const void *keys[] = { CFSTR("PrimaryUsagePage"), CFSTR("PrimaryUsage") };
  const void *vals[] = { CFNumberCreate(NULL, kCFNumberIntType, &page), CFNumberCreate(NULL, kCFNumberIntType, &usage) };
  CFDictionaryRef match = CFDictionaryCreate(NULL, keys, vals, 2, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
  IOHIDEventSystemClientRef sys = IOHIDEventSystemClientCreate(kCFAllocatorDefault);
  IOHIDEventSystemClientSetMatching(sys, match);
  CFArrayRef services = IOHIDEventSystemClientCopyServices(sys);
  if (!services || CFArrayGetCount(services) == 0) return 1;
  for (CFIndex i = 0; i < CFArrayGetCount(services); i++) {
    IOHIDServiceClientRef s = (IOHIDServiceClientRef)CFArrayGetValueAtIndex(services, i);
    CFStringRef name = IOHIDServiceClientCopyProperty(s, CFSTR("Product"));
    IOHIDEventRef e = IOHIDServiceClientCopyEvent(s, 15, 0, 0); // 온도 이벤트
    if (!name || !e) continue;
    char buf[128];
    CFStringGetCString(name, buf, sizeof buf, kCFStringEncodingUTF8);
    printf("%s\t%.1f\n", buf, IOHIDEventGetFloatValue(e, 15 << 16));
  }
  return 0;
}
```
