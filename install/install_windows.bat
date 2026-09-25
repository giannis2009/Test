@echo off
REM AppleFX installer for Premiere Pro (Windows)
REM 1) Allows unsigned CEP extensions  2) Copies AppleFX into the CEP extensions folder
setlocal
for %%v in (9 10 11 12 13 14) do reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
set "DEST=%APPDATA%\Adobe\CEP\extensions\AppleFX"
if exist "%DEST%" rmdir /s /q "%DEST%"
xcopy "%~dp0..\AppleFX" "%DEST%\" /e /i /y /q >nul
if errorlevel 1 (
  echo Copy failed. Try running this file as your normal user, with Premiere Pro closed.
  pause
  exit /b 1
)
echo.
echo AppleFX installed to %DEST%
echo Restart Premiere Pro and open: Window ^> Extensions ^> AppleFX
pause
