# Data Model: 소프트웨어학과 교과 지도

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Data**: [data.md](./data.md)

타입은 `src/domain/courses/types.ts`, 데이터는 `src/data/courses/`(정본). data.md는 같은 원자료에서 TS와 함께 뽑은 사람이 읽는 표다(표 → TS 대응은 data.md 머리말). 찾기 표는 `src/data/courses/index.ts`의 `WORLD = worldOf(SWE, COURSES, LABS, DIRECTIONS)`(과목·배치·연구실 Map, 선수 앞뒤 Map).

## 학기 (Term)

`'1-1' | '1-2' | '2-1' | '2-2' | '3-1' | '3-2' | '4-1' | '4-2'`. `TERMS` 배열 순서가 곧 학기 순서다. `nextTerm(t)`는 배열의 다음 칸(4-2의 다음은 4-2). `termLabel(t)` = '3학년 2학기'.

## CSRankings 분야 (CsrArea, CsrGroup) — `csrankings.ts`

- `CsrGroup = 'ai' | 'systems' | 'theory' | 'inter'`, 이름 'AI' · '시스템' · '이론' · '융합'.
- `CsrArea`는 CSRankings 키 27개: `ai`, `vision`, `mlmining`, `nlp`, `inforet`, `arch`, `comm`, `sec`, `mod`, `da`, `bed`, `hpc`, `mobile`, `metrics`, `ops`, `plan`, `soft`, `act`, `crypt`, `log`, `bio`, `graph`, `csed`, `ecom`, `chi`, `robotics`, `visualization`.
- `CSR_AREAS: { id: CsrArea; group: CsrGroup; label: string }[]` — 우리말 이름(data.md A). 이름만 쓰고 CSRankings의 다른 데이터는 넣지 않는다.

## 과목 (Course) — `catalog.ts`

| 칸 | 타입 | 규칙 |
|---|---|---|
| `code` | `string` | 학수번호(예: `SWE3004`). 학교 전체에서 과목 하나의 키. 중복 금지 |
| `name` | `string` | 교육과정 표 이름 그대로 |
| `credits` | `number` | 학점 |
| `dept` | `string` | 개설 학과(예: '소프트웨어학과', '인공지능학과') |
| `offered` | `boolean` | 교육과정 표 '개설 여부'(예 → true, '최근 열림') |

95개: 지도 83 + 선수·연구실이 가리키는 로드맵 밖 12(data.md E). 과목 설명 문장은 담지 않는다(research R6).

## 전공 (Major) — `swe.ts`

| 칸 | 타입 | 규칙 |
|---|---|---|
| `id` | `'swe'` | 첫 전공. 학과를 더하면 id가 늘어난다 |
| `name` | `string` | '소프트웨어학과' |
| `checked` | `'example' \| 'dept'` | 줄 연결의 확인 상태. 지금 'example'(학과 확인 전). 학과가 과목별로 확인하기 시작하면 배치마다 둔다 |
| `fields` | `FieldDef[]` | 지도 줄 14개, 위→아래 순서(data.md B) |
| `placements` | `Placement[]` | 학기 칸 69 + 경험 층 14(data.md C·D) |
| `prereqs` | `Prereq[]` | 선수 관계 13(data.md F) |

예시 학생(3학년 2학기)의 교과 상태는 전공 데이터가 아니라 예시 데이터 `src/data/seed.ts`의 `EXAMPLE_COURSES`(15과목, data.md I)다.

### FieldDef (지도 줄)

`{ id: FieldId; label: string; layer: 'field' | 'base' | 'experience'; group?: CsrGroup; areas: CsrArea[] }`

- `FieldId = 'base' | 'ai' | 'ml' | 'vision' | 'arch' | 'os' | 'network' | 'security' | 'db' | 'pl' | 'se' | 'theory' | 'graphics' | 'experience'`.
- 분야 줄(`layer: 'field'`)은 `group`이 있고 `areas`가 하나 이상, 모두 그 묶음의 분야다. 분야 하나는 줄 하나에만 걸린다. 기초·경험 줄은 `group`이 없고 `areas`가 빈 배열이다.
- 색은 줄마다 두지 않는다. 점 색은 과목 상태가 정한다(research R2).

### Placement (배치)

`{ code: string; term: Term | null; kind: CourseKind; field: FieldId; area?: CsrArea }`

