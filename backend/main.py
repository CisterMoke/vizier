"""FastAPI LLM proxy server for Analytics Idea Lab.

All LLM calls happen server-side via pydantic-ai so API keys never reach the browser.
Supports Google (Gemini) and Mistral providers.
REST API calls use aiohttp, data parsing uses pandas.
"""

import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

import aiohttp
import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.models import infer_model, parse_model_id
from pydantic_ai.providers import infer_provider_class

sys.path.append(str(Path(__file__).parents[1]))

from backend.ratelimit import RateLimiter, GlobalRateLimiter, RateLimitConfig

# Load .env file before reading any env vars
load_dotenv()

app = FastAPI(title="Analytics Idea Lab LLM Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- LLM configuration (server-side only) ---

_LLM_MODEL = os.getenv("LLM_MODEL", "google:gemini-3.5-flash-lite")

# Max file upload size: 10 MB
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
    # Skip rate limiting for health check
    if request.url.path == "/api/health":
        return await call_next(request)

    client_ip = request.client.host if request.client else "unknown"

    # Check per-IP limit first
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

    # Then check global limit
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

# --- Prompts ---

MAP_SCHEMA_PROMPT = """You are a data schema analyzer. Given free-form text (SQL DDL, CSV headers, JSON, OpenAPI spec, scraped HTML, or any data description), extract a flat list of fields with their types and semantics.

For each field, infer:
- type: string, number, boolean, date, or datetime
- semanticType: identifier (primary key), measure (numeric metric), dimension (categorical label), timestamp, currency, percentage, count, text, latitude (lat/geo lat), longitude (lng/geo lon), or geohash
- sampleValues: 3-5 representative values if they can be inferred from the input
- unique: true if the field is a primary key or unique identifier
- group: a grouping label if the fields come from distinct nested objects or resources (e.g. "order", "customer")

Set the source to a short description of where the data comes from.
Include warnings for any fields you are uncertain about."""

INSIGHT_PROMPT = """You are an analytics brainstorming assistant. Given a dataset schema with field semantics and sample values, generate creative analytics hypotheses suitable for a hackathon demo.

For each insight, provide a chartSpec object that MUST include "mode": "recipe" as a field. Example:
  "chartSpec": { "mode": "recipe", "chartType": "bar", "xAxis": "category", "yAxis": "revenue" }
- chartType can be: bar, line, pie, scatter, heatmap, or geomap.
  - Use "geomap" when the data has geographic coordinates (latitude/longitude fields). Provide xAxis as the longitude column, yAxis as the latitude column, and optionally zAxis as the intensity/value column.
  - Use "heatmap" for 2D density/intensity views.
  - Use "scatter" for correlation between two measures.
  - Use "bar" for categorical comparisons.
  - Use "line" for trends over time.
  - Use "pie" for share/proportion.
- xAxis and yAxis must be column name strings from the schema.
- zAxis is optional, for heatmap intensity or geomap point coloring.

Provide a dataProfile with rowCount and columns. Each column must have a "generator" field:
  - "category": include "categories" array
  - "normal": include "mean" and "stddev", optionally "min" and "max"
  - "uniform": include "min" and "max"
  - "linear": include "start", "end", and "step"
  - "constant": include "value"
Column names in dataProfile must match chartSpec xAxis/yAxis/zAxis values.
Return practical, visually interesting ideas with concise reasoning."""

FIELD_MAPPING_PROMPT = """You are a field mapping assistant. Given a list of insights with their chart axis column names (from mock data profiles) and a list of real data column names, map each insight's axis columns to the best matching real column. Return a mappings array where each entry has insightId and a mappings object mapping axis names to real column names."""

# --- Pydantic output models ---

class DatasetField(BaseModel):
    name: str = ""
    type: str = "string"
    nullable: bool = False
    semanticType: str | None = None
    sampleValues: Any | None = None
    unique: bool | None = None
    group: str | None = None


class DatasetSchema(BaseModel):
    source: str
    fields: list[DatasetField]
    warnings: list[str] = []


class ChartSpec(BaseModel):
    mode: str = "recipe"
    chartType: str | None = None
    xAxis: str | None = None
    yAxis: str | None = None
    zAxis: str | None = None
    plotlyData: list[Any] | None = None
    plotlyLayout: dict[str, Any] | None = None


class DataColumnSpec(BaseModel):
    name: str = ""
    generator: str = "uniform"
    categories: list[str] | None = None
    min: float | None = None
    max: float | None = None
    mean: float | None = None
    stddev: float | None = None
    start: float | None = None
    end: float | None = None
    step: float | None = None
    value: Any | None = None


class DataProfile(BaseModel):
    rowCount: int = 100
    columns: list[DataColumnSpec] = []


class InsightCandidate(BaseModel):
    id: str = ""
    title: str = ""
    summary: str = ""
    confidence: float = 0.5
    hypothesis: str = ""
    metricDescription: str = ""
    chartSpec: ChartSpec | None = None
    dataProfile: DataProfile | None = None
    assumptions: list[str] = []
    description: str | None = None  # LLM sometimes returns this instead of summary


class InsightEnvelope(BaseModel):
    insights: list[InsightCandidate]


class FieldMappingResult(BaseModel):
    mappings: list[dict[str, Any]]


# --- Request model (for JSON requests without file upload) ---

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


async def call_llm(system: str, prompt: str, output_type: type, retry_prompt: str | None = None) -> dict:
    """Call LLM via pydantic-ai with structured output using server-side config.

    Retries once with a simpler prompt if validation fails.
    """
    model = infer_model(_LLM_MODEL, lambda s: infer_provider_class(s)(api_key=os.getenv("LLM_API_KEY")))

    try:
        agent = Agent(model, system_prompt=system, output_type=output_type)
        result = await agent.run(prompt)
        return result.output.model_dump(mode="json")
    except Exception as first_error:
        print(f"[LLM] First attempt failed: {first_error}", file=sys.stderr)
        if retry_prompt:
            print("[LLM] Retrying with simplified prompt...", file=sys.stderr)
            try:
                retry_agent = Agent(model, system_prompt=system, output_type=output_type)
                result = await retry_agent.run(retry_prompt)
                return result.output.model_dump(mode="json")
            except Exception as retry_error:
                print(f"[LLM] Retry also failed: {retry_error}", file=sys.stderr)
        raise first_error


# --- Data fetching ---

async def fetch_rest_data(method: str, url: str, headers: str, body: str) -> str:
    """Fetch data from a REST API using aiohttp."""
    parsed_headers: dict[str, str] = {}
    if headers:
        parsed_headers = json.loads(headers)

    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
        async with session.request(
            method,
            url,
            headers=parsed_headers,
            data=body.encode() if body else None,
        ) as resp:
            resp.raise_for_status()
            return await resp.text()


async def fetch_sql_data(connection_string: str, query: str) -> str:
    """Execute a SQL query and return results as JSON using pandas."""
    from sqlalchemy import create_engine, text

    engine = create_engine(connection_string)
    with engine.connect() as conn:
        df = pd.read_sql(text(query), conn)

    return df.to_json(orient="records", force_ascii=False)


# --- Shared pipeline ---

async def _run_pipeline(
    schema_text: str,
    real_data: dict | None = None,
) -> dict:
    """Run the full LLM pipeline: schema mapping → insights → field mapping."""
    # 1. Map schema
    schema = await call_llm(
        MAP_SCHEMA_PROMPT,
        f"Analyze this data description and extract the dataset schema:\n\n{schema_text}",
        DatasetSchema,
    )

    # 2. Generate insights
    insights = await call_llm(
        INSIGHT_PROMPT,
        f"Given this dataset schema, produce up to 10 insight candidates:\n\n{json.dumps(schema)}",
        InsightEnvelope,
        retry_prompt=(
            f"Generate 5 analytics insights for this schema. Each insight MUST have all fields: "
            f'id, title, summary, confidence (0-1), hypothesis, metricDescription, '
            f'chartSpec (with mode="recipe", chartType, xAxis, yAxis), '
            f'dataProfile (with rowCount and columns, each column needs name and generator), '
            f'and assumptions (array of strings).\n\nSchema: {json.dumps(schema)}'
        ),
    )

    # 3. Map fields if we have real data
    field_mappings: list = []
    if real_data and real_data.get("rowCount", 0) > 0:
        insight_axes = [
            {
                "insightId": ins.get("id", ""),
                "chartType": ins.get("chartSpec", {}).get("chartType") if ins.get("chartSpec") else None,
                "xAxis": ins.get("chartSpec", {}).get("xAxis") if ins.get("chartSpec") else None,
                "yAxis": ins.get("chartSpec", {}).get("yAxis") if ins.get("chartSpec") else None,
                "zAxis": ins.get("chartSpec", {}).get("zAxis") if ins.get("chartSpec") else None,
            }
            for ins in insights.get("insights", [])
        ]

        mapping_result = await call_llm(
            FIELD_MAPPING_PROMPT,
            f"Insights with their chart axes:\n{json.dumps(insight_axes)}\n\n"
            f"Available real data columns:\n{json.dumps(real_data['columns'])}\n\n"
            f"For each insight, map xAxis, yAxis, and zAxis to the most appropriate real column name. "
            f'Return {{ "mappings": [{{ "insightId": "...", "mappings": {{ "xAxis": "col", "yAxis": "col" }} }}] }}.',
            FieldMappingResult,
        )
        field_mappings = mapping_result.get("mappings", [])

    return {
        "schema": schema,
        "insights": insights,
        "realData": real_data,
        "fieldMappings": field_mappings,
    }


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
        from backend.parser import parse_data
        real_data = parse_data(raw_text, "json")

    elif request.data_source_mode == "sql" and request.sql_connection and request.sql_query:
        raw_json = await fetch_sql_data(request.sql_connection, request.sql_query)
        from backend.parser import parse_data
        real_data = parse_data(raw_json, "json")

    return await _run_pipeline(request.schema_text, real_data)


@app.post("/api/generate-upload")
async def generate_upload(
    schemaText: str = Form(...),
    file: UploadFile = File(...),
    fileFormat: str = Form(default="csv"),
) -> dict:
    """Full pipeline with file upload via multipart form data.

    The file is saved to a temp file and parsed by pandas directly,
    avoiding loading the entire file content into memory as a string.
    """
    # Check file size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max {MAX_FILE_SIZE // (1024 * 1024)} MB. Got {len(content) // (1024 * 1024)} MB.",
        )

    # Save to temp file and parse
    with tempfile.NamedTemporaryFile(mode="wb", suffix=f".{fileFormat}", delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        from backend.parser import parse_data
        real_data = parse_data(tmp_path, fileFormat)
    finally:
        tmp_path.unlink(missing_ok=True)

    return await _run_pipeline(schemaText, real_data)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
