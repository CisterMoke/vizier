"""Core library — standalone chart brainstorming and generation.

This module contains all the library-grade logic with zero FastAPI/HTTP
dependencies. It can be used independently as a Python library:

    from vizier_ai.core import run_pipeline, call_llm, build_plotly_spec

The LLM model and API key are injectable via parameters with env-based
defaults. Prompts are overridable constants.
"""

import json
import os
import sys
from typing import Any

import aiohttp
import pandas as pd
from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.models import infer_model
from pydantic_ai.providers import infer_provider_class

from vizier_ai.chart_builder import build_plotly_spec
from vizier_ai.mock_data import generate_mock_rows
from vizier_ai.parser import parse_data


# --- Default prompts (overridable via parameters) ---

DEFAULT_MAP_SCHEMA_PROMPT = """You are a data schema analyzer. Given free-form text (SQL DDL, CSV headers, JSON, OpenAPI spec, scraped HTML, or any data description), extract a flat list of fields with their types and semantics.

For each field, provide:
- name: a human-friendly field name (e.g. "County" or "Geocoded Column Longitude")
- jsonPath: a JSONPath expression to access this field in a data record. For top-level fields: "$.field_name". For nested fields: "$.parent.child" (e.g. "$.geocoded_column.longitude")
- type: string, number, boolean, date, or datetime
- semanticType: identifier (primary key), measure (numeric metric), dimension (categorical label), timestamp, currency, percentage, count, text, latitude (lat/geo lat), longitude (lng/geo lon), or geohash
- sampleValues: 3-5 representative values if they can be inferred from the input
- unique: true if the field is a primary key or unique identifier
- group: a grouping label if the fields come from distinct nested objects or resources (e.g. "order", "customer")

Set the source to a short description of where the data comes from.
Include warnings for any fields you are uncertain about."""

DEFAULT_INSIGHT_PROMPT = """You are an analytics brainstorming assistant. Given a dataset schema (or a data sample with a description), generate creative analytics hypotheses suitable for a hackathon demo.

For each insight, provide a chartSpec object that MUST include "mode": "recipe" and a "traces" array with AT LEAST ONE trace.

Each trace in the traces array has:
- chartType: bar, line, pie, scatter, heatmap, or geomap
  - Use "geomap" when the data has geographic coordinates (latitude/longitude fields). Provide xAxis as the longitude jsonPath, yAxis as the latitude jsonPath, and optionally zAxis as the intensity/value jsonPath.
  - Use "heatmap" for 2D density/intensity views.
  - Use "scatter" for correlation between two measures.
  - Use "bar" for categorical comparisons.
  - Use "line" for trends over time.
  - Use "pie" for share/proportion.
- xAxis: a jsonPath string from the schema fields (e.g. "$.county")
- yAxis: a jsonpath string from the schema fields (e.g. "$.dol_vehicle_id")
- zAxis: optional, for heatmap intensity or geomap point coloring (jsonPath string)
- aggregation: optional, one of "sum", "mean", "count", "min", "max", "median", "first", "last"
  - When you want to aggregate Y values by X (e.g. count of vehicles by county, sum of revenue by category, average range by make), set aggregation to the appropriate function.
  - Count: "aggregation": "count" (counts rows per X category)
  - Sum: "aggregation": "sum" (sums Y values per X category)
  - Mean: "aggregation": "mean" (averages Y values per X category)
- yaxis2: set to "y2" to use a secondary y-axis (for overlays with different scales)
- name: trace name for the legend
- filter: optional, to select a subset of data for this trace only
  - field: a jsonPath string for the field to filter on (e.g. "$.state")
  - op: one of "eq", "ne", "gt", "gte", "lt", "lte", "in", "not_in"
  - value: a string, number, or array of strings/numbers to compare against
  - Example: { "field": "$.ev_type", "op": "eq", "value": "Battery Electric Vehicle (BEV)" }
  - Example: { "field": "$.electric_range", "op": "gte", "value": 200 }
  - Example: { "field": "$.make", "op": "in", "value": ["TESLA", "NISSAN", "FORD"] }

SINGLE-TRACE EXAMPLE:
  "chartSpec": {
    "mode": "recipe",
    "traces": [
      {
        "chartType": "bar",
        "xAxis": "$.county",
        "yAxis": "$.dol_vehicle_id",
        "aggregation": "count",
        "name": "EV Count by County"
      }
    ]
  }

MULTI-TRACE EXAMPLE (overlay with dual axis):
  "chartSpec": {
    "mode": "recipe",
    "traces": [
      {
        "chartType": "bar",
        "xAxis": "$.county",
        "yAxis": "$.dol_vehicle_id",
        "aggregation": "count",
        "name": "EV Count"
      },
      {
        "chartType": "line",
        "xAxis": "$.county",
        "yAxis": "$.electric_range",
        "aggregation": "mean",
        "yaxis2": "y2",
        "name": "Avg Range"
      }
    ]
  }

Provide a dataProfile with columns. Each column must have a "generator" field:
  - "category": include "categories" array
  - "normal": include "mean" and "stddev", optionally "min" and "max"
  - "uniform": include "min" and "max"
  - "linear": include "start", "end", and "step"
  - "constant": include "value"
Column names in dataProfile must be jsonPath strings matching the chartSpec trace xAxis/yAxis/zAxis values.
Each insight MUST have a non-empty id, title, summary, and keyIdea. Do not leave any of these fields empty or null.
If you are given a data sample (JSON rows), infer the field names and jsonPath values from the sample's keys.
Return practical, visually interesting ideas with concise reasoning."""


