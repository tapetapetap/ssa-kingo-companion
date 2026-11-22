# Research: 분야 목록 3안 비교와 공지 분야 판정

결정마다 '결정 / 이유 / 버린 것' 순서로 적는다. 확인한 날은 따로 적지 않으면 2026-11-16이다.

## R1. 분야는 기존 판정과 따로 묻는다

- **결정**: 기회로 판정된 공지에만 분야 질문을 한 번 더 한다. 기존 판정(기회 여부·종류·주최)의 지시문·스키마·보관 답은 그대로 둔다.
- **이유**: 기존 지시문을 바꾸면 판정 판이 바뀌어 개발용 501건을 다시 받고 스펙 2의 지표를 다시 재야 한다. 따로 물으면 분야 판정만 재면 된다. 기회만 물으므로 늘어나는 요청은 412건이다.
- **버린 것**: 한 질문에 분야 칸을 더하기. 요청 수는 줄지만 이미 잰 판정이 흔들린다.

## R2. 요청·보관 몸통은 두 판정이 함께 쓴다

- **결정**: `etl/notices/llm.ts`의 `makeAsk` 몸통을 공통 함수 `makeChat<T>`로 뺀다. 기회 판정과 분야 판정이 같은 몸통을 쓴다.
  - makeChat이 맡는 일: 보관 읽기, Ollama `/api/chat` 요청, 120초 시간 초과는 실패, 연결 실패·404는 down(그 뒤로 서버를 부르지 않음), 잘림 막기(R5), `.tmp`에 쓴 뒤 이름 바꿔 보관
  - 넣는 것: model, host, post, options
  - 보관 위치: `dir`(보관 뿌리), `sub`(모델 폴더 아래 폴더 이름)
  - 보관 파일에 더할 칸: `meta`(분야 판정은 `{ taxonomy, prompt }`). 모든 보관 파일에 `promptTokens`(답의 `prompt_eval_count`, 없으면 null)도 남긴다. 읽을 때는 쓰지 않는다.
  - 요청 내용: `request(row, lines)`가 그 글의 `{ system, user, schema, parse }`를 돌려준다. 분야 판정은 후보(R17)가 글마다 달라 지시문·스키마·답 검사도 글마다 다르다. request가 'fail'이나 'down'을 돌려주면(임베딩 실패) 요청 없이 그 결과이고, down을 잠그지 않는다.
  - 보관 검사: `isValid`(보관 파일의 answer 꼴)
  - 부하 제한: `gate`(R6). 보관 답에는 부르지 않는다. `before()`가 false면 요청 없이 'down'이고 down을 잠그지 않는다. post를 부른 뒤에는 결과(답·실패·down)와 상관없이 `after(ms)`를 부른다.
  - 순서: 보관 → 잠긴 down → request → before → post → after → 답 검사·잘림 막기 → 보관
  - 공개: `readKept(file, isValid)`와 `modelDir(model)`(모델 이름의 영숫자·`._-` 밖은 `_`)을 내보낸다. 분야 답 읽기(`readFieldAnswer`)와 벡터 보관(R17)이 쓴다.
  - 기존 `makeAsk`는 `sub = PROMPT_VERSION`, `meta = { prompt: PROMPT_VERSION }`, 늘 같은 request(`SYSTEM`, `userMessage`, `SCHEMA`, `parseAnswer`)로 지금과 같은 폴더·파일을 만든다. 인자에 `gate?`만 더한다.
- **이유**:
  - 같은 규칙을 두 번 쓰면 한쪽만 고쳐지는 일이 생긴다. 쓰는 곳이 실제로 둘이다.
  - 기존 `llm.test.ts`·`run.test.ts`·`eval.test.ts`가 고치지 않고 통과해야 한다(SC-008). 보관 파일에 칸이 늘어도 `readKept`는 answer만 읽어 옛 파일도 그대로 쓴다.
  - 지금 makeAsk는 폴더 이름과 파일의 `prompt` 칸에 같은 `PROMPT_VERSION`을 쓴다(llm.ts 163·199행). 분야 판정은 폴더가 `<안 id>-<판정 판>`이라, 폴더 이름과 파일 칸을 따로 넣어야 한다.
  - gate가 false일 때 down을 잠그면 다음 글에서 before()가 불리지 않아, 온도 때문에 못 물은 수(noTemp)가 1에서 멈춘다.
- **버린 것**: 분야 판정에 `makeAsk`를 복사하기. 지시문을 makeChat 인자로 고정하기(후보가 글마다 달라 맞지 않는다).

## R3. 답 형식과 정리

- **결정**: Ollama 구조화 출력(`format`)에 JSON 스키마를 준다.
  - `핵심`은 그 글의 후보(R17) 이름 enum 배열(최대 2), `관련`은 같은 enum 배열(최대 5)이다.
  - 이름은 안 안에서 겹치지 않게 만든다. 겹치면 '이름 (묶음 이름)'이다.
  - 후보는 id·이름·묶음·설명을 갖지만, 모델에게는 묶음 머리 아래 `이름: 설명`만 보인다. id는 답을 정리한 뒤 보관과 결과 파일에만 쓴다.
  - 답을 받은 뒤 다시 검사한다(spec Edge Cases).
    - 후보 밖 이름이 하나라도 있으면 실패(목록 안 이름이어도)
    - 같은 이름은 한 번만
    - 핵심과 관련에 같이 있으면 핵심에만
    - 넘치면 앞에서부터 자른다.
- **예시 글**: 지시문·라벨 기준·분야 설명의 예시는 개발용 정답셋 501건에 없는 글이나 짧게 지어낸 예를 쓴다. 표본 120건은 그 501건 안에서 뽑으므로 표본이 정해지기 전에 써도 겹치지 않는다. 마무리 점검(T048)에서 예시 제목이 `dev-501.csv`에 없는지 확인한다.
- **이유**:
  - enum이 있으면 모델이 후보 밖 이름을 거의 내지 못한다. 그래도 서버나 모델에 따라 스키마가 덜 지켜질 수 있어 다시 검사한다.
  - 이름으로 묻는 것은 id보다 모델이 뜻을 잘 읽기 때문이다. 보관과 결과 파일에는 id로 바꿔 넣는다.
  - 후보 밖 답을 받으면 임베딩 단계를 건너뛴 셈이라 후보 적중률(R10)이 뜻을 잃는다.
- **버린 것**:
  - id로 묻기: 뜻이 없는 글자라 틀리기 쉽다(2안 `ncs-200102`).
  - 자유 글로 받아 가까운 이름 찾기: 틀린 연결을 만든다.

## R4. 판정 판

