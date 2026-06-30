# 티어리스트 (tier-list)

실시간 멀티플레이 티어 리스트 웹앱. 과자·라면·아이돌 등 무엇이든 드래그 앤 드롭으로
등급을 매기고, 방에 모인 사람들과 **실시간으로** 함께 정합니다. 단순 투표를 넘어
인정협회 투표·티어 결정전(스킬 듀얼)·관전 버프 같은 인터랙티브 요소가 들어 있습니다.

## ✨ 주요 기능

- **드래그 앤 드롭 티어 보드** — 티어 추가/삭제/색상/등급명 편집, 미배치 대기열, 상위 N 필터, 정렬·검색
- **실시간 멀티플레이 방** — Socket.IO 기반. 접속자 프레즌스, 라이브 채팅, 슈퍼챗
- **인정협회 투표** — 아이템을 특정 티어로 옮길지 참여/미참여로 결정 (정족수·잠금)
- **티어 결정전** — 1:1·NvN 스킬 듀얼로 티어를 확정, 관전자 버프(방어/공격/도박/목숨), 결투 금지 모더레이션
- **이미지 검색/선택** — 이름만 입력하면 네이버 → 위키백과 → Openverse 순으로 후보 이미지 제시
- **아이템 상세** — OpenGraph 관련 링크 카드, 이동 이력(언제·누가·어디서→어디로), 쿠팡 검색 바로가기
- **계정/모더레이션** — 로그인, 방장·관리자 권한, 음소거·배치금지·강퇴·티어 잠금

## 🧱 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 모노레포 | pnpm workspaces |
| 클라이언트 | React 19, Vite 6, TypeScript, Tailwind CSS v4, shadcn/ui, lucide-react |
| 라우팅 | react-router-dom (REST 스타일 URL) |
| HTTP 데이터 | TanStack Query + fetch (이미지 검색·OG 미리보기) |
| 실시간 | Socket.IO (방·보드·채팅·투표·결정전 상태) |
| 드래그 앤 드롭 | Pragmatic drag and drop |
| 서버 | Node.js, Socket.IO, better-sqlite3 (tsx 실행) |
| 영속화 | SQLite (`packages/server/data/rooms.db`) |

> **실시간 상태는 왜 TanStack Query가 아닌가?** 방·채팅·투표·결정전은 서버가 양방향으로
> 푸시하는 멀티플레이 상태라 요청/응답 캐시 모델로 표현할 수 없습니다. 그래서 이 계층은
> Socket.IO로 두고, 진짜 HTTP 요청/응답인 **이미지 검색·OG 미리보기만** TanStack Query로 다룹니다.

## 📁 구조

```
packages/
  client/   # React + Vite 프론트엔드 (포트 5810)
  server/   # Socket.IO 실시간 서버 + SQLite (포트 5811)
  shared/   # 클라이언트·서버 공용 타입 (@tier-list/shared)
```

## 🚀 시작하기

요구사항: Node.js 20+, pnpm 10+

```bash
pnpm install

# 환경변수 준비 (선택)
cp packages/server/.env.example packages/server/.env
cp packages/client/.env.example packages/client/.env.local

# 클라이언트 + 서버 동시 실행
pnpm dev:all
```

- 웹: http://localhost:5810
- 실시간 서버: http://localhost:5811 (Vite가 `/socket.io`를 프록시하므로 5810만 열어도 됩니다)

### 개별 실행

```bash
pnpm dev       # 클라이언트만 (5810)
pnpm server    # 서버만 (5811)
```

## 🔧 스크립트

| 명령 | 설명 |
|---|---|
| `pnpm dev:all` | 클라이언트 + 서버 동시 실행 |
| `pnpm dev` | 클라이언트 개발 서버 |
| `pnpm server` | 실시간 서버 (tsx watch) |
| `pnpm build` | 클라이언트 프로덕션 빌드 (`tsc -b` + vite) |
| `pnpm preview` | 빌드 결과 미리보기 |
| `pnpm lint` | ESLint 전체 검사 |
| `pnpm kill-ports` | 5810·5811 점유 프로세스 정리 |

## 🌐 라우트 (REST 스타일 URL)

URL이 곧 "지금 어떤 방에 있는지"의 출처입니다.

| 경로 | 화면 |
|---|---|
| `/` | 솔로 보드 (로컬 편집) |
| `/rooms` | 로비 (방 목록) |
| `/rooms/:roomId` | 특정 실시간 방 |

`/rooms/ABCD` 링크를 공유하면 그대로 방에 입장합니다(비로그인 시 로그인 안내).

## ⚙️ 환경변수

**서버** (`packages/server/.env`)

| 키 | 설명 |
|---|---|
| `ADMIN_USERNAMES` | 관리자 로그인 ID 목록(쉼표 구분). 항상 관리자 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 최초 실행 시 관리자 계정 시드(선택) |
| `PORT` | 서버 포트 (기본 5811) |
| `DB_PATH` | SQLite 경로 (기본 `data/rooms.db`) |

**클라이언트** (`packages/client/.env.local`)

| 키 | 설명 |
|---|---|
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | 네이버 이미지 검색용. 미설정 시 위키백과 → Openverse로 폴백. **브라우저에 번들되지 않음**(`VITE_` 접두사 없음) |
| `VITE_PORT` | 클라이언트 포트 (기본 5810) |
| `VITE_SERVER_URL` | 클라이언트가 접속할 실시간 서버 URL (기본 `http://localhost:5811`) |

## 🗄️ 데이터 영속화

방 상태는 `packages/server/data/rooms.db` (SQLite)에 저장됩니다. 마이그레이션은
**가산 방식**(`ALTER TABLE ... ADD COLUMN`)으로만 이뤄지며, DB 파일과 `.env`는
git에 커밋되지 않습니다(`.gitignore`).

## 📦 배포 메모

- 클라이언트는 SPA(`BrowserRouter`)이므로, 정적 호스팅 시 알 수 없는 경로를
  `index.html`로 폴백시키는 설정이 필요합니다. (개발/`preview` 서버는 자동 처리)
- `/api/naver-image`·`/api/og`는 **개발 전용 Vite 미들웨어**입니다. 프로덕션에서는
  동일 동작의 서버리스 함수 등으로 대체해야 합니다.
