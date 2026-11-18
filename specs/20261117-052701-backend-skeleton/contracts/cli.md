# 명령 계약: 운영자가 서버 컴퓨터에서 쓰는 것

`node server/cli.ts <명령>`(Docker에서는 `docker compose run --rm jobs node server/cli.ts <명령>`). 넣기·계정·백업·상태 보기는 명령으로만 한다(FR-014).

| 명령 | 하는 일 | 근거 |
|---|---|---|
| `migrate` | 스키마 바꾸기를 번호 순서로 적용 | R4 |
| `ingest <결과 파일> --taxonomy <id> [--dry-run]` | 결과 파일과 분야 목록을 검사하고 넣기. `--dry-run`은 요약만 내고 바꾸지 않음 | US1, FR-002~008 |
| `account create <이메일> [--dept <학과>]` | 개발 계정 만들기. 비밀번호는 표준 입력으로 받음(명령 기록에 남지 않게) | FR-011 |
| `account password <이메일>` | 개발 계정 비밀번호 다시 정하기 | FR-011 |
| `account delete <이메일>` | 개발 계정과 그 학생 자료 지우기 | FR-011, FR-020 |
| `status` | 마지막 매일 작업과 넣기, 모델 서버에 닿는지, 다시 고르기 줄 길이 | FR-045 |
| `daily [--skip-classifier]` | 매일 작업 한 번 | FR-043 |
| `backup` | 백업 한 번(7일 지난 파일 지움) | FR-046 |
| `restore <백업 파일>` | 빈 DB에 되살리기. 비어 있지 않으면 거절 | FR-046 |
| `export-gold <폴더>` | 고친 공지를 정답셋 후보로 내보내기. 저장소 안 경로는 거절 | FR-053 |

- 운영 모드에서 `account create`·`account password`는 거절한다(FR-012). `account delete`는 운영 모드에서도 된다.
- 끝 코드: 0 성공, 1 거절·실패, 2 쓰는 법이 틀림.
- 출력: 한 줄 요약(한국어). `--json`이면 같은 내용을 JSON으로.
- 넣기 요약 예: `새 3 · 바뀜 2 · 그대로 121 · 내려감 1 · 되살림 0 · 사람 판정 유지 0 · 벡터 보관 125 / 새로 1 / 못 만듦 0 · 분야 목록 custom(2026-11-17, 고르지 않은 안)`
- 거절 예: `넣지 않았어요: opportunities[17].fields.core[0] 'web-x'는 분야 목록 custom에 없어요`
- 출력과 기록에는 비밀번호, 토큰, 공지 본문을 남기지 않는다(FR-047).