- **결정**: 판정 판 = sha1(JSON.stringify({ system, user, schema, think: false, options, limits, key, taxonomy, candidates }))의 앞 8자다.
  - system: 지시문 틀(후보 목록 앞까지). schema: 스키마 틀(enum 자리는 비운다). 후보는 글마다 달라 글 내용처럼 뺀다.
  - user: 사용자 메시지 틀. 기존 `USER`와 같다.
  - limits·key: 본문 자르기 기준
  - taxonomy: groups의 `[id, name, parent]` 목록과 fields의 `[id, name, group, desc]` 목록. 후보가 이 목록에서 나오므로 설명 한 글자도 판을 바꾼다.
  - candidates: 후보 규칙 `CANDIDATE_RULE`(R17의 임베딩 모델 이름, K, 분야 글·공지 글 규칙, 고르는 법)
  - 스펙 2 `contracts/llm.md`의 '판'(글 내용만 뺀 요청 전체)과 같은 범위다. 기존 `PROMPT_PARTS`(llm.ts 76행)에 user·think가 있는 것과도 맞춘다.
- **보관**: 답은 `etl/.cache/llm-fields/<모델>/<안 id>-<판정 판>/<글 번호>.json`이다. 사람이 폴더를 알아보도록 안 id를 앞에 붙인다. 벡터 보관은 R17이다.
- **목록 판과의 구분**: 목록 판(`edition`, 만든 날·NCS 기준 월)은 사람이 읽는 표시다. 답을 다시 받을지는 판정 판만 정한다.
- **버린 것**: 파일 수정 시각으로 판 정하기(내용이 같아도 바뀐다).

## R5. 문맥 길이와 실행 순서

- **결정**:
  - 분야 판정의 `num_ctx`는 세 안 모두 같은 값이다. 32768에서 시작한다.
  - 본문 자르기는 기존 판정과 같다(앞 60줄 + 날짜·신청 낱말 줄, 120줄, 한 줄 300자, 합쳐 8,000자).
  - 세 안은 한 안씩 차례로 412건을 다 돌린다.
  - **잘림 막기**: Ollama 답의 `prompt_eval_count`가 `num_ctx`의 95% 이상이면 요청이 잘렸을 수 있다. 그 답은 실패로 보고 보관하지 않는다. 답에 그 값이 없으면 검사하지 않는다(시험의 가짜 답). makeChat에 있어 기회 판정에도 걸린다.
  - **문맥 확인**: 보관 파일의 `promptTokens`(R2)로 본다. T028에서 ncs 안의 글 1건을 먼저 돌려 그 값을 실행 기록에 남긴다. `num_ctx`의 70%를 넘으면 세 안 모두 `num_ctx`를 65536으로 올린 뒤 412건 판정(T036)을 시작한다. 판정 판이 바뀌지만 그때는 아직 잰 것이 없다.
  - `compare.ts check`는 안마다 전체 목록 글자 수(묶음·분야 이름과 설명)를 출력한다. 지시문에는 그중 후보 30개만 들어간다.
- **이유**:
  - 지시문에는 후보 30개만 들어가(R17) 세 안 모두 수천 자다. 가장 긴 것은 설명(세분류 이름 나열, 240자까지)이 긴 2안 후보이고, 본문 8,000자가 더해진다. 넘치면 Ollama가 앞부분을 오류 없이 잘라 지표만 조용히 나빠질 수 있다.
  - 세 안을 같은 설정으로 재야 비교가 공정하다.
  - 안을 섞지 않으면 같은 지시문 앞부분(규칙)을 Ollama가 다시 쓰고, 실행 기록(R16)이 안마다 나뉜다.
- **버린 것**:
  - 2안만 문맥을 늘리기(설정이 달라진다)
  - 2안을 대분류부터 두 번 묻기(요청이 두 배이고 방식이 다르다)

## R6. 부하 제한

- **결정**: `etl/notices/throttle.ts`의 `createThrottle()`을 실행 하나에 하나 만든다. 기회 판정, 분야 판정, 임베딩(R17)이 함께 쓰고 끄는 설정은 없다.
  - **꼴**: `createThrottle(deps?) → { gate(), stop() }`. `gate()`는 판정마다 문을 하나씩 만든다(run.ts는 기회 판정 문과 분야 판정 문, compare.ts judge는 분야 판정 문 하나). 문은 `{ before(), after(ms), noTemp }`다.
    - throttle 하나가 함께 가지는 것: 가장 큰 오름폭, 온도 못 읽음 표시, 요청 수·시간, 기록
    - 문마다 따로 세는 것: noTemp(그 문에서 온도 때문에 보내지 않은 요청 수). run.ts의 K(contracts/cli.md)는 기회 판정 문의 noTemp로 낸다.
    - deps(시험에서만 바꾼다): `now() → number`(ms), `sleep(ms) → Promise<void>`, `every(ms, fn) → 멈추는 함수`(기본은 setInterval에 `unref()`), `readTemp() → Promise<number | null>`, `readGpu() → Promise<{ util: number | null, temp: number | null } | null>`(둘 다 R18), `logDir`(기본 `etl/.cache/load`), `platform`(기본 process.platform, 요약 줄의 '칩'·'CPU'를 정한다)
  - **연결**: 실제 요청 앞뒤에 건다. makeChat(R2)과 임베딩 요청(R17)이 보관이 없을 때만 `before()`를 부르고, post를 부른 뒤에는 결과와 상관없이 `after(ms)`를 부른다. 그래서 보관 답·보관 벡터는 쉬거나 기다리지 않는다.
  - **쉼(GPU)**: `after(ms)`는 그 요청을 기다린 시간 ms의 1/4을 쉰다. 답이든 실패든 같다.
  - **온도 대기**:
    - `before()`가 온도를 읽는다(운영체제별 센서는 R18).
    - 지금까지 요청 하나에 오른 가장 큰 폭(after에서 읽은 요청 직후 온도 − before에서 읽은 직전 온도의 최댓값)을 더해 80°C 이상이면, 5초마다 다시 읽으며 기다린다.
    - 가장 큰 폭은 0에서 시작하고 `max(지금 값, 이번 폭)`으로만 갱신한다. 그래서 음수가 되지 않고, 온도가 내려간 요청은 폭을 줄이지 않는다.
  - **온도를 읽지 못함**: before()나 after()에서 한 번이라도 못 읽으면 그 실행이 끝날 때까지 `before()`가 false다. 센서는 다시 부르지 않고, 그 문의 noTemp가 부를 때마다 하나씩 는다. 요청하는 쪽은 'down'을 돌려주되 down을 잠그지 않는다(R2). 그래서 noTemp는 온도 때문에 못 물은 글 수와 같다.
  - **기록**
    - 첫 실제 요청 앞(`before()`가 true를 돌려줄 때)에서 시작한다. 보관 답만 쓴 실행이나 온도를 처음부터 못 읽은 실행은 기록 파일을 만들지 않는다.
    - 5초마다 GPU 사용률과 온도를 읽는다(R18). 못 읽은 표본은 빼기만 하고, 요청을 멈출지는 before·after의 읽기가 정한다.
    - 1분마다 그 1분의 평균 GPU, 최고 온도, 최고 GPU 온도(리눅스만)를 `etl/.cache/load/<시작 시각>.jsonl`에 한 줄씩 남긴다.
    - 타이머는 `unref()`라 프로세스가 끝나는 것을 막지 않는다.
    - 기록 폴더를 만들거나 파일에 쓰지 못해도 판정은 계속한다. 그 1분 묶음은 버린다.
  - **끝**: `stop()`이 기록을 멈추고 `LoadSummary = { requests, requestMs, gpuAvg, tempMax, logFile, line }`을 돌려준다.
    - 여러 번 불러도 된다. 두 번째부터는 아무것도 하지 않고 첫 값을 돌려준다.
    - requests·requestMs는 `after(ms)`로 받은 요청 수와 ms 합이다(쉼·온도 대기 제외).
    - gpuAvg는 실행 전체 5초 값의 평균(SC-005)이고, GPU를 한 번도 못 읽었으면 null이다.
    - tempMax는 실행 동안 읽은 모든 온도(before·after 읽기와 5초 표본)의 최고다.
    - 기록 중이었으면 1분이 안 찬 마지막 표본 묶음도 한 줄로 남기고 멈춘다. logFile은 이 실행이 한 줄이라도 쓴 기록 파일의 경로이고, 쓰지 못했으면 null이다(같은 초에 시작한 다른 실행도 파일 이름이 같다).
    - requests가 0이면 gpuAvg·tempMax·logFile은 모두 null이다(data-model 3).
    - line은 요청이 0이면 빈 글자다. 아니면 `부하: GPU 평균 n% · 칩 최고 n°C`이고, 리눅스는 `칩` 대신 `CPU`, gpuAvg가 null이면 `GPU 평균 -`이다.
  - **만드는 곳**: `run.ts`·`eval.ts`·`compare.ts`의 파일 끝 진입 줄(`if (import.meta.main) …`)에서만 만든다.
    - main은 문(noTemp를 읽는다)과 `load: t.stop`을 선택 인자로 받아, 요약을 찍을 때 부른다.
    - 진입 줄은 main이 어떻게 끝나든(`finally`) `t.stop()`을 한 번 더 부른다.
    - 시험이 main에 넣는 ask·문은 가짜라 CI에서 센서와 Ollama를 부르지 않는다.
