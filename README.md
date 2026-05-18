# Dooray MCP Workspace

두레이(Dooray!) 관련 MCP 서버 모음입니다.

## MCP 서버 목록

| 서버명 | 위치 | 설명 |
|---|---|---|
| `dooray-mcp` | npm (`@jhl8041/dooray-mcp`) | 프로젝트/업무/위키/드라이브 |
| `dooray-messenger` | `messenger/` | 메신저 채널 메시지 전송 |
| `dooray-calendar` | `calendar/` | 캘린더 일정 관리 |
| `dooray-mail` | `mail/` | 메일 발송 및 수신함 조회 |

## 디렉토리 구조

```
dooray-mcp-workspace/
├── messenger/         # 두레이 메신저 MCP
│   ├── index.js
│   └── package.json
├── calendar/          # 두레이 캘린더 MCP
│   ├── index.js
│   └── package.json
├── mail/              # 두레이 메일 MCP (SMTP/IMAP)
│   ├── index.js
│   └── package.json
└── README.md
```

## Claude Code MCP 설정 (`~/.claude.json`)

```json
{
  "dooray-mcp": {
    "command": "npx",
    "args": ["-y", "@jhl8041/dooray-mcp"],
    "env": { "DOORAY_API_TOKEN": "..." }
  },
  "dooray-messenger": {
    "command": "node",
    "args": ["C:/Users/NHN/dooray-mcp-workspace/messenger/index.js"],
    "env": { "DOORAY_API_TOKEN": "..." }
  },
  "dooray-calendar": {
    "command": "node",
    "args": ["C:/Users/NHN/dooray-mcp-workspace/calendar/index.js"],
    "env": { "DOORAY_API_TOKEN": "..." }
  }
}
```

## 각 서버 도구 목록

### dooray-mcp (npm 패키지)
- 프로젝트, 업무(Task), 위키, 드라이브, 태그, 마일스톤 등 17개 도구

### dooray-messenger
- `get-messenger-channels` — 채널 목록 조회
- `send-channel-message` — 채널에 메시지 전송
- `get-my-member-info` — 내 멤버 정보 조회

### dooray-calendar
- `get-calendar-list` — 캘린더 목록 조회
- `get-calendar` — 캘린더 상세 조회
- `create-calendar` — 캘린더 생성
- `delete-calendar` — 캘린더 삭제
- `update-calendar-members` — 캘린더 멤버 관리
- `get-calendar-events` — 일정 목록 조회
- `get-calendar-event` — 일정 상세 조회
- `create-calendar-event` — 일정 생성
- `update-calendar-event` — 일정 수정
- `delete-calendar-event` — 일정 삭제

### dooray-mail
- `send-mail` — 메일 발송 (수신, 참조, 숨은참조, HTML 본문 지원)
- `get-mail-list` — 받은메일함 목록 조회 (폴더, 읽지않음 필터)
- `get-mail` — 특정 메일 상세 조회
- `get-mail-folders` — 메일 폴더 목록 조회

## 새 MCP 추가 방법

1. 새 폴더 생성 (`dooray-mcp-workspace/새서버명/`)
2. `index.js`, `package.json` 작성 후 `npm install`
3. Claude Code에 등록:
   ```
   claude mcp add 서버명 node C:/Users/NHN/dooray-mcp-workspace/새서버명/index.js -e DOORAY_API_TOKEN=토큰값
   ```
