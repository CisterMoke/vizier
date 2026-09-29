"""Vizier AI — Chart brainstorming and generation library.

Standalone Python library for generating analytics chart ideas from
data schemas, data samples, or full datasets.

Usage:
    from vizier_ai import run_pipeline, parse_data, edit_chart

    # Generate insights from a text description (mock data)
    result = await run_pipeline("orders table with id, total, status")
    result.save_html("charts/")            # one HTML file per insight (vizier-ai[plot])

    # From a CSV file path, raw text, or a pandas DataFrame
    data = parse_data("sales.csv", "csv")
    result = await run_pipeline("regional sales", data)
    result = await run_pipeline("sales", my_dataframe)

    # From a REST endpoint or SQL database (response format sniffed)
    data = await fetch_rest_data("GET", url, {"Authorization": "Bearer ..."})
    data = await fetch_sql_data("sqlite:///sales.db", "SELECT * FROM orders")

    # Edit one chart without re-calling the LLM
    spec = edit_chart(result.insights[0], data["rows"], chart_type="line")

    # Save / reload insight recipes as a portable bundle
    save_bundle(result, "insights.json")
    result, warnings = render_bundle(load_bundle("insights.json"), source="sales_v2.csv")
"""

from vizier_ai.core import (
    run_pipeline,
    call_llm,
    fetch_rest_data,
    fetch_sql_data,
    UnsatisfiableConstraintsError,
    DEFAULT_SCHEMA_SYSTEM_PROMPT,
    DEFAULT_INSIGHT_SYSTEM_PROMPT,
    DEFAULT_DATA_PROFILE_SYSTEM_PROMPT,
)
from vizier_ai.bundle import build_bundle, render_bundle, save_bundle, load_bundle
from vizier_ai.chart_builder import build_plotly_spec, edit_chart
from vizier_ai.mock_data import generate_mock_rows
from vizier_ai.parser import parse_data
from vizier_ai.models.bundle import InsightBundle, SavedInsight
from vizier_ai.models.constraints import InsightConstraints
from vizier_ai.models.insights import (
    ChartSpec,
    Insight,
    InsightCandidate,
    InsightMetadata,
    Insights,
    TraceFilter,
    TraceSpec,
)

__all__ = [
    "run_pipeline",
    "call_llm",
    "fetch_rest_data",
    "fetch_sql_data",
    "build_plotly_spec",
    "edit_chart",
    "generate_mock_rows",
    "parse_data",
    "build_bundle",
    "render_bundle",
    "save_bundle",
    "load_bundle",
    "InsightBundle",
    "SavedInsight",
    "UnsatisfiableConstraintsError",
    "InsightConstraints",
    "Insight",
    "Insights",
    "InsightCandidate",
    "InsightMetadata",
    "ChartSpec",
    "TraceSpec",
    "TraceFilter",
    "DEFAULT_SCHEMA_SYSTEM_PROMPT",
    "DEFAULT_INSIGHT_SYSTEM_PROMPT",
    "DEFAULT_DATA_PROFILE_SYSTEM_PROMPT",
]
