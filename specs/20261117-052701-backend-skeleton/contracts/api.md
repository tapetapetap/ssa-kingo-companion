# API 계약: 앱·운영자 화면 ↔ 서버

3단계 앱과 운영자 판정 검토 화면이 부르는 HTTP 계약이다. 계약 시험은 경로마다 되는 예 하나와 거절되는 예 하나를 본다(research R19).

## 공통

- 주소는 `/api/...`이고 본문은 JSON이다. 날짜는 한국 날짜 `YYYY-MM-DD`, 때는 `+09:00`이 붙은 ISO 글이다.
- 로그인은 쿠키 `kingo_session`이다(HttpOnly, SameSite=Lax, Path=/, Max-Age 30일, 운영 모드는 Secure, R5). 쓴 때를 DB에 고쳐 적는 요청(하루 한 번)의 답에 쿠키를 다시 실어 30일을 늘린다.
- 상태를 바꾸는 요청(POST·PUT·PATCH·DELETE)은 `Content-Type: application/json`과 같은 출처의 `Origin`이 있어야 한다. 없으면 403 `bad_origin`이다. 같은 출처는 `Origin`의 host(포트 포함)가 요청의 `Host`와 같다는 뜻이고 스킴은 보지 않는다(문지기 뒤라 스킴이 다를 수 있다). 본문이 없는 요청은 빈 본문을 `{}`로 본다.
- 오류는 `{ "error": { "code": "…", "message": "해요체 한 줄" } }`이다. `message`는 화면에 그대로 써도 되는 글이다.

| code | 상태 | 뜻 |
|---|---|---|
| login_required | 401 | 로그인이 없거나 30일이 지났음 |
| bad_login | 401 | 이메일이나 비밀번호가 틀림(어느 쪽인지 말하지 않음) |
| locked | 403 | 5번 틀려 잠김. `until`을 함께 줌 |
| login_off | 403 | 이 모드에서 꺼진 로그인 방식(운영 모드의 개발 로그인) |
| https_required | 403 | 운영 모드에서 HTTPS가 아닌 로그인 요청(문지기가 `X-Forwarded-Proto: https`를 주지 않음) |
| consent_required | 403 | 동의 전에는 학생 자료를 받지 않음(FR-015) |
| forbidden | 403 | 운영자가 아님 |
| bad_request | 400 | JSON이 아니거나 본문이 64KB를 넘음 |
| not_found | 404 | 없는 경로나 없는 자료. 남의 자료(다른 학생의 활동 번호)도 이것이다(있는지 알려 주지 않는다) |
| invalid | 422 | 값이 규칙에 어긋남. `field`로 칸 이름을 줌 |
| too_few_fields | 422 | 분야를 3개보다 적게 고름 |
| too_long | 422 | 글자 수를 넘음. `max`를 줌 |
| limit_reached | 422 | 개수 한도(직접 넣은 활동 100개) |
| analysis_off | 409 | 나의 분석을 꺼 둔 상태에서 분석 파일이나 줄 빼기를 부름 |
| server_error | 500 | 서버 안 오류. `message`는 '잠시 뒤에 다시 해 주세요'이고 까닭은 서버 기록에만 남는다 |

### NoticeCard(공지 하나)

```json
{
  "id": "cse:228336",
  "title": "…", "host": "…", "kind": "hackathon",
  "postedOn": "2026-11-10", "deadline": "2026-11-29", "closesOn": "2026-11-29",
  "open": true, "down": false,
  "fields": { "core": [{ "id": "llm", "name": "LLM·생성형 AI" }], "related": [], "by": "LLM: gemma4:12b" },
  "url": "https://…",
  "action": { "kind": "later", "revisitOn": "2026-11-20", "reason": null, "at": "…" }
}
```

- `fields`가 `null`이면 그 공지에 분야가 붙지 않은 것이다(결과 파일에 분야 칸이 없음). 분야가 붙었는데 비어 있으면 `core`와 `related`가 빈 배열이다. `by`는 'LLM: <모델 이름>' 또는 '운영자'다(FR-023, FR-051).
- `down`은 내려간 공지이거나 공지가 아니게 된 글이다(data-model 3절). `open`은 열린 공지인가다.
- `action`은 이 학생의 지금 행동이고 없으면 `null`이다.
- 규칙 점수와 벡터 유사도는 어디에도 없다(FR-024).

