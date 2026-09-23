"""FastAPI server layer for Vizier AI.

Wraps the core library (vizier_ai.core) with HTTP endpoints, session
storage, rate limiting, file upload handling, and static frontend serving.
"""

import os
import sys
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

sys.path.append(str(Path(__file__).parents[2]))

from vizier_ai.core import (
    run_pipeline,
    fetch_rest_data,
    fetch_sql_data,
    build_plotly_spec,
    generate_mock_rows,
    UnsatisfiableConstraintsError,
)
from vizier_ai.bundle import render_bundle
from vizier_ai.models.bundle import InsightBundle
from vizier_ai.models.constraints import InsightConstraints
from vizier_ai.models.csv_options import CsvOptions
from vizier_ai.models.insights import ChartSpec, Insight, InsightMetadata
from vizier_ai.parser import parse_data
from vizier_ai.ui.models.api import (
    GenerateRequest,
    EditChartRequest,
    RegenerateRequest,
    InsightsResponse
)
from vizier_ai.ui import static_render
from vizier_ai.ui.ratelimit import RateLimiter, GlobalRateLimiter, RateLimitConfig
from vizier_ai.ui.sessions import (
    _create_session,
    _get_session,
    _get_session_rows,
    _set_session_insights,
)

app = FastAPI(title="Vizier AI LLM Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- File upload size limit ---

MAX_FILE_SIZE = float(os.getenv("MAX_FILE_SIZE_MB", "0")) * 1024 ** 2
MAX_ROWS = os.getenv("MAX_ROWS")
if MAX_ROWS is not None:
    MAX_ROWS = int(MAX_ROWS)

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
    # Rate limiting protects the LLM-backed API only. Static assets, the
    # SPA fallback route, and cheap page-load endpoints stay unrestricted.
    path = request.url.path
    if not path.startswith("/api/") or path in ("/api/health", "/api/config"):
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

@app.exception_handler(UnsatisfiableConstraintsError)
async def unsatisfiable_constraints_handler(request: Request, exc: UnsatisfiableConstraintsError):
    return JSONResponse(status_code=422, content={"detail": exc.reason})


def _parse_csv_options(csv_options: str) -> CsvOptions | None:
    if not csv_options.strip():
        return None
    try:
        return CsvOptions.model_validate_json(csv_options)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid CSV options: {exc}")


def _recipe_only(insights: list) -> list:
    """Session copy of insights: trace recipes without materialized arrays."""
    copies = []
    for insight in insights:
        copy = insight.model_copy(deep=True)
        copy.chart_spec.plotlyData = None
        copy.chart_spec.plotlyLayout = None
        copies.append(copy)
    return copies


# --- Routes ---

@app.post("/api/generate")
async def generate(request: GenerateRequest) -> InsightsResponse:
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

    result = await run_pipeline(request.schema_text, real_data, constraints=request.constraints)

    session_id = _create_session(
        real_data, request.schema_text, insights=_recipe_only(result.insights)
    )
    response = InsightsResponse.model_validate(
        dict(
            **result.model_dump(),
            session_id = session_id,
        ),
        by_name=True,
    )

    return response


@app.post("/api/generate-upload")
async def generate_upload(
    schemaText: str = Form(...),
    file: UploadFile = File(...),
    fileFormat: str = Form(default="csv"),
    constraints: str = Form(default=""),
    csvOptions: str = Form(default=""),
) -> InsightsResponse:
    """Full pipeline with file upload via multipart form data."""
    if MAX_FILE_SIZE and file.size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max {MAX_FILE_SIZE // (1024 ** 2):.2f} MB. Got {file.size // (1024 ** 2):.2f} MB.",
        )

    parsed_constraints: InsightConstraints | None = None
    if constraints.strip():
        try:
            parsed_constraints = InsightConstraints.model_validate_json(constraints)
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc))

    content = await file.read()

    with tempfile.NamedTemporaryFile(mode="wb", suffix=f".{fileFormat}", delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    csv_options = _parse_csv_options(csvOptions)

    try:
        real_data = parse_data(tmp_path, fileFormat, csv_options=csv_options)
    finally:
        tmp_path.unlink(missing_ok=True)

    result = await run_pipeline(schemaText, real_data, constraints=parsed_constraints)

    session_id = _create_session(real_data, schemaText, insights=_recipe_only(result.insights))
    response = InsightsResponse.model_validate(
        dict(
            **result.model_dump(),
            session_id = session_id,
            csv_options = csv_options,
        ),
        by_name=True,
    )

    return response


@app.post("/api/regenerate")
async def regenerate(request: RegenerateRequest) -> InsightsResponse:
    """Regenerate insights using stored session data (no re-upload)."""
    session = _get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    schema_text = session.get("schema_text", "")
    real_data = session.get("real_data")

    result = await run_pipeline(schema_text, real_data, constraints=request.constraints)
    _set_session_insights(request.session_id, _recipe_only(result.insights))
    response = InsightsResponse.model_validate(
        dict(
            **result.model_dump(),
            session_id = request.session_id,
        ),
        by_name=True,
    )

    return response


@app.post("/api/edit-chart")
async def edit_chart(request: EditChartRequest) -> dict:
    """Rebuild Plotly specs from modified trace specs (no LLM call)."""
    session = _get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    rows = _get_session_rows(session)

    if not rows:
        rows = generate_mock_rows(None, seed=1337)

    chart_spec = ChartSpec(traces=request.traces)
    insight = Insight(
        id="custom-chart",
        metadata=InsightMetadata(title="Custom chart", summary="Custom chart", keyIdea="Custom chart"),
        chart_spec=chart_spec,
    )
    plotly_spec = build_plotly_spec(insight, rows)

    return {
        "plotlyData": plotly_spec["data"],
        "plotlyLayout": plotly_spec["layout"],
    }


@app.get("/api/session/{session_id}/insight/{insight_id}/svg")
async def insight_svg(session_id: str, insight_id: str) -> Response:
    """Render a stored insight as a static SVG (server-side, via kaleido)."""
    session = _get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    rows = _get_session_rows(session)
    if not rows:
        raise HTTPException(
            status_code=404, detail="This session has no data rows to render."
        )

    insight = next(
        (i for i in session.get("insights", []) if i.id == insight_id), None
    )
    if insight is None:
        raise HTTPException(status_code=404, detail="Insight not found.")

    plotly_spec = build_plotly_spec(insight, rows)
    try:
        svg = static_render.render_static_svg(plotly_spec)
    except static_render.StaticRenderUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return Response(content=svg, media_type="image/svg+xml")


@app.post("/api/load-bundle")
async def load_bundle(
    bundle: UploadFile = File(...),
    data: UploadFile | None = File(default=None),
    dataFormat: str = Form(default="csv"),
    csvOptions: str = Form(default=""),
) -> InsightsResponse:
    """Render a saved insight bundle, optionally with an attached dataset. No LLM call."""
    bundle_bytes = await bundle.read()
    try:
        parsed_bundle = InsightBundle.model_validate_json(bundle_bytes)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid bundle: {exc}")

    csv_options = _parse_csv_options(csvOptions) or parsed_bundle.csv_options

    rows: list[dict] = []
    if data is not None:
        data_text = (await data.read()).decode("utf-8")
        try:
            parsed_data = parse_data(data_text, dataFormat, csv_options=csv_options)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Invalid data file: {exc}")
        rows = parsed_data.get("rows", [])

    result, warnings = render_bundle(parsed_bundle, rows=rows)

    real_data = {"rows": rows, "rowCount": len(rows)} if rows else None
    session_id = _create_session(
        real_data,
        parsed_bundle.dataset_schema.model_dump_json(),
        insights=_recipe_only(result.insights),
    )

    response = InsightsResponse.model_validate(
        dict(
            **result.model_dump(),
            session_id=session_id,
            csv_options=csv_options,
            warnings=warnings,
        ),
        by_name=True,
    )

    return response


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/api/config")
async def get_config() -> dict:
    return {
        "maxFileSize": MAX_FILE_SIZE,
        "maxRows": MAX_ROWS,
    }


# --- Static frontend serving ---

_FRONTEND_DIST = Path(__file__).parent / "frontend" / "dist"

if _FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=_FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = _FRONTEND_DIST / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(_FRONTEND_DIST / "index.html")
