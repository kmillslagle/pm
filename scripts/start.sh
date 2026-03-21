#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

if ! command -v docker &>/dev/null; then
  echo "docker is not installed"
  exit 1
fi

docker compose up --build -d
echo "Kanban Studio is running at http://localhost:8000"
