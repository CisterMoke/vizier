"""FastAPI LLM proxy server for Analytics Idea Lab.

All LLM calls happen server-side via pydantic-ai so API keys never reach the browser.
Supports Google (Gemini) and Mistral providers.
REST API calls use aiohttp, data parsing uses pandas.
"""

import json
import os
from typing import Any

import aiohttp
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_ai import Agent

app = FastAPI(title="Analytics Idea Lab LLM Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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

class DatasetSchema(BaseModel):
    source: str
    fields: list[dict[str, Any]]
    warnings: list[str]


class InsightEnvelope(BaseModel):
    insights: list[dict[str, Any]]


class FieldMappingResult(BaseModel):
    mappings: list[dict[str, Any]]


# --- Request model ---

class GenerateRequest(BaseModel):
    schema_text: str = Field(alias="schemaText")
    provider: str = "google"
    model: str = "gemini-2.0-flash"
    data_source_mode: str = Field(default="none", alias="dataSourceMode")
    file_content: str | None = Field(default=None, alias="fileContent")
    file_format: str | None = Field(default=None, alias="fileFormat")
    rest_method: str | None = Field(default=None, alias="restMethod")
    rest_url: str | None = Field(default=None, alias="restUrl")
    rest_headers: str | None = Field(default=None, alias="restHeaders")
    rest_body: str | None = Field(default=None, alias="restBody")
    sql_connection: str | None = Field(default=None, alias="sqlConnection")
    sql_query: str | None = Field(default=None, alias="sqlQuery")

    model_config = {"populate_by_name": True}


def _model_string(provider: str, model: str) -> str:
    """Build pydantic-ai model string."""
    if provider == "google":
        return f"google-gla:{model}"
    elif provider == "mistral":
        return f"mistral:{model}"
    raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")


async def call_llm(provider: str, model: str, system: str, prompt: str, output_type: type) -> dict:
    """Call LLM via pydantic-ai with structured output."""
    model_str = _model_string(provider, model)
    agent = Agent(model_str, system_prompt=system, output_type=output_type)

    result = await agent.run(prompt)
    return result.output.model_dump()


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


# --- Routes ---

@app.post("/api/generate")
async def generate(request: GenerateRequest) -> dict:
    """Full pipeline: map schema → generate insights → fetch real data → map fields."""
    # 1. Map schema
    schema = await call_llm(
        request.provider, request.model,
        MAP_SCHEMA_PROMPT,
        f"Analyze this data description and extract the dataset schema:\n\n{request.schema_text}",
        DatasetSchema,
    )

    # 2. Generate insights
    insights = await call_llm(
        request.provider, request.model,
        INSIGHT_PROMPT,
        f"Given this dataset schema, produce up to 10 insight candidates:\n\n{json.dumps(schema)}",
        InsightEnvelope,
    )

    # 3. Fetch real data if requested
    real_data: dict | None = None
    field_mappings: list = []

    if request.data_source_mode == "file" and request.file_content:
        from server.parser import parse_data
        real_data = parse_data(request.file_content, request.file_format or "csv")

    elif request.data_source_mode == "rest" and request.rest_url:
        raw_text = await fetch_rest_data(
            request.rest_method or "GET",
            request.rest_url,
            request.rest_headers or "",
            request.rest_body or "",
        )
        from server.parser import parse_data
        real_data = parse_data(raw_text, "json")

    elif request.data_source_mode == "sql" and request.sql_connection and request.sql_query:
        raw_json = await fetch_sql_data(request.sql_connection, request.sql_query)
        from server.parser import parse_data
        real_data = parse_data(raw_json, "json")

    # 4. Map fields if we have real data
    if real_data and real_data.get("rowCount", 0) > 0:
        insight_axes = [
            {
                "insightId": ins.get("id", ""),
                "chartType": ins.get("chartSpec", {}).get("chartType"),
                "xAxis": ins.get("chartSpec", {}).get("xAxis"),
                "yAxis": ins.get("chartSpec", {}).get("yAxis"),
                "zAxis": ins.get("chartSpec", {}).get("zAxis"),
            }
            for ins in insights.get("insights", [])
        ]

        mapping_result = await call_llm(
            request.provider, request.model,
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


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
