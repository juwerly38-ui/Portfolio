# 통역사 스케줄 관리 시스템 — 개발 스펙 정리

> **문서 목적**: `index.html` 프로토타입을 실제 서비스로 전환하기 위한 개발팀 공통 기준 문서.  
> 프로토타입의 비즈니스 로직 정리 + 실제 구현 시 필요한 기능/데이터/API/검증 규칙 정의.

---

## 1. 시스템 개요

### 사용자 역할
| 역할 | 코드 | 설명 |
|------|------|------|
| 신청자 | `requester` | 통역 신청 및 본인 신청 내역 확인 |
| 관리자 | `admin` | 승인/거절, 통역사 관리, 수기 블록, CSV 추출 |
| 통역사 | `interpreter` | 본인 일정 확인, 가능 시간 등록 |

### 핵심 화면 (탭)
| 탭 | 설명 |
|---|---|
| 일별 뷰 | 슬롯(30분 단위) 기반 신청/배정 상태 확인 |
| 주별 뷰 | 주간 시간표 요약 |
| 월별 뷰 | 날짜 단위 일정 밀도 확인 |
| 정례 탭 | 반복 일정(정례) 신청/승인/수기 블록 관리 |
| 관리 탭 | 통역사 관리 + CSV(엑셀) 추출 (관리자 전용) |

---

## 2. 비즈니스 로직

### 2.1 운영 시간 / 슬롯 규칙
- **슬롯 단위**: 30분
- **정규 시간**: `09:00 ~ 19:00` (18:30~19:00 슬롯 포함 정규)
- **연장 시간**: `08:00~09:00`, `19:00~21:00`
- **1회 신청 최대**: 90분
- **1일 통역사 최대 배정**: 240분(4시간)
- **회의 종료 후 버퍼**: 30분 (`rest` 처리 — 신청 불가)

```
코드 상수 (index.html)
  EXT_BEFORE=8, CORE_START=9, CORE_END=19, EXT_AFTER=21
  isExt(time): m < 9*60 || m >= 19*60+30  → 18:30~19:00은 정규
```

### 2.2 공휴일 / 주말 규칙
| 데이터셋 | 용도 |
|---------|------|
| `KR_HOLIDAYS` | D+3 영업일 계산 시 제외. 슬롯 휴일 표시에도 사용. |
| `JP_HOLIDAYS` | 🎌 아이콘 표시만. 영업일 계산에는 영향 없음. |
| `HOLIDAYS` (한+일 합산) | 슬롯 상태 `holiday` 판정, 정례 신청 날짜 자동 제외 |

### 2.3 일반/긴급 자동 분류 규칙 (최종 정책)

> **신청자는 일반/긴급을 직접 선택하지 않는다. 시스템이 [형태 + 방향 + 날짜]로 자동 판단한다.**

| 회의 형태 | 통역 방향 | 날짜 조건 | 자동 분류 |
|----------|----------|----------|----------|
| 원격(화상) | JP→KR | 모든 날짜 | **일반** (긴급 리소스도 JP→KR 담당, 일반 우선) |
| 원격(화상) | KR→JP | D+3 이내 | **긴급 자동 전환** ⚡ |
| 원격(화상) | KR→JP | D+3 초과 | 선택 **차단** 🚫 (신청 불가) |
| 원격(화상) | JP↔KR 양방향 | D+3 이내 | **긴급 자동 전환** ⚡ (2명 배정 시도) |
| 원격(화상) | JP↔KR 양방향 | D+3 초과 | 선택 **차단** 🚫 (신청 불가) |
| 대면 | 방향 무관 (1인 양방향) | 모든 날짜 | **일반** (D+3 이내면 긴급도 가능) |

**D+3 계산 규칙**: 오늘부터 순방향으로 `주말(토/일) + 한국 공휴일`을 건너뛰어 3 영업일째 날짜 = **마지막 오픈일**.  
일본 공휴일은 제외하지 않음.

> ⚠️ **오픈/잠금 기준**: D+3 영업일 **까지** 오픈, D+3 초과(그 다음날)부터 🔒 잠김