- **이유**:
  - 사용자가 고정한 수치(GPU 80%, 온도 80°C)다.
  - 스펙 2 research R12에서 이 방식으로 GPU 평균 76%, 최고 76.7°C를 지켰다. 그때 GPU 평균은 실행 전체 평균이었다. 처음에 최근 다섯 글의 오름폭으로 막았을 때는 80.8°C까지 올랐다.
  - 요청 앞뒤에 걸어야 보관 답을 버리지 않는다(FR-013). '이번 실행에서 가장 큰 폭'(FR-015 b)은 두 판정과 임베딩이 함께 쓴다.
  - noTemp를 throttle 하나로 세면 run.ts의 K에서 분야 판정의 못 물음까지 빠져 K가 작아지거나 음수가 된다.
  - main이 요약을 찍을 때 부하 값이 있어야 해서 stop()을 두 번 불러도 되게 했다. 멈추지 않고 값만 주는 함수를 따로 두는 것보다 하나가 적다.
  - 이 맥(Apple M5 Pro)에서 센서(`PMU tdie1`…, 쉴 때 약 32°C)와 `Device Utilization %` 모두 sudo 없이 읽히는 것을 확인했다.
- **버린 것**:
  - Ask를 바깥에서 통째로 감싸기: 보관 답인지 미리 알 수 없어 보관 답까지 버린다.
  - `powermetrics`(sudo 필요), npm 패키지(새 의존성)
  - 저장소 밖 임시 실행기: 실행할 때마다 잊을 수 있다.
  - throttle을 만들 때 기록 시작: 보관 답만 쓴 실행도 빈 기록 파일을 남긴다.
- **2026-11-23 고침**: 분야 판정 다듬기 3회차 판정(139분)에서 칩이 82.5°C까지 올라 80°C를 1분 넘었다. 요청 하나가 그때까지 본 가장 큰 오름폭보다 더 오른 것이다. 그래서 대기 조건을 '온도 + 가장 큰 오름폭 + 여유 2°C ≥ 80°C'로 바꾸고, 요청 도중의 5초 표본도 오름폭에 센다. 판정 판은 바뀌지 않는다(부하 제한은 판정 판 재료가 아니다).

## R7. NCS 분류표

- **받는 곳**(확인함)
  - 자료실 글: `POST https://www.ncs.go.kr/th06/bbs_lib_view.do?libDstinCd=01`, 본문 `libSeq=20260205111407114`. 제목은 'NCS 정보망 DB(대분류별, 2026년 2월 기준)', 2026-02-05에 올라왔다.
  - 첨부: `POST https://www.ncs.go.kr/common/file/downloadFile.do`, 본문 `sysDstinCd=01&fileMstky=20260205111403008&filedetlSeq=20260205111403797&downlDstinCd=09`
  - 파일 `NCS정보망DB(대분류별,2026년2월).xlsx`, 약 200MB. `etl/.cache/ncs/`에 한 번 받고, 있으면 다시 받지 않는다. 요청은 1초에 1건이다.
- **파일 모양**(확인함)
  - 시트 24개(이름 '01'~'24', 대분류별). 시트 이름은 `xl/workbook.xml`과 `xl/_rels/workbook.xml.rels`로 시트 파일에 잇는다.
  - 머리줄 A~T: 대분류코드, 대분류코드명, 중분류코드, 중분류코드명, 소분류코드, 소분류코드명, 세분류코드, 세분류코드명, 능력단위분류번호, … 지식기술태도의의
  - 코드는 단계마다 2자리 글자다(예: '01').
  - 시트 XML을 풀면 1GB가 넘는다(정보통신 시트만 약 210MB). 그래서 `unzip -p`로 시트를 흘려 읽으며 A~H 칸만 본다. 시트 XML은 줄바꿈이 없는 한 줄이라 `</row>`로 끊어 읽는다. 공유 문자열(약 48MB)은 한 번에 읽는다.
- **id 규칙**
  - 묶음: 대분류 `ncs-<대>`(예 `ncs-20`), 중분류 `ncs-<대><중>`(예 `ncs-2001`, parent는 대분류)
  - 분야: `ncs-<대><중><소>`(예 `ncs-200102`)
  - 이름은 코드명 그대로다.
- **설명 칸**: 소분류 정의 칸은 표에 없다. 그 소분류에 딸린 세분류 이름을 코드 순서로 `, `(쉼표와 빈칸)로 잇는다. `descFrom: "source"`다. 240자를 넘으면 240자 안에 드는 마지막 이름까지만 쓰고 말줄임표는 붙이지 않는다. 첫 이름 하나가 240자를 넘으면 그 이름을 240자에서 자른다. 새로 쓴 문장은 넣지 않는다.
- **목록 판**: `edition: "2026-02"`(받은 DB의 기준 월)이고, 2025-12 개편이 반영된 표다.
- **개수 기록**: `sourceCounts: { major, middle, minor, detail }`에 받은 표의 대·중·소·세분류 수를 적는다. `checkTaxonomy`는 분야 수가 `sourceCounts.minor`와 같은지 본다. CI는 저장소의 `ncs.json`만으로 검사한다(T010).
  - 공식 사이트 소개문은 '대분류(24개) → 중분류(81개) → 소분류(270개) → 세분류(1,096개)'다. 받은 표와 다르면 받은 표를 따르고 보고서에 적는다.
