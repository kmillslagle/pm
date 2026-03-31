#!/usr/bin/env bash
# Rebuilds and pushes a new image, then restarts the app
set -euo pipefail

RESOURCE_GROUP="kanban-studio-rg"
ACR_NAME="kanbanstudioacr"
APP_NAME="kanban-studio-app"
IMAGE_NAME="kanban-studio"
IMAGE_TAG="latest"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Building and pushing new image..."
cd "$PROJECT_ROOT"
az acr build \
  --registry "$ACR_NAME" \
  --image "$IMAGE_NAME:$IMAGE_TAG" \
  --file backend/Dockerfile \
  .

echo "==> Restarting app..."
az webapp restart \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  -o none

echo ""
echo "Done! App restarting at https://$APP_NAME.azurewebsites.net"
echo "Check logs: az webapp log tail --resource-group $RESOURCE_GROUP --name $APP_NAME"
