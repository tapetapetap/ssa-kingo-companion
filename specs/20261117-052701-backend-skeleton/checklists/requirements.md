# Specification Quality Checklist: 2단계 백엔드 뼈대(API 서버와 DB)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-17
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- 검증은 세 번 돌렸다(2026-11-17).
  - 1차: 7곳을 고쳤다. US6 설명의 매일 작업 순서에 '만료된 기억 지우기'를 넣음. FR-038에 '닫힘·내려감이면 규칙 1위로 바꾸고 다시 고르기를 건다'를 넣음. SC-001을 특정 파일(126건)에 묶이지 않게 고침. FR-002에 '넣는 도중의 반쯤 바뀐 자료는 앱에 보이지 않는다'를 넣음. FR-045에 매일 작업 손으로 돌리기를 넣음. FR-024(점수 안 줌)의 인수 시나리오를 US3-10으로 더함. '사용자 확인 필요' 19번에 학년 범위와 찾는 말 길이를 더함.
  - 2차: 2곳을 고쳤다. 확인 필요 6번이 '비슷한 공지도 진로 목표·종류·마감으로 돈다'고 잘못 읽히던 문장을 고침. FR-022 마감 가까운 순에서 마감 없는 공지의 자리(맨 뒤)를 정함.
  - 3차: 번호와 참조를 기계로 확인했다. FR 48개·SC 12개가 빈 번호 없이 이어지고, 본문의 FR 참조가 모두 있는 번호다. 이야기 6개에 인수 시나리오 48개, '사용자 확인 필요' 19줄이다. [NEEDS CLARIFICATION] 0개, '비서' 0회, 362줄(500줄 아래).
- 구현 세부 판단: 언어·프레임워크·DB 종류·API 꼴·세션 방식은 넣지 않았다(후속 작업에서 plan으로 넘김). 남은 고유 이름은 앞 단계가 이미 정한 입력과 환경이라 그대로 두었다: 입력 파일 경로와 계약 파일(1단계·스펙 1 산출물), 벡터 모델 bge-m3·1024차원(1단계 R17이 정한 자료 호환 조건), 판정 모델 gemma4:12b(Assumptions에서 지금 상태로만 적음), 학교 데스크톱 사양(사용자 결정), HTTPS(보안 요구, 연결이 암호화돼야 한다는 뜻).
- 독자 판단: '벡터', 'LLM', '부하 제한'은 사용자가 2026-11-16 결정에서 쓴 말이라 그대로 썼다. 처음 보는 사람에게는 배경과 용어 절이 뜻을 밝힌다.
- 기술 무관성 판단: SC-005·SC-006의 'GPU'는 성능 목표의 조건(하드웨어가 있을 때)이고 구현 선택이 아니다. SC-010의 '커밋'은 코드 저장소에 개인정보를 넣지 않는다는 기존 규칙(CLAUDE.md)을 재는 말이다.
- [NEEDS CLARIFICATION] 대신 사용자 위임(2026-11-17 '내 선택 없이 추천대로 모두 진행')에 따라 추천값으로 정하고 spec의 '사용자 확인 필요' 절에 19개 질문과 정한 값, 이유를 적었다. 사용자가 다른 값을 고르면 해당 FR과 시나리오를 함께 고친다.
- 다음 단계: `/speckit-plan`(이번 작업 범위 밖). plan에서 정할 것: 기술 선택, 앱-서버 계약, 규칙 점수 무게, 매일 작업·백업 방법, 전체 시스템 도식도(구현 전 승인 게이트용).