- **교과 지도 대응**: `ncs.ts` 안의 고정 표 `NCS_COURSE_MAP`(교과 지도 12줄 → NCS 소분류 코드)이 정한다. T009에서 정보통신 대분류(20)의 소분류 목록만 보고 한 번 쓰며, 다시 돌려도 같은 값이 나온다. 줄 이름과 소분류 이름이 같은 일을 가리킬 때만 넣고(예 보안 → 정보보호), 애매하면 넣지 않는다. 대응이 없는 줄은 빈 배열이다.
- **시험**: 읽기·만들기 함수(`readShared`, `readRows`, `buildNcs`)는 작은 XML 조각으로 `ncs.test.ts`에서 시험한다(T008). 받기와 흘려 읽기는 진입 줄이라 시험하지 않는다.
- **이용 조건**: NCS 홈페이지 저작권정책에 따르면, 한국산업인력공단이 저작재산권 전부를 가진 저작물은 공공누리 제1유형(출처표시)으로 자유 이용할 수 있다. 학습모듈만 제2유형(상업 이용 불가)이다. 분류 이름은 제1유형이라 출처를 밝히고 저장소에 넣을 수 있다. 받은 원본은 저장소에 넣지 않는다.
- **받지 못할 때**: 공식 DB를 받지 못하거나 시트·칸 모양이 위와 다르면 `ncs.ts`가 이유를 내고 1로 끝난다. 대체 자료(공공데이터포털 '한국기술교육대학교 원격훈련심사센터 NCS 분류', 소분류 231개)는 쓰지 않는다. 원격훈련 심사용으로 거른 표라 FR-003의 개편 분류표가 아니고, 꼴이 달라 읽는 코드가 하나 더 든다. 공식 DB는 위 '파일 모양'처럼 받아 열어 보았다(2026-11-16).
- **버린 것**: 세분류 1,096개를 분야로 쓰기. 취향 고르기와 LLM 판정 모두에 너무 많다(브레인스토밍에서 사용자 동의).

## R8. 1안과 3안 초안, 그리고 다듬기를 미루는 이유

- **결정**: 1안과 3안은 이 스펙에서 손으로 초안을 쓰고, 세 안을 한 번씩만 잰다. 재기 전에 공지에 맞춰 다듬지 않는다. 고른 안이 85%에 못 미치면 무엇을 다듬을지 사용자와 정해 새 작업으로 한다(spec FR-021, 브레인스토밍 설계 '못 미치면 목록이나 지시문을 다듬고 다시 재요').
  - **직무 11개**(고정, 1안과 3안이 같은 이름·id를 쓴다)

    | 이름 | id | 이름 | id |
    |---|---|---|---|
    | 백엔드 | `backend` | 데이터 분석 | `data-analysis` |
    | 프론트엔드 | `frontend` | ML 엔지니어링 | `ml-eng` |
    | 모바일 앱 | `mobile-app` | 보안 엔지니어링 | `security-eng` |
    | 클라우드·인프라 | `cloud` | 임베디드·펌웨어 | `embedded` |
    | 데이터 엔지니어링 | `data-eng` | 게임 개발 | `game` |
    | QA·테스트 | `qa` | | |

  - 1안: 큰 분야 11개 아래 세부 분야 90개다(검사 한도는 10~15개, 80~120개). 묶음은 화면 그림의 분야 고르기(2026-11-16: 인공지능·시스템·보안·개발 직무·데이터·그래픽스·HCI·이론·전공 밖)에 네트워크·클라우드, 소프트웨어 개발, 산업·응용을 더했다. CSRankings 27개 키(`src/data/courses/csrankings.ts`)가 모두 들어가게 나눴다.

    | 묶음 id | 이름 | 이 묶음 분야의 csr에 넣는 키 | 세부 분야 초안 | 수 |
    |---|---|---|---|---|
    | `g-ai` | 인공지능 | ai, mlmining, vision, nlp, robotics | 머신러닝, 딥러닝, LLM·생성형 AI, 자연어 처리, 컴퓨터 비전, 음성 AI, 추천 시스템, 강화학습, AI 에이전트, 로봇·피지컬 AI, 시계열·예측 | 11 |
    | `g-data` | 데이터 | mod, inforet, visualization | 데이터베이스, 빅데이터 플랫폼, 검색 엔진, 웹 데이터·크롤링, 데이터 시각화, 데이터 마이닝, 데이터 과학·통계 | 7 |
    | `g-systems` | 시스템 | arch, ops, bed, hpc, da, metrics | 운영체제, 컴퓨터 구조, AI 반도체, 임베디드·IoT, 실시간 시스템, 고성능·병렬 컴퓨팅, 반도체 설계 자동화, 성능 분석·최적화 | 8 |
    | `g-network` | 네트워크·클라우드 | comm, mobile | 컴퓨터 네트워크, 모바일·무선 통신, 차세대 통신, 클라우드 컴퓨팅, 분산 시스템, 엣지 컴퓨팅 | 6 |
    | `g-security` | 보안 | sec, crypt | 시스템 보안, 네트워크 보안, 웹·앱 보안, AI 보안, 개인정보 보호, 디지털 포렌식, 암호, 블록체인 | 8 |
    | `g-software` | 소프트웨어 개발 | plan, soft, log | 프로그래밍 언어·컴파일러, 프로그램 분석, 소프트웨어공학, 소프트웨어 아키텍처, 형식 검증·논리, 오픈소스, 웹 기술 | 7 |
    | `g-theory` | 이론 | act, ecom | 알고리즘, 계산 이론, 최적화, 양자 컴퓨팅, 게임 이론·메커니즘 설계 | 5 |
    | `g-hci` | 그래픽스·HCI | graph, chi | 컴퓨터 그래픽스, 3D·렌더링, HCI, 가상·증강현실, 접근성 | 5 |
    | `g-job` | 개발 직무 | 없음 | 위 직무 표 11개 | 11 |
    | `g-industry` | 산업·응용 | bio | 핀테크, 헬스케어·바이오, 모빌리티·자율주행, 커머스·유통, 콘텐츠·미디어, 공공·사회, 스마트 제조, 스마트 시티, 에너지·환경, 국방·우주 | 10 |
    | `g-beyond` | 전공 밖 | csed | 서비스 기획·PM, UX·UI 디자인, 창업, 마케팅·브랜딩, 경영·컨설팅, 경제·금융, 외국어·국제, 글쓰기·발표, 교육·에듀테크, 법·정책, 인문·예술, 리더십·협업 | 12 |

    - 쪼개는 기준: 세부 분야 하나는 학생이 공지·과목·채용 글에서 마주치는 말 하나다(예 'LLM·생성형 AI', '디지털 포렌식'). 'IT'처럼 너무 넓은 말과 회사·제품 이름은 분야로 두지 않는다.
    - csr: 표의 키는 그 묶음에서 알맞은 세부 분야의 csr에 넣는다. 한 분야의 csr은 0~2개이고, 다른 묶음의 키를 둘째로 넣어도 된다. 키마다 하나 이상의 분야에 들어가야 한다. 직무 분야는 csr을 비운다.
    - 이름: 초안 이름은 다듬어도 되지만 분야 수는 묶음마다 ±1 안에서 지킨다. 안 안에서 이름이 겹치지 않고, 분류기 종류 11가지와 같지 않아야 한다(data-model 1).
    - 분야 id: 영어 소문자·숫자와 `-`(예 `llm`, `digital-forensics`). `g-`로 시작하지 않는다(묶음 id와 겹치지 않게).
  - 3안: CSRankings 27개와 위 직무 11개, 합 38개다.
    - 묶음 5개: `g-ai` AI, `g-systems` 시스템, `g-theory` 이론, `g-inter` 융합(`CSR_GROUP_LABEL`의 키·이름 그대로), `g-job` 개발 직무(1안과 같은 이름)
    - 연구 분야: id는 CSRankings 키 그대로(예 `vision`), name은 `CSR_AREAS`의 label 그대로(예 '컴퓨터 비전'), group은 `g-<그 키의 묶음>`, csr은 `[그 키]`다. desc는 원래 영어 이름(csrankings.ts 주석)을 맨 앞 괄호에 두고 한 줄 설명을 붙인다(예 `desc: "(Computer vision) 사진·영상에서 …"`).
    - 직무 분야: 위 직무 표 그대로, group은 `g-job`, csr은 없다.
  - courseMap(1안·3안): 교과 지도 줄(`src/data/courses/swe.ts`)의 areas와 분야의 csr이 하나라도 겹치면 그 줄에 그 분야 id를 넣는다(목록 순서). csr이 없는 분야는 넣지 않는다. 2안은 csr이 없어 R7의 `NCS_COURSE_MAP`이 정한다.
  - 세 안 모두 분류기 종류 11가지는 분야로 두지 않는다(FR-005).
