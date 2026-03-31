#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
docker build -t kanban-studio -f backend/Dockerfile .
docker run --rm -d --name kanban-studio -p 8000:8000 --env-file .env -v kanban-studio-data:/app/data kanban-studio
echo "Kanban Studio running at http://localhost:8000"
