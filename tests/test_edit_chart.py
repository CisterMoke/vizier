"""Tests for edit_chart — the library's chart-editing convenience."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))

from vizier_ai import edit_chart
from vizier_ai.mock_data import generate_mock_rows
from vizier_ai.models.data_profile import DataColumnSpec, DataProfile
from vizier_ai.models.insights import ChartSpec, Insight, InsightMetadata, TraceSpec


def make_insight() -> Insight:
    return Insight(
        id="rev-by-region",
        metadata=InsightMetadata(title="Revenue by region", summary="S"),
        chart_spec=ChartSpec(traces=[
            TraceSpec(chart_type="bar", x_axis="$['region']", y_axis="$['revenue']", aggregation="sum"),
        ]),
    )


ROWS = [
    {"region": "EMEA", "revenue": 10},
    {"region": "EMEA", "revenue": 20},
    {"region": "APAC", "revenue": 30},
]


class TestEditChart:
    def test_chart_type_change_with_real_rows(self):
        spec = edit_chart(make_insight(), ROWS, chart_type="line")

        assert spec["data"][0]["type"] in ("scatter", "scattergl")
        # aggregation still applies: EMEA=30, APAC=30
        assert spec["data"][0]["x"] == ["APAC", "EMEA"]
        assert spec["data"][0]["y"] == [30.0, 30.0]
        assert spec["layout"]["title"]["text"] == "Revenue by region"

    def test_traces_override_takes_precedence(self):
        traces = [TraceSpec(chart_type="pie", x_axis="$['region']", y_axis="$['revenue']")]
        spec = edit_chart(make_insight(), ROWS, chart_type="line", traces=traces)

        assert spec["data"][0]["type"] == "pie"

    def test_mock_rows_regenerated_from_profile_and_seed(self):
        insight = make_insight()
        insight.mock_seed = 42
        profile = DataProfile(columns=[
            DataColumnSpec(name="$.region", generator="category", categories=["EMEA", "APAC"]),
        ])

        spec = edit_chart(insight, data_profile=profile)

        expected_rows = generate_mock_rows(profile.model_dump(), seed=42)
        expected_spec = edit_chart(insight, expected_rows)
        assert spec == expected_spec

    def test_missing_rows_and_profile_raises(self):
        with pytest.raises(ValueError, match="rows"):
            edit_chart(make_insight(), chart_type="line")

    def test_re_render_without_changes_reuses_traces(self):
        spec = edit_chart(make_insight(), ROWS)

        assert spec["data"][0]["type"] == "bar"
        assert spec["data"][0]["x"] == ["APAC", "EMEA"]

    def test_field_labels_become_axis_titles(self):
        spec = edit_chart(
            make_insight(),
            ROWS,
            chart_type="line",
            field_labels={"$['region']": "Region", "$['revenue']": "Revenue"},
        )

        assert spec["layout"]["xaxis"]["title"]["text"] == "Region"
        assert spec["layout"]["yaxis"]["title"]["text"] == "Revenue"

    def test_repeated_edits_start_from_original_recipe(self):
        insight = make_insight()
        first = edit_chart(insight, ROWS, chart_type="line")
        second = edit_chart(insight, ROWS, chart_type="pie")

        # the insight's own traces are untouched by edits
        assert insight.chart_spec.traces[0].chart_type == "bar"
        assert first["data"][0]["type"] in ("scatter", "scattergl")
        assert second["data"][0]["type"] == "pie"
