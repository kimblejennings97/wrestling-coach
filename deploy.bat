@echo off
rem Double-click: builds dist\ (see tools\build_deploy.py) and publishes it to Cloudflare.
rem Live at https://wrestling-coach.wrestling-coach.workers.dev  (config: wrangler.jsonc, uploads ONLY dist\)
cd /d "%~dp0"
py tools\build_deploy.py || goto :fail
call npx wrangler deploy || goto :fail
echo.
echo Deployed. If wrangler asks you to log in, run: npx wrangler login
pause
exit /b 0
:fail
echo.
echo Deploy failed - see the messages above.
pause
exit /b 1