- **이유**:
  - 재기 전에 1안·3안만 공지에 맞춰 다듬으면 NCS(고칠 수 없는 표준)와 조건이 달라진다.
  - 다듬은 뒤에는 판정 판이 바뀌어 412건을 다시 돌려야 해서 시간도 두 배가 된다.
  - 무엇을 다듬을지는 보고서의 빈 분야·쏠림 표가 보여 준다.
  - 직무 이름·id를 여기 고정해 두면 1안·3안을 따로 써도 같다(T006·T007을 함께 한다). id는 CSRankings 키(`mobile` 등)와 겹치지 않게 골랐다.
  - 1안 묶음 표는 사용자가 화면 그림에서 본 분야 고르기 묶음을 따른다. 묶음·키 자리·분야 수를 여기 정해 두어 목록을 쓰는 사람이 새로 정할 것이 없다. 직무 묶음 이름이 두 안에서 같아야 직무 분야의 임베딩 글('묶음 > 이름: 설명')도 같다.
  - courseMap을 csr로 기계적으로 정해야 '교과 지도 연결' 지표가 쓰는 사람의 판단에 기대지 않는다.
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
- **라벨러 입력**: 게시판, 제목, LLM과 같은 방식으로 자른 본문(`clip`)이다. 본문이 든 입력 파일은 저장소 밖 임시 폴더에 만든다. 표본 글의 본문 보관본이 없으면 label-input과 gold(셋째 입력)는 쓰지 않고 1로 끝난다. 라벨이 네트워크 상태에 따라 달라지지 않게 한다(eval.ts와 같은 이유).
- **라벨러**: Claude 하위 에이전트다.
  - 안마다 A·B 둘이 40건씩 세 묶음을 서로 모른 채 단다.
  - 후보가 아니라 그 안의 전체 목록에서 고른다. 그래야 후보 적중률(R10)이 임베딩이 버린 정답을 센다.
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

- **값의 꼴**: 비율은 `{ num, den }`으로 저장하고 반올림하지 않는다.
  - 기준 비교는 정수로 한다(`num × 100 ≥ 85 × den`). eval.ts 139·147행과 같은 이유다.
  - 표시는 백분율을 소수 첫째 자리까지 내림하고 `(num/den)`을 붙인다(예 `84.9% (147/173)`). 내림이라 미달인 값이 85.0%로 보이지 않는다.
  - 분모가 0이면 '해당 없음'이다. 개수(unused, courseMapRows)와 시간(secPerAsk, wallMinutes)은 수 그대로다.
- **맞은 비율**은 표본 120건의 분야 붙임을 모두 합쳐 계산한다(micro). 보관 답이 없는 표본 글은 LLM 답이 빈 것으로 센다.
  - 핵심 정밀도 = Σ|LLM 핵심 ∩ 정답 핵심| / Σ|LLM 핵심|
  - 핵심 재현율 = Σ|LLM 핵심 ∩ 정답 핵심| / Σ|정답 핵심|
  - 전체 재현율 = Σ|LLM 전체 ∩ 정답 전체| / Σ|정답 전체|. 전체 = 핵심 ∪ 관련이다.
  - 관련 정밀도 = Σ|LLM 관련 ∩ 정답 전체| / Σ|LLM 관련|
- **후보 적중률**(표본 120건, micro): 정답이 후보(R17의 30개) 안에 든 비율이다. 기획 문서의 '정답이 후보 안에 든 비율'이 이것이다.
  - 핵심 = Σ|정답 핵심 ∩ 후보| / Σ|정답 핵심|
  - 전체 = Σ|정답 전체 ∩ 후보| / Σ|정답 전체|
  - score가 보관 벡터로 후보를 다시 계산한다(요청 없음). 공지 벡터가 없는 표본 글은 후보가 없는 것으로 센다. 분야 벡터 파일이 없으면 score가 거절한다. 분야가 30개 이하인 안은 모든 분야가 후보라 벡터를 읽지 않는다.
  - 분야가 적은 안일수록 높게 나오므로 보고서에 후보 비율(30 / 분야 수)을 함께 보인다.
- **라벨러 일치도**(120건): A·B의 핵심이 똑같은 글의 비율과, 하나 이상 겹친 글의 비율을 센다. 둘 다 핵심을 비운 글은 두 비율 모두에 '맞음'으로 넣는다. 그래서 겹침 비율은 늘 똑같음 비율 이상이다.
- **412건 지표**: 빈칸·쏠림·실패는 412건으로 센다. 보관 답이 없는 글은 실패로 센다.
  - 빈칸: 핵심이 빈 글의 비율, 핵심과 관련이 모두 빈 글의 비율
  - 쏠림: 핵심으로 가장 많이 붙은 분야 3개의 붙임 수 / 전체 핵심 붙임 수. 핵심과 관련 어디에도 안 붙은 분야의 수, 전체 분야 대비 비율, id 목록(`unusedIds`)도 낸다.
  - 실패율: score 때 보관 답이 없는 글 수 / 412
