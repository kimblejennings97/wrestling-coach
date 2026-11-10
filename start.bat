@echo off
rem Double-click to play. Starts a local server (needed because browsers block
rem ES modules over file://) and opens the game. Close the server window to stop it.
rem serve.py sends no-cache headers so updated game files always load (a plain http.server can leave a blank page after updates).
cd /d "%~dp0"
start "Wrestling Coach server" /min py serve.py 8765
timeout /t 2 /nobreak >nul
start "" http://localhost:8765/index.html
