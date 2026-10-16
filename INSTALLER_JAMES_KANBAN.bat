@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Installe Node.js LTS depuis https://nodejs.org puis relance ce fichier.
  pause
  exit /b 1
)
call npm install
if errorlevel 1 (
  echo Installation interrompue. Aucune base existante n'a ete remplacee.
  pause
  exit /b 1
)
node backend\scripts\setup-kanban.js
pause
