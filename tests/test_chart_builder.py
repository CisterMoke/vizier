"""Tests for chart_builder JSONPath resolution and escaping."""

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))

import vizier_ai.chart_builder as chart_builder_module
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
        metadata=InsightMetadata(title=title, summary="S"),
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
        """Nested access with a dotted child key works via the bracket
        notation the LLM always emits (see also the two tests above)."""
        rows = [{"parent": {"child.name": 42}}]
        assert _resolve_values(rows, "$['parent']['child.name']") == [42]

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

    def test_bracket_notation_nested_dotted_child(self):
        """The LLM always emits bracket notation, which resolves dotted
        child keys unambiguously on the first (primary) attempt."""
        rows = [{"parent": {"child.name": 42}}]
        assert _resolve_values(rows, "$['parent']['child.name']") == [42]

    def test_dot_notation_dotted_child_is_not_unescaped(self):
        """Dot-notation paths with a dotted child key are ambiguous; the
        resolver only falls back to a whole-path literal-key escape, so
        genuinely nested dotted children require bracket notation."""
        rows = [{"parent": {"child.name": 42}}]
        assert _resolve_values(rows, "$.parent.child.name") == [None]


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


class TestColumnarResolution:
    """build_plotly_spec pre-resolves each unique field path once over all
    rows; traces and filters index into the shared columns instead of
    re-resolving the same path per trace or per filter pass."""

    @staticmethod
    def counting_compile(monkeypatch):
        """Spy on jsonpath_compile, counting parse() calls per expression."""
        parse_counts: dict[str, int] = {}
        real_compile = chart_builder_module.jsonpath_compile

        def spy(expr):
            compiled = real_compile(expr)

            def counting_parse(row):
                parse_counts[expr] = parse_counts.get(expr, 0) + 1
                return compiled.parse(row)

            return SimpleNamespace(parse=counting_parse)

        monkeypatch.setattr(chart_builder_module, "jsonpath_compile", spy)
        return parse_counts

    def test_shared_fields_resolved_once_across_traces(self, monkeypatch):
        parse_counts = self.counting_compile(monkeypatch)
        rows = [
            {"county": f"c{i}", "revenue": i, "units": i * 2, "status": "on" if i % 2 else "off"}
            for i in range(6)
        ]
        insight = make_insight("Shared fields", [
            TraceSpec(
                chart_type="bar",
                x_axis="$.county",
                y_axis="$.revenue",
                filter=TraceFilter(field="$.county", op="ne", value="c0"),
            ),
            TraceSpec(chart_type="line", x_axis="$.county", y_axis="$.units"),
        ])

        build_plotly_spec(insight, rows)

        # $.county is referenced by both traces' x_axis AND the filter;
        # $.revenue and $.units once each. Columnar resolution parses each
        # unique path exactly once per row (6), not once per use.
        assert parse_counts["$.county"] == 6
        assert parse_counts["$.revenue"] == 6
        assert parse_counts["$.units"] == 6

    def test_filter_and_axes_use_shared_columns(self, monkeypatch):
        """Filtered trace values must match filtering rows directly."""
        rows = [
            {"county": f"c{i}", "revenue": i, "status": "on" if i % 2 else "off"}
            for i in range(6)
        ]
        insight = make_insight("Filtered", [
            TraceSpec(
                chart_type="bar",
                x_axis="$.county",
                y_axis="$.revenue",
                filter=TraceFilter(field="$.status", op="eq", value="on"),
            ),
            TraceSpec(chart_type="bar", x_axis="$.county", y_axis="$.revenue"),
        ])

        spec = build_plotly_spec(insight, rows)
        assert spec["data"][0]["x"] == ["c1", "c3", "c5"]
        assert spec["data"][0]["y"] == [1, 3, 5]
        assert spec["data"][1]["x"] == ["c0", "c1", "c2", "c3", "c4", "c5"]
        assert spec["data"][1]["y"] == [0, 1, 2, 3, 4, 5]

    def test_multi_trace_shared_axis_values(self):
        insight = make_insight("Shared axis", [
            TraceSpec(chart_type="bar", x_axis="$.county", y_axis="$.revenue", name="Revenue"),
            TraceSpec(chart_type="line", x_axis="$.county", y_axis="$.units", name="Units"),
        ])
        rows = [
            {"county": "King", "revenue": 10, "units": 5},
            {"county": "Pierce", "revenue": 20, "units": 7},
        ]

        spec = build_plotly_spec(insight, rows)
        assert spec["data"][0]["x"] == ["King", "Pierce"]
        assert spec["data"][0]["y"] == [10, 20]
        assert spec["data"][1]["x"] == ["King", "Pierce"]
        assert spec["data"][1]["y"] == [5, 7]


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


