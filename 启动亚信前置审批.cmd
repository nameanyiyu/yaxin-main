@echo off
setlocal EnableExtensions
rem Pure CMD launcher. It does not depend on PowerShell.
cd /d "%~dp0"
set "APP_URL=http://127.0.0.1:3000/admin"
set "HEALTH_URL=http://127.0.0.1:3000/api/health"

where npm.cmd >nul 2>&1
if errorlevel 1 goto npm_missing

curl.exe --silent --show-error --fail --max-time 2 "%HEALTH_URL%" >nul 2>&1
if not errorlevel 1 goto open_app

echo Starting preaudit service...
start "Preaudit Service" cmd.exe /d /k "cd /d ""%~dp0"" && call npm.cmd run dev"
set /a attempts=0

:wait_for_server
set /a attempts+=1
curl.exe --silent --show-error --fail --max-time 2 "%HEALTH_URL%" >nul 2>&1
if not errorlevel 1 goto open_app
if %attempts% GEQ 60 goto start_failed
timeout /t 1 /nobreak >nul
goto wait_for_server

:open_app
echo Service is ready. Opening %APP_URL%
start "" "%APP_URL%"
endlocal
exit /b 0

:npm_missing
echo ERROR: npm.cmd was not found. Install Node.js 20 or later first.
pause
endlocal
exit /b 1

:start_failed
echo ERROR: Service did not become ready within 60 seconds.
echo Check the separate Preaudit Service window for the startup error.
pause
endlocal
exit /b 1
