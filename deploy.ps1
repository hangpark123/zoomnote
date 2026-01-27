# ZoomNote Deployment Script (Zip & Upload Method)
# 1. Build Client
Write-Host "1. Building Client..." -ForegroundColor Cyan
cd client
npm run build
if ($LASTEXITCODE -ne 0) { 
    Write-Host "Client build failed." -ForegroundColor Red
    exit 1 
}
cd ..

# 2. Create Archive (deploy.zip)
Write-Host "2. Creating Deployment Archive..." -ForegroundColor Cyan
if (Test-Path deploy.zip) { Remove-Item deploy.zip }

# Include server.js, package.json, .env, fonts, and client/build
# Using tar (available on Windows 10+)
tar -a -c -f deploy.zip server.js package.json .env fonts client/build

# 3. Upload to Server
$ServerIP = "1.220.31.27"
$Port = "222"
$User = "irlink"
$RemotePath = "/home/irlink/zoomnote/"

Write-Host "3. Uploading deploy.zip to Server..." -ForegroundColor Cyan
scp -P $Port deploy.zip $User@$ServerIP`:$RemotePath

if ($LASTEXITCODE -ne 0) {
    Write-Host "Upload failed." -ForegroundColor Red
    exit 1
}

# 4. Extract and Restart (Optional Auto-Execute)
Write-Host "4. Extracting and Restarting on Server..." -ForegroundColor Cyan
$Commands = "cd $RemotePath; unzip -o deploy.zip; npm install; pm2 restart zoomnote; rm deploy.zip; echo 'Deployment Complete!'"
ssh -p $Port $User@$ServerIP $Commands

Write-Host "Done!" -ForegroundColor Green
