# Vizier AI

Turn any data description into interactive analytics dashboards — instantly.

Vizier AI takes a free-form description of your dataset (prose, schema, sample rows, or all three), uses an LLM to generate analytics insights with chart specifications, and renders them as interactive Plotly charts. Optionally connect real data via file upload, REST API, or SQL query to replace mock data with the real thing.

## What It Does

1. **Schema extraction** — Paste a description of your data (SQL DDL, CSV headers, JSON, OpenAPI spec, or just words). The LLM extracts a structured schema with field types, semantic types, and JSONPath expressions for precise data access.

2. **Insight generation** — The LLM generates up to 10 analytics insights, each with a title, summary, key idea, chart specification (chart type, axes, aggregation, filters), and a mock data profile for demo rendering.

3. **Interactive visualization** — Insights render as interactive Plotly charts in a carousel:
   - **Chart types:** bar, line, pie, scatter, heatmap, geomap (world map)
   - **Aggregation:** sum, mean, count, min, max, median, first, last — applied per-trace, grouping Y values by X before rendering
   - **Filters:** per-trace data subsetting with operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `not_in`
   - **Overlays:** multi-trace charts with secondary y-axis support (e.g., a bar chart with a line overlay)
   - **Dark theme** throughout

4. **Real data integration** — Three options, available at generation time or applied to existing insights later:
   - **File upload** — CSV, JSON array, or JSONL (max 10 MB, auto-sampled to 5000 rows)
   - **REST API** — any HTTP method, custom headers and body
   - **SQL query** — any SQLAlchemy-compatible connection string

5. **Apply data later** — Generate insights with mock data first, then click "Apply real data" to fetch and attach real data to existing insights without regenerating — no LLM round-trip needed.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Preact, Vite, TypeScript, Mantine, Tailwind CSS v4, Plotly.js, Zod, jsonpath-plus |
| Backend | Python, FastAPI, pydantic-ai, pandas, aiohttp, SQLAlchemy |
| LLM | Server-side via pydantic-ai (default: Google Gemini; Mistral also supported) |
| Deployment | systemd + nginx on Ubuntu |

## Quick Start

### Prerequisites

- Node.js 22+
- Python 3.12+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- An LLM API key (Google Gemini or Mistral)

### Local Development

1. **Clone and install:**

```bash
git clone <repo-url>
cd vizier-ai
```

2. **Backend setup:**

```bash
cd backend
uv sync
cp .env.example .env
# Edit .env and set LLM_API_KEY=your-key-here
uv run uvicorn main:app --reload --port 8000
```

3. **Frontend setup (in another terminal):**

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env if backend is not at http://localhost:8000
npm run dev
```

4. **Open the app** at `http://localhost:5173`.

### Configuration

**Backend (`backend/.env`):**

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_API_KEY` | (required) | API key for the LLM provider |
| `LLM_MODEL` | `google:gemini-3.5-flash-lite` | Model ID with provider prefix |
| `RATE_LIMIT_MAX_REQUESTS` | 10 | Per-IP request limit per window |
| `RATE_LIMIT_WINDOW_SECONDS` | 60 | Per-IP rate limit window |
| `GLOBAL_RATE_LIMIT_MAX_REQUESTS` | 100 | Global request limit per window |
| `GLOBAL_RATE_LIMIT_WINDOW_SECONDS` | 60 | Global rate limit window |
| `MAX_FILE_SIZE_MB` | 10 | Max file upload size in MB |

**Frontend (`frontend/.env`):**

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_BACKEND_URL` | `http://localhost:8000` | Backend API URL |
| `VITE_MAX_FILE_SIZE_MB` | 10 | Client-side file size limit in MB |

### Supported LLM Models

Any model supported by [pydantic-ai](https://ai.pydantic.dev/). Set `LLM_MODEL` in `backend/.env`:

- `google:gemini-2.0-flash` (Google Gemini)
- `google:gemini-3.5-flash-lite` (default)
- `mistral:mistral-large-latest` (Mistral)

## Usage

1. **Describe your data** — In the "Data description" field, write a natural language description, paste a schema, or include sample rows. For example:

   > This dataset is obtained from the WA State DOL and contains EV registration records with fields like county, make, model, electric_range, vehicle_id, and geocoded coordinates.

2. **Choose a data source** (optional):
   - **None** — uses mock data generated from the LLM's data profile
   - **File upload** — upload a CSV/JSON/JSONL file
   - **REST API** — configure method, URL, headers, and body
   - **SQL query** — provide a connection string and query

3. **Click "Generate analytics"** — The LLM analyzes your description, extracts a schema, and generates insights with charts.

4. **Browse insights** — Navigate the carousel with prev/next buttons. Each card shows the chart, title, summary, key idea, metric description, and assumptions.

5. **Apply real data later** (optional) — If you generated with mock data, select a data source and click "Apply real data" to fetch and attach real data to existing insights.

## Deployment

### One-command setup (Ubuntu 22.04+)

```bash
sudo LLM_API_KEY=your-key-here bash setup.sh
```

This installs Node.js, uv, and nginx; builds the frontend; installs Python deps; creates a systemd service for the backend; and configures nginx to serve the SPA and proxy API requests.

### Updating an existing deployment

```bash
git pull
sudo bash deploy-update.sh
```

Rebuilds the frontend, reinstalls Python deps, restarts the backend service, and reloads nginx.

### Optional: SSL with Let's Encrypt

```bash
sudo certbot --nginx -d your-domain.com
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for full deployment instructions.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/generate` | POST | Full pipeline (JSON: schema text + optional REST/SQL config) |
| `/api/generate-upload` | POST | Full pipeline (multipart: schema text + file upload) |
| `/api/apply-data` | POST | Fetch/parse real data only, no LLM (JSON: REST/SQL config) |
| `/api/apply-data-upload` | POST | Parse uploaded file only, no LLM (multipart: file) |
| `/api/health` | GET | Health check |

## Project Structure

```
vizier-ai/
├── backend/
│   ├── main.py          # FastAPI server, LLM pipeline, endpoints
│   ├── parser.py        # CSV/JSON/JSONL parser (pandas, max 5000 rows)
│   ├── ratelimit.py     # Per-IP + global rate limiting
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app.tsx              # Main app flow
│   │   ├── components/          # DataInputPanel, ChartCarousel, ChartCard
│   │   ├── domain/              # Types and Zod schemas
│   │   ├── services/            # API client, chart builder, JSONPath, mock data
│   │   └── store/               # Workspace state
│   └── .env.example
├── setup.sh             # One-command Ubuntu deployment
├── deploy-update.sh     # Rebuild + restart script
└── DEPLOYMENT.md         # Full deployment guide
```

## Development

```bash
# Frontend tests
cd frontend && npm run test

# Frontend build
cd frontend && npm run build

# Backend import check
cd backend && uv run python -c "import main; print('OK')"
```
