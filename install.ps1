# Dooray MCP 서버 설치 스크립트
# 사용법: PowerShell에서 .\install.ps1 실행

Write-Host ""
Write-Host "=== Dooray MCP 서버 설치 ===" -ForegroundColor Cyan
Write-Host ""

# 현재 스크립트 위치 기준으로 경로 설정
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$username = $env:USERNAME

# 필수 정보 입력
Write-Host "[1/4] 두레이 API 토큰을 입력하세요 (개인설정 > API > 개인 인증 토큰)" -ForegroundColor Yellow
$doorayToken = Read-Host "DOORAY_API_TOKEN"

Write-Host ""
Write-Host "[2/4] 두레이 메일 계정 정보를 입력하세요" -ForegroundColor Yellow
$mailUser = Read-Host "메일 주소 (예: yourname@nhnpayco.com)"
$mailPass = Read-Host "메일 비밀번호" -AsSecureString
$mailPassPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($mailPass)
)

# npm install
Write-Host ""
Write-Host "[3/4] 패키지 설치 중..." -ForegroundColor Yellow

foreach ($dir in @("messenger", "calendar", "mail", "dalle")) {
    $path = Join-Path $root $dir
    if (Test-Path $path) {
        Write-Host "  npm install: $dir" -ForegroundColor Gray
        Push-Location $path
        npm install --silent
        Pop-Location
    }
}

# Claude Code MCP 등록
Write-Host ""
Write-Host "[4/4] Claude Code에 MCP 서버 등록 중..." -ForegroundColor Yellow

$rootForward = $root -replace '\\', '/'

# dooray-mcp (npm 패키지)
Write-Host "  dooray-mcp (프로젝트/업무/위키)" -ForegroundColor Gray
claude mcp add dooray-mcp npx -e "DOORAY_API_TOKEN=$doorayToken" -- -y "@jhl8041/dooray-mcp"

# dooray-messenger
Write-Host "  dooray-messenger" -ForegroundColor Gray
claude mcp add dooray-messenger node "$rootForward/messenger/index.js" -e "DOORAY_API_TOKEN=$doorayToken"

# dooray-calendar
Write-Host "  dooray-calendar" -ForegroundColor Gray
claude mcp add dooray-calendar node "$rootForward/calendar/index.js" -e "DOORAY_API_TOKEN=$doorayToken"

# dooray-mail
Write-Host "  dooray-mail" -ForegroundColor Gray
claude mcp add dooray-mail node "$rootForward/mail/index.js" -e "MAIL_USER=$mailUser" -e "MAIL_PASS=$mailPassPlain"

Write-Host ""
Write-Host "=== 설치 완료! ===" -ForegroundColor Green
Write-Host ""
Write-Host "등록된 MCP 서버 확인:" -ForegroundColor Cyan
claude mcp list
Write-Host ""
Write-Host "Claude Code를 재시작하면 MCP 서버가 활성화됩니다." -ForegroundColor Yellow
Write-Host ""
Write-Host "※ DALL-E 이미지 생성 MCP는 OpenAI API 키가 필요합니다:" -ForegroundColor Gray
Write-Host "   claude mcp add dalle node `"$rootForward/dalle/index.js`" -e OPENAI_API_KEY=sk-proj-..." -ForegroundColor Gray
