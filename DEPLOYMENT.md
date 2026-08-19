# Analytics Idea Lab — Deployment Guide

## Architecture

```
Browser → Nginx (port 80) → static frontend files (dist/)
                       /api/ → FastAPI Backend (port 8000) → LLM Provider (Google/Mistral)
                                                     ↘ REST API / SQL DB (real data fetching)
```

- **Nginx**: Serves the built frontend SPA and proxies `/api/` to the backend
- **Backend**: FastAPI server managed by systemd, reads `.env` for config
- **LLM API keys**: Stored server-side in `.env`, never exposed to the browser

---

## Ubuntu Server Deployment (systemd + nginx)

### Prerequisites

- Ubuntu 22.04+ server with root access
- Your app code at `/opt/analytics-idea-lab` (or wherever you cloned it)
- A domain name pointing to your server (optional, defaults to `localhost`)

### Quick Setup

```bash
# Clone the repo (if not already on the server)
git clone <your-repo-url> /opt/analytics-idea-lab
cd /opt/analytics-idea-lab

# Run the setup script with your LLM API key
sudo LLM_API_KEY=your-api-key bash setup.sh

# Or with custom settings
sudo LLM_API_KEY=your-key \
     LLM_PROVIDER=google \
     LLM_MODEL=gemini-2.0-flash \
     DOMAIN=your-domain.com \
     BACKEND_PORT=8000 \
     bash setup.sh
```

The setup script will:
1. Install Node.js 22, uv, and nginx
2. Build the frontend (`npm run build` with `VITE_BACKEND_URL=/api`)
3. Install Python dependencies via `uv sync`
4. Create `.env` from your environment variables
5. Create a systemd service for the backend (`analytics-backend.service`)
6. Configure nginx to serve the frontend and proxy `/api/` to the backend
7. Enable and start all services

### Manual Setup

If you prefer to do it step by step:

#### 1. Install system dependencies

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt-get install -y nodejs

# uv (Python package manager)
curl -LsSf https://astral.sh/uv/install.sh | sh

# nginx
sudo apt-get install -y nginx
```

#### 2. Build the frontend

```bash
cd /opt/analytics-idea-lab/stats-scraper
npm ci
VITE_BACKEND_URL=/api npm run build
```

> `VITE_BACKEND_URL=/api` makes the frontend use the relative `/api` path, which nginx proxies to the backend.

#### 3. Install Python dependencies

```bash
cd /opt/analytics-idea-lab
uv sync
```

#### 4. Create `.env`

```bash
cp .env.example .env
# Edit .env and fill in your values
nano .env
chmod 600 .env
```

#### 5. Create systemd service for the backend

Create `/etc/systemd/system/analytics-backend.service`:

```ini
[Unit]
Description=Analytics Idea Lab Backend (FastAPI)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/analytics-idea-lab
EnvironmentFile=/opt/analytics-idea-lab/.env
ExecStart=/root/.local/bin/uv run uvicorn server.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable analytics-backend
sudo systemctl start analytics-backend
```

#### 6. Configure nginx

Create `/etc/nginx/sites-available/analytics-idea-lab`:

```nginx
server {
    listen 80;
    server_name localhost;  # or your domain

    root /opt/analytics-idea-lab/stats-scraper/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }

    gzip on;
    gzip_types text/css application/javascript application/json text/plain;
    gzip_min_length 1000;
}
```

Enable the site:

```bash
sudo ln -sf /etc/nginx/sites-available/analytics-idea-lab /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### Managing Services

```bash
# Backend
sudo systemctl status  analytics-backend
sudo systemctl restart analytics-backend
sudo systemctl stop    analytics-backend
sudo journalctl -u analytics-backend -f   # view logs

# Nginx
sudo systemctl restart nginx
sudo tail -f /var/log/nginx/error.log
```

### Updating After New Code

```bash
cd /opt/analytics-idea-lab
git pull
sudo bash deploy-update.sh
```

Or manually:

```bash
cd /opt/analytics-idea-lab/stats-scraper
npm ci && VITE_BACKEND_URL=/api npm run build
cd /opt/analytics-idea-lab
uv sync
sudo systemctl restart analytics-backend
sudo systemctl reload nginx
```

### SSL/HTTPS (optional)

To add HTTPS with Let's Encrypt:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_API_KEY` | (required) | API key for your LLM provider |
| `LLM_PROVIDER` | `google` | `google` or `mistral` |
| `LLM_MODEL` | `gemini-2.0-flash` | Model name |
| `RATE_LIMIT_MAX_REQUESTS` | `10` | Max requests per IP per window |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Per-IP rate limit window |
| `GLOBAL_RATE_LIMIT_MAX_REQUESTS` | `100` | Max total requests per window |
| `GLOBAL_RATE_LIMIT_WINDOW_SECONDS` | `60` | Global rate limit window |

---

## API Endpoints

### `POST /api/generate`
Full pipeline: schema mapping → insight generation → real data fetch → field mapping.

**Request body:**
```json
{
  "schemaText": "orders(id int, total decimal, ...)",
  "dataSourceMode": "none|file|rest|sql",
  "fileContent": "...",
  "fileFormat": "csv|json|jsonl",
  "restMethod": "GET",
  "restUrl": "https://api.example.com/data",
  "restHeaders": "{\"Authorization\": \"Bearer ...\"}",
  "restBody": "{\"query\": \"...\"}",
  "sqlConnection": "postgresql://...",
  "sqlQuery": "SELECT * FROM orders LIMIT 100"
}
```

**Response:**
```json
{
  "schema": { "source": "...", "fields": [...], "warnings": [] },
  "insights": [{ "id": "...", "chartSpec": {...}, "dataProfile": {...} }],
  "realData": { "columns": [...], "rows": [...], "rowCount": 100 },
  "fieldMappings": [{ "insightId": "...", "mappings": { "xAxis": "col", "yAxis": "col" } }]
}
```

### `GET /api/health`
Health check endpoint.

---

## Local Development

1. Start the backend:
```bash
cd /opt/analytics-idea-lab
cp .env.example .env  # fill in LLM_API_KEY
uv run uvicorn server.main:app --reload --port 8000
```

2. Start the frontend (in another terminal):
```bash
cd stats-scraper
npm run dev
```

The frontend will proxy to `http://localhost:8000` by default.
