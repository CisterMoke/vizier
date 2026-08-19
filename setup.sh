#!/usr/bin/env bash
#
# Setup script for deploying Analytics Idea Lab on Ubuntu via systemd.
#
# Usage:
#   sudo bash setup.sh
#
# This script will:
#   1. Install system dependencies (Node.js, uv, nginx)
#   2. Build the frontend
#   3. Install Python backend dependencies
#   4. Create systemd service files for backend and nginx
#   5. Configure nginx to serve the frontend and proxy /api to the backend
#   6. Enable and start all services
#
# Configuration (edit these or pass via environment):
APP_DIR="${APP_DIR:-/opt/analytics-idea-lab}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
DOMAIN="${DOMAIN:-localhost}"
LLM_API_KEY="${LLM_API_KEY:-}"
LLM_PROVIDER="${LLM_PROVIDER:-google}"
LLM_MODEL="${LLM_MODEL:-gemini-2.0-flash}"

set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "ERROR: This script must be run as root (use sudo)."
  exit 1
fi

if [[ -z "$LLM_API_KEY" ]]; then
  echo "ERROR: LLM_API_KEY is required. Set it via environment or edit this script."
  echo "  sudo LLM_API_KEY=your-key bash setup.sh"
  exit 1
fi

echo "=========================================="
echo " Analytics Idea Lab — Ubuntu Setup"
echo "=========================================="
echo " App dir:     $APP_DIR"
echo " Backend port: $BACKEND_PORT"
echo " Domain:       $DOMAIN"
echo " Provider:     $LLM_PROVIDER"
echo " Model:        $LLM_MODEL"
echo "=========================================="
echo ""

# --- 1. Install system dependencies ---
echo "[1/7] Installing system packages..."

export DEBIAN_FRONTEND=noninteractive

if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v uv &> /dev/null; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

apt-get install -y nginx

echo "  Node.js: $(node --version)"
echo "  npm:     $(npm --version)"
echo "  uv:      $(uv --version)"
echo "  nginx:   $(nginx -v 2>&1)"
echo ""

# --- 2. Copy app files ---
echo "[2/7] Setting up application directory..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$SCRIPT_DIR" != "$APP_DIR" ]]; then
  mkdir -p "$APP_DIR"
  rsync -a --exclude node_modules --exclude .venv --exclude dist --exclude __pycache__ \
    "$SCRIPT_DIR/" "$APP_DIR/"
fi

echo "  Files copied to $APP_DIR"
echo ""

# --- 3. Build frontend ---
echo "[3/7] Building frontend..."

cd "$APP_DIR/stats-scraper"
npm ci
VITE_BACKEND_URL="/api" npm run build

echo "  Frontend built to $APP_DIR/stats-scraper/dist"
echo ""

# --- 4. Install Python dependencies ---
echo "[4/7] Installing Python backend dependencies..."

cd "$APP_DIR"
uv sync

echo "  Python dependencies installed"
echo ""

# --- 5. Create .env file ---
echo "[5/7] Creating .env file..."

cat > "$APP_DIR/.env" << EOF
LLM_API_KEY=$LLM_API_KEY
LLM_PROVIDER=$LLM_PROVIDER
LLM_MODEL=$LLM_MODEL
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_WINDOW_SECONDS=60
GLOBAL_RATE_LIMIT_MAX_REQUESTS=100
GLOBAL_RATE_LIMIT_WINDOW_SECONDS=60
EOF

chmod 600 "$APP_DIR/.env"

echo "  .env created (permissions: 600)"
echo ""

# --- 6. Create systemd service for backend ---
echo "[6/7] Creating systemd services..."

UV_PATH="$(which uv)"

cat > /etc/systemd/system/analytics-backend.service << EOF
[Unit]
Description=Analytics Idea Lab Backend (FastAPI)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=$UV_PATH run uvicorn server.main:app --host 127.0.0.1 --port $BACKEND_PORT
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# --- 7. Create nginx config ---
echo "[7/7] Configuring nginx..."

cat > /etc/nginx/sites-available/analytics-idea-lab << EOF
server {
    listen 80;
    server_name $DOMAIN;

    # Serve frontend static files
    root $APP_DIR/stats-scraper/dist;
    index index.html;

    # SPA fallback: serve index.html for any route not matching a file
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Proxy API requests to the backend
    location /api/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # Timeout for LLM calls (can take a while)
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }

    # Gzip compression
    gzip on;
    gzip_types text/css application/javascript application/json text/plain;
    gzip_min_length 1000;
}
EOF

ln -sf /etc/nginx/sites-available/analytics-idea-lab /etc/nginx/sites-enabled/analytics-idea-lab

# Remove default nginx site if it conflicts
rm -f /etc/nginx/sites-enabled/default

# --- Enable and start services ---
echo ""
echo "Enabling and starting services..."

systemctl daemon-reload
systemctl enable analytics-backend
systemctl restart analytics-backend

nginx -t
systemctl reload nginx

echo ""
echo "=========================================="
echo " Setup complete!"
echo "=========================================="
echo ""
echo " Backend:  http://127.0.0.1:$BACKEND_PORT  (systemd: analytics-backend)"
echo " Frontend: http://$DOMAIN           (nginx)"
echo ""
echo " Manage services:"
echo "   sudo systemctl status  analytics-backend"
echo "   sudo systemctl restart analytics-backend"
echo "   sudo systemctl stop    analytics-backend"
echo "   sudo systemctl restart nginx"
echo ""
echo " View logs:"
echo "   sudo journalctl -u analytics-backend -f"
echo "   sudo tail -f /var/log/nginx/error.log"
echo ""
echo " Update the app (after pulling new code):"
echo "   cd $APP_DIR && bash deploy-update.sh"
echo "=========================================="
