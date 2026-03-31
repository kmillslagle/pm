#!/usr/bin/env bash
# Deletes all Azure resources created by deploy-azure.sh
set -euo pipefail

RESOURCE_GROUP="kanban-studio-rg"

echo "This will DELETE the entire resource group '$RESOURCE_GROUP' and all resources in it."
echo "This action cannot be undone."
echo ""
read -p "Are you sure? Type the resource group name to confirm: " confirm

if [ "$confirm" != "$RESOURCE_GROUP" ]; then
  echo "Aborted."
  exit 0
fi

echo "==> Deleting resource group (this may take a few minutes)..."
az group delete --name "$RESOURCE_GROUP" --yes --no-wait
echo "    Deletion started in the background."
echo "    Check status: az group show --name $RESOURCE_GROUP"
