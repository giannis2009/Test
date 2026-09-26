@echo off
setlocal
title Ezro - local server
cd /d "%~dp0"

echo.
echo  ==========================================
echo    Ezro - local setup and start
echo  ==========================================
echo.

rem ---- 1. Node.js -----------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [1/4] Node.js not found - installing Node.js LTS with winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  set "PATH=%PATH%;%ProgramFiles%\nodejs"
)
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Could not install Node.js automatically.
  echo  Install it from https://nodejs.org ^(LTS^), then run this file again.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo [1/4] Node.js %%v found.

rem ---- 2. Dependencies ------------------------------------------------------
if not exist node_modules (
  echo [2/4] Installing packages ^(first time only^)...
  call npm install
  if errorlevel 1 ( echo npm install failed. & pause & exit /b 1 )
) else (
  echo [2/4] Packages already installed.
)

rem ---- 3. .env for local testing ------------------------------------------
if not exist .env (
  echo [3/4] First run - creating .env for local testing.
  set /p ADMIN=   Your Google email ^(becomes the admin^): 
  call :writeenv
) else (
  echo [3/4] .env already exists.
)

rem ---- 4. Git for automatic updates -----------------------------------------
where git >nul 2>nul
if errorlevel 1 (
  echo Installing Git ^(one time, for automatic updates^)...
  winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements
  set "PATH=%PATH%;%ProgramFiles%\Git\cmd"
)

rem ---- 5. Start with auto-update -------------------------------------------
echo [4/4] Starting Ezro on http://localhost:3000  ^(close this window to stop^)
start "" http://localhost:3000
node scripts\live.js
pause
exit /b 0

:writeenv
> .env echo PORT=3000
>> .env echo PUBLIC_URL=http://localhost:3000
>> .env echo DEV_LOGIN=1
>> .env echo ADMIN_EMAILS=%ADMIN%
>> .env echo # Fill these in later for real Google login / PayPal / email - see .env.example
>> .env echo GOOGLE_CLIENT_ID=
>> .env echo PAYPAL_ENV=sandbox
>> .env echo PAYPAL_CLIENT_ID=
>> .env echo PAYPAL_CLIENT_SECRET=
exit /b 0
