#!/usr/bin/env bash
#
# Update script — rebuild frontend and restart backend after pulling new code.
#
# Usage:
#   sudo bash deploy-update.sh
#

APP_DIR="${APP_DIR:-/opt/analytics-idea-lab}"
set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "ERROR: Run as root (use sudo)."
  exit 1
fi

echo "Rebuilding frontend..."
cd "$APP_DIR/stats-scraper"
npm ci
VITE_BACKEND_URL="/api" npm run build

echo "Reinstalling Python dependencies..."
cd "$APP_DIR"
uv sync

echo "Restarting services..."
systemctl restart analytics-backend
systemctl reload nginx

echo "Done. Check status:"
echo "  sudo systemctl status analytics-backend"
