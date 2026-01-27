#!/bin/bash

# ==========================================
# ZoomNote 자동 배포 스크립트 (Git Bash용)
# ==========================================

# 설정 변수
SERVER_IP="1.220.31.27"
SERVER_PORT="222"
SERVER_USER="irlink"
DEST_PATH="/home/irlink/zoomnote"
TEMP_DIR="temp_deploy"
ARCHIVE_NAME="deploy_package.zip"

echo "=========================================="
echo "🚀 ZoomNote 배포를 시작합니다..."
echo "=========================================="

# 1. 클라이언트 빌드
echo "📦 [1/5] 클라이언트 빌드 중..."
cd client
if [ ! -d "node_modules" ]; then
    echo "   npm install 실행 중..."
    npm install
fi
npm run build
if [ $? -ne 0 ]; then
    echo "❌ 빌드 실패! 스크립트를 중단합니다."
    exit 1
fi
cd ..

# 2. 배포 패키지 생성
echo "🗂️  [2/5] 배포 패키지 생성 중..."
# 임시 디렉토리 정리
rm -rf $TEMP_DIR
mkdir -p $TEMP_DIR

# 필요한 파일 복사 (node_modules, .git, .env 제외)
# 서버 사이드 파일
echo "   서버 파일 복사..."
cp server.js $TEMP_DIR/
cp package.json $TEMP_DIR/
# cp .env $TEMP_DIR/  # .env 파일은 서버 설정을 유지하기 위해 보통 제외합니다. 필요하면 주석 해제하세요.

# 클라이언트 빌드 결과물 복사
echo "   클라이언트 빌드 복사..."
mkdir -p $TEMP_DIR/client
cp -r client/build $TEMP_DIR/client/

# 압축
echo "   ZIP 압축 중..."
# tar를 사용하여 zip 생성 (Git Bash에는 zip 명령어가 없을 수 있으므로 tar 사용 권장하나, 요청에 따라 zip 시도)
if command -v zip >/dev/null 2>&1; then
    zip -r $ARCHIVE_NAME $TEMP_DIR > /dev/null
else
    # zip이 없으면 tar로 압축 후 확장자만 zip으로 하거나 tar.gz 사용
    # 여기서는 윈도우 내장 tar 사용
    tar -a -c -f $ARCHIVE_NAME $TEMP_DIR
fi

# 임시 폴더 삭제
rm -rf $TEMP_DIR

# 3. 서버로 전송
echo "📤 [3/5] 서버로 파일 전송 중 ($SERVER_IP)..."
echo "   비밀번호를 물어보면 입력해주세요: dkdldkf^^04"
scp -P $SERVER_PORT $ARCHIVE_NAME $SERVER_USER@$SERVER_IP:$DEST_PATH/

# 4. 서버에서 배포 적용
echo "🔧 [4/5] 서버에 변경사항 적용 중..."
ssh -p $SERVER_PORT $SERVER_USER@$SERVER_IP << EOF
    cd $DEST_PATH
    
    echo "   압축 해제 중..."
    # 기존 temp_deploy가 있다면 삭제
    rm -rf temp_deploy
    
    # 압축 해제 (unzip이 없으면 jar xf 등을 써야할 수 있으나 보통 있음)
    unzip -o $ARCHIVE_NAME
    
    echo "   파일 덮어쓰기..."
    # 서버 파일 덮어쓰기
    cp -r temp_deploy/* .
    
    echo "   의존성 업데이트..."
    npm install
    
    echo "   임시 파일 정리..."
    rm -rf temp_deploy
    rm $ARCHIVE_NAME
    
    echo "   서버 재시작..."
    pm2 restart zoomnote
    
    echo "✅ 서버 배포 완료!"
EOF

# 5. 로컬 정리
echo "🧹 [5/5] 로컬 임시 파일 정리..."
rm $ARCHIVE_NAME

echo "=========================================="
echo "🎉 모든 배포 작업이 완료되었습니다!"
echo "=========================================="
