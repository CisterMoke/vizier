# Analytics Idea Lab — Deployment Guide

## Architecture

```
Browser (Vite/Preact SPA)  →  FastAPI Backend  →  LLM Provider (Google/Mistral)
                              ↘ REST API / SQL DB (real data fetching)
```

- **Frontend**: Static SPA deployed on Vercel
- **Backend**: Python FastAPI server deployed on Railway/Render/Fly.io
- **LLM API keys**: Stored server-side as environment variables, never exposed to the browser

## Backend Setup (FastAPI)

### Prerequisites
- Python 3.12+
- [uv](https://docs.astral.sh/uv/) package manager

### Install dependencies
```bash
cd /home/rubuntu/projects/stats-scraper
uv sync
```

### Set environment variables
```bash
export LLM_API_KEY="your-google-or-mistral-api-key"
# Optional: change provider/model defaults
export LLM_PROVIDER="google"  # or "mistral"
export LLM_MODEL="gemini-2.0-flash"
```

### Run locally
```bash
uv run uvicorn server.main:app --reload --port 8000
```

The backend will be available at `http://localhost:8000`.

### Deploy backend

**Option A: Railway**
1. Create a new Railway project from this repo
2. Set the start command: `uvicorn server.main:app --host 0.0.0.0 --port $PORT`
3. Add environment variable: `LLM_API_KEY=your-key`
4. Deploy

**Option B: Render**
1. Create a new Web Service from this repo
2. Build command: `pip install -e .` (or `uv sync`)
3. Start command: `uvicorn server.main:app --host 0.0.0.0 --port $PORT`
4. Add environment variable: `LLM_API_KEY=your-key`

**Option C: Fly.io**
```bash
fly launch
fly secrets set LLM_API_KEY=your-key
fly deploy
```

## Frontend Setup (Vercel)

### Configure backend URL
Create `.env` in `stats-scraper/`:
```
VITE_BACKEND_URL=https://your-backend-url.com
```

### Deploy to Vercel
```bash
cd stats-scraper
npm install
npm run build
npx vercel
```

Or connect the GitHub repo to Vercel:
1. Import the `stats-scraper` directory
2. Build command: `npm run build`
3. Output directory: `dist`
4. Environment variable: `VITE_BACKEND_URL=https://your-backend-url.com`

## Local Development

1. Start the backend:
```bash
cd /home/rubuntu/projects/stats-scraper
export LLM_API_KEY=your-key
uv run uvicorn server.main:app --reload --port 8000
```

2. Start the frontend (in another terminal):
```bash
cd stats-scraper
npm run dev
```

The frontend will proxy to `http://localhost:8000` by default.

## API Endpoints

### `POST /api/generate`
Full pipeline: schema mapping → insight generation → real data fetching → field mapping.

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
