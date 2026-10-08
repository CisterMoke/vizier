"""Vizier AI — Chart brainstorming and generation library.

Standalone Python library for generating analytics chart ideas from
data schemas, data samples, or full datasets.

Usage:
    from vizier_ai import Vizier, Hooks

    # Object-oriented entry point: config once, run many times
    vizier = Vizier()                      # model/api_key from env LLM_MODEL/LLM_API_KEY
    result = await vizier.run("orders table with region, revenue")
    result.save_html("charts/")            # one HTML file per insight (vizier-ai[plot])

    # Any data source: dict, DataFrame, file path, or raw text (sniffed)
    result = await vizier.run("regional sales", data="sales.csv")
    result = await vizier.run("sales", data=my_dataframe)

    # Hooks fire at every pipeline step — progress feedback for your UI
    hooks = Hooks(
        on_schema=lambda e: print(f"schema: {len(e.schema.fields)} fields"),
        on_chart=lambda e: print(f"chart {e.index + 1}/{e.total}: {e.title}"),
    )
    result = await vizier.run("orders", data=df, hooks=hooks)

    # Edit a chart without another LLM call; save and reload recipes
    spec = edit_chart(result.insights[0], data["rows"], chart_type="line")
    save_bundle(result, "insights.json")
    result, warnings = render_bundle(load_bundle("insights.json"), source="sales_v2.csv")

The functional one-shot API remains available as ``run_pipeline``.
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
from vizier_ai.pipeline import (
    ChartEvent,
    CompleteEvent,
    Hooks,
    InsightsEvent,
    ParseEvent,
    SchemaEvent,
    Vizier,
)
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
    "Vizier",
    "Hooks",
    "ParseEvent",
    "SchemaEvent",
    "InsightsEvent",
    "ChartEvent",
    "CompleteEvent",
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