- **판정 시간과 부하**: R16의 실행 기록에서 읽는다.
  - 글당 시간 = 그 실행의 requestMs / (fresh + failed). 임베딩 시간이 들고 쉼·온도 대기는 빠진다. 분모가 0이면 null이다.
  - 전체 시간 = 그 실행의 끝 − 시작(쉰 시간·온도 대기 포함)
- **교과 지도 연결**: 대응표에서 대응이 있는 줄 수(12줄 중, 개수)
- **보고서용 목록**
  - top: 핵심으로 많이 붙은 분야 10개. 같으면 id 순서다.
  - misses: 표본 중 LLM 핵심 집합과 최종 정답 핵심 집합이 다른 글. 글 번호 오름차순으로 앞 10건이다.
  - splits.examples: 갈림이 `C`인 글. 글 번호 오름차순으로 앞 10건이다.
  - 제목과 링크만 담는다.
- **함수 자리**: 계산은 `etl/notices/score.ts`의 순수 함수다. 꼴은 tasks T034다.

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
  - 거절하는 경우: 그 안의 지표가 없음, 판정 판·모델이 지금 목록·모델과 다름, 핵심 정밀도의 분모가 0. 이때 1로 끝난다.
  - 그 밖에는 정밀도와 상관없이 그 안 파일에 `chosen: { date, corePrecision: { num, den }, prompt, model }`을 쓰고 다른 안의 chosen을 지운다.
  - 출력: `custom 고름 · 핵심 정밀도 88.0% (88/100) · 85% 기준 통과`(미달이면 `… · 85% 기준 미달: 결과 파일에 분야를 넣지 않아요`). 표시와 비교는 R10을 따른다.
- **함수**(`etl/taxonomy/taxonomy.ts`, 시험은 taxonomy.test.ts)
  - `findChosen(list)`: chosen이 있는 안 하나 또는 null을 돌려준다. 둘 이상이면 `고른 안이 둘 이상이에요: custom, ncs`를 던진다. `compare.ts check`도 이 함수로 '많아야 하나'를 본다.
  - `fieldGate(t, version, model)`: `{ ok: true }` 또는 `{ reason }`을 돌려준다. 판정 판 → 모델 → 정밀도 순으로 보고 처음 걸린 이유 하나를 낸다(문구는 contracts/cli.md).
- **결과 파일**: `run.ts` 진입 줄이 `findChosen`으로 고른 안을 찾는다.
  - 고른 안이 둘 이상이면(findChosen이 던지면) 그 문구를 내고 1로 끝난다. 1로 끝나는 것은 이때뿐이다.
  - 목록 파일을 읽지 못하면(파일 없음·JSON 아님·꼴 틀림) 공지 수집은 그대로 돈다. main에 `field: { reason }`을 넘겨 요약에 이유를 한 줄 낸다.
  - 고른 안이 있으면 분야 판정기(`makeFieldAsk`)를 만들고 `fieldGate(chosen, ask.version, ask.model)`을 본다. 통과면 main에 `field: { ask, gate }`를, 아니면 `field: { reason }`을 넘긴다.
  - 통과면 기회마다 분야를 판정해 data-model 7의 칸을 더한다. 아니면 분야 판정을 하지 않고 결과 파일은 지금과 같으며, 요약에 이유를 한 줄 적는다.
- **스키마**: 결과 파일 계약 `specs/20261107-193624-cse-notice-opportunities/contracts/cse-notices.schema.json`은 최상위와 opportunity 모두 `additionalProperties: false`다. 그래서 아래 선택 칸을 더한다. 스펙 2가 같은 파일을 고친 전례가 있다.
  - 최상위: `taxonomy { id(custom·ncs·csrankings), prompt(8자리 16진) }`
  - opportunity: `fields { core(최대 2), related(최대 5) }`(문자열 배열, 겹침 없음), `fieldRule`(패턴 `^LLM: .+$`)
- **결정 로그**: 고른 사실은 구현하는 사람이 `docs/product/decisions.md`에 한 줄 적는다.
- **이유**: 고르기는 사람이 하고, 85% 기준은 결과 파일에 넣을지만 정한다(spec FR-020·021). 목록을 고친 뒤 옛 정밀도로 넣는 일을 판정 판 비교가 막는다. 조건은 순수 함수라 시험이 닿고, 진입 줄은 함수를 잇기만 한다. run.ts는 비교 결과 파일에 묶이지 않는다.
- **버린 것**:
  - choose가 미달을 거절하기: 고르기와 기준이 섞인다.
  - run.ts가 fields-compare.json을 직접 읽기: 실행마다 비교 결과에 묶인다.
  - 조건을 진입 줄에만 두기: 시험이 닿지 않는다.

## R13. 실행 시간 추정

- 스펙 2에서 gemma4:12b는 글당 약 2.2초였다(지시문 약 4,000자, 같은 지시문을 이어 보내 앞부분 계산을 다시 씀).
- 분야 판정은 후보가 글마다 달라 다시 쓰는 앞부분이 규칙 부분(1~2천 자)뿐이다. 글마다 새로 계산하는 것은 후보(1안·3안 약 2천 자, 2안은 설명이 길어 최대 약 8천 자)와 본문이다.
- 글당 4~7초로 잡으면 412 × 3 × 5.5초 × 1.25(쉼) ≈ 2.4시간이다. 임베딩은 공지 412건(세 안이 함께 씀)과 분야 약 410개라 몇 분이다. 온도 대기를 더하면 SC-006(3시간)에 가깝다.
- 첫 안을 돌린 뒤 실제 글당 시간으로 다시 추정한다. 넘을 것 같으면 보고서에 적고 계속 돌린다(사용자 위임 2026-11-17: 묻지 않고 추천대로).

## R14. 에이전트 맥락 갱신 스크립트

- 이 저장소의 `.specify/scripts/bash/`에는 agent context 갱신 스크립트가 없다(check-prerequisites, common, create-new-feature, setup-plan, setup-tasks뿐). 건너뛴다. 프로젝트 지침은 `CLAUDE.md`가 맡는다.

## R15. 전체 시스템 도식도

- **결정**: 이번 단계는 새 서비스를 들이지 않는다. 다만 사용자가 '구현 직전에 설계대로면 전체 시스템이 어떻게 생기는지' 도식도를 요청했다. 그래서 목표 구조 전체를 `system.html`(stack-diagram 스킬)로 이 폴더에 두고, 이번 단계가 만드는 부분을 표시한다. 2026-11-17 판에는 임베딩 후보(30개 → LLM)와 운영 서버(학교 데스크톱, Ubuntu)가 들어 있다.
  - 흐름: 출처 → 분류기(수집·규칙·LLM 판정·임베딩 후보·분야 판정·부하 제한) → 결과 파일·분야 목록 → 2단계 DB·API 서버(학교 데스크톱) → 3단계 새 앱(취향 고르기, 추천, 에이전트가 아는 나)
  - 공개: plan.md에서 링크한다. 2-1 승인 게이트는 사용자가 면제했다(2026-11-17 '내 승인은 생략하고 모두 추천으로 진행'). 그래서 그림과 실사용 변화는 비교 보고서(T041)에 남긴다. 같은 그림을 비공개 아티팩트로도 올린다. 공개 갤러리에는 올리지 않는다.

