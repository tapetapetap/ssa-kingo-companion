# Quickstart: 분야 목록 3안 비교와 공지 분야 판정

이 기능이 처음부터 끝까지 도는지 확인하는 순서다. 명령의 자세한 약속은 [contracts/cli.md](contracts/cli.md), 파일 모양은 [data-model.md](data-model.md)에 있다.

## 준비

- Node 22.18 이상, `npm ci`
- macOS Apple Silicon, `clang`이 있어야 한다(`xcode-select --install`). 칩 온도 센서를 읽는 데 쓴다.
- Ollama가 켜져 있고 `gemma4:12b`가 있어야 한다(`ollama list`).
- 이 컴퓨터에 `etl/gold/dev-501.csv`와 본문 보관본 `etl/.cache/cse/`가 있어야 한다(스펙 1·2에서 만든 것).
- 라벨러 입력처럼 본문이 든 파일은 저장소 밖 임시 폴더에 둔다(아래 `$T`).

## S1. 검사가 통과한다

```sh
npm run check
```

새 테스트(분야 목록 검사, 답 정리, 판, 부하 제한 계산, 표본, 정답 합치기, 지표, 고르기, 결과 파일 칸)와 기존 테스트가 모두 통과한다. LLM·학교 서버·센서 없이 돈다.

## S2. 세 분야 목록이 준비된다 (US1)

```sh
node etl/taxonomy/ncs.ts            # NCS 정보망 DB를 받아 ncs.json을 만든다
node etl/notices/compare.ts check   # 세 안 검사
```

- `check`가 세 줄을 출력하고 0으로 끝난다. 예: `custom: 묶음 12 · 분야 104 · 교과 지도 12/12`
- NCS 개수는 받은 표와 같다(공식 소개는 소분류 270개).
- 미리보기 HTML을 `?v=custom`, `?v=ncs`, `?v=csrankings`로 연다.
  - 칩을 2개 고르면 '다음'이 꺼져 있고, 3개째에 켜진다.
  - '보안'으로 찾으면 맞는 칩만 남는다.
  - 없는 말로 찾으면 '맞는 분야가 없어요'가 나온다.

## S3. 분야 판정이 돈다 (US2)

```sh
node etl/notices/compare.ts judge custom --limit 5
```

- 다섯 건에 핵심 ≤ 2, 관련 ≤ 5이고 서로 겹치지 않는 분야가 붙는다.
- 요약에 `부하: GPU 평균 …% · 칩 최고 …°C`가 나온다.
- 같은 명령을 다시 돌리면 `보관 5 · 새로 0`이다(SC-007).
- `etl/taxonomy/custom.json`에서 설명 한 글자를 바꾸고 다시 돌리면 새 판정 판이라 `새로 5`다. 바꾼 것은 되돌린다.
- 서버에 닿지 못하게 하고 10건을 돌린다. 앞 5건은 보관돼 있고 뒤 5건은 보관이 없다.

  ```sh
  OLLAMA_HOST=127.0.0.1:1 node etl/notices/compare.ts judge custom --limit 10
  ```

  기대 출력은 `custom 분야 판정 10(보관 5 · 새로 0 · 실패 0 · 못 물음 5 · …)`이고, 끝까지 돈다.
- 문맥 길이를 확인한다. `node etl/notices/compare.ts judge ncs --limit 1`을 돌려 `prompt_eval_count`를 실행 기록에 남긴다. 그 값이 `num_ctx`의 70%를 넘으면 세 안 모두 `num_ctx`를 올린다(research R5).

## S4. 세 안의 412건 판정 (US3)

```sh
node etl/notices/compare.ts sample
for t in custom ncs csrankings; do node etl/notices/compare.ts judge $t; done
```

- `sample.csv`는 120줄이고 종류마다 1건 이상이다. 다시 돌려도 같은 파일이다.
- 안마다 실패와 못 물음을 합친 비율이 2% 이하다(SC-001).
- 세 안 합계 시간이 3시간 안이다(SC-006).
- 안마다 judge 요약의 부하 줄에서 실행 전체 GPU 평균이 80% 이하이고, 칩 최고가 80°C 이하다(SC-005). 1분 기록(`etl/.cache/load/*.jsonl`)은 살펴보기용이라 1분 평균은 80%를 잠깐 넘을 수 있다.
- 안마다 `runs.jsonl`에 전체 실행 한 줄(limit null)이 남는다.

## S5. 정답과 지표 (US3)

```sh
for t in custom ncs csrankings; do node etl/notices/compare.ts label-input $t "$T"; done
# 라벨러 A·B(Claude 하위 에이전트)가 $T의 입력과 label-guide.md로 라벨을 달아 $T/<안>-A.json, -B.json에 쓴다
node etl/notices/compare.ts gold custom "$T/custom-A.json" "$T/custom-B.json"
# → 갈림 n건. custom.csv에 갈림 O(최종 빈칸)로 쓰이고, $T/custom-split.jsonl이 생긴다
# 셋째(C)가 split을 읽고 정해 $T/custom-C.json에 쓴다
node etl/notices/compare.ts gold custom "$T/custom-A.json" "$T/custom-B.json" "$T/custom-C.json"
# ncs, csrankings도 같은 순서
node etl/notices/compare.ts score
```

- 세 정답 파일이 모두 완성된다. 갈림 칸에 `O`가 남지 않는다(SC-002).
- `fields-compare.json`에 세 안의 지표가 다 있다.
- 보고서(비공개 아티팩트)에서 세 안을 나란히 보고 미리보기로 갈 수 있다.

## S6. 고르고 결과 파일에 넣기 (US4)

```sh
node etl/notices/compare.ts choose <사용자가 고른 안>
node etl/notices/run.ts
```

- `choose`는 정밀도와 상관없이 고른 것을 기록한다. 출력에 85% 기준 통과·미달이 나온다.
- 85% 이상이면 run.ts가 결과 파일에 `taxonomy`와 기회마다 `fields`·`fieldRule`을 넣고, 기존 칸은 그대로다(SC-004, SC-008).
- 미달이면 run.ts가 분야를 넣지 않고 요약에 이유를 적는다. 목록을 고친 뒤 다시 재지 않아도(판정 판이 다르면) 같다.
- 구현하는 사람이 `docs/product/decisions.md`에 고른 안과 날짜를 한 줄 적는다(SC-003).
