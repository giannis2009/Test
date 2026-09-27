@echo off
rem Makes the site PUBLIC on the internet from this PC (Cloudflare Tunnel).
rem Same as start-windows.bat, plus a public https:// address. Close the window to go offline.
title Ezro - PUBLIC server
cd /d "%~dp0"
set EZRO_TUNNEL=1
call "%~dp0start-windows.bat"
