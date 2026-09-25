@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Boost Cars
where node >nul 2>nul
if errorlevel 1 (
  echo Δεν βρέθηκε το Node.js. Κατεβάστε την έκδοση LTS από https://nodejs.org και ξανατρέξτε αυτό το αρχείο.
  start https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo Εγκατάσταση για πρώτη φορά, περιμένετε...
  call npm install --omit=dev
  if errorlevel 1 ( pause & exit /b 1 )
)
echo.
echo Το site ανοίγει στο http://localhost:30000   (Admin: http://localhost:30000/admin)
echo Κλείστε αυτό το παράθυρο για να σταματήσει.
echo.
start "" http://localhost:30000
call npm start
pause
