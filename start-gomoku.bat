@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*D:\\五子棋\\server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
start "" http://localhost:3000
call "%ProgramFiles%\nodejs\node.exe" "%~dp0server.js"
