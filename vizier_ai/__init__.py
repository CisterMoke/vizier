"""Vizier AI — Chart brainstorming and generation library.

Standalone Python library for generating analytics chart ideas from
data schemas, data samples, or full datasets.

Usage:
    from backend import run_pipeline, build_plotly_spec, parse_data

    # Generate insights from a text description
    result = await run_pipeline("orders table with id, total, status")

    # Generate insights from real data
    data = parse_data("file.csv", "csv")
    result = await run_pipeline("sales data", data)

    # With custom LLM config
    result = await run_pipeline(
        "description",
        model="google:gemini-2.0-flash",
        api_key="your-key",
    )
"""

from vizier_ai.core import (
    run_pipeline,
    call_llm,
    fetch_rest_data,
    fetch_sql_data,
    DEFAULT_MAP_SCHEMA_PROMPT,
    DEFAULT_INSIGHT_PROMPT,
)
from vizier_ai.chart_builder import build_plotly_spec
from vizier_ai.mock_data import generate_mock_rows
from vizier_ai.parser import parse_data

__all__ = [
    "run_pipeline",
    "call_llm",
    "fetch_rest_data",
    "fetch_sql_data",
    "build_plotly_spec",
    "generate_mock_rows",
    "parse_data",
    "DEFAULT_MAP_SCHEMA_PROMPT",
    "DEFAULT_INSIGHT_PROMPT",
]