## R16. 판정 실행 기록

- **결정**: `compare.ts judge`는 실행이 끝날 때마다 그 안·판정 판 폴더의 `runs.jsonl`에 한 줄을 더한다.
  - 꼴: `{ start, end, limit, total, cached, fresh, failed, notAsked, noTemp, empty, requests, requestMs, gpuAvg, tempMax, loadLog }`
  - limit: `--limit` 값, 전체면 null
  - notAsked: 'down'인 글과 본문을 얻지 못한 글. noTemp는 그중 온도 때문에 못 물은 수(분야 판정 문의 noTemp)다.
  - requests·requestMs: 서버에 실제로 보낸 요청(임베딩 포함) 수와 그 순수 대기 시간 합(쉼·온도 대기 제외). throttle의 `stop()`이 돌려준다(R6). 그래서 기존 Outcome 꼴(`{ answer, cached } | 'fail' | 'down'`)은 바뀌지 않는다.
- **score가 고르는 줄**: limit이 null이고 notAsked가 0이며 total이 0보다 큰 줄 가운데 cached가 가장 작은 줄(같으면 마지막 줄)을 그 안의 판정 시간·부하로 쓴다.
  - 못 물은 글이 있는 실행(서버에 닿지 못함·온도)은 묻지 않은 만큼 시간이 짧게 잡혀 고르지 않는다. 기회가 0건인 정답셋은 `devOpportunities`가 거절한다.
  - 실패를 채우는 재실행과 SC-007 확인 실행은 cached가 커서 덮지 않는다. T028이 남긴 보관 답(몇 건) 위에서 돈 첫 전체 실행은 고른다.
  - 끊긴 실행은 줄을 남기지 않는다(끝에서 쓴다). 이어 돌린 실행이 골라지면 전체 시간은 이어 돌린 만큼이다. 그래서 fields-compare.json의 `run`에 그 줄의 cached를 함께 둔다.
  - 그런 줄이 없으면 그 안은 '판정 안 됨'으로 1로 끝난다.
  - 실패율은 R10대로 score 때의 보관 상태로 센다.
- **이유**: 보관 답 파일에는 시간·부하가 없다. 실패는 보관하지 않으므로 보관 상태만으로는 판정 시간을 알 수 없다. 끝까지 실패하는 글은 거절하지 않고 실패로 센다(SC-001이 실패를 2%까지 허용).
- **버린 것**:
  - 보관 파일의 `at` 차이로 시간 추정: `--limit` 실행과 섞인다.
  - judge 출력을 사람이 옮겨 적기: 다시 계산할 수 없다.
  - 'fresh ≥ 1인 마지막 줄': 실패 몇 건을 채운 재실행이 412건 실행을 덮는다.
  - 'cached = 0인 줄만': T028이 남긴 보관 답 때문에 첫 전체 실행도 걸러진다.

## R17. 임베딩으로 후보를 줄인다 (사용자 결정 2026-11-16)

- **결정**: 분야 판정은 두 단계다. 임베딩으로 글마다 후보를 줄인 뒤 LLM이 후보 안에서 고른다(`etl/notices/embed.ts`).
  - **모델**: `bge-m3`(상수 `EMBED_MODEL`). 같은 Ollama 서버의 `/api/embed`를 쓴다. 바꾸려면 상수를 고친다(판정 판이 바뀐다).
  - **분야 글**: 분야 하나를 `<묶음 경로> > <이름>: <설명>` 한 줄로 만든다. 묶음 경로는 묶음과 그 위 묶음 이름을 위에서부터 ` › `로 잇는다(2안 `정보통신 › 정보기술`).
  - **공지 글**: `<제목>\n<본문 앞 1,500자>`(본문 줄을 `\n`으로 이은 앞 1,500자). 본문 글자가 없으면 제목만이다.
  - **후보**: 공지 벡터와 분야 벡터의 코사인 유사도 상위 K=30개(`EMBED_K`). 같은 점수는 목록 순서다. 안의 분야가 30개 이하면 모두 후보이고 임베딩을 부르지 않는다.
  - **지시문**: 후보만 목록 순서(묶음 순서, 묶음 안 분야 순서)로 넣는다. 유사도 순서는 보이지 않는다(앞에 놓인 분야로 쏠리지 않게).
  - **요청**: `POST /api/embed` 몸통 `{ model, input: [글…], truncate: true, keep_alive: "10m" }`, 답 `{ embeddings: number[][] }`. 분야 글은 한 요청에 32개까지, 공지 글은 한 요청에 하나다.
  - **실패 구분**(makeChat과 같다): 120초 시간 초과·2xx 아님·꼴 틀림(개수, 차원, 수 아님)은 'fail'. 연결 실패·404(모델 없음)는 'down'이고 그 뒤로 부르지 않는다. 부하 제한(R6)의 before()가 false면 'down'이고 잠그지 않는다.
  - **보관**(`etl/.cache/embed/<모델>/`, `.gitignore` 안)
    - 분야 벡터: `<안 id>-<목록 sha>.json`. 목록 sha는 `[id, 분야 글]` 목록 sha1의 앞 8자다. 설명이 바뀌면 새 파일이다.
    - 공지 벡터: `notices/<글 번호>.json`. 파일에 공지 글 sha1의 앞 8자를 두고, 글이 바뀌었으면 다시 받는다. 세 안이 함께 쓴다.
    - 벡터와 sha만 둔다. 본문 글자는 넣지 않는다.
  - **실패한 글**: 임베딩이 'fail'이면 그 안의 분야는 빈칸이고 실패로 센다. 'down'이면 못 물음이다. 실행은 멈추지 않는다. 분야 벡터는 FieldAsk 하나에 한 번 갖추고 성공과 'fail'만 기억한다. 'down'은 잠긴 down이나 온도 표시가 바로 다시 돌려주므로 기억하지 않는다(그래야 noTemp가 글마다 센다).
  - **판정 판**: `CANDIDATE_RULE = { model, k, field, notice, pick }`이 판정 판 재료에 든다(R4).
  - **확인**(2026-11-17, 이 맥 Ollama 0.32.0): bge-m3는 1024차원이고 길이 1로 정규화돼 나온다. 그래도 코사인은 길이로 나눠 계산한다.
