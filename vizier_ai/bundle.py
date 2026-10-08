"""Save and load insight bundles — chart recipes without data points."""

from pathlib import Path

import pandas as pd

from vizier_ai.chart_builder import _resolve_values, build_plotly_spec
from vizier_ai.mock_data import generate_mock_rows
from vizier_ai.models.bundle import InsightBundle, SavedInsight
from vizier_ai.models.insights import ChartSpec, Insight, Insights
from vizier_ai.parser import parse_data


def save_bundle(insights_or_bundle, path) -> Path:
    """Save insights (or an existing bundle) to a JSON file. Returns the path."""
    bundle = insights_or_bundle if isinstance(insights_or_bundle, InsightBundle) else build_bundle(insights_or_bundle)
    path = Path(path)
    path.write_text(bundle.model_dump_json())
    return path


def load_bundle(path) -> InsightBundle:
    """Load a bundle previously saved with ``save_bundle``."""
    return InsightBundle.model_validate_json(Path(path).read_text())


def build_bundle(insights: Insights) -> InsightBundle:
    if insights.dataset_schema is None:
        raise ValueError("Insights carry no dataset schema; cannot build a bundle.")

    return InsightBundle(
        dataset_schema=insights.dataset_schema,
        data_profile=insights.data_profile,
        insights=[
            SavedInsight(
                id=insight.id,
                metadata=insight.metadata,
                traces=insight.chart_spec.traces,
                mock_seed=insight.mock_seed,
            )
            for insight in insights.insights
        ],
    )


def _compat_warnings(bundle: InsightBundle, rows: list[dict]) -> list[str]:
    warnings: list[str] = []
    sample = rows[:50]
    for saved in bundle.insights:
        reported: set[str] = set()
        for trace in saved.traces:
            paths = [trace.x_axis, trace.y_axis]
            if trace.z_axis:
                paths.append(trace.z_axis)
            if trace.filter:
                paths.append(trace.filter.field)
            for path in paths:
                if path in reported:
                    continue
                resolved = _resolve_values(sample, path)
                if not any(value is not None for value in resolved):
                    warnings.append(
                        f"Insight '{saved.metadata.title}': field {path} not found in the provided data."
                    )
                    reported.add(path)
    return warnings


def _rows_from_source(source, csv_options=None, excel_options=None) -> list[dict]:
    """Derive rows from a file path (format inferred from the extension;
    CSV/Excel options applied) or a pandas DataFrame."""
    if isinstance(source, pd.DataFrame):
        return parse_data(source)["rows"]
    lower = str(source).lower()
    if lower.endswith(".xlsx") or lower.endswith(".xls"):
        return parse_data(source, "excel", excel_options=excel_options)["rows"]
    fmt = "jsonl" if lower.endswith(".jsonl") else ("json" if lower.endswith(".json") else "csv")
    return parse_data(source, fmt, csv_options=csv_options)["rows"]


def render_bundle(
        bundle: InsightBundle,
        rows: list[dict] | None = None,
        *,
        source: str | Path | pd.DataFrame | None = None,
    ) -> tuple[Insights, list[str]]:
    """Render a bundle's insights into charts.

    Rows come from ``rows`` directly, or from ``source`` — a CSV/JSON/JSONL
    file path or a pandas DataFrame. When ``source`` is a CSV file, the
    bundle's saved ``csv_options`` are applied automatically. With neither,
    mock rows are regenerated from the bundle's data profile.
    """
    if source is not None and rows is None:
        rows = _rows_from_source(
            source,
            csv_options=bundle.csv_options,
            excel_options=bundle.excel_options,
        )

    real_rows = rows or []
    has_real_rows = len(real_rows) > 0

    field_labels = {f.jsonPath: f.name for f in bundle.dataset_schema.fields}
    insights_list = []
    for i, saved in enumerate(bundle.insights):
        if has_real_rows:
            chart_rows = real_rows
        elif bundle.data_profile is not None:
            chart_rows = generate_mock_rows(
                bundle.data_profile.model_dump(),
                seed=saved.mock_seed if saved.mock_seed is not None else 1337 + i,
            )
        else:
            chart_rows = []

        insight = Insight(
            id=saved.id,
            metadata=saved.metadata,
            chart_spec=ChartSpec(traces=saved.traces),
            mock_seed=saved.mock_seed,
        )
        spec = build_plotly_spec(insight, chart_rows, field_labels=field_labels)
        insight.chart_spec.plotlyData = spec["data"]
        insight.chart_spec.plotlyLayout = spec["layout"]
        insights_list.append(insight)

    warnings = _compat_warnings(bundle, real_rows) if has_real_rows else []

    result = Insights(
        insights=insights_list,
        dataset_schema=bundle.dataset_schema,
        data_profile=bundle.data_profile,
    )
    return result, warnings