```
예) 오늘 3/26(수), D+3=4/1(수) → 4/1까지 오픈, 4/2부터 🔒
예) 오늘 3/26(수), 목=한국 공휴일 → D+3=4/2(목), 4/3부터 🔒
```

코드: `isBufferLocked(date)` → `date > calcBufferOpenDate()` 이면 잠김  
코드: `onDirectionChange()` → 방향+날짜 조합으로 `STATE.modal.autoEmergency` 자동 설정

#### 통역사 리소스 구조
- **일반 리소스**: JP→KR 전담
- **긴급 리소스**: JP→KR + KR→JP 모두 가능 (방향 제한 없음)
- 긴급은 일회성 신청만. **정례 신청은 긴급 없음** (JP→KR 고정, 일반만)

#### JP↔KR 양방향 배정 루트
```
긴급 리소스 2명 확보 시도
├─ 2명 확보 → 양방향 전체 승인 ✅
├─ 1명만 가능
│   └─ 일반 리소스 JP→KR 추가 확인
│       ├─ 가용 있음 → 긴급1명(KR↔JP) + 일반1명(JP→KR) 조합 승인
│       │              긴급 관리자 1차 확인 → 일반 담당에 JP→KR 이관
│       └─ 없음 → 긴급 1명으로 JP→KR 부분승인
│                  신청자 알림: "KR→JP 미확보, JP→KR만 배정"
└─ 0명 → 전체 거절 ❌
          신청자 알림: "외부 통역 섭외 부탁드립니다"
```

#### 관리자 큐 분류
- **긴급 큐**: 긴급 자동 전환된 신청 (KR→JP, 양방향)
- **일반 큐**: JP→KR 원격, 대면 신청
- 관리자 승인창에서 큐별 구분 표시 (자동 전환 사유 배지 포함)

### 2.4 배정 및 승인 로직
1. 신청자 예약 요청 → `reservations.status = pending` + `isEmergency` 자동 설정
2. 관리자 승인 시:
   - 해당 시간 가용 통역사 실시간 재조회
   - 당일 누적 배정 시간 최소 통역사 우선 배정
   - 240분 초과 시 경고 후 관리자 확인 진행 (강제 차단 아님)
   - `meetings`에 확정 레코드 생성 + `reservation.status = approved`
3. 거절 시: `reservation.status = rejected`, 거절 사유 기록

### 2.5 정례(반복) 로직
- **그룹 단위** 신청 (`regularGroups`)
- **반복 규칙**: 매주 / 격주 / 매월 N번째 주
- **기간 제한**: 시작일 기준 최대 3개월
- **공휴일(한/일) 자동 제외**
- 신청 시 → 그룹 `pending`, 회차 미팅도 `meetings`에 `pending`
- 승인 시 → 그룹 `active`, 회차 미팅 `approved`
- 거절 시 → 그룹 `rejected`, 회차 미팅 제거

### 2.6 수기 블록
- 관리자가 요일+시간 구간을 매주 반복 불가로 설정
- 블록 구간에는 신규 정례 신청 배정 차단
- 관리자만 해제 가능

### 2.7 개인정보 / 노출 정책 (핵심 보안 규칙)
> **신청자 화면에서는 타인의 정보를 절대 노출하지 않음.**

| 위치 | 신청자 화면 | 관리자/통역사 화면 |
|------|------------|----------------|
| 일별 배정 슬롯 | `불가예상` | 회의명 표시 |
| 주간 뷰 예약 블록 | `불가예상` | 회의명 표시 |
| 월간 뷰 이벤트 | `불가예상 N건` | 회의명 최대 2개 표시 |
| 정례 탭 시간표 | `불가예상` (배정됨) | 회의명 표시 |
| 정례 목록 | 본인 신청 건만 (`STATE.myGroupIds`) | 전체 표시 |

---

## 3. 현재 프로토타입 상태

