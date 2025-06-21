# 📝 Coffee Order System - Tech Spec

## 프로젝트 요약 (Summary)

커피숍 주문 시스템을 설계 및 구현한다. 사용자는 메뉴를 조회하고, 포인트를 충전한 뒤 커피를 주문할 수 있으며, 최근 인기 있는 커피를 조회할 수 있다. 모든 기능은 확장성과 데이터 일관성을 고려하여 설계된다.

---

## 목표 (Goals)

- 커피 메뉴 조회, 포인트 충전, 커피 주문 및 인기 메뉴 조회 API 구현
- 추가로 가입, 로그인 등 인증 API 구현
- 다중 서버 환경에서도 정확하게 동작하는 주문 통계 시스템 구축
- 동시성 및 데이터 정합성 이슈에 대한 견고한 설계
- 유닛 및 통합 테스트를 통한 안정성 확보

---

## 계획 (Plan)

### 1. 시스템 구성도

```mermaid
graph TD
    User --> API[API Server]
    API --> AS[Auth Service]
    API --> MS[Menu Service]
    API --> PS[Point Service]
    API --> OS[Order Service]
    AS --> DB[(RDBMS)]
    AS --> Redis[(Redis)]
    MS --> DB[(RDBMS)]
    PS --> DB[(RDBMS)]
    OS --> DB[(RDBMS)]
    OS --> MockAPI{{MockAPI}}
```

---

### 2. 도메인 모델 (Entity Relationship Diagram)

```mermaid
erDiagram
    USER ||--o{ ORDER : places
    USER ||--o{ POINT_TRANSACTION : creates
    ORDER ||--o{ ORDER_ITEM : has
    MENU ||--o{ ORDER_ITEM : included_in

    USER {
        UUID id PK
        string email UK
        string password
        string name
        int point
        datetime created_at
        datetime updated_at
    }

    POINT_TRANSACTION {
        UUID id PK
        UUID user_id FK "user.id"
        int amount
        enum type "ADD, DEDUCT"
        datetime created_at
    }

    MENU {
        UUID id PK
        string name
        int price
    }

    ORDER {
        UUID id PK
        UUID user_id FK "user.id"
        int total_price
        datetime created_at
    }

    ORDER_ITEM {
      UUID id PK
      UUID order_id FK "order.id"
      UUID menu_id FK "menu.id"
      int quantity
      int unit_price
      int total_price
    }
```

---

### 3. API 명세

#### 🔐 인증 API

| API 이름     | 경로            | 메서드 | 설명                                      |
| ------------ | --------------- | ------ | ----------------------------------------- |
| 회원가입     | `/auth/signup`  | POST   | 이메일, 비밀번호, 이름으로 회원가입       |
| 로그인       | `/auth/login`   | POST   | 이메일, 비밀번호로 로그인 (JWT 토큰 발급) |
| 로그아웃     | `/auth/logout`  | POST   | 로그아웃 처리 (토큰 무효화)               |
| 내 정보 조회 | `/auth/me`      | GET    | 현재 로그인된 사용자 정보 조회            |
| 토큰 갱신    | `/auth/refresh` | POST   | Refresh Token으로 Access Token 갱신       |

#### ☕ 메뉴 & 주문 API

| API 이름       | 경로                            | 메서드 | 설명                              |
| -------------- | ------------------------------- | ------ | --------------------------------- |
| 커피 메뉴 조회 | `/menus`                        | GET    | 메뉴 ID, 이름, 가격 조회          |
| 인기 메뉴 조회 | `/menus/popular`                | GET    | 최근 7일 주문량 기준 Top 3 조회   |
| 커피 주문/결제 | `/orders`                       | POST   | 주문 및 결제 처리 (JWT 인증 필요) |
| 포인트 충전    | `/users/{userId}/points/charge` | POST   | 포인트 충전 요청 (JWT 인증 필요)  |

1. GET /menu
   - 커피 정보(메뉴ID, 이름, 가격)을 조회하는 API를 작성합니다.
