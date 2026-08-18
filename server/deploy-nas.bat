@echo off
REM Windows 一键部署包装器：双击或在 cmd / PowerShell 里调用都行。
REM 内部走 Git Bash（Windows 10/11 默认自带，没有的话装 Git for Windows）。
REM 用法: deploy-nas.bat    （仓库根或 server/ 目录下都行）

setlocal
set SCRIPT_DIR=%~dp0

REM 找 Git Bash
set "BASH="
for %%P in ("C:\Program Files\Git\bin\bash.exe" "C:\Program Files\Git\usr\bin\bash.exe") do (
  if exist %%~P if not defined BASH set "BASH=%%~P"
)
if not defined BASH (
  echo [错误] 找不到 Git Bash，请安装 Git for Windows。
  exit /b 1
)

"%BASH%" "%SCRIPT_DIR%deploy-nas.sh" %*
exit /b %ERRORLEVEL%
