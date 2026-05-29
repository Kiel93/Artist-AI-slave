@echo off
echo Starting Artist Assistant Server...
echo Please wait...

:: Start the Next.js dev server in a new window so it keeps running in the background
start cmd /k "npm run dev"

:: Wait a few seconds to let the server start up
timeout /t 5 /nobreak >nul

:: Open the workspace URL directly in the default browser
start http://localhost:3000/workspace?task=task-1

echo.
echo Artist Assistant launched!
echo You can close this window now. The server will keep running in the other command prompt window.
timeout /t 5 >nul