# --- Pydantic output models ---

class DatasetField(BaseModel):
    name: str = Field(min_length=1)
    jsonPath: str = Field(min_length=1)
    type: str = "string"
    nullable: bool = False
    semanticType: str | None = None
    sampleValues: Any | None = None
    unique: bool | None = None
    group: str | None = None


class DatasetSchema(BaseModel):
    source: str = Field(min_length=1)
    fields: list[DatasetField] = Field(min_length=1)
    warnings: list[str] = []


class TraceFilter(BaseModel):
    field: str = Field(min_length=1)
    op: str = "eq"
    value: Any = None


class TraceSpec(BaseModel):
    chartType: str = Field(min_length=1)
    xAxis: str = Field(min_length=1)
    yAxis: str = Field(min_length=1)
    zAxis: str | None = None
    aggregation: str | None = None
    filter: TraceFilter | None = None
    yaxis2: str | None = None
    name: str | None = None


class ChartSpec(BaseModel):
    mode: str = "recipe"
    traces: list[TraceSpec] = Field(min_length=1, default_factory=lambda: [TraceSpec()])
    plotlyData: list[Any] | None = None
    plotlyLayout: dict[str, Any] | None = None


class DataColumnSpec(BaseModel):
    name: str = Field(min_length=1)
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
    columns: list[DataColumnSpec] = Field(min_length=1, default_factory=list)


class InsightCandidate(BaseModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=3)
    summary: str = Field(min_length=3)
    keyIdea: str = Field(min_length=3)
    metricDescription: str = ""
    chartSpec: ChartSpec = Field(default_factory=ChartSpec)
    dataProfile: DataProfile | None = None
    assumptions: list[str] = []
    description: str | None = None


class InsightEnvelope(BaseModel):
    insights: list[InsightCandidate]


# --- Validation ---

def _validate_insights(insights: dict) -> bool:
    """Post-validation check: reject insights with empty traces or missing data."""
    for ins in insights.get("insights", []):
        spec = ins.get("chartSpec", {})
        traces = spec.get("traces", [])
        if not traces:
            return False
        for t in traces:
            if not t.get("xAxis") or not t.get("yAxis") or not t.get("chartType"):
                return False
    return True


# --- LLM calls ---

async def call_llm(
    system: str,
    prompt: str,
    output_type: type,
    *,
    model: str | None = None,
    api_key: str | None = None,
    retry_prompt: str | None = None,
    validate_fn=None,
) -> dict:
    """Call LLM via pydantic-ai with structured output.

    Args:
        system: System prompt for the LLM.
        prompt: User prompt for the LLM.
        output_type: Pydantic model class for structured output.
        model: LLM model string (e.g. "google:gemini-3.5-flash-lite").
               Defaults to env LLM_MODEL or "google:gemini-3.5-flash-lite".
        api_key: API key for the LLM provider.
                Defaults to env LLM_API_KEY.
        retry_prompt: Alternative prompt for retry attempts.
        validate_fn: Optional validation function called on the output dict.
                     If it returns False, the call retries.

    Retries up to 2 times (3 total attempts).
    """
    model_str = model or os.getenv("LLM_MODEL", "google:gemini-3.5-flash-lite")
    key = api_key or os.getenv("LLM_API_KEY")

    llm_model = infer_model(model_str, lambda s: infer_provider_class(s)(api_key=key))

    for attempt in range(3):
        try:
            use_prompt = prompt if attempt == 0 else (retry_prompt or prompt)
            agent = Agent(llm_model, system_prompt=system, output_type=output_type)
            result = await agent.run(use_prompt)
            output = result.output.model_dump(mode="json")

            if validate_fn and not validate_fn(output):
                print(f"[LLM] Attempt {attempt + 1} failed validation, retrying...", file=sys.stderr)
                continue

            return output
        except Exception as e:
            print(f"[LLM] Attempt {attempt + 1} failed: {e}", file=sys.stderr)
            if attempt < 2:
                print("[LLM] Retrying...", file=sys.stderr)
            else:
                raise


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