## 상태

`GET /api/health`는 로그인 없이 `{ "ok": true }`만 준다(상태 보기 명령이 문지기를 거쳐 부른다). 다른 정보는 주지 않는다.

## 로그인과 계정

| 요청 | 본문 | 답 |
|---|---|---|
| `POST /api/login` | `{ method: "dev", email, password }` | 200 `{ next }` + 쿠키. 거절: `bad_login`, `locked`, `login_off` |
| `POST /api/logout` | 없음 | 204. 그 기기의 로그인을 바로 끝냄 |
| `GET /api/me` | | `{ dept, next, analysisOff }` |
| `DELETE /api/me` | `{ confirm: true }` | 204. 학생 자료와 로그인 수단을 모두 지움(FR-020) |

`next`는 `consent` → `answers` → `fields` → `home` 중 하나다(FR-018).

## 동의, 처음 질문, 분야

| 요청 | 본문 | 답 |
|---|---|---|
| `GET /api/consent` | | `{ version, text }`(문구는 서버 설정 파일에서) |
| `POST /api/consent` | `{ version }` | 204. 지금 판이 아니면 `invalid`. 문구의 판이 바뀌면 `next`가 다시 `consent`다(R23) |
| `GET /api/me/answers` | | `{ grade, term, goal, answeredAt }`, 없으면 404 |
| `PUT /api/me/answers` | `{ grade: 1~4, term: 1\|2, goal: "job"\|"grad"\|"startup"\|"unsure" }` | 200 같은 꼴. 거절: `consent_required`, `invalid` |
| `GET /api/fields` | | `{ taxonomy: { id, name, edition }, groups: [{ id, name, parent }], fields: [{ id, name, group, desc }] }`(목록 순서, FR-017) |
| `GET /api/me/fields` | | `{ ids }` |
| `PUT /api/me/fields` | `{ ids }` | 200 `{ ids }`. 거절: `too_few_fields`, `invalid`(목록에 없음·겹침) |

## 홈

`GET /api/home`

```json
{
  "pick": {
    "notice": { "…": "NoticeCard" },
    "reason": "고른 분야와 맞고 마감이 가까워요",
    "cited": [{ "key": "liked:llm", "text": "관심 있어요가 몰린 분야: LLM·생성형 AI" }, { "key": "prompt" }],
    "method": "LLM: gemma4:12b",
    "computedAt": "…",
    "repicking": false
  },
  "pickEmpty": null,
  "shelves": {
    "soon":    { "items": [], "empty": null },
    "field":   { "items": [], "empty": "no_field_verdicts" },
    "similar": { "items": [], "empty": "no_likes" }
  }
}
```

- `pick`이 `null`이면 `pickEmpty`가 까닭이다: `fields_not_done`, `no_open_notices`, `no_match`(열린 공지는 있는데 모두 거르기에 걸림).
- 선반은 가장 추천과 앞 선반에 나온 공지를 뺀 뒤 10개로 자른다(마감 임박 → 관심 분야 새 공지 → 비슷한 공지 순서로 채운다). 마감 임박의 '고른 분야와 맞음'은 핵심 분야만 본다. 동점은 글 번호 큰 순이다. 비면 `empty`가 까닭이다: `no_open_notices`, `no_field_verdicts`, `no_likes`, `no_match`(FR-040).
- `method`는 'LLM: <모델 이름>' 또는 '규칙'이다. `repicking`이 참이면 앱은 '새로 고르는 중'을 보인다(FR-038).
- 한 홈에 같은 공지는 한 번만 나온다(FR-039).

## 공지와 카드 행동

