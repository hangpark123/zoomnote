# ==========================================
# ZoomNote 자동 배포 스크립트 (PowerShell용)
# ==========================================

# 1. 설정 변수
$SERVER_IP = "1.220.31.27"
$SERVER_PORT = "222"
$SERVER_USER = "irlink"
$DEST_PATH = "/home/irlink/zoomnote"
$TEMP_DIR = "temp_deploy"
$ARCHIVE_NAME = "deploy_package.zip"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🚀 ZoomNote 배포를 시작합니다..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 2. 클라이언트 빌드
Write-Host "📦 [1/5] 클라이언트 빌드 중..." -ForegroundColor Yellow
Set-Location client
if (-not (Test-Path "node_modules")) {
    Write-Host "   npm install 실행 중..."
    npm install
}
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 빌드 실패! 스크립트를 중단합니다." -ForegroundColor Red
    exit 1
}
Set-Location ..

# 3. 배포 패키지 생성
Write-Host "🗂️  [2/5] 배포 패키지 생성 중..." -ForegroundColor Yellow

# 임시 디렉토리 정리
if (Test-Path $TEMP_DIR) { Remove-Item -Path $TEMP_DIR -Recurse -Force }
New-Item -ItemType Directory -Path $TEMP_DIR | Out-Null

# 서버 파일 복사
Write-Host "   서버 파일 복사..."
Copy-Item "server.js" -Destination $TEMP_DIR
Copy-Item "package.json" -Destination $TEMP_DIR
# Copy-Item ".env" -Destination $TEMP_DIR  # 필요 시 주석 해제

# 클라이언트 빌드 복사
Write-Host "   클라이언트 빌드 복사..."
New-Item -ItemType Directory -Path "$TEMP_DIR\client" | Out-Null
Copy-Item -Path "client\build" -Destination "$TEMP_DIR\client" -Recurse

# 압축
Write-Host "   ZIP 압축 중..."
if (Test-Path $ARCHIVE_NAME) { Remove-Item $ARCHIVE_NAME -Force }
Compress-Archive -Path "$TEMP_DIR\*" -DestinationPath $ARCHIVE_NAME -Force

# 임시 폴더 삭제
Remove-Item -Path $TEMP_DIR -Recurse -Force

# 4. 서버로 전송
Write-Host "📤 [3/5] 서버로 파일 전송 중 ($SERVER_IP)..." -ForegroundColor Yellow
Write-Host "   비밀번호를 물어보면 입력해주세요: dkdldkf^^04" -ForegroundColor White
scp -P $SERVER_PORT $ARCHIVE_NAME ${SERVER_USER}@${SERVER_IP}:${DEST_PATH}/

# 5. 서버에서 배포 적용
Write-Host "🔧 [4/5] 서버에 변경사항 적용 중..." -ForegroundColor Yellow

# SSH 명령 구성 (PowerShell에서의 멀티라인 문자열 처리 - 윈도우 개행 제거)
$sshCommands = @"
    cd $DEST_PATH
    
    echo '   압축 해제 중...'
    rm -rf temp_deploy
    # unzip이 없으면 설치 필요할 수 있음
    unzip -o $ARCHIVE_NAME -d temp_deploy
    
    echo '   파일 덮어쓰기...'
    cp -r temp_deploy/* .
    
    echo '   의존성 업데이트...'
    npm install
    
    echo '   임시 파일 정리...'
    rm -rf temp_deploy
    rm $ARCHIVE_NAME
    
    echo '   서버 재시작...'
    pm2 restart zoomnote
    
    echo '✅ 서버 배포 완료!'
"@ -replace "`r`n", "`n"

# SSH 실행
ssh -p $SERVER_PORT ${SERVER_USER}@${SERVER_IP} $sshCommands

# 6. 로컬 정리
Write-Host "🧹 [5/5] 로컬 임시 파일 정리..." -ForegroundColor Yellow
Remove-Item $ARCHIVE_NAME -Force

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🎉 모든 배포 작업이 완료되었습니다!" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
