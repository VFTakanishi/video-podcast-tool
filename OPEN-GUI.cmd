@echo off
setlocal
set SCRIPT_DIR=%~dp0
powershell.exe -ExecutionPolicy Bypass -STA -File "%SCRIPT_DIR%launch-builder-gui.ps1"
exit /b %errorlevel%
