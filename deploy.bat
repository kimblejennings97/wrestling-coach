@echo off
rem Double-click: builds the dist\ folder to upload to Netlify (see tools\build_deploy.py).
cd /d "%~dp0"
py tools\build_deploy.py
echo.
echo Next: drag the "dist" folder onto https://app.netlify.com/drop
pause
