@echo off
chcp 65001 >nul
REM ─────────────────────────────────────────────────────────────
REM 一键启动：数据库 + 网站 + 公网隧道
REM 由 Windows 任务计划程序在开机时调用
REM ─────────────────────────────────────────────────────────────

cd /d "C:\Users\83668\Documents\deepseek-harness\default-workspace\shop"

echo [%date% %time%] 开始启动 >> "%~dp0startup.log"

REM 1) 启动便携 PostgreSQL（后台常驻）
start "" /min cmd /c "node scripts\db.mjs start >> startup.log 2>&1"

REM 等待数据库就绪（最多 60 秒）
set /a tries=0
:waitdb
timeout /t 2 /nobreak >nul
node -e "const{Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL||'postgresql://shop:shoppw@127.0.0.1:55432/shopdev'});c.connect().then(()=>{console.log('DB OK');process.exit(0)}).catch(()=>process.exit(1))" >> startup.log 2>&1
if %errorlevel% neq 0 (
  set /a tries+=1
  if %tries% lss 30 goto waitdb
  echo [%date% %time%] 数据库启动超时 >> "%~dp0startup.log"
)

REM 2) 启动网站（生产模式，监听 0.0.0.0:3000）
start "" /min cmd /c "npm run start >> startup.log 2>&1"

REM 3) 等待网站就绪
set /a tries=0
:waitweb
timeout /t 2 /nobreak >nul
curl -s -o nul -w "%%{http_code}" http://localhost:3000/api/health > "%TEMP%\health.txt" 2>nul
findstr "200" "%TEMP%\health.txt" >nul
if %errorlevel% neq 0 (
  set /a tries+=1
  if %tries% lss 30 goto waitweb
)

REM 4) 启动公网隧道
start "" /min cmd /c "cloudflared.exe tunnel --url http://localhost:3000 --no-autoupdate >> tunnel.log 2>&1"

echo [%date% %time%] 启动完成 >> "%~dp0startup.log"
