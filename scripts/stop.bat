@echo off
cd /d "%~dp0\.."

docker compose down
echo Kanban Studio stopped.