- **이유**:
  - 2안은 분야가 270개라 전체를 지시문에 넣으면 수만 자다. 후보만 넣으면 세 안 지시문 길이가 비슷해져 비교가 공정하고, 잘림 위험(R5)도 준다.
  - bge-m3는 한국어를 포함한 여러 언어의 검색용으로 학습됐고, 문맥이 8,192토큰이라 공지 글이 잘리지 않는다. 이 맥에 이미 있고(1.2GB, F16, 약 5.7억 매개변수) 같은 Ollama로 로컬에서 돈다. 새 의존성이 없고 본문이 밖으로 나가지 않는다.
  - 작은 확인(2026-11-17): 지어낸 대회 모집 글 하나와 분야 다섯으로 재 보니, bge-m3는 맞는 분야(0.63)와 상관없는 회계(0.36)의 차이가 컸고 순서가 맞았다. nomic-embed-text는 0.74~0.85 사이에 몰렸고 회계가 백엔드·게임보다 위였다.
  - 같은 벡터를 다음 단계가 다시 쓴다: 2단계 DB 벡터 칸, 3단계 추천·컴패니언 기억 찾기, 4단계 같은 기회 후보, 5단계 과목↔공지(사용자 결정 2026-11-16).
  - 후보 적중률(R10)로 임베딩이 정답을 버리는지 LLM과 따로 잰다.
  - K=30은 사용자 결정이다. 1안(100개 안팎)의 약 30%, 2안의 11%, 3안(38개)의 79%다.
- **버린 것**:
  - `nomic-embed-text`(이 맥에 있음, 274MB): 영어 위주로 학습됐고 위 확인에서 한국어 순서가 틀렸다. 문맥도 2,048토큰이다.
  - multilingual-e5: 한국어는 되지만 이 맥에 없고, 글 앞에 `query:`·`passage:`를 붙이는 규칙이 더 있다.
  - 클라우드 임베딩 API: 공지 본문이 밖으로 나가고 키·비용이 든다.
  - 후보 없이 전체 목록: 위 공정성·길이 문제
  - 안마다 다른 K: 비교 조건이 달라진다.

## R18. 운영체제별 센서 (운영 서버 결정 2026-11-16)

- **결정**: `etl/notices/sensors.ts`가 `process.platform`으로 나눈다. throttle(R6)은 `readTemp()`와 `readGpu()`만 부른다. 규칙은 두 운영체제가 같다(사용자 고정): 요청 시간의 1/4 쉼, 온도 + 가장 큰 오름폭 80°C 대기, 못 읽으면 그 실행의 새 요청 멈춤.
  - **darwin(이 맥, 오늘 밤 판정)**
    - 온도: `thermal.c`(부록 A)의 `PMU tdie*` 줄 최댓값. 처음 쓸 때 `clang -O2 -framework IOKit -framework CoreFoundation`으로 `etl/.cache/bin/thermal`에 빌드하고, 실행 파일이 c 파일보다 오래되면 다시 빌드한다.
    - GPU: `ioreg -r -d 1 -c IOAccelerator`의 `"Device Utilization %"`. GPU 온도는 따로 없다(칩 다이 온도에 들어 있다).
  - **linux(학교 데스크톱: Ubuntu, Intel i7 12세대, NVIDIA GPU 예정)**
    - 온도: `/sys/class/thermal/thermal_zone*/type`이 `x86_pkg_temp`인 영역의 `temp`(밀리도)를 1000으로 나눈 값. 여럿이면 최댓값이다.
    - 그런 영역이 없으면 `sensors -j`(lm-sensors)의 `coretemp-*` 안 `Package id N`의 `temp*_input` 최댓값을 쓴다. 둘 다 없으면 못 읽은 것이다.
    - GPU: `nvidia-smi --query-gpu=utilization.gpu,temperature.gpu --format=csv,noheader,nounits`. 줄마다 `사용률, 온도`이고 여러 장이면 둘 다 최댓값이다. GPU 온도는 1분 기록의 `gpuTemp`로만 남기고 대기에는 쓰지 않는다.
  - **그 밖**(win32 등): 온도를 못 읽는 것으로 본다. 그래서 새 요청을 보내지 않는다.
  - **읽기 함수의 꼴**: `readTemp(platform = process.platform, o?) → Promise<number | null>`, `readGpu(platform = process.platform, o?) → Promise<{ util: number | null, temp: number | null } | null>`. 못 읽으면 null이고 던지지 않는다.
    - o(시험에서만 바꾼다): `run(cmd, args) → Promise<string | null>`(표준 출력 글자, 명령이 없거나 0이 아닌 종료면 null, 기본은 `execFile`), `sys`(`class/thermal`이 든 뿌리 폴더, 기본 `/sys`), `bin`·`src`(darwin 실행 파일과 c 파일, 기본 `etl/.cache/bin/thermal`·`etl/notices/thermal.c`)
    - darwin 온도: `bin`이 없거나 수정 시각이 `src`보다 이르면 bin 폴더를 만들고 `run('clang', ['-O2', '-framework', 'IOKit', '-framework', 'CoreFoundation', '-o', bin, src])`로 빌드한다. 빌드가 null이면 null이다. 그다음 `run(bin, [])` 출력을 `parseThermal`로 읽는다.
    - darwin GPU: `run('ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator'])` 출력을 `parseIoreg`로 읽고 temp는 null이다.
  - **시험**: 글자를 읽는 해석 함수(`parseThermal`, `parseIoreg`, `parseZones`, `parseSensors`, `parseNvidiaSmi`)와 읽기 함수를 나눈다. 해석 함수는 고정 문자열로, 읽기 함수는 가짜 run과 임시 폴더(가짜 `thermal_zone`, 수정 시각을 정한 가짜 bin·src)로 시험한다. darwin도 빌드 안 함·다시 빌드·빌드 실패를 시험한다(plan G4). CI(Linux)는 실제 센서를 부르지 않는다.
- **이유**:
  - 운영 서버는 이 맥이 아니라 학교 데스크톱이다(사용자 결정 2026-11-16). 부하 제한은 두 곳 모두에서 지켜야 한다.
  - 세 길 모두 관리자 권한 없이 읽힌다. `/sys`는 누구나 읽고, `sensors`와 `nvidia-smi`도 일반 사용자로 돈다.
  - `x86_pkg_temp`는 커널이 인텔 CPU 패키지 온도를 보이는 기본 자리라 패키지를 깔지 않아도 된다. `sensors`는 그 영역이 없을 때만 쓴다.
  - 데스크톱 GPU는 부하가 걸리면 80°C 안팎이 보통이다. 사용자 규칙은 CPU 온도라 GPU 온도는 기록만 한다.
- **확인하지 못한 것**: 학교 데스크톱에서 실제로 읽어 보지 못했다(GPU가 아직 없다). 서버가 준비되면 `readTemp()`·`readGpu()`를 한 번 돌려 본다(2단계 작업).
- **버린 것**:
  - GPU 온도로도 대기: 사용자 규칙 밖이고 데스크톱 GPU에서는 거의 늘 기다리게 된다.
  - 센서 npm 패키지(새 의존성), `powermetrics`·`ipmitool`(관리자 권한)
  - 리눅스에서도 C 파일 빌드: 커널이 이미 글자로 보인다.

## 부록 A. 칩 온도 읽기 C 코드 (`etl/notices/thermal.c`, darwin 전용)

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