| 요청 | 본문 | 답 |
|---|---|---|
| `GET /api/notices?kind=&field=&q=&sort=new\|due&cursor=` | | `{ items: NoticeCard[], next, empty }`. 20개씩. `kind`·`field`는 쉼표로 여럿. 새로 올라온 순은 게시일 최근 순, 마감 가까운 순은 닫히는 날 순(마감 없는 공지는 맨 뒤)이고, 둘 다 같으면 글 번호 큰 순이다. `cursor`는 앞 답의 `next`(불투명한 글)이고 끝이면 `next`가 `null`이다. `q`가 50자를 넘으면 `too_long`(FR-022). `empty`: 열린 공지가 하나도 없으면 `no_open_notices`, 있는데 거르기나 찾는 말에 맞는 것이 없으면 `no_match`. 거절: `invalid`(모르는 종류·분야·정렬) |
| `GET /api/notices/:id` | | NoticeCard. 닫힌 공지와 내려간 공지도 줌(FR-023). 공지가 아닌 글(`is_notice` 거짓)은 이 학생의 행동이 있을 때만 `down` 카드로 주고, 없으면 `not_found` |
| `PUT /api/notices/:id/action` | `{ kind: "like"\|"later"\|"dislike", revisitOn?, reason?: "time"\|"field"\|"done"\|"hard" }` | 200 `{ action, suggestActivity }`. 거절: `invalid`(다시 볼 날이 내일~닫히는 날 밖, 이유가 관심 없음이 아닌 행동에 붙음, 열린 공지가 아님), 보이지 않는 공지는 `not_found`. 행동 지우기는 닫히거나 내려간 공지에도 된다 |
| `DELETE /api/notices/:id/action` | | 204 |
| `GET /api/me/list` | | `{ items: [{ notice: NoticeCard, flags: ["revisit_due"\|"closed"\|"down"] }] }`(FR-027). 행동한 때가 최근인 순 |

`suggestActivity`는 이유가 `done`(이미 해 봤어요)일 때만 오고(아니면 `null`), 직접 넣은 활동 초안 `{ name, term, kind, fieldIds }`다(US4-6). `name`은 공지 제목의 앞 100자, `term`은 오늘의 학기(`YYYY-1`·`YYYY-2`), `kind`는 공지 종류, `fieldIds`는 핵심 분야(0~2개)다. 저장은 앱이 활동 넣기로 한다.

## 나에 대한 프롬프트와 나의 분석

| 요청 | 본문 | 답 |
|---|---|---|
| `GET /api/me/prompt` | | `{ body, updatedAt }`(없으면 빈 글) |
| `PUT /api/me/prompt` | `{ body }` | 200 `{ body, updatedAt }`. 거절: `too_long`(1,000자). 이 요청은 모델을 부르지 않는다(벡터는 다시 고르기 일꾼이 만든다, R9) |
| `DELETE /api/me/prompt` | | 204 |
| `GET /api/me/analysis` | | 아래 꼴 |
| `GET /api/me/analysis.md` | | `text/markdown` 파일(읽을 때와 같은 글, FR-032d). 꺼져 있으면 `analysis_off` |
| `PUT /api/me/analysis/excluded/:key` | `{}` | 204. 줄 빼기. 거절: `invalid`(직접 넣은 활동·처음 답·고른 분야 줄), `not_found`(지금 분석에 없는 줄), `analysis_off` |
| `DELETE /api/me/analysis/excluded/:key` | | 204. 되살리기. 거절: `analysis_off` |
| `PUT /api/me/analysis/off` | `{ off: true\|false }` | 204. 끄면 분석과 뺀 줄을 지움 |
| `GET /api/me/activities` | | `{ items: [{ id, name, term, kind, fieldIds, proofUrl, createdAt, updatedAt }] }` |
| `POST /api/me/activities` | `{ name, term, kind, fieldIds, proofUrl? }` | 201 활동. 거절: `limit_reached`, `too_long`(이름 100자, 증빙 주소 500자), `invalid`(학기 꼴, 모르는 종류, 분야가 목록에 없거나 3개 이상, 증빙 주소가 `http://`·`https://`로 시작하지 않음) |
| `PATCH /api/me/activities/:id` | 바꿀 칸만 | 200 활동. 거절은 넣기와 같고, 내 활동이 아니면 `not_found` |
| `DELETE /api/me/activities/:id` | | 204. 내 활동이 아니면 `not_found` |

