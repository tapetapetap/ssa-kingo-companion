# Quickstart: 다듬기가 되는지 확인하기

명령과 출력 꼴은 [contracts/cli.md](contracts/cli.md), 규칙 글은 [contracts/rules.md](contracts/rules.md)를 본다. 모두 저장소 뿌리에서 돌린다.

## 준비

- 이 맥의 `etl/gold/dev-501.csv`, `etl/gold/fields/sample.csv`(1회차 표본), `etl/.cache/cse`(본문 보관본)
- Ollama가 켜져 있고 `gemma4:12b`, `bge-m3`가 있다(`ollama list`)
- 라벨러 입력을 둘 저장소 밖 폴더(아래 `<밖>`)

## 1. 자동 검사

```sh
npm run check
```

- 타입 검사와 vitest가 모두 통과한다. 굳히기(rules.md 3절 표의 네 경우), 회차 파일 이름, 2회차 표본이 1회차와 겹치지 않음, 안을 준 score, 통과 줄, Wilson 구간이 시험에 있다.

## 2. 목록과 판정 판(US1)

```sh
node etl/notices/compare.ts check
```

- `custom: 묶음 11 · 분야 91 · 교과 지도 12/12 · …`가 나온다. 다른 두 안은 수가 그대로다(274, 38).

## 3. 다시 판정(US2, US4)

```sh
cp etl/out/fields-compare.json etl/out/fields-compare-1-20261117.json   # 1회차 세 안 결과를 남겨 둔다
node etl/notices/compare.ts judge custom
```

- `custom 분야 판정 412(보관 0 · 새로 412 · 실패 0 · 못 물음 0 · 분야 없음 n) · 글당 …초 · …분`
- 부하 줄이 GPU 평균 80% 이하, 칩 최고 80°C 이하다.
- 다시 돌리면 `보관 412 · 새로 0`이다.

## 4. 둘째 표본과 정답(US3)

```sh
node etl/notices/compare.ts sample --round 2
node etl/notices/compare.ts sample --round 2            # 같은 파일인지 본다(shasum)
node etl/notices/compare.ts label-input custom <밖>/r2 --round 2
# 라벨러 A·B(하위 에이전트)가 <밖>/r2/custom-A.json, custom-B.json을 쓴다
node etl/notices/compare.ts gold custom <밖>/r2/custom-A.json <밖>/r2/custom-B.json --round 2
# 라벨러 C가 <밖>/r2/custom-split.jsonl을 읽고 custom-C.json을 쓴다
node etl/notices/compare.ts gold custom <밖>/r2/custom-A.json <밖>/r2/custom-B.json <밖>/r2/custom-C.json --round 2
```

- `2회차 표본 120건: …`. `sample-2.csv`의 글 번호가 `sample.csv`와 한 건도 겹치지 않는다.
- `label-input`을 저장소 안 폴더로 주면 거절한다.
- 마지막 gold 뒤 `etl/gold/fields/custom-2.csv`에 갈림 `O`가 없다. `custom.csv`(1회차)는 바뀌지 않았다(shasum).

## 5. 지표와 통과 줄(US4)

```sh
node etl/notices/compare.ts score --round 2
node etl/notices/compare.ts score custom               # 1회차 참고 값(옛 라벨 기준)
```

- 2회차: 열이 `custom` 하나인 지표 표와 `custom 2회차 핵심 정밀도 …% (n/d) · 95% 구간 a~b% · 85% 기준 통과|미달`.
- 표에 '핵심 정밀도(굳히기 전)', '핵심 재현율(굳히기 전)' 줄이 있다.
- 1회차(`score custom`)의 끝 줄은 통과·미달 대신 `참고(2회차 표본이 있어요)`다.
- `etl/taxonomy/custom.json`의 `chosen`은 그대로 `null`이다(시스템은 고르지 않는다).

## 6. 지키는 것

- `git status`에 `etl/gold`, `etl/.cache`, `etl/out/fields-compare*.json`이 나오지 않는다.
- 커밋에 공지 본문과 정답 라벨이 없다(라벨러 입력은 `<밖>`에만 있다).
