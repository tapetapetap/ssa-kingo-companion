# 앱 계약: 주소와 화면

| 주소 | 화면 | 읽는 것 | 쓰는 것 |
|---|---|---|---|
| `/login?to=` | 로그인 | `login/methods` | `login` |
| `/start/consent` | 동의 | `consent` | `consent`, `logout` |
| `/start/answers` | 처음 질문 | `me/answers`(없으면 빈 칸) | `me/answers` |
| `/start/fields` | 분야 고르기 | `fields`, `me/fields` | `me/fields` |
| `/` | 홈 | `home`, `me/answers`(새 학기) | 행동, `me/answers` |
| `/notices?kind=&field=&q=&sort=` | 공지 목록 | `notices`, `fields` | 행동 |
| `/notices/:id` | 공지 자세히 | `notices/:id` | 행동 |
| `/list?tab=like\|later` | 내 목록 | `me/list` | 행동 |
| `/me` | 나 | `me`, `me/fields`, `me/answers` | `logout`, `DELETE me` |
| `/me/fields` | 분야 고치기 | `fields`, `me/fields` | `me/fields` |
| `/me/answers` | 처음 질문 고치기 | `me/answers` | `me/answers` |
| `/me/prompt` | 나에 대한 프롬프트 | `me/prompt` | `me/prompt` |
| `/me/analysis` | 나의 분석 | `me/analysis`, `me/activities` | 줄 빼기·되살리기, 끄기·켜기, `.md` |
| `/me/activities/new`, `/me/activities/:id` | 활동 넣기·고치기 | `fields`, `me/activities` | `me/activities` |
| `/me/push` | 알림 | `me`, `me/push/key` | `me/push` |
| 그 밖 | '없는 화면이에요'와 홈으로 | | |

`/notices`의 `kind`·`field`는 서버와 같이 쉼표로 이은 여럿이다(`?kind=job,hackathon`). 비면 칸을 뺀다.

## 규칙

1. **들어올 때**: `GET /api/me`. 401이면 `/login?to=<지금 주소>`. `next`가 `home`이 아니면 `/start/<consent|answers|fields>`. 마친 뒤 `to`가 `/`로 시작하고 `//`·`/\`·`/login`·`/start`로 시작하지 않으면 그 주소, 아니면 `/`.
2. **어디서든**: 답이 401 `login_required`면 1과 같다. 403 `consent_required`면 `/start/consent`. 저장하던 글이 있으면 R17대로 둔다.
3. **자리 기억**: `/notices`는 받은 쪽·스크롤을 주소마다 메모리에 두고 뒤로 가기에서 그대로 보인다. 행동이 바뀌면 그 카드만 고친다. 세로 자리만 되살리고 선반의 가로 자리는 처음부터다.
4. **날짜**: 한국 날짜로 센다. `D-0`은 '오늘 마감', 지난 것은 '마감 지남', 마감 없음은 '마감 없음'. D-n은 `deadline`으로만 센다.
5. **내 목록 순서**: `flags`에 `down`이나 `closed`가 있으면 먼저 맨 아래로 보낸다(서버의 `revisit_due`는 닫힌 공지에도 붙는다). 나머지는 다시 볼 날이 된 것(`revisit_due`) → 열린 것 중 마감 있는 것(마감 가까운 순) → 열린 것 중 마감 없는 것 → 그 아래 `closed` → `down`. 같은 자리 안은 서버가 준 순서다.
6. **AI 표시**: 가장 추천 `method`가 'LLM: …'이면 'AI가 골랐어요', '규칙'이면 '규칙으로 골랐어요'. 분야 `by`가 'LLM: …'이면 'AI 추정', '운영자'면 '운영자 확인'.
7. **빈 까닭**: `pickEmpty`·`empty` 값마다 글과 할 일을 하나씩 둔다: `fields_not_done` → 분야 고르기, `no_open_notices` → '지금 열린 공지가 없어요', 홈 `pickEmpty`의 `no_match` → '맞는 공지를 모두 봤어요'(공지 보러 가기), 공지 목록 `empty`의 `no_match` → '찾는 말이나 거르기에 맞는 공지가 없어요'(거르기 지우기). 선반의 `empty`는 글 없이 선반을 숨기고, 셋 다 비면 '지금 보여 줄 선반이 없어요' 한 줄이다.
8. **행동**(홈의 가장 추천은 spec FR-012대로 5초 뒤 홈을 다시 부른다): 누르면 바로 바꾸고 저장이 실패하면 되돌린다. 같은 공지에 저장이 겹치면 앞 것이 끝난 뒤 마지막 것 하나만 보낸다.
9. **푸시 켜기**: `serviceWorker`·`PushManager`·`Notification`이 있고 `push.ready`면 켤 수 있다. 순서는 설명 → `Notification.requestPermission()` → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → `PUT /api/me/push`. 저장이 실패하면 구독을 거둔다. 앱을 열 때 브라우저에 구독이 있고 `push.on`이 거짓이면 다시 저장하지 않고 '꺼짐'으로 보인다(로그아웃한 기기에서 조용히 다시 켜지지 않게).
10. **아이폰 안내**: iOS Safari이고 `navigator.standalone`이 참이 아니면 한 번.