- `CourseKind = 'core-basic' | 'core' | 'advanced' | 'lab' | 'grad' | 'project' | 'internship' | 'research' | 'startup'` — 전공코어 기초필수, 전공코어, 전공심화, 실험실습, 학석공통, 프로젝트, 현장실습, 연구학점, 창업.
- 줄은 `field`가 정하고 칸은 `term`이 정한다. `field === 'experience'` ⟺ `term === null`(데이터 검사).
- `area`는 분야 줄 과목에만 있고 그 줄의 `areas` 안에 있다.

### Prereq (선수 관계)

`{ from: string; to: string }`. from을 먼저 듣는다. 과목 설명에 명시된 것만(근거 요지는 data.md F, 저장소 데이터에는 넣지 않는다). 고리 금지.

## 진로 방향 (Direction) — `directions.ts`

| 칸 | 타입 | 규칙 |
|---|---|---|
| `id` | `string` | 예: `search` |
| `name` | `string` | 예: '검색·추천 엔지니어' |
| `side` | `'연구' \| '산업' \| '둘 다'` | |
| `area` | `CsrArea` | 대표 CSRankings 분야. 고르기 목록의 묶음은 이 분야의 묶음 |
| `labs` | `string[]` | 연구실 id. 1개 이상, 모두 있는 연구실 |

## 연구실 (Lab) — `directions.ts`

| 칸 | 타입 | 규칙 |
|---|---|---|
| `id` | `string` | 예: `nlplab` |
| `prof` | `string` | 교수 이름 |
| `name` | `string` | 연구실 이름(홈페이지 표기). 확인 못 했으면 빈 글(화면은 '연구실 홈페이지') |
| `url` | `string?` | 연구실 주소 |
| `areas` | `CsrArea[]` | CSRankings 분야 1~2개(첫째가 대표). 예시(학과 확인 전) |
| `topics` | `string[]` | 주제 1~2개(우리말 요약) |
| `undergrad` | `'open' \| 'member' \| 'none'` | 화면 문구: '학부생 모집·인턴 안내' / '학부생 있음(공고 없음)' / '학부생 안내 없음' |
| `alumni` | `string` | 졸업생 진로 요약(사람 이름 없음), 없으면 빈 글. 연구실마다 그대로 보인다 |
| `courses` | `string[]` | 이어지는 과목(학수번호, 과목표 안) |

확인 날짜는 파일 머리 상수 `LABS_CHECKED = '2026-11-16'`.

## 학생 교과 상태 (CourseState) — `AppState.courses`

| 칸 | 타입 | 규칙 |
|---|---|---|
| `term` | `Term \| null` | 지금 학년·학기. 예시 학생 `'3-2'`, 새 학생 `null` |
| `taken` | `string[]` | 들은 과목 학수번호. 복원 때 과목표에 없는 값과 겹친 값은 버린다 |
| `direction` | `string \| null` | 고른 방향 id. 글자가 아니면 복원 때 null |

저장 모듈은 과목표(`catalog.ts`)만 읽는다. 방향·연구실 데이터까지 읽으면 첫 화면 덩어리가 커져서, 없는 방향 id 는 남겨 두고 화면이 '방향 없음'으로 본다.

행동: `courses/term`(term), `courses/taken`(code 토글), `courses/direction`(id | null). `dataOf`에 들어가 예시↔새 학생 전환·'내 데이터 지우기'와 함께 움직인다. 새 학생만 저장한다(`AppState.tsx` 저장 의존 목록에 `state.courses`).

## 계산 결과 (domain/courses/plan.ts)

```ts
type PlanGroup = 'now' | 'later' | 'left' | 'closed' | 'other';
type PlanItem = {  // 화면은 code, group, reasons 만 읽는다
  code: string;
  group: PlanGroup;
  missing: string[];      // 안 들은 먼저 들을 과목(정렬 순)
  reasons: string[];      // 이유 한 줄의 토막들(plan.md 표). 방향 과목·전공코어·학기는 여기 글로 담긴다
};
type Plan = {
  items: PlanItem[];      // 묶음 순서(now, later, left, closed, other) → 묶음 안 정렬
  lit: Set<string> | null; // 밝은 과목. 방향이 없으면 null(모두 같은 밝기)
  progress: { done: number; total: number } | null;  // 방향이 없으면 null
  needsTerm: boolean;     // 학년·학기가 없어 지금/나중을 나누지 못함
};
```

- 들은 과목은 `items`에 없다. `items`는 `lit − taken`과 같다.
- 지도에서 '지금' 테두리를 받는 과목 = `group === 'now'`인 과목.
