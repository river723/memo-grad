@echo off
REM Windows wrapper: runs deploy-nas.sh inside WSL Ubuntu (Git Bash has no rsync).
REM   deploy-nas.bat           deploy: rsync + rebuild + health check
REM   deploy-nas.bat --check   read-only diff: local source vs NAS source dir
setlocal

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

for /f "delims=" %%P in ('wsl -d Ubuntu wslpath -u "%SCRIPT_DIR%"') do set "WSL_DIR=%%P"
if not defined WSL_DIR (
  echo [ERROR] WSL path conversion failed. Is WSL Ubuntu installed?
  exit /b 1
)

wsl -d Ubuntu --cd "%WSL_DIR%" -- bash deploy-nas.sh %*
exit /b %ERRORLEVEL%
