@echo off
cd /d "%~dp0\.."

where docker >nul 2>&1
if errorlevel 1 (
    echo docker is not installed
    exit /b 1
)

docker compose up --build -d
echo Kanban Studio is running at http://localhost:8000