`GET /api/me/analysis`:

```json
{
  "off": false, "version": 7, "madeAt": "…",
  "md": "# 나의 분석\n\n## 해 온 활동\n- …",
  "lines": [
    { "key": "act:12", "section": "done", "text": "2025-2 · 교내 해커톤 · 해커톤 · 백엔드", "source": "직접 입력", "proof": "증빙 없음" },
    { "key": "ans", "section": "interest", "text": "처음 답: 3학년 2학기, 취업", "source": "처음 질문", "proof": null },
    { "key": "disliked:frontend", "section": "interest", "text": "관심 없음이 몰린 분야: 프론트엔드", "source": "앱 기록", "proof": null },
    { "key": "flow:act:12+liked:llm", "section": "flow", "text": "…", "source": "컴패니언", "proof": null, "refs": ["act:12", "liked:llm"] }
  ],
  "excluded": [{ "key": "liked:backend" }]
}
```

꺼져 있으면 `{ "off": true }`만 온다. 줄의 글 틀과 `source` 값, md의 꼴은 research R10에 있다.

## 운영자 판정 검토

운영자 목록에 있는 계정만 부른다. 아니면 403 `forbidden`이다(FR-049). 답에는 학생 자료가 없다(FR-055).

| 요청 | 본문 | 답 |
|---|---|---|
| `GET /api/ops/review?reason=&checked=false` | | `{ items: [{ notice: OpsNotice, reasons, checkedAt, checkedBy }] }`. `reason`은 `review`(`review:`로 시작하는 이유 모두)·`no_deadline`·`no_fields` 중 하나이고, `checked=false`면 아직 확인하지 않은 것만 준다 |
| `GET /api/ops/notices/:id` | | `{ notice: OpsNotice, log }` |
| `PUT /api/ops/notices/:id/verdict` | `{ isNotice?, kind?, deadline?, fields?: { core, related } }` | 200 OpsNotice. 보낸 칸만 사람 판정이 된다(`deadline: null`은 '마감 없음'으로 정한 것이다). 고친 공지는 확인한 것으로 남는다(확인할 것에 행이 없던 공지는 행을 만들지 않는다). 거절: 고친 뒤 보이는 값이 공지인데 종류가 없으면 `invalid`, `invalid`(핵심 2개·관련 5개 넘음, 겹침, 목록에 없는 분야, 모르는 종류, 날짜 꼴) |
| `POST /api/ops/notices/:id/confirm` | `{}` | 204. '맞아요' |
| `POST /api/ops/notices/:id/rejudge` | `{}` | 204. 다음 매일 작업에 다시 판정(FR-054) |
| `GET /api/ops/log?notice=` | | `{ items: [{ noticeId, field, action, old, new, by, at }] }` |

`OpsNotice`는 아래 꼴이다. `file`은 결과 파일의 값, `human`은 사람 판정이 있는 칸만, `shown`은 학생에게 보이는 값이다. `by`는 운영자 목록의 `subject` 글이다.

```json
{
  "id": "cse:228336", "title": "…", "url": "https://…", "postedOn": "2026-11-10", "host": "…", "down": false, "closesOn": "2026-11-19",
  "file": { "verdict": "opportunity", "kind": "job", "deadline": "2026-11-19", "fields": null, "rule": "LLM: gemma4:12b", "deadlineRule": "제목", "reason": null },
  "human": { "kind": { "value": "edu", "by": "ops@example.com", "at": "…" } },
  "shown": { "isNotice": true, "kind": "edu", "deadline": "2026-11-19", "fields": null }
}
```

`file.verdict`는 `opportunity`(기회) 또는 `review`(확인 필요)이고, 확인 필요 글은 `reason`에 분류기가 적은 이유가 있다. `fields`는 `{ core: [{ id, name }], related: […] }` 또는 `null`이다.

## 정적 파일

`GET /ops/…`는 운영자 화면의 빌드 파일이다(`web/ops/dist`, R17). 파일에는 자료가 없어 로그인 없이 준다. 자료는 모두 위 `/api/ops`로 받는다.
