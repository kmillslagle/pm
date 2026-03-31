#!/usr/bin/env bash
# ============================================================
# Azure Deployment Script for Kanban Studio
# Deploys to Azure App Service with persistent SQLite storage
# ============================================================
set -euo pipefail

# ---- Configuration (edit these if you want different names) ----
RESOURCE_GROUP="kanban-studio-rg"
LOCATION="eastus"
ACR_NAME="kanbanstudioacr"          # must be globally unique, alphanumeric only
APP_PLAN="kanban-studio-plan"
APP_NAME="kanban-studio-app"        # must be globally unique — your URL will be $APP_NAME.azurewebsites.net
STORAGE_ACCOUNT="kanbanstudiostore" # must be globally unique, alphanumeric, 3-24 chars
SHARE_NAME="kanban-data"
IMAGE_NAME="kanban-studio"
IMAGE_TAG="latest"

# ---- Preflight checks ----
echo "==> Checking Azure CLI login..."
if ! az account show &>/dev/null; then
  echo "ERROR: Not logged in. Run 'az login' first."
  exit 1
fi

SUBSCRIPTION=$(az account show --query name -o tsv)
echo "    Using subscription: $SUBSCRIPTION"

# Check that ANTHROPIC_API_KEY is set in .env
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ ! -f "$PROJECT_ROOT/.env" ]; then
  echo "ERROR: .env file not found at $PROJECT_ROOT/.env"
  exit 1
fi

API_KEY=$(grep "^ANTHROPIC_API_KEY=" "$PROJECT_ROOT/.env" | cut -d'=' -f2-)
if [ -z "$API_KEY" ]; then
  echo "ERROR: ANTHROPIC_API_KEY not set in .env"
  exit 1
fi
echo "    ANTHROPIC_API_KEY found in .env"

echo ""
echo "==> Will create the following resources in '$LOCATION':"
echo "    Resource Group:   $RESOURCE_GROUP"
echo "    Container Registry: $ACR_NAME.azurecr.io"
echo "    App Service Plan: $APP_PLAN (B1 — Linux)"
echo "    Web App:          $APP_NAME.azurewebsites.net"
echo "    Storage Account:  $STORAGE_ACCOUNT (file share: $SHARE_NAME)"
echo ""
read -p "Proceed? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# ---- 1. Resource Group ----
echo ""
echo "==> Creating resource group..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" -o none

# ---- 2. Azure Container Registry ----
echo "==> Creating container registry..."
az acr create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$ACR_NAME" \
  --sku Basic \
  --admin-enabled true \
  -o none

ACR_SERVER="$ACR_NAME.azurecr.io"
ACR_USER=$(az acr credential show --name "$ACR_NAME" --query username -o tsv)
ACR_PASS=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)
echo "    Registry: $ACR_SERVER"

# ---- 3. Build and push Docker image ----
echo "==> Building and pushing Docker image..."
cd "$PROJECT_ROOT"
az acr build \
  --registry "$ACR_NAME" \
  --image "$IMAGE_NAME:$IMAGE_TAG" \
  --file backend/Dockerfile \
  .

# ---- 4. Storage Account + File Share (for SQLite persistence) ----
echo "==> Creating storage account and file share..."
az storage account create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$STORAGE_ACCOUNT" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  -o none

STORAGE_KEY=$(az storage account keys list \
  --resource-group "$RESOURCE_GROUP" \
  --account-name "$STORAGE_ACCOUNT" \
  --query "[0].value" -o tsv)

az storage share create \
  --name "$SHARE_NAME" \
  --account-name "$STORAGE_ACCOUNT" \
  --account-key "$STORAGE_KEY" \
  --quota 1 \
  -o none

# ---- 5. App Service Plan ----
echo "==> Creating App Service plan (B1 Linux)..."
az appservice plan create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_PLAN" \
  --sku B1 \
  --is-linux \
  -o none

# ---- 6. Web App (from container) ----
echo "==> Creating Web App..."
az webapp create \
  --resource-group "$RESOURCE_GROUP" \
  --plan "$APP_PLAN" \
  --name "$APP_NAME" \
  --container-image-name "$ACR_SERVER/$IMAGE_NAME:$IMAGE_TAG" \
  --container-registry-url "https://$ACR_SERVER" \
  --container-registry-user "$ACR_USER" \
  --container-registry-password "$ACR_PASS" \
  -o none

# ---- 7. Mount Azure File Share at /app/data ----
echo "==> Mounting file share for database persistence..."
az webapp config storage-account add \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --custom-id "kanban-data" \
  --storage-type AzureFiles \
  --share-name "$SHARE_NAME" \
  --account-name "$STORAGE_ACCOUNT" \
  --access-key "$STORAGE_KEY" \
  --mount-path "/app/data" \
  -o none

# ---- 8. Configure app settings ----
echo "==> Setting environment variables..."
az webapp config appsettings set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --settings \
    ANTHROPIC_API_KEY="$API_KEY" \
    WEBSITES_PORT=8000 \
  -o none

# ---- 9. Enable always-on and set startup timeout ----
echo "==> Configuring app settings..."
az webapp config set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --always-on true \
  --startup-file "" \
  -o none

# ---- 10. Restart to pick up all config ----
echo "==> Restarting app..."
az webapp restart \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  -o none

# ---- Done ----
echo ""
echo "============================================================"
echo "  Deployment complete!"
echo ""
echo "  URL:  https://$APP_NAME.azurewebsites.net"
echo ""
echo "  It may take 1-2 minutes for the first startup."
echo "  Check logs with:"
echo "    az webapp log tail --resource-group $RESOURCE_GROUP --name $APP_NAME"
echo "============================================================"