# --- Pipeline ---

async def run_pipeline(
    schema_text: str,
    real_data: dict | None = None,
    *,
    model: str | None = None,
    api_key: str | None = None,
    map_schema_prompt: str | None = None,
    insight_prompt: str | None = None,
) -> dict:
    """Run the full LLM pipeline and build Plotly specs.

    When real data is provided: skip the schema-mapping LLM call and send
    a data sample directly to the insight-generation LLM.
    When no real data: run schema-mapping first, then generate insights.
    After LLM calls, build Plotly specs for each insight using either
    real data or mock data.

    Args:
        schema_text: Free-form text description of the dataset.
        real_data: Parsed data dict (from parse_data) or None.
        model: LLM model string (e.g. "google:gemini-3.5-flash-lite").
        api_key: API key for the LLM provider.
        map_schema_prompt: Override the default schema-mapping prompt.
        insight_prompt: Override the default insight-generation prompt.

    Returns:
        dict with shape: { "insights": { "insights": [...] } }
        Each insight has plotlyData/plotlyLayout pre-built.
    """
    schema_prompt = map_schema_prompt or DEFAULT_MAP_SCHEMA_PROMPT
    insight_system = insight_prompt or DEFAULT_INSIGHT_PROMPT

    real_rows = real_data.get("rows", []) if real_data and real_data.get("rowCount", 0) > 0 else []
    use_real_data = len(real_rows) > 0

    llm_kwargs = {"model": model, "api_key": api_key}

    if use_real_data:
        sample = real_rows[:5]
        sample_json = json.dumps(sample, default=str)
        user_prompt = (
            f"Here is a sample of the dataset (first {len(sample)} rows as JSON):\n\n{sample_json}\n\n"
            f"Additional context from the user: {schema_text}\n\n"
            f"Infer the field names and jsonPath values from the sample's keys. "
            f"Produce up to 10 insight candidates."
        )
        retry_prompt = (
            f"Generate 5 analytics insights for this data. Each insight MUST have all required fields: "
            f'id, title, summary, keyIdea, metricDescription, '
            f'chartSpec (with mode="recipe" and a traces array with at least one trace, '
            f'each trace needs chartType, xAxis, yAxis as jsonPath strings, and optional aggregation), '
            f'dataProfile (with columns, each column needs name and generator), '
            f'and assumptions (array of strings). '
            f'Do NOT leave any field empty or null.\n\n'
            f'Data sample: {sample_json}\n\nContext: {schema_text}'
        )
    else:
        schema = await call_llm(
            schema_prompt,
            f"Analyze this data description and extract the dataset schema:\n\n{schema_text}",
            DatasetSchema,
            **llm_kwargs,
        )
        user_prompt = f"Given this dataset schema, produce up to 10 insight candidates:\n\n{json.dumps(schema)}"
        retry_prompt = (
            f"Generate 5 analytics insights for this schema. Each insight MUST have all required fields: "
            f'id, title, summary, keyIdea, metricDescription, '
            f'chartSpec (with mode="recipe" and a traces array with at least one trace, '
            f'each trace needs chartType, xAxis, yAxis as jsonPath strings, and optional aggregation), '
            f'dataProfile (with columns, each column needs name and generator), '
            f'and assumptions (array of strings). '
            f'Do NOT leave any field empty or null.\n\nSchema: {json.dumps(schema)}'
        )

    insights_output = await call_llm(
        insight_system,
        user_prompt,
        InsightEnvelope,
        retry_prompt=retry_prompt,
        validate_fn=_validate_insights,
        **llm_kwargs,
    )

    # Build Plotly specs for each insight, then strip internal fields
    insights_list = insights_output.get("insights", [])
    for i, insight in enumerate(insights_list):
        if use_real_data:
            rows = real_rows
        else:
            rows = generate_mock_rows(insight, seed=1337 + i)

        plotly_spec = build_plotly_spec(insight, rows)
        insight["plotlyData"] = plotly_spec["data"]
        insight["plotlyLayout"] = plotly_spec["layout"]

        insight.pop("chartSpec", None)
        insight.pop("dataProfile", None)
        insight.pop("description", None)

    return {
        "insights": {"insights": insights_list},
    }
