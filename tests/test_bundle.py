"""Tests for the insight bundle save/load format."""

import asyncio
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).parents[1]))

from vizier_ai.models.bundle import InsightBundle, SavedInsight
from vizier_ai.models.data_profile import DataColumnSpec, DataProfile
from vizier_ai.models.data_schema import DatasetField, DatasetSchema
from vizier_ai.models.insights import InsightMetadata, Insights, TraceSpec


def make_schema() -> DatasetSchema:
    return DatasetSchema(
        source="test",
        fields=[DatasetField(name="County", jsonPath="$.county")],
    )


def make_profile() -> DataProfile:
    return DataProfile(columns=[
        DataColumnSpec(name="$.county", generator="category", categories=["King", "Pierce"]),
    ])


def make_saved_insight(mock_seed: int | None = 1338) -> SavedInsight:
    return SavedInsight(
        id="i1",
        metadata=InsightMetadata(title="T", summary="S", keyIdea="K"),
        traces=[TraceSpec(chart_type="bar", x_axis="$.county", y_axis="$.county")],
        mock_seed=mock_seed,
    )


class TestInsightBundleModel:
    def test_accepts_mock_bundle(self):
        bundle = InsightBundle(
            dataset_schema=make_schema(),
            data_profile=make_profile(),
            insights=[make_saved_insight(mock_seed=1338)],
        )

        assert bundle.version == 1
        assert bundle.dataset_schema.fields[0].name == "County"
        assert bundle.data_profile is not None
        assert bundle.insights[0].mock_seed == 1338

    def test_accepts_real_data_bundle_without_profile(self):
        bundle = InsightBundle(
            dataset_schema=make_schema(),
            data_profile=None,
            insights=[make_saved_insight(mock_seed=None)],
        )

        assert bundle.data_profile is None
        assert bundle.insights[0].mock_seed is None

    def test_rejects_unknown_version(self):
        with pytest.raises(ValidationError):
            InsightBundle.model_validate({
                "version": 2,
                "schema": make_schema().model_dump(),
                "insights": [make_saved_insight().model_dump()],
            })

    def test_rejects_missing_schema(self):
        with pytest.raises(ValidationError):
            InsightBundle.model_validate({
                "insights": [make_saved_insight().model_dump()],
            })

    def test_rejects_empty_insights(self):
        with pytest.raises(ValidationError):
            InsightBundle(
                schema=make_schema(),
                insights=[],
            )

    def test_round_trips_through_json(self):
        bundle = InsightBundle(
            dataset_schema=make_schema(),
            data_profile=make_profile(),
            insights=[make_saved_insight()],
        )

        parsed = InsightBundle.model_validate_json(bundle.model_dump_json())

        assert parsed == bundle

    def test_round_trips_csv_options(self):
        from vizier_ai.models.csv_options import CsvOptions

        bundle = InsightBundle(
            dataset_schema=make_schema(),
            insights=[make_saved_insight()],
            csv_options=CsvOptions(delimiter=";"),
        )

        parsed = InsightBundle.model_validate_json(bundle.model_dump_json())

        assert parsed.csv_options == CsvOptions(delimiter=";")


class FakeLLM:
    def __init__(self):
        self.calls = []

    async def __call__(self, system, prompt, output_type, *, model=None, api_key=None):
        self.calls.append({"system": system, "prompt": prompt, "output_type": output_type})
        if output_type is DatasetSchema:
            return make_schema()
        if output_type is DataProfile:
            return make_profile()
        if output_type.__name__ == "ConstrainedInsightCandidates":
            from vizier_ai.models.insights import ConstrainedInsightCandidates
            return ConstrainedInsightCandidates(candidates=self.candidates, fallback_reason=self.fallback_reason)
        from vizier_ai.models.insights import InsightCandidates, InsightCandidate, TraceSpec
        return InsightCandidates(candidates=[
            InsightCandidate(
                id=f"i{i}",
                metadata=InsightMetadata(title="T", summary="S", keyIdea="K"),
                traces=[TraceSpec(chart_type="bar", x_axis="$.county", y_axis="$.county")],
            )
            for i in range(2)
        ])

    candidates = []
    fallback_reason = None


