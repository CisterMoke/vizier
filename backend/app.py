"""FastAPI server layer for Vizier AI.

Wraps the core library (backend.core) with HTTP endpoints, session
storage, rate limiting, and file upload handling.
"""

import os
import sys
import tempfile
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

sys.path.append(str(Path(__file__).parents[1]))

from backend.ratelimit import RateLimiter, GlobalRateLimiter, RateLimitConfig
from backend.core import run_pipeline, fetch_rest_data, fetch_sql_data, build_plotly_spec, generate_mock_rows
from backend.parser import parse_data

# Load .env file before reading any env vars
load_dotenv()

app = FastAPI(title="Vizier AI LLM Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- File upload size limit ---

MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE_MB", "10")) * 1024 * 1024

# --- Rate limiting ---

_per_ip_config = RateLimitConfig(
    max_requests=int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "10")),
    window_seconds=int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60")),
)
_per_ip_limiter = RateLimiter(_per_ip_config)

_global_config = RateLimitConfig(
    max_requests=int(os.getenv("GLOBAL_RATE_LIMIT_MAX_REQUESTS", "100")),
    window_seconds=int(os.getenv("GLOBAL_RATE_LIMIT_WINDOW_SECONDS", "60")),
)
_global_limiter = GlobalRateLimiter(_global_config)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path == "/api/health":
        return await call_next(request)

    client_ip = request.client.host if request.client else "unknown"

    ip_allowed, ip_remaining = _per_ip_limiter.check(client_ip)
    if not ip_allowed:
        return JSONResponse(
            status_code=429,
            content={
                "detail": f"Per-IP rate limit exceeded. Max {_per_ip_config.max_requests} requests per {_per_ip_config.window_seconds}s."
            },
            headers={
                "Retry-After": str(_per_ip_config.window_seconds),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Limit": str(_per_ip_config.max_requests),
                "X-RateLimit-Scope": "per-ip",
            },
        )

    global_allowed, global_remaining = _global_limiter.check()
    if not global_allowed:
        return JSONResponse(
            status_code=429,
            content={
                "detail": f"Global rate limit exceeded. Max {_global_config.max_requests} requests per {_global_config.window_seconds}s across all users."
            },
            headers={
                "Retry-After": str(_global_config.window_seconds),
                "X-RateLimit-Global-Remaining": "0",
                "X-RateLimit-Global-Limit": str(_global_config.max_requests),
                "X-RateLimit-Scope": "global",
            },
        )

    response = await call_next(request)
    response.headers["X-RateLimit-Remaining"] = str(ip_remaining)
    response.headers["X-RateLimit-Limit"] = str(_per_ip_config.max_requests)
    response.headers["X-RateLimit-Global-Remaining"] = str(global_remaining)
    response.headers["X-RateLimit-Global-Limit"] = str(_global_config.max_requests)
    return response


# --- Session storage (in-memory, per-session data retention) ---

_sessions: dict[str, dict] = {}


def _create_session(real_data: dict | None, schema_text: str) -> str:
    session_id = uuid.uuid4().hex
    _sessions[session_id] = {
        "real_data": real_data,
        "schema_text": schema_text,
    }
    return session_id


def _get_session(session_id: str) -> dict | None:
    return _sessions.get(session_id)


def _get_session_rows(session: dict) -> list[dict]:
    real_data = session.get("real_data")
    if real_data and real_data.get("rowCount", 0) > 0:
        return real_data.get("rows", [])
    return []


# --- Request models ---

class GenerateRequest(BaseModel):
    schema_text: str = Field(alias="schemaText")
    data_source_mode: str = Field(default="none", alias="dataSourceMode")
    rest_method: str | None = Field(default=None, alias="restMethod")
    rest_url: str | None = Field(default=None, alias="restUrl")
    rest_headers: str | None = Field(default=None, alias="restHeaders")
    rest_body: str | None = Field(default=None, alias="restBody")
    sql_connection: str | None = Field(default=None, alias="sqlConnection")
    sql_query: str | None = Field(default=None, alias="sqlQuery")

    model_config = {"populate_by_name": True}


class RegenerateRequest(BaseModel):
    session_id: str = Field(alias="sessionId")


class EditChartRequest(BaseModel):
    session_id: str = Field(alias="sessionId")
    traces: list[dict] = []


# --- Routes ---

@app.post("/api/generate")
async def generate(request: GenerateRequest) -> dict:
    """Full pipeline for schema-only, REST API, or SQL data sources."""
    real_data: dict | None = None

    if request.data_source_mode == "rest" and request.rest_url:
        raw_text = await fetch_rest_data(
            request.rest_method or "GET",
            request.rest_url,
            request.rest_headers or "",
            request.rest_body or "",
        )
        real_data = parse_data(raw_text, "json")

    elif request.data_source_mode == "sql" and request.sql_connection and request.sql_query:
        raw_json = await fetch_sql_data(request.sql_connection, request.sql_query)
        real_data = parse_data(raw_json, "json")

    result = await run_pipeline(request.schema_text, real_data)

    session_id = _create_session(real_data, request.schema_text)
    result["sessionId"] = session_id

    return result


@app.post("/api/generate-upload")
async def generate_upload(
    schemaText: str = Form(...),
    file: UploadFile = File(...),
    fileFormat: str = Form(default="csv"),
) -> dict:
    """Full pipeline with file upload via multipart form data."""
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max {MAX_FILE_SIZE // (1024 * 1024)} MB. Got {len(content) // (1024 * 1024)} MB.",
        )

    with tempfile.NamedTemporaryFile(mode="wb", suffix=f".{fileFormat}", delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        real_data = parse_data(tmp_path, fileFormat)
    finally:
        tmp_path.unlink(missing_ok=True)

    result = await run_pipeline(schemaText, real_data)

    session_id = _create_session(real_data, schemaText)
    result["sessionId"] = session_id

    return result


@app.post("/api/regenerate")
async def regenerate(request: RegenerateRequest) -> dict:
    """Regenerate insights using stored session data (no re-upload)."""
    session = _get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    schema_text = session.get("schema_text", "")
    real_data = session.get("real_data")

    result = await run_pipeline(schema_text, real_data)
    result["sessionId"] = request.session_id

    return result


@app.post("/api/edit-chart")
async def edit_chart(request: EditChartRequest) -> dict:
    """Rebuild Plotly specs from modified trace specs (no LLM call)."""
    session = _get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    rows = _get_session_rows(session)

    if not rows:
        rows = generate_mock_rows(
            {"dataProfile": {"columns": []}},
            seed=1337,
        )

    chart_spec = {"mode": "recipe", "traces": request.traces}
    insight = {"title": "Custom chart", "chartSpec": chart_spec}
    plotly_spec = build_plotly_spec(insight, rows)

    return {
        "plotlyData": plotly_spec["data"],
        "plotlyLayout": plotly_spec["layout"],
    }


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
