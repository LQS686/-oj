@echo off
REM One-click: sync repo to WSL ~/dsoj and start npm run dev
REM Usage:
REM   scripts\wsl-dev.cmd
REM   scripts\wsl-dev.cmd -Full
REM   scripts\wsl-dev.cmd -SyncOnly
REM NOTE: Keep this file ASCII-only. UTF-8 Chinese breaks cmd.exe (GBK) and becomes a fake "command".
setlocal
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0wsl-dev.ps1" %*
exit /b %ERRORLEVEL%
