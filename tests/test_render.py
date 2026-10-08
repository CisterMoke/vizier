"""Render helpers: insight.figure(), write_html(), Insights.save_html()."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))

from vizier_ai.models.insights import ChartSpec, Insight, InsightMetadata, TraceSpec


def make_insight(insight_id="rev-by-region") -> Insight:
    return Insight(
        id=insight_id,
        metadata=InsightMetadata(title="Revenue by region", summary="S"),
        chart_spec=ChartSpec(
            traces=[TraceSpec(chart_type="bar", x_axis="$['region']", y_axis="$['revenue']", aggregation="sum")],
            plotlyData=[{"type": "bar", "x": ["EMEA"], "y": [10], "name": "Revenue"}],
            plotlyLayout={"title": {"text": "Revenue by region"}},
        ),
    )


class TestInsightFigure:
    def test_figure_returns_plotly_figure_with_insight_data(self):
        import plotly.graph_objects as go

        insight = make_insight()
        fig = insight.figure()

        assert isinstance(fig, go.Figure)
        assert fig.data[0].type == "bar"
        assert list(fig.data[0].x) == ["EMEA"]
        assert fig.layout.title.text == "Revenue by region"

    def test_figure_handles_insight_without_rendered_spec(self):
        insight = Insight(
            id="raw",
            metadata=InsightMetadata(title="t", summary="s"),
            chart_spec=ChartSpec(traces=[TraceSpec(chart_type="bar", x_axis="$.a", y_axis="$.b")]),
        )
        fig = insight.figure()
        assert fig.data == ()


class TestInsightShow:
    def test_show_delegates_to_figure_show(self, monkeypatch):
        """show() is the CLI-friendly entry point: plotly's Figure.show()
        opens the chart in the system browser outside Jupyter (and renders
        inline inside it)."""
        shown = []

        class FakeFigure:
            def show(self, **kwargs):
                shown.append(kwargs)

        monkeypatch.setattr(Insight, "figure", lambda self: FakeFigure())

        make_insight().show()

        assert shown == [{}]


class TestInsightWriteHtml:
    def test_write_html_saves_file(self, tmp_path):
        out = tmp_path / "chart.html"
        make_insight().write_html(out)
        assert out.exists()
        assert "Revenue by region" in out.read_text()


class TestInsightsSaveHtml:
    def test_save_html_writes_one_file_per_insight(self, tmp_path):
        from vizier_ai.models.insights import Insights

        result = Insights(insights=[
            make_insight("a/b tricky id"),
            make_insight("second-insight"),
        ])

        paths = result.save_html(tmp_path)

        assert len(paths) == 2
        assert all(Path(p).exists() for p in paths)
        filenames = sorted(Path(p).name for p in paths)
        assert "second-insight.html" in filenames
        assert "a_b_tricky_id.html" in filenames  # unsafe chars are replaced