2. GET /menu/popular
   - 결제는 포인트로만 가능하며, 포인트를 충전하는 API를 작성합니다.
   - 사용자 식별값, 충전금액을 입력 받아 포인트를 충전합니다. (1원=1P)
3. POST /orders
   - 최근 7일간 인기있는 메뉴 3개를 조회하는 API 작성합니다.
   - 메뉴별 주문 횟수가 정확해야 합니다.
4. POST /user/{user_id}/points/charge
   - 사용자 식별값, 메뉴ID를 입력 받아 주문을 하고 결제를 진행합니다.
   - 결제는 포인트로만 가능하며, 충전한 포인트에서 주문금액을 차감합니다.
   - 주문 내역을 데이터 수집 플랫폼으로 실시간 전송하는 로직을 추가합니다.
     (Mock API 등을 사용하여 사용자 식별값, 메뉴ID, 결제금액을 전송합니다.)

---

### 4. 기술 설계 주요 포인트

#### 🔐 인증 & 보안

- JWT (JSON Web Token) 기반 인증 시스템 구현
- Access Token (짧은 유효기간) + Refresh Token (긴 유효기간) 구조
- 비밀번호는 bcrypt를 사용하여 해시화하여 저장
- 보안 미들웨어를 통한 인증이 필요한 API 보호
- 로그아웃 시 토큰 블랙리스트 관리 (Redis 활용)

#### 💸 포인트, 결제 안정성

- 동시성 제어: 포인트 차감 시 데이터 정합성을 보장하기 위해 DB 레벨 락 또는 Redis 기반 분산 락 사용
- 멱등성 보장: idempotency key 인자로 받기

#### 📊 인기 메뉴 집계

- 배치 또는 조회 시점에 7일 이내 데이터를 기준으로 정렬 후 상위 3개 추출

#### 📡 실시간 전송 로직

- 주문 성공 시 비동기 방식 (Kafka or Async Queue)으로 외부 API (Mock) 전송
- 실패 시 재시도 큐에 저장하여 재전송 로직 구현 (at-least-once 보장)

---

## 마일스톤 (Milestones)

| issue id | 기간    | 항목                                       | 세부 내용                            |
| -------- | ------- | ------------------------------------------ | ------------------------------------ |
| cf-1     | 2시간   | 요구사항 분석 및 테크 스펙 작성            | API 설계, erd 설계, 핵심 서비스 설계 |
| cf-2     | 1시간   | DB, Redis Docker 세팅                      | 기본 인프라 세팅 + nest js bp 확인   |
| cf-3     | 1.5시간 | TypeORM 모델 세팅                          | nest js bp 확인                      |
| cf-4     | 2시간   | 인증 API 구현 (JWT, bcrypt)                | 회원가입, 로그인, 인증 미들웨어      |
| cf-5     | 0.5시간 | 모든 Route Swagger + Controller 작성       | nest js bp 확인                      |
| cf-6     | 0.5시간 | 첫 레포지토리 + 서비스 구현                | nest js bp 확인                      |
| cf-7     | 0.5시간 | 첫 테스팅 구현 + testable code 고민        | nest js bp 확인                      |
| cf-8     | 1.5시간 | 나머지 레포지토리 + 서비스 + 테스팅 마무리 | nest js bp 확인                      |
| cf-9     | 0.5시간 | bp 안맞는 부분 리팩토링                    | nest js bp 확인                      |
| cf-10    | 0.5시간 | e2e happy path 테스팅 구현                 | nest js bp 확인                      |
| cf-11    | 2시간   | 회고 및 nest js 어려운 부분 이해           |                                      |
| cf-12    | 4시간   | (선택) nest js 핵심 기술 딥 다이브         |                                      |

총계 11 시간 + (선택 4시간)

---

## 참고 자료

- [뱅크샐러드 테크스펙 문화](https://blog.banksalad.com/tech/we-work-by-tech-spec/)
- [Airbridge API 개발 프로세스](https://engineering.ab180.co/stories/how-engineering-team-works-to-make-robust-product#2ff0f0e7-8c47-4ad8-9e2b-5635b7442d56)