class TestTracePointCap:
    """MAX_TRACE_POINTS caps plotted points per trace (default 10k) using
    uniform stride sampling of real values. Applied after filters and
    aggregations; separate from the MAX_ROWS parse limit."""

    @staticmethod
    def make_rows(count: int) -> list[dict]:
        return [{"x": i, "y": i * 2, "z": i * 3} for i in range(count)]

    def test_large_traces_are_stride_sampled(self):
        trace = build_trace(
            TraceSpec(chart_type="line", x_axis="$.x", y_axis="$.y"),
            self.make_rows(25_000),
            color_index=0,
            y_index=1,
        )

        # step = ceil(25000/10000) = 3 -> 8334 points
        assert len(trace["x"]) == 8334
        assert len(trace["y"]) == 8334
        assert trace["x"][0] == 0
        assert trace["x"][1] == 3
        assert trace["y"][1] == 6

    def test_small_traces_are_untouched(self):
        trace = build_trace(
            TraceSpec(chart_type="line", x_axis="$.x", y_axis="$.y"),
            self.make_rows(100),
            color_index=0,
            y_index=1,
        )

        assert len(trace["x"]) == 100
        assert trace["x"] == list(range(100))

    def test_cap_applies_after_aggregation(self):
        rows = [{"cat": f"c{i % 50}", "v": 1} for i in range(25_000)]
        trace = build_trace(
            TraceSpec(chart_type="bar", x_axis="$.cat", y_axis="$.v", aggregation="sum"),
            rows,
            color_index=0,
            y_index=1,
        )

        # 50 aggregated categories: never capped
        assert len(trace["x"]) == 50

    def test_cap_applies_after_filter(self):
        rows = self.make_rows(25_000)
        trace = build_trace(
            TraceSpec(
                chart_type="scatter",
                x_axis="$.x",
                y_axis="$.y",
                filter=TraceFilter(field="$.x", op="lt", value=20_000),
            ),
            rows,
            color_index=0,
            y_index=1,
        )

        assert len(trace["x"]) == 10_000

    def test_cap_is_configurable(self, monkeypatch):
        monkeypatch.setenv("MAX_TRACE_POINTS", "5")
        trace = build_trace(
            TraceSpec(chart_type="line", x_axis="$.x", y_axis="$.y"),
            self.make_rows(10),
            color_index=0,
            y_index=1,
        )

        assert len(trace["x"]) == 5
        assert trace["x"] == [0, 2, 4, 6, 8]

    def test_cap_can_be_disabled(self, monkeypatch):
        monkeypatch.setenv("MAX_TRACE_POINTS", "0")
        trace = build_trace(
            TraceSpec(chart_type="line", x_axis="$.x", y_axis="$.y"),
            self.make_rows(25_000),
            color_index=0,
            y_index=1,
        )

        assert len(trace["x"]) == 25_000

    def test_geomap_lon_lat_and_color_capped_consistently(self):
        rows = [
            {"lon": i * 0.001, "lat": 40.0 + i * 0.0001, "intensity": i}
            for i in range(25_000)
        ]
        trace = build_trace(
            TraceSpec(
                chart_type="geomap",
                x_axis="$.lon",
                y_axis="$.lat",
                z_axis="$.intensity",
            ),
            rows,
            color_index=0,
            y_index=1,
        )

        assert len(trace["lon"]) == 8334
        assert len(trace["lat"]) == 8334
        assert len(trace["marker"]["color"]) == 8334
        # lon/lat pairs stay aligned with their source rows
        assert trace["lon"][1] == pytest.approx(3 * 0.001)
        assert trace["lat"][1] == pytest.approx(40.0 + 3 * 0.0001)


