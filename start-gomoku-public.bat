@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*D:\\五子棋\\server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
start "" http://localhost:3000
start "" "%ProgramFiles%\nodejs\node.exe" "%~dp0server.js"
timeout /t 2 >nul
"%~dp0tools\cloudflared.exe" tunnel --url http://localhost:3000
pause