### 3.1 구현 완료
- [x] 역할별 탭/기능 노출 제어 (드롭다운으로 역할 전환)
- [x] 일별 뷰: 일반/긴급 2줄 통합 행 (신청자), 개별 통역사 행 (관리자)
- [x] 주별 / 월별 뷰
- [x] 정례 탭: 요일 시간표 / 관리자 승인 대기 목록 / 수기 블록 관리
- [x] D+3 영업일 버퍼 잠금 (한국 공휴일+주말 제외)
- [x] 18:30~19:00 정규 시간대 처리
- [x] 통역사 CRUD + 가용 시간 등록
- [x] 예약 신청 → 관리자 승인/거절 → 자동 배정
- [x] 정례 신청 → 승인/거절
- [x] 수기 블록 CRUD
- [x] CSV(엑셀) 추출 (기간/통역사/구분 필터)
- [x] 신청자 정보 보호 (불가예상, 본인 신청 건만 표시)
- [x] 데모 샘플 데이터 (정례 3건, 일회성 4건 사전 블록)
- [x] **신청 모달 확장 (최종 정책 반영)**
  - 일반/긴급 수동 선택 제거 → 시스템 자동 분류
  - 원격 + KR→JP / 양방향 선택 시 긴급 자동 전환 배너 표시
  - D+3 초과 날짜에서 KR→JP / 양방향 선택 시 신청 버튼 자동 차단
  - 대면: 방향 무관 (1인 양방향), 일반 신청
  - 회의 형태(원격/대면) 필수 선택, Zoom 링크·회의 장소 조건부 입력
  - 회의 유형: 일반/교육·설명회/대규모 (대규모 시 경력자 배정 안내)
  - 연락처 필드 제거 (향후 로그인 정보 자동 주입 예정)
  - 정례 신청: JP→KR 고정, 회의 형태 필수, 긴급 미지원
  - 관리자 승인창: 긴급/일반 큐 분리 표시, 자동 전환 사유 배지

### 3.2 미구현 / 보완 필요
- [ ] **데이터 영속화**: 현재 프론트 전역 `STATE` 메모리 저장 → DB 필요
- [ ] **인증/인가**: 현재 드롭다운 역할 전환 → SSO/사내 계정 연동
- [ ] **실시간 동기화**: 다중 사용자 동시 접속 시 충돌 없음 보장
- [ ] **동시성 보호**: 승인 순간 중복 배정 방지 (DB 트랜잭션 락)
- [ ] **외부 신청서 연동**: `EXTERNAL_LINK` 변수 → 환경변수/관리자 콘솔로 분리
- [ ] **알림**: 신청 접수/승인/거절 시 이메일·메신저 알림
- [ ] **통계 대시보드**: 가동률, 시간대별 수요, 미배정률
- [ ] `myReservationIds` 활용 → 서버 인증 세션 기반 본인 조회 API로 대체

---

## 4. 데이터 모델 (백엔드 구현 기준)

```
users               → id, name, role, employee_no, contact, active
interpreters        → id, user_id(FK), memo, active
interpreter_availability → id, interpreter_id(FK), type(single|recurring), date, dow, start_time, end_time
reservations        → id, title, requester_user_id(FK), contact, date, start_time, end_time,
                       duration_min, is_extended, is_emergency, notes,
                       meeting_format(remote|onsite), zoom_link, meeting_location,
                       direction(JP_KR|KR_JP|both|both_onsite), meeting_type(general|education|large),
                       status(pending|approved|rejected|cancelled),
                       assigned_interpreter_id, rejection_reason
regular_groups      → id, title, requester_user_id(FK), cycle, days(json), start_date, end_date,
                       start_time, duration_min, notes,
                       meeting_format(remote|onsite), zoom_link, meeting_location,
                       direction(JP_KR 고정), meeting_type(general|education|large),
                       status(pending|active|rejected|cancelled)
meetings            → id, reservation_id, regular_group_id, interpreter_id, title, date,
                       start_time, end_time, duration_min, is_extended, is_regular, status
manual_blocks       → id, dow(1~5), start_time, end_time, reason, created_by(FK)
holiday_calendar    → date(PK), country_code(KR|JP), name, is_business_day_excluded
audit_logs          → id, actor_user_id, entity_type, entity_id, action, before_json, after_json
```

---

## 5. 핵심 API 초안

