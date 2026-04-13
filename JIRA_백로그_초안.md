# 통역사 스케줄 관리 시스템 Jira 백로그 초안

## 공통 규칙
- 프로젝트 키: `INT` (예시)
- 우선순위: `Highest > High > Medium`
- 라벨: `interpreter-scheduling`, `mvp`, `backend`, `frontend`
- 스토리 포인트 기준: 1,2,3,5,8

---

## Epic 1. 인증/권한 및 사용자 컨텍스트
- 이슈 타입: Epic
- 제목: `[MVP] 역할 기반 인증/인가 및 사용자 컨텍스트 구축`
- 목표: 신청자/관리자/통역사 권한 분리와 API 접근 제어
- 우선순위: Highest

### Story 1-1
- 제목: `로그인 사용자 역할 기반 접근 제어 미들웨어 구현`
- 타입: Story
- 포인트: 5
- 우선순위: Highest
- AC:
1. Given 인증된 사용자가 API 호출 시, When 권한 없는 API에 접근하면 Then 403을 반환한다.
2. Given 관리자 API 호출 시, When role=admin이면 Then 요청이 정상 처리된다.
3. Given 미인증 호출 시, When 보호 API 접근하면 Then 401을 반환한다.

### Story 1-2
- 제목: `프론트 역할별 탭/기능 노출 제어`
- 타입: Story
- 포인트: 3
- 우선순위: High
- AC:
1. 신청자는 관리 탭이 보이지 않는다.
2. 통역사는 본인 데이터만 기본 표시된다.
3. 관리자는 관리 탭과 승인 기능에 접근 가능하다.

### Story 1-3
- 제목: `사용자/통역사 프로필 조회 API`
- 타입: Story
- 포인트: 3
- 우선순위: High
- AC:
1. 로그인 사용자 프로필(role 포함)을 반환한다.
2. 통역사 목록 조회 시 active 사용자만 기본 반환한다.

---

## Epic 2. 일별 신청/승인 워크플로우
- 이슈 타입: Epic
- 제목: `[MVP] 일반/긴급 신청 접수와 관리자 승인 자동배정`
- 목표: 신청 접수부터 승인/거절까지 핵심 플로우 완성
- 우선순위: Highest

### Story 2-1
- 제목: `일회성 예약 신청 API 생성 (pending)`
- 타입: Story
- 포인트: 5
- 우선순위: Highest
- AC:
1. 필수값(title, requester, date, start, duration) 누락 시 400을 반환한다.
2. 정상 요청 시 status=pending으로 저장된다.
3. duration은 30/60/90만 허용한다.
4. meeting_format(remote|onsite)은 필수값이며 누락 시 400을 반환한다.
5. meeting_format=remote이면 zoom_link가 필수이다.
6. meeting_format=onsite이면 meeting_location이 필수이다.
7. direction=both(양방향)는 is_emergency=true일 때만 허용한다.
8. 정례 신청의 direction은 JP_KR로 고정된다.
9. meeting_type(general|education|large)은 필수이며 기본값은 general이다.

### Story 2-2
- 제목: `관리자 예약 승인 API 및 자동 통역사 배정`
- 타입: Story
- 포인트: 8
- 우선순위: Highest
- AC:
1. 승인 시 실시간 가용 통역사 재조회가 수행된다.
2. 후보 중 당일 누적시간 최소 통역사가 배정된다.
3. 가용 통역사가 없으면 승인 실패(409) 처리된다.
4. meeting_type=large이면 경력 통역사(senior=true)를 우선 배정 시도한다.
5. direction=both(양방향 원격) 신청은 통역사 2명 배정을 시도한다. 1명만 가능 시 direction=JP_KR로 변경 후 1명만 배정하며 신청자에게 알림한다.

### Story 2-3
- 제목: `관리자 예약 거절 API`
- 타입: Story
- 포인트: 2
- 우선순위: High
- AC:
1. 거절 사유 입력 시 status=rejected로 저장된다.
2. 거절 사유는 이력 조회 API에서 확인 가능하다.

---

## Epic 3. 슬롯 가용성 엔진
- 이슈 타입: Epic
- 제목: `[MVP] 슬롯 상태 계산 엔진 구현 (한도/버퍼/공휴일/긴급잠금)`
- 목표: UI와 동일한 판단 규칙을 서버 단에서 단일화
- 우선순위: Highest

### Story 3-1
- 제목: `슬롯 상태 계산 서비스 구현`
- 타입: Story
- 포인트: 8
- 우선순위: Highest
- AC:
1. 슬롯 상태(available/occupied/rest/limit/holiday/locked/full)를 반환한다.
2. 회의 종료 후 30분은 rest로 계산된다.
3. 일 4시간 초과 시 limit로 계산된다.

### Story 3-2
- 제목: `긴급 신청 D+3 영업일 잠금 규칙 구현`
- 타입: Story
- 포인트: 5
- 우선순위: Highest
- AC:
1. 한국 공휴일+주말 제외 기준으로 D+3 영업일(마지막 오픈일)이 계산된다.
2. 오늘~D+3 영업일까지는 긴급 신청 가능(오픈), D+3 초과 날짜부터 잠김 처리된다.
3. 일본 공휴일은 영업일 카운트에서 제외되지 않는다.

