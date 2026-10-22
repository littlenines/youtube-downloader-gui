@echo off
rem Run the desktop app from source on Windows. (The release build does not need this or Node.js.)
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 20+ is required: https://nodejs.org & pause & exit /b 1)
if not exist node_modules call npm install
if not exist dist\desktop.cjs call npm run build
rem Some tools (e.g. VS Code) set this for their own processes; it would start Electron as plain Node.
set ELECTRON_RUN_AS_NODE=
start "" node_modules\electron\dist\electron.exe .