```
GET    /api/schedule/daily?date=YYYY-MM-DD&role=...
GET    /api/schedule/weekly?start=YYYY-MM-DD
GET    /api/schedule/monthly?year=YYYY&month=MM

POST   /api/reservations
POST   /api/reservations/{id}/approve
POST   /api/reservations/{id}/reject

POST   /api/regular-groups
POST   /api/regular-groups/{id}/approve
POST   /api/regular-groups/{id}/reject
POST   /api/regular-groups/{id}/cancel-date

POST   /api/manual-blocks
DELETE /api/manual-blocks/{id}

GET    /api/interpreters
POST   /api/interpreters
PATCH  /api/interpreters/{id}
DELETE /api/interpreters/{id}

GET    /api/export/csv?start=&end=&interp=&type=
```

---

## 6. 서버 검증 규칙 (반드시 강제)

| 규칙 | 내용 |
|------|------|
| 시간 | `duration_min <= 90`, `end_time > start_time`, 30분 슬롯 경계 |
| 한도 | 동일 일자 누적 + 신규 `<= 240분` |
| 버퍼 | 긴급: `target_date >= D+3 영업일` |
| 충돌 | 동일 통역사 시간 겹침 금지, 종료 후 30분 버퍼 중첩 금지 |
| 정례 | 최대 3개월, 공휴일 자동 제외, 수기 블록 구간 생성 금지 |
| 권한 | 승인/거절/수기블록/통역사 관리 = 관리자 전용 |
| 통역 방향 | 원격 신청 필수 선택. 양방향(both)은 긴급 신청 시만 허용 |
| 회의 형태 | 원격: zoom_link 필수. 대면: meeting_location 필수 |
| 정례 방향 | 정례 신청은 direction=JP_KR 고정 (KR→JP 불가) |
| 양방향 인원 | 원격+양방향: 통역사 2명 확보 우선. 1명만 가능 시 JP→KR만 제공 |

---

## 7. 구현 우선순위 (Sprint 계획)

| Sprint | 내용 |
|--------|------|
| Sprint 1 | Epic 1(인증/인가) + Epic 2 핵심(신청/승인 워크플로우) |
| Sprint 2 | Epic 3(슬롯 가용성 엔진) + Epic 5-1(통역사 CRUD) |
| Sprint 3 | Epic 4(정례 엔진) + Epic 5-2(CSV 추출) |
| Sprint 4 | Epic 6(감사로그/동시성/테스트) + 안정화 |

---

## 8. 테스트 시나리오 (필수)

1. 신청자 일반 신청 → 관리자 승인 → 자동 배정 확인
2. 긴급 신청 D+3 이전 차단 / 이후 허용 확인
3. 연장 시간대 신청 UI/승인 플로우 확인
4. 통역사 1일 4시간 초과 시 배정 차단
5. 회의 종료 후 30분 버퍼 슬롯 점유 확인
6. 정례 신청(매주/격주/매월N주) 날짜 계산 정확성
7. 공휴일(한/일) 제외 동작 확인
8. 수기 블록 생성/해제 후 정례 시간표 반영
9. CSV 추출 필터(기간/통역사/구분) 결과 검증
10. 권한별 접근 통제(API/화면) 확인

---

## 9. 개발 환경 & 실행

```bash
# 로컬 서버 시작 (정적 파일 서빙)
pm2 start ecosystem.config.cjs

# 서비스 확인
curl http://localhost:3000

# PM2 로그 확인
pm2 logs webapp --nostream
```

**미리보기 URL**: https://3000-ic0k88xuupw61g7qf7u5r-8f57ffe2.sandbox.novita.ai/

---

## 10. 파일 구조

```
webapp/
├── index.html              # 프로토타입 단일 파일 (HTML+CSS+JS)
│                           # 섹션별 상세 주석 포함 (코드 내 /* [섹션] ... */ 형식)
├── README.md               # 이 파일 — 개발 스펙 공통 기준
├── JIRA_백로그_초안.md      # Jira Epic/Story/AC 초안
├── ecosystem.config.cjs    # PM2 실행 설정
└── .gitignore
```

---

*마지막 업데이트: 2026-03-18*  
*프로토타입 버전: v0.9 (백엔드 미연동)*
