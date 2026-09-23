"""Tests for chart_builder JSONPath resolution and escaping."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from vizier_ai.chart_builder import _resolve_values, build_plotly_spec, build_trace
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


class TestResolveValuesEscaping:
    """Test that _resolve_values handles field names with reserved characters."""

    def test_simple_field(self):
        rows = [{"county": "King", "total": 100}]
        assert _resolve_values(rows, "$.county") == ["King"]
        assert _resolve_values(rows, "$.total") == [100]

    def test_field_with_dot(self):
        """Field names containing dots should be resolved as a single key."""
        rows = [{"revenue.usd": 100, "revenue.eur": 85}]
        assert _resolve_values(rows, "$.revenue.usd") == [100]
        assert _resolve_values(rows, "$.revenue.eur") == [85]

    def test_field_with_hyphen(self):
        rows = [{"revenue-usd": 100}]
        assert _resolve_values(rows, "$.revenue-usd") == [100]

    def test_field_with_space(self):
        rows = [{"total revenue": 100}]
        assert _resolve_values(rows, "$.total revenue") == [100]

    def test_field_with_at_symbol(self):
        rows = [{"data@special": 42}]
        assert _resolve_values(rows, "$.data@special") == [42]

    def test_field_with_brackets(self):
        rows = [{"key[bracket]": 55}]
        assert _resolve_values(rows, "$.key[bracket]") == [55]

    def test_field_with_hash(self):
        rows = [{"value#id": 7}]
        assert _resolve_values(rows, "$.value#id") == [7]

    def test_field_with_star(self):
        rows = [{"value*": 9}]
        assert _resolve_values(rows, "$.value*") == [9]

    def test_field_with_comma(self):
        rows = [{"name,first": "Alice"}]
        assert _resolve_values(rows, "$.name,first") == ["Alice"]

    def test_field_with_colon(self):
        rows = [{"time:value": "noon"}]
        assert _resolve_values(rows, "$.time:value") == ["noon"]

    def test_nested_path_still_works(self):
        """Genuinely nested paths should still resolve correctly."""
        rows = [{"parent": {"child": 42}}]
        assert _resolve_values(rows, "$.parent.child") == [42]

    def test_nested_path_with_special_child(self):
        """Nested path where child key has a dot should resolve correctly."""
        rows = [{"parent": {"child.name": 42}}]
        assert _resolve_values(rows, "$.parent.child.name") == [42]

    def test_missing_field_returns_none(self):
        rows = [{"county": "King"}]
        assert _resolve_values(rows, "$.nonexistent") == [None]

    def test_multiple_rows(self):
        rows = [
            {"revenue.usd": 100, "county": "A"},
            {"revenue.usd": 200, "county": "B"},
        ]
        assert _resolve_values(rows, "$.revenue.usd") == [100, 200]
        assert _resolve_values(rows, "$.county") == ["A", "B"]

    def test_path_without_dollar_prefix(self):
        rows = [{"county": "King"}]
        assert _resolve_values(rows, "county") == ["King"]

    def test_field_with_dot_no_dollar_prefix(self):
        rows = [{"revenue.usd": 100}]
        assert _resolve_values(rows, "revenue.usd") == [100]


class TestBuildPlotlySpecWithSpecialChars:
    """Test that build_plotly_spec works with field names containing reserved characters."""

    def test_bar_chart_with_dotted_field(self):
        insight = make_insight("Revenue by County", [
            TraceSpec(
                chart_type="bar",
                x_axis="$.county",
                y_axis="$.revenue.usd",
                aggregation="sum",
                name="Revenue",
            ),
        ])
        rows = [
            {"county": "King", "revenue.usd": 100},
            {"county": "King", "revenue.usd": 50},
            {"county": "Pierce", "revenue.usd": 200},
        ]
        spec = build_plotly_spec(insight, rows)
        assert len(spec["data"]) == 1
        trace = spec["data"][0]
        assert trace["type"] == "bar"
        # Aggregated: King=150, Pierce=200 (sorted alphabetically)
        assert trace["x"] == ["King", "Pierce"]
        assert trace["y"] == [150.0, 200.0]

    def test_filter_with_special_char_field(self):
        insight = make_insight("Filtered", [
            TraceSpec(
                chart_type="bar",
                x_axis="$.county",
                y_axis="$.revenue.usd",
                aggregation="sum",
                filter=TraceFilter(field="$.status.code", op="eq", value="active"),
                name="Active Revenue",
            ),
        ])
        rows = [
            {"county": "King", "revenue.usd": 100, "status.code": "active"},
            {"county": "King", "revenue.usd": 50, "status.code": "inactive"},
            {"county": "Pierce", "revenue.usd": 200, "status.code": "active"},
        ]
        spec = build_plotly_spec(insight, rows)
        trace = spec["data"][0]
        # Only active rows: King=100, Pierce=200
        assert trace["x"] == ["King", "Pierce"]
        assert trace["y"] == [100.0, 200.0]


class TestScatterGlSwitch:
    """WebGL traces (scattergl) are a rendering choice only: the plotted
    points are identical to their SVG (scatter) counterparts."""

    @staticmethod
    def make_rows(count: int) -> list[dict]:
        return [{"x": i, "y": i * 2} for i in range(count)]

    def test_line_below_threshold_stays_svg(self):
        trace = build_trace(
            TraceSpec(chart_type="line", x_axis="$.x", y_axis="$.y"),
            self.make_rows(10),
            color_index=0,
            y_index=1,
        )
        assert trace["type"] == "scatter"

    def test_line_above_threshold_uses_webgl(self):
        trace = build_trace(
            TraceSpec(chart_type="line", x_axis="$.x", y_axis="$.y"),
            self.make_rows(1500),
            color_index=0,
            y_index=1,
        )
        assert trace["type"] == "scattergl"
        assert len(trace["x"]) == 1500

    def test_scatter_above_threshold_uses_webgl(self):
        trace = build_trace(
            TraceSpec(chart_type="scatter", x_axis="$.x", y_axis="$.y"),
            self.make_rows(1500),
            color_index=0,
            y_index=1,
        )
        assert trace["type"] == "scattergl"

    def test_bar_is_never_converted(self):
        trace = build_trace(
            TraceSpec(chart_type="bar", x_axis="$.x", y_axis="$.y"),
            self.make_rows(1500),
            color_index=0,
            y_index=1,
        )
        assert trace["type"] == "bar"

    def test_threshold_is_configurable_via_env(self, monkeypatch):
        monkeypatch.setenv("GL_TRACE_THRESHOLD", "5")
        trace = build_trace(
            TraceSpec(chart_type="line", x_axis="$.x", y_axis="$.y"),
            self.make_rows(10),
            color_index=0,
            y_index=1,
        )
        assert trace["type"] == "scattergl"
