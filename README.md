# ZoomNote

Zoom 내에서 연구노트를 작성, 결재(확인/점검), 부서 단위로 관리하는 통합 웹앱입니다.  
프론트엔드(React)와 백엔드(Express)가 하나의 저장소에서 운영되며, 서버가 `client/build` 정적 파일을 함께 서빙합니다.

## 주요 기능

- 내 연구노트 작성/수정/조회
- 결재 플로우: 기록자 -> 확인자 -> 점검자
- 부서별 문서함(리더), 관리자 문서 수정(마스터)
- 주차 기반 문서번호 자동 생성 (`YYYY-WW-NNN`)
- 주차별 휴가자 설정 및 누락자 집계
- 선택 문서 PDF 내보내기 / 다건 출력
- 연구 내용 마크다운 입력 단축 지원
  - 블록: `# + 공백`, `- + 공백`, `1. + 공백`, `> + 공백`, ````` 
  - 인라인: `**굵게**`, `*기울임*`, `` `코드` ``

## 아키텍처

- `client` (React SPA): 작성/결재/관리 UI
- `server.js` (Express API): 인증, 권한, 문서 CRUD, 결재, PDF, 사용자/휴가 관리
- `MySQL`:
  - `users`, `departments`
  - `research_notes`, `research_note_files`
  - `user_vacations`
  - `zoom_oauth_tokens`

## 기술 스택

### Frontend

- React 19 + CRA (`react-scripts`)
- Quill 2 에디터 (`quill`, `quill-blot-formatter`)
- `react-datepicker`
- Zoom Apps SDK (`@zoom/appssdk`)

### Backend

- Node.js + Express 5
- MySQL (`mysql2/promise`)
- 파일 업로드 (`multer`, memory storage)
- PDF/Export (`puppeteer`, `archiver`, `pdfkit`)

### Security / Runtime

- CORS + Cookie 세션
- CSP/HSTS/Referrer-Policy 헤더 적용
- 정적 파일 no-cache 서빙(Zoom 앱 최신 리소스 강제)

## 핵심 로직

### 1) 사용자 식별/권한 (`attachMe`)

- 우선순위로 사용자 식별:
  1. Zoom App Context Header
  2. 서버 세션 쿠키
  3. OAuth 토큰 기반 Zoom API 조회
- 최초 진입/동기화 시 사용자 upsert 수행
- 시스템 권한(`staff`, `leader`, `admin`, `master`)에 따라 API 접근 제한

### 2) 문서 생성/수정

- 생성 시 필수값 검증(기록일, 기간, 제목, 목표, 내용)
- 사용자 서명 미등록 시 생성 차단
- 주차별 시퀀스로 문서번호 자동 생성
- 첨부파일은 별도 테이블(`research_note_files`)로 저장

### 3) 결재(서명) 플로우

- `/api/research-notes/:id/sign`에서 `checker`/`reviewer` 서명 처리
- 마스터는 대리서명(`proxyZoomUserId`) 가능
- 확인 완료된 문서는 일반 사용자 삭제/수정 제한

### 4) 휴가/누락 관리

- 마스터가 주차 휴가자 설정
- 휴가자에 대해 휴가 문서 생성/삭제 동기화
- 관리자 화면에서 주차 누락자 자동 집계

### 5) PDF/내보내기

- 단일/다중 문서를 HTML 렌더 후 Puppeteer로 PDF 생성
- 결재 정보(이름/서명/시각), 금주 목표/연구 내용 포함

## API 요약

- 인증/사용자
  - `GET /api/me`
  - `GET /api/users`, `PUT /api/users/:zoomUserId/role`
- 서명
  - `GET /api/my-signature`, `POST /api/my-signature`
- 노트
  - `GET /api/research-notes`
  - `POST /api/research-notes`
  - `PUT /api/research-notes/:id`
  - `DELETE /api/research-notes/:id`
  - `POST /api/research-notes/:id/sign`
- 첨부 다운로드
  - `GET /api/research-notes/:id/download`
  - `GET /api/research-notes/:noteId/files/:fileId/download`
- 내보내기
  - `GET /api/research-notes/export-pdf`
  - `POST /api/research-notes/export`
- 휴가
  - `GET /api/vacations`, `GET /api/my-vacations`, `POST /api/vacations`

## 디렉토리 구조

```text
zoomnote/
  client/                  # React 앱
    src/
      App.js
      App.css
      RichTextEditor.js
  db/
    research_notes_schema.sql
  server.js                # Express API + static serving
  scripts/
  README.md
```

## 실행 방법

### 1) 의존성 설치

```bash
npm install
cd client
npm install
```

### 2) DB 초기화

```bash
# SQL 직접 실행
# db/research_notes_schema.sql

# 또는 스크립트 사용(프로젝트 스크립트에 맞게)
npm run db:reset
```

### 3) 빌드 및 실행

```bash
cd client
npm run build
cd ..
node server.js
```

## 환경 변수 (예시)

### Server `.env`

```env
PORT=5000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=zoomnote

ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_OAUTH_REDIRECT_URI=
ZOOM_ACCOUNT_ID=

APP_SUCCESS_REDIRECT=/
ALLOW_DEV_FALLBACK=false
```

### Client `.env`

```env
REACT_APP_API_BASE=http://localhost:5000
REACT_APP_ALLOW_DEV_FALLBACK=false
```

## 운영 메모

- 프로덕션은 `client/build`가 있어야 웹 UI가 정상 서빙됩니다.
- 대량 PDF 생성은 시간이 길어질 수 있어 서버 타임아웃이 10분으로 설정돼 있습니다.
- 캐시 무효화 헤더가 적용되어 Zoom 내에서도 최신 JS/CSS를 우선 로드합니다.
