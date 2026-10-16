@echo off
cd /d "%~dp0"
echo Ouvre http://localhost:3005/kanban.html dans ton navigateur.
echo Garde cette fenetre ouverte : elle fait fonctionner James.
call npm start
pause