class TestAxisLabelPolish:
    """Long tick labels must not collide with axis titles: automargin
    reserves space, and over-long categorical tick labels are truncated
    via tickvals/ticktext (the underlying data stays intact)."""

    def make_bar_insight(self, categories: list[str]) -> Insight:
        return make_insight("Chart", [
            TraceSpec(chart_type="bar", x_axis="$.cat", y_axis="$.v"),
        ])

    def test_axes_use_automargin(self):
        spec = build_plotly_spec(
            self.make_bar_insight([]),
            [{"cat": "A", "v": 1}],
        )

        assert spec["layout"]["xaxis"]["automargin"] is True
        assert spec["layout"]["yaxis"]["automargin"] is True

    def test_long_category_tick_labels_truncated(self):
        long_name = "A very long category name that keeps going and going"
        spec = build_plotly_spec(
            self.make_bar_insight([]),
            [{"cat": long_name, "v": 1}, {"cat": "Short", "v": 2}],
        )

        xaxis = spec["layout"]["xaxis"]
        assert xaxis["ticktext"][0].endswith("…")
        assert len(xaxis["ticktext"][0]) < len(long_name)
        assert xaxis["tickvals"] == [0, 1]
        # the data itself is untouched
        assert spec["data"][0]["x"][0] == long_name
        # plotly.js routes hover labels through the axis tick formatter,
        # so ticktext would leak into tooltips — explicit per-point
        # hovertext/hovertemplate restores the full value there
        trace = spec["data"][0]
        assert trace["hovertext"][0] == long_name
        assert "%{hovertext}" in trace["hovertemplate"]

    def test_short_tick_labels_untouched(self):
        spec = build_plotly_spec(
            self.make_bar_insight([]),
            [{"cat": "Alpha", "v": 1}, {"cat": "Beta", "v": 2}],
        )

        xaxis = spec["layout"]["xaxis"]
        assert "tickvals" not in xaxis
        assert "ticktext" not in xaxis

    def test_truncation_length_configurable(self, monkeypatch):
        monkeypatch.setenv("MAX_TICK_LABEL_LENGTH", "5")
        spec = build_plotly_spec(
            self.make_bar_insight([]),
            [{"cat": "ABCDEFGH", "v": 1}],
        )

        text = spec["layout"]["xaxis"]["ticktext"][0]
        assert text.endswith("…")
        assert len(text) == 6  # 5 chars + ellipsis

    def test_truncation_can_be_disabled(self, monkeypatch):
        monkeypatch.setenv("MAX_TICK_LABEL_LENGTH", "0")
        spec = build_plotly_spec(
            self.make_bar_insight([]),
            [{"cat": "A very long category name that keeps going", "v": 1}],
        )

        assert "ticktext" not in spec["layout"]["xaxis"]

    def test_mismatched_categories_across_traces_untouched(self):
        insight = make_insight("Two traces", [
            TraceSpec(chart_type="bar", x_axis="$.cat", y_axis="$.v"),
            TraceSpec(chart_type="bar", x_axis="$.other", y_axis="$.v"),
        ])
        rows = [
            {"cat": "A very long category name that keeps going", "other": "X", "v": 1},
            {"cat": "B", "other": "A very long category name that keeps going", "v": 2},
        ]

        spec = build_plotly_spec(insight, rows)

        assert "ticktext" not in spec["layout"]["xaxis"]


class TestFieldLabels:
    """Axis titles use schema field names when a jsonPath→name map is
    provided; the jsonPath tail remains the fallback."""

    def make_bar_insight(self) -> Insight:
        return make_insight("Chart", [
            TraceSpec(chart_type="bar", x_axis="$['region']", y_axis="$['revenue']", aggregation="sum"),
        ])

    def test_axis_titles_use_field_names(self):
        spec = build_plotly_spec(
            self.make_bar_insight(),
            [{"region": "EMEA", "revenue": 10}],
            field_labels={"$['region']": "Region", "$['revenue']": "Revenue"},
        )

        assert spec["layout"]["xaxis"]["title"]["text"] == "Region"
        assert spec["layout"]["yaxis"]["title"]["text"] == "Revenue"

    def test_unknown_paths_fall_back_to_jsonpath_tail(self):
        spec = build_plotly_spec(
            self.make_bar_insight(),
            [{"region": "EMEA", "revenue": 10}],
            field_labels={"$['region']": "Region"},
        )

        assert spec["layout"]["xaxis"]["title"]["text"] == "Region"
        assert spec["layout"]["yaxis"]["title"]["text"] == "revenue"

    def test_secondary_yaxis_title_uses_field_name(self):
        insight = make_insight("Overlay", [
            TraceSpec(chart_type="bar", x_axis="$['region']", y_axis="$['revenue']"),
            TraceSpec(chart_type="line", x_axis="$['region']", y_axis="$['units']"),
        ])

        spec = build_plotly_spec(
            insight,
            [{"region": "EMEA", "revenue": 10, "units": 5}],
            field_labels={"$['region']": "Region", "$['revenue']": "Revenue", "$['units']": "Units"},
        )

        assert spec["layout"]["yaxis2"]["title"]["text"] == "Units"

    def test_geomap_colorbar_title_uses_field_name(self):
        insight = make_insight("Map", [
            TraceSpec(
                chart_type="geomap",
                x_axis="$['lon']",
                y_axis="$['lat']",
                z_axis="$['intensity']",
            ),
        ])

        spec = build_plotly_spec(
            insight,
            [{"lon": 1.0, "lat": 2.0, "intensity": 3.0}],
            field_labels={"$['intensity']": "Intensity"},
        )

        assert spec["data"][0]["marker"]["colorbar"]["title"]["text"] == "Intensity"
