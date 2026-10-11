@echo off
setlocal
set "PG_BIN=%LOCALAPPDATA%\pgsql\pgsql\bin"
set "PG_DATA=%LOCALAPPDATA%\pgsql\data"
set "PG_LOG=%LOCALAPPDATA%\pgsql\postgres.log"
set "PG_CTL=%PG_BIN%\pg_ctl.exe"

if not exist "%PG_CTL%" (
  echo PostgreSQL portable not found at %PG_CTL%
  exit /b 1
)

if "%~1"=="start" goto start
if "%~1"=="stop" goto stop
if "%~1"=="status" goto status
echo Usage: pg-local.cmd start^|stop^|status
exit /b 1

:start
"%PG_CTL%" -D "%PG_DATA%" status >nul 2>&1
if %ERRORLEVEL%==0 (
  echo PostgreSQL is already running.
  exit /b 0
)
"%PG_CTL%" -D "%PG_DATA%" -l "%PG_LOG%" start
exit /b %ERRORLEVEL%

:stop
"%PG_CTL%" -D "%PG_DATA%" stop -m fast
exit /b %ERRORLEVEL%

:status
"%PG_CTL%" -D "%PG_DATA%" status
exit /b %ERRORLEVEL%
