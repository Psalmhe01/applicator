@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.16 or newer is required. Install it from https://nodejs.org
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo Installing free open-source dependencies...
  node --use-system-ca "%ProgramFiles%\nodejs\node_modules\npm\bin\npm-cli.js" install --no-audit --no-fund
  if errorlevel 1 (
    echo Installation failed. See the error above.
    pause
    exit /b 1
  )
)
if not exist "dist\index.html" (
  echo Building Applicator...
  call npm run build
  if errorlevel 1 (
    echo Build failed. See the error above.
    pause
    exit /b 1
  )
)
echo Open http://127.0.0.1:8787 in your browser. Keep this window open.
call npm start
pause
