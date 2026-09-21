@echo off
setlocal

rem ---------------------------------------------------------------------------
rem  DeepSeek Harness 0.1.5 - shortcut installer
rem
rem  Portable builds ship no installer, so Windows never creates a desktop or
rem  Start menu entry and the app cannot be found by searching. This creates
rem  them, and can undo them again.
rem
rem    double-click            create shortcuts
rem    install-shortcuts -Remove   remove them (keeps the application)
rem
rem  Kept ASCII-only on purpose: cmd.exe reads this file using the console code
rem  page, so non-ASCII text here would be mis-decoded on some systems. All the
rem  Chinese output comes from install-shortcuts.ps1, which is UTF-8 with a BOM.
rem ---------------------------------------------------------------------------

rem System32 is not necessarily on PATH, so resolve PowerShell by full path.
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if not exist "%PS%" (
    echo.
    echo   [ERROR] Windows PowerShell was not found at:
    echo           %PS%
    echo.
    echo   This script needs Windows PowerShell 5.1, which ships with Windows 10.
    echo.
    pause
    exit /b 1
)

if not exist "%~dp0install-shortcuts.ps1" (
    echo.
    echo   [ERROR] install-shortcuts.ps1 is missing from this folder:
    echo           %~dp0
    echo.
    echo   Keep both files together.
    echo.
    pause
    exit /b 1
)

"%PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-shortcuts.ps1" %*
set "CODE=%ERRORLEVEL%"

echo.
if not "%CODE%"=="0" (
    echo   Exit code: %CODE%
    echo.
)
pause
exit /b %CODE%
