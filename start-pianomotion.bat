@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules" (
  echo [PianoMotion] Installing Node.js dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)

if not exist "dist\web\index.html" (
  echo [PianoMotion] Building Web UI...
  call npm run app:build
  if errorlevel 1 exit /b 1
)

if "%PORT%"=="" set PORT=4000
echo [PianoMotion] Starting server at http://localhost:%PORT%
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:%PORT%"
call npm run app:start
