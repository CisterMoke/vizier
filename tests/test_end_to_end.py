"""End-to-end tests for the escaped-JSONPath pipeline.

Verifies that field names with reserved characters flow correctly:
  dataProfile column names → mock_data keys → chart_builder resolution
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from vizier_ai.mock_data import generate_mock_rows
from vizier_ai.chart_builder import build_plotly_spec
from vizier_ai.models.insights import (
    ChartSpec,
    Insight,
    InsightMetadata,
    TraceFilter,
    TraceSpec,
)


def make_insight(title: str, traces: list[TraceSpec]) -> Insight:
    return Insight(
        id="i1",
        metadata=InsightMetadata(title=title, summary="S", keyIdea="K"),
        chart_spec=ChartSpec(traces=traces),
    )


class TestEndToEndEscapedJsonPath:
    """Test the full pipeline with field names containing reserved characters."""

    def test_real_data_round_trip_with_dots(self):
        """Real data with dotted field names: chart builder resolves bracket-escaped jsonPath."""
        rows = [
            {"county": "King", "revenue.usd": 100},
            {"county": "King", "revenue.usd": 50},
            {"county": "Pierce", "revenue.usd": 200},
        ]

        insight = make_insight("Revenue by County", [
            TraceSpec(
                chart_type="bar",
                x_axis="$.county",
                y_axis="$['revenue.usd']",
                aggregation="sum",
                name="Revenue",
            ),
        ])

        spec = build_plotly_spec(insight, rows)
        trace = spec["data"][0]
        assert trace["x"] == ["King", "Pierce"]
        assert trace["y"] == [150.0, 200.0]

    def test_mock_data_round_trip_with_dots(self):
        """Mock data path: dataProfile jsonPaths → mock keys → chart builder resolution."""
        data_profile = {
            "columns": [
                {"name": "$.county", "generator": "category", "categories": ["A", "B", "C"]},
                {"name": "$['revenue.usd']", "generator": "uniform", "min": 10, "max": 100},
            ]
        }

        insight = make_insight("Test Chart", [
            TraceSpec(
                chart_type="bar",
                x_axis="$.county",
                y_axis="$['revenue.usd']",
                aggregation="sum",
                name="Revenue",
            ),
        ])

        mock_rows = generate_mock_rows(data_profile, seed=42)
        assert len(mock_rows) == 200
        assert "county" in mock_rows[0]
        assert "revenue.usd" in mock_rows[0]

        spec = build_plotly_spec(insight, mock_rows)
        trace = spec["data"][0]
        assert trace["type"] == "bar"
        assert len(trace["x"]) > 0
        assert len(trace["y"]) > 0

    def test_filter_with_dotted_field_real_data(self):
        """Filter on a dotted field name with real data."""
        rows = [
            {"county": "King", "revenue.usd": 100, "status.code": "active"},
            {"county": "King", "revenue.usd": 50, "status.code": "inactive"},
            {"county": "Pierce", "revenue.usd": 200, "status.code": "active"},
        ]

        insight = make_insight("Active Revenue", [
            TraceSpec(
                chart_type="bar",
                x_axis="$.county",
                y_axis="$['revenue.usd']",
                aggregation="sum",
                filter=TraceFilter(field="$['status.code']", op="eq", value="active"),
                name="Active Revenue",
            ),
        ])

        spec = build_plotly_spec(insight, rows)
        trace = spec["data"][0]
        assert trace["x"] == ["King", "Pierce"]
        assert trace["y"] == [100.0, 200.0]