### Story 3-3
- 제목: `공휴일 캘린더 API/테이블 구현`
- 타입: Story
- 포인트: 3
- 우선순위: High
- AC:
1. KR/JP 공휴일 데이터 조회 가능하다.
2. 버퍼 계산 시 KR만 제외 옵션 적용 가능하다.

---

## Epic 4. 정례 신청 엔진
- 이슈 타입: Epic
- 제목: `[MVP] 정례 반복 규칙/승인/차단(수기 블록) 구현`
- 목표: 반복 일정의 신청-승인-운영 전주기 완성
- 우선순위: High

### Story 4-1
- 제목: `정례 신청 API (group + occurrences pending 생성)`
- 타입: Story
- 포인트: 8
- 우선순위: High
- AC:
1. cycle(every/biweekly/monthlyN) 계산으로 회차가 생성된다.
2. 공휴일은 자동 제외된다.
3. 최대 3개월 제한이 강제된다.
4. 정례 신청의 direction은 JP_KR로 고정되며, 다른 값 입력 시 400을 반환한다.
5. meeting_format(remote|onsite), zoom_link(remote 시), meeting_location(onsite 시)이 포함된다.

### Story 4-2
- 제목: `정례 승인/거절 API`
- 타입: Story
- 포인트: 5
- 우선순위: High
- AC:
1. 승인 시 group=active, 회차 status=approved로 전환된다.
2. 거절 시 group=rejected, 거절 사유가 저장된다.

### Story 4-3
- 제목: `수기 블록 CRUD 및 정례 차단 연동`
- 타입: Story
- 포인트: 5
- 우선순위: High
- AC:
1. 요일+시간 블록 생성/삭제 가능하다.
2. 블록 구간은 신규 정례 신청 생성이 차단된다.

---

## Epic 5. 관리자 운영 기능
- 이슈 타입: Epic
- 제목: `[MVP] 통역사 관리 및 CSV 추출 기능 구현`
- 목표: 운영자 실무 기능 완성
- 우선순위: High

### Story 5-1
- 제목: `통역사 CRUD API`
- 타입: Story
- 포인트: 5
- 우선순위: High
- AC:
1. 통역사 생성/수정/비활성/삭제가 가능하다.
2. 삭제 시 참조 데이터 정책(soft delete 또는 제한)이 적용된다.

### Story 5-2
- 제목: `CSV 추출 API`
- 타입: Story
- 포인트: 3
- 우선순위: High
- AC:
1. 기간/통역사/구분(일반/정례) 필터가 동작한다.
2. 한글 깨짐 방지를 위한 BOM 옵션을 제공한다.

---

## Epic 6. 품질/운영 안정성
- 이슈 타입: Epic
- 제목: `[MVP] 감사로그/동시성/테스트 체계 구축`
- 목표: 운영 안정성과 추적 가능성 확보
- 우선순위: High

### Story 6-1
- 제목: `상태 변경 감사로그 저장`
- 타입: Story
- 포인트: 5
- 우선순위: High
- AC:
1. approve/reject/cancel/update 이벤트가 actor와 함께 기록된다.
2. before/after 스냅샷 조회가 가능하다.

### Story 6-2
- 제목: `승인 처리 동시성 보호`
- 타입: Story
- 포인트: 5
- 우선순위: High
- AC:
1. 동시 승인 요청 시 중복 배정이 발생하지 않는다.
2. 충돌 시 명시적 에러코드(409)를 반환한다.

### Story 6-3
- 제목: `핵심 회귀 테스트 작성`
- 타입: Story
- 포인트: 5
- 우선순위: High
- AC:
1. 긴급 D+3 규칙 테스트가 통과한다.
2. 4시간 한도/버퍼 30분 테스트가 통과한다.
3. 정례 반복 계산 테스트가 통과한다.

---

## Sprint 제안
- Sprint 1: Epic 1, Epic 2 핵심 스토리(2-1,2-2,2-3)
- Sprint 2: Epic 3 전체 + Epic 5 일부(5-1)
- Sprint 3: Epic 4 전체 + Epic 5(5-2)
- Sprint 4: Epic 6 전체 + 안정화

---

## Jira 등록 템플릿 (복붙용)

### Epic 템플릿
- Summary: `[MVP] <에픽명>`
- Description:
  - 목표:
  - 범위(In):
  - 비범위(Out):
  - 완료조건(DoD):
- Labels: `interpreter-scheduling,mvp`

### Story 템플릿
- Summary: `<스토리명>`
- Description:
  - 배경:
  - 구현내용:
  - AC:
    1.
    2.
    3.
  - 테스트 포인트:
- Epic Link: `<INT-EPIC-KEY>`
- Story Points: `<숫자>`
- Labels: `interpreter-scheduling,mvp,<backend|frontend>`

