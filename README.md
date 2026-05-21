# Dooray MCP Workspace

두레이(Dooray!) 서비스를 Claude Code AI로 자동화하는 MCP 서버 모음입니다.

## 설치 방법

### 사전 준비

아래 3가지가 설치되어 있어야 합니다.

**1. Node.js**
👉 https://nodejs.org → LTS 버전 다운로드 후 설치

**2. VS Code**
👉 https://code.visualstudio.com

**3. Claude Code 익스텐션**
VS Code 실행 → 확장(Extensions) 탭 → `Claude Code` 검색 → 설치
→ 회사 Claude Max 계정으로 로그인

---

### 설치 순서

**1. 코드 받기**

VS Code 터미널(`Ctrl + 백틱`) 열고 아래 명령어 입력:

```
git clone https://github.com/dasima-me/dooray-mcp-workspace.git
cd dooray-mcp-workspace
```

**2. 설치 스크립트 실행**

```
.\install.ps1
```

실행하면 아래 정보를 순서대로 입력하라고 나옵니다:

| 항목 | 입력값 |
|---|---|
| 두레이 API 토큰 | 두레이 → 우측 상단 프로필 → 개인설정 → API → 개인 인증 토큰 복사 |
| 메일 주소 | 본인 두레이 메일 (예: yourname@nhnpayco.com) |
| 메일 비밀번호 | 두레이 로그인 비밀번호 |

**3. VS Code 재시작**

재시작하면 Claude Code에서 두레이 기능을 바로 사용할 수 있습니다.

---

## 사용 가능한 기능

| 서버명 | 설명 |
|---|---|
| `dooray-mcp` | 프로젝트, 업무, 위키, 드라이브 관리 |
| `dooray-messenger` | 메신저 채널 메시지 전송 |
| `dooray-calendar` | 캘린더 일정 등록/수정/삭제 |
| `dooray-mail` | 메일 발송 및 수신함 조회 |

---

## 업데이트 방법

새 기능이 추가됐을 때는 설치한 폴더에서:

```
git pull
.\install.ps1
```

다시 실행 후 VS Code 재시작하면 됩니다.

---

## 문의

포인트사업팀 주다해 (dahae.ju@nhnpayco.com)
