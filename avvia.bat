@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8000/app/
  node server.js 8000
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8000/app/
  python -m http.server 8000
  goto :eof
)
echo Ne' Node ne' Python trovati: apri app\index.html e usa "Carica GLB..." per la scansione.
pause