class TestPipelineBundleContext:
    def test_mock_run_carries_schema_profile_and_seeds(self, monkeypatch):
        from vizier_ai.core import run_pipeline

        fake = FakeLLM()
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)

        result = asyncio.run(run_pipeline("counties", {"rows": []}))

        assert result.dataset_schema is not None
        assert result.dataset_schema.fields[0].name == "County"
        assert result.data_profile is not None
        assert result.data_profile.columns[0].name == "$.county"
        assert [i.mock_seed for i in result.insights] == [1337, 1338]

    def test_real_data_run_carries_schema_without_profile(self, monkeypatch):
        from vizier_ai.core import run_pipeline

        fake = FakeLLM()
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)

        result = asyncio.run(run_pipeline("counties", {"rows": [{"county": "King"}]}))

        assert result.dataset_schema is not None
        assert result.data_profile is None
        assert all(i.mock_seed is None for i in result.insights)


class TestBuildAndRenderBundle:
    def run_mock_pipeline(self, monkeypatch):
        from vizier_ai.core import run_pipeline

        fake = FakeLLM()
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)
        return asyncio.run(run_pipeline("counties", {"rows": []}))

    def test_build_bundle_strips_plotly_fields_and_keeps_recipes(self, monkeypatch):
        from vizier_ai.bundle import build_bundle

        result = self.run_mock_pipeline(monkeypatch)

        bundle = build_bundle(result)

        assert bundle.version == 1
        assert bundle.dataset_schema.fields[0].name == "County"
        assert bundle.data_profile is not None
        assert len(bundle.insights) == 2
        assert [s.mock_seed for s in bundle.insights] == [1337, 1338]
        assert bundle.insights[0].traces[0].chart_type == "bar"
        assert "plotlyData" not in SavedInsight.model_fields
        assert "plotlyLayout" not in SavedInsight.model_fields

    def test_build_bundle_requires_schema(self):
        from vizier_ai.bundle import build_bundle

        with pytest.raises(ValueError):
            build_bundle(Insights(insights=[]))

    def test_render_bundle_reproduces_pipeline_charts_exactly(self, monkeypatch):
        from vizier_ai.bundle import build_bundle, render_bundle

        result = self.run_mock_pipeline(monkeypatch)
        bundle = build_bundle(result)

        rendered, warnings = render_bundle(bundle)

        assert warnings == []
        assert len(rendered.insights) == 2
        for original, rebuilt in zip(result.insights, rendered.insights):
            assert rebuilt.chart_spec.plotlyData == original.chart_spec.plotlyData
            assert rebuilt.chart_spec.plotlyLayout == original.chart_spec.plotlyLayout
            assert rebuilt.mock_seed == original.mock_seed
        assert rendered.dataset_schema is not None
        assert rendered.data_profile is not None

    def test_render_bundle_with_real_rows(self):
        from vizier_ai.bundle import render_bundle

        bundle = InsightBundle(
            dataset_schema=make_schema(),
            insights=[make_saved_insight(mock_seed=None)],
        )
        rows = [{"county": "King"}, {"county": "Pierce"}]

        rendered, warnings = render_bundle(bundle, rows=rows)

        assert warnings == []
        trace = rendered.insights[0].chart_spec.plotlyData[0]
        assert trace["x"] == ["King", "Pierce"]

    def test_render_bundle_warns_on_incompatible_dataset(self):
        from vizier_ai.bundle import render_bundle

        bundle = InsightBundle(
            dataset_schema=make_schema(),
            insights=[make_saved_insight(mock_seed=None)],
        )
        rows = [{"state": "WA"}]

        rendered, warnings = render_bundle(bundle, rows=rows)

        assert len(warnings) == 1
        assert "$.county" in warnings[0]

    def test_render_bundle_without_profile_or_rows_renders_empty_charts(self):
        from vizier_ai.bundle import render_bundle

        bundle = InsightBundle(
            dataset_schema=make_schema(),
            insights=[make_saved_insight(mock_seed=None)],
        )

        rendered, warnings = render_bundle(bundle)

        trace = rendered.insights[0].chart_spec.plotlyData[0]
        assert trace["x"] == []
        assert trace["y"] == []
