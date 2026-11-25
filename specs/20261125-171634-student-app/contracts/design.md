# 화면 값: 테마 `kingo`

[디자인 후보](https://claude.ai/artifact/X6aGWhu4g5NdQJVTTdi3es) 추천안(A 바탕)의 테마에서 뽑은 값이다. 여기 없는 것은 astryx 기본(neutral 계열)을 따른다. 구현은 `web/app/src/theme.ts`의 `defineTheme`이다.

| 토큰 | 밝음 | 어두움 |
|---|---|---|
| `--color-accent`, 초점 테두리 | `#4e741b` | `#98b779` |
| `--color-accent-muted` | `#c5dfae` | `#34510e` |
| `--color-on-accent` | `#ffffff` | `#000000` |
| `--color-text-accent`, `--color-icon-accent` | `#42670b` | `#b7d0a0` |
| `--color-background-body` | `#f1f1f1` | `#1b1b1b` |
| `--color-background-surface` | `#ffffff` | `#262626` |
| `--color-background-card`, `popover` | `#ffffff` | `#1b1b1b` |
| `--color-background-muted` | `#f1f1f1` | `#1b1b1b` |
| `--color-text-primary` | `#000000` | `#ffffff` |
| `--color-text-secondary` | `#474747` | `#9e9e9e` |
| `--color-text-disabled` | `#919191` | `#525252` |
| `--color-border` | `#00000014` | `#ffffff1a` |
| `--color-border-emphasized` | `#d4d4d4` | `#525252` |
| `--color-success` / `--color-text-success` | `#198100` / `#2f7d33` | `#64af4c` / `#90ca90` |
| `--color-warning` / `--color-text-warning` | `#ffce2f` / `#836700` | `#ffce2f` / `#eec448` |
| `--color-error` / `--color-text-error` | `#c9303a` / `#c0262c` | `#ff705d` / `#ffaea7` |
| `--color-neutral` | `#0000000f` | `#ffffff1a` |
| `--color-overlay-hover` | `#0000000d` | `#ffffff0d` |
| `--color-overlay-pressed` | `#0000001a` | `#ffffff1a` |
| `--color-skeleton` | `#f1f1f1` | `#525252` |
| `--color-icon-primary` | `#000000` | `#ffffff` |
| `--color-icon-secondary` | `#6a6a6a` | `#9e9e9e` |
| `--color-on-success` | `#ffffff` | `#111111` |
| `--color-on-error` | `#ffffff` | `#111111` |
| `--color-on-warning` | `#111111` | `#111111` |
| `--color-success-muted` | `#bce0bb` | `#90ca903d` |
| `--color-warning-muted` | `#fae19e` | `#e2b6233d` |
| `--color-error-muted` | `#ffc4be` | `#ff98903d` |

- 모서리: inner 0.375rem, element 0.625rem, container 0.75rem, page 1.75rem.
- 글자 크기: sm 0.75, base 0.875, lg 1.125, xl 1.5, 2xl 1.9375, 3xl 2.5rem. 제목 자간 -0.02em.
- 움직임: 빠름 125ms, 중간 300ms, 느림 700ms. `prefers-reduced-motion`이면 끈다.
- 글꼴은 바깥에서 받지 않는다(CSP `default-src 'self'`). 시스템 글꼴을 쓴다.

**확인 기준**: `--color-on-accent` 글자와 `--color-accent` 바탕, `--color-text-primary`·`secondary`·`accent`·`error`·`warning`·`success` 글자와 body·card 바탕의 대비가 밝음·어두움 모두 4.5:1 이상.

**추천안의 원칙**: 한 화면에 주인공 하나(홈은 오늘의 공지 제목이 가장 크고 다음 행동은 '자세히 보기' 하나), 컴패니언 목소리는 말풍선이 아니라 이름표와 한 문장, 결정하는 곳마다 '나중에 바꿀 수 있어요' 같은 안심 글.

강조색은 학교 상징색(은행잎 초록)에서 왔다. 쓰기로 정했고(2026-11-25) 학교 색 규정은 출시 전에 확인한다.
