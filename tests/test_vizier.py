"""Tests for the Vizier object — the OO pipeline entry point with hooks."""

import asyncio
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))

from vizier_ai import (
    ChartEvent,
    CompleteEvent,
    Hooks,
    InsightsEvent,
    ParseEvent,
    SchemaEvent,
    Vizier,
)
from vizier_ai.core import UnsatisfiableConstraintsError
from vizier_ai.models.constraints import InsightConstraints
from vizier_ai.models.data_profile import DataColumnSpec, DataProfile
from vizier_ai.models.data_schema import DatasetField, DatasetSchema
from vizier_ai.models.insights import (
    ConstrainedInsightCandidates,
    InsightCandidate,
    InsightCandidates,
    InsightMetadata,
    TraceSpec,
)

SALES_ROWS = [
    {"region": "EMEA", "revenue": 10.0},
    {"region": "EMEA", "revenue": 20.0},
    {"region": "APAC", "revenue": 30.0},
    {"region": "AMER", "revenue": 40.0},
]


def make_schema(fields=None) -> DatasetSchema:
    return DatasetSchema(
        source="orders",
        fields=fields or [
            DatasetField(name="Region", jsonPath="$['region']", type="string"),
            DatasetField(name="Revenue", jsonPath="$['revenue']", type="number"),
        ],
    )


def make_profile() -> DataProfile:
    return DataProfile(columns=[
        DataColumnSpec(name="$.region", generator="category", categories=["EMEA", "APAC"]),
    ])


def make_candidate() -> InsightCandidate:
    return InsightCandidate(
        id="rev-by-region",
        metadata=InsightMetadata(title="Revenue by region", summary="S"),
        traces=[TraceSpec(chart_type="bar", x_axis="$['region']", y_axis="$['revenue']", aggregation="sum")],
    )


class FakeLLM:
    """Stub for vizier_ai.core.call_llm, recording model/api_key kwargs."""

    def __init__(self, schema=None, profile=None, candidates=None):
        self.calls = []
        self.prompts = []
        self.schema = schema or make_schema()
        self.profile = profile or make_profile()
        self.candidates = candidates or [make_candidate()]

    async def __call__(self, system, prompt, output_type, *, model=None, api_key=None):
        self.calls.append({"output_type": output_type, "model": model, "api_key": api_key})
        self.prompts.append(prompt)
        if output_type is DatasetSchema:
            return self.schema
        if output_type is DataProfile:
            return self.profile
        if output_type is ConstrainedInsightCandidates:
            return ConstrainedInsightCandidates(candidates=self.candidates)
        return InsightCandidates(candidates=self.candidates)


class TestVizierRun:
    """Vizier().run() mirrors run_pipeline's behavior with OO config."""

    def test_run_text_only_uses_mock_path(self, monkeypatch):
        fake = FakeLLM()
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)

        result = asyncio.run(Vizier().run("orders table with region and revenue"))

        assert len(result.insights) == 1
        assert result.insights[0].mock_seed is not None
        assert result.data_profile is not None
        assert result.insights[0].chart_spec.plotlyData

    def test_run_with_pre_parsed_dict_uses_real_rows(self, monkeypatch):
        fake = FakeLLM()
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)

        result = asyncio.run(Vizier().run("sales", data={"rows": SALES_ROWS, "rowCount": 4}))

        assert result.data_profile is None
        assert "EMEA" in fake.prompts[0], "sample rows must reach the schema prompt"

    def test_run_with_dataframe(self, monkeypatch):
        fake = FakeLLM()
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)

        df = pd.DataFrame({"region": ["EMEA", "APAC"], "revenue": [10.0, 20.0]})
        result = asyncio.run(Vizier().run("sales", data=df))

        assert result.data_profile is None
        assert "EMEA" in fake.prompts[0]

    def test_run_with_csv_file_path(self, monkeypatch, tmp_path):
        fake = FakeLLM()
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)

        csv = tmp_path / "sales.csv"
        csv.write_text("region,revenue\nEMEA,10\nAPAC,20\n")

        result = asyncio.run(Vizier().run("sales", data=str(csv)))

        assert result.data_profile is None
        assert "EMEA" in fake.prompts[0]

    def test_axis_titles_use_schema_field_names(self, monkeypatch):
        fake = FakeLLM()
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)

        result = asyncio.run(Vizier().run("sales", data={"rows": SALES_ROWS}))

        layout = result.insights[0].chart_spec.plotlyLayout
        assert layout["xaxis"]["title"]["text"] == "Region"
        assert layout["yaxis"]["title"]["text"] == "Revenue"

    def test_run_with_raw_csv_text(self, monkeypatch):
        fake = FakeLLM()
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)

        result = asyncio.run(Vizier().run("sales", data="region,revenue\nEMEA,10\n"))

        assert result.data_profile is None

    def test_run_rejects_unknown_data_type(self):
        with pytest.raises(TypeError, match="data"):
            asyncio.run(Vizier().run("sales", data=12345))

    def test_constructor_model_used_for_all_llm_calls(self, monkeypatch):
        fake = FakeLLM()
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)

        asyncio.run(Vizier(model="mistral:mistral-large-latest", api_key="key-1").run("orders"))

        assert all(call["model"] == "mistral:mistral-large-latest" for call in fake.calls)
        assert all(call["api_key"] == "key-1" for call in fake.calls)

    def test_run_model_overrides_constructor(self, monkeypatch):
        fake = FakeLLM()
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)

        asyncio.run(
            Vizier(model="constructor:model").run("orders", model="runtime:model")
        )

        assert all(call["model"] == "runtime:model" for call in fake.calls)

    def test_constructor_constraints_reach_insight_prompt(self, monkeypatch):
        fake = FakeLLM()
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)

        vizier = Vizier(constraints=InsightConstraints(include_chart_types=["bar"]))
        asyncio.run(vizier.run("orders"))

        assert "Apply these constraints" in fake.prompts[1]
        assert "bar" in fake.prompts[1]

    def test_run_constraints_override_constructor(self, monkeypatch):
        fake = FakeLLM()
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)

        vizier = Vizier(constraints=InsightConstraints(guidance="from constructor"))
        asyncio.run(vizier.run("orders", constraints=InsightConstraints(guidance="from run")))

        assert "from run" in fake.prompts[1]
        assert "from constructor" not in fake.prompts[1]

    def test_unsatisfiable_constraints_raise(self, monkeypatch):
        fake = FakeLLM(candidates=[])
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)

        vizier = Vizier(constraints=InsightConstraints(include_chart_types=["pie"]))
        with pytest.raises(UnsatisfiableConstraintsError):
            asyncio.run(vizier.run("orders"))


class TestHooks:
    """Hooks fire at each pipeline step with typed events."""

    def test_parse_event_for_file_input(self, monkeypatch, tmp_path):
        monkeypatch.setattr("vizier_ai.core.call_llm", FakeLLM())
        csv = tmp_path / "sales.csv"
        csv.write_text("region,revenue\nEMEA,10\nAPAC,20\n")

        events = []
        hooks = Hooks(on_parse=lambda e: events.append(e))
        asyncio.run(Vizier(hooks=hooks).run("sales", data=str(csv)))

        assert len(events) == 1
        event = events[0]
        assert isinstance(event, ParseEvent)
        assert event.source == "file"
        assert event.row_count == 2
        assert event.columns == ["region", "revenue"]

    def test_no_parse_event_for_pre_parsed_dict(self, monkeypatch):
        monkeypatch.setattr("vizier_ai.core.call_llm", FakeLLM())

        events = []
        hooks = Hooks(on_parse=lambda e: events.append(e))
        asyncio.run(Vizier(hooks=hooks).run("sales", data={"rows": SALES_ROWS}))

        assert events == []

    def test_schema_event_carries_schema_and_warnings(self, monkeypatch):
        monkeypatch.setattr("vizier_ai.core.call_llm", FakeLLM())

        events = []
        hooks = Hooks(on_schema=lambda e: events.append(e))
        asyncio.run(Vizier(hooks=hooks).run("sales", data={"rows": SALES_ROWS}))

        event = events[0]
        assert isinstance(event, SchemaEvent)
        assert event.schema.source == "orders"
        assert event.warnings == []

    def test_insights_event_count(self, monkeypatch):
        monkeypatch.setattr("vizier_ai.core.call_llm", FakeLLM())

        events = []
        hooks = Hooks(on_insights=lambda e: events.append(e))
        asyncio.run(Vizier(hooks=hooks).run("sales", data={"rows": SALES_ROWS}))

        assert events == [InsightsEvent(count=1)]

    def test_chart_events_fire_per_insight(self, monkeypatch):
        monkeypatch.setattr("vizier_ai.core.call_llm", FakeLLM())

        events = []
        hooks = Hooks(on_chart=lambda e: events.append(e))
        asyncio.run(Vizier(hooks=hooks).run("sales", data={"rows": SALES_ROWS}))

        assert events == [ChartEvent(index=0, total=1, insight_id="rev-by-region", title="Revenue by region")]

    def test_complete_event_carries_result(self, monkeypatch):
        monkeypatch.setattr("vizier_ai.core.call_llm", FakeLLM())

        events = []
        hooks = Hooks(on_complete=lambda e: events.append(e))
        result = asyncio.run(Vizier(hooks=hooks).run("sales", data={"rows": SALES_ROWS}))

        assert events == [CompleteEvent(insights=result)]

    def test_async_hooks_are_awaited(self, monkeypatch):
        monkeypatch.setattr("vizier_ai.core.call_llm", FakeLLM())

        seen = []

        async def on_schema(event):
            await asyncio.sleep(0)
            seen.append(event.schema.source)

        asyncio.run(Vizier(hooks=Hooks(on_schema=on_schema)).run("sales"))
        assert seen == ["orders"]

    def test_run_hooks_override_constructor_hooks(self, monkeypatch):
        monkeypatch.setattr("vizier_ai.core.call_llm", FakeLLM())

        constructor_events = []
        run_events = []
        asyncio.run(
            Vizier(hooks=Hooks(on_insights=lambda e: constructor_events.append(e)))
            .run("sales", hooks=Hooks(on_insights=lambda e: run_events.append(e)))
        )

        assert constructor_events == []
        assert len(run_events) == 1

    def test_hooks_without_callbacks_are_noops(self, monkeypatch):
        monkeypatch.setattr("vizier_ai.core.call_llm", FakeLLM())

        result = asyncio.run(Vizier(hooks=Hooks()).run("sales", data={"rows": SALES_ROWS}))
        assert len(result.insights) == 1


class TestSchemaValidation:
    """Schema fields that never match, or resolve to non-primitives, warn."""

    def test_non_primitive_field_produces_warning(self, monkeypatch):
        schema = make_schema(fields=[
            DatasetField(name="Region", jsonPath="$['region']"),
            DatasetField(
                name="Coordinates",
                jsonPath="$['geocoded_column']['coordinates']",
            ),
        ])
        monkeypatch.setattr("vizier_ai.core.call_llm", FakeLLM(schema=schema))
        rows = [
            {"region": "King", "geocoded_column": {"coordinates": [-122.0, 47.0]}},
        ]

        result = asyncio.run(Vizier().run("ev registrations", data={"rows": rows}))

        warnings = result.dataset_schema.warnings
        assert any("Coordinates" in w and "primitive" in w for w in warnings)

    def test_warning_reaches_schema_hook(self, monkeypatch):
        schema = make_schema(fields=[
            DatasetField(name="Coordinates", jsonPath="$['geocoded_column']['coordinates']"),
        ])
        monkeypatch.setattr("vizier_ai.core.call_llm", FakeLLM(schema=schema))
        rows = [{"geocoded_column": {"coordinates": [-122.0, 47.0]}}]

        events = []
        hooks = Hooks(on_schema=lambda e: events.append(e))
        asyncio.run(Vizier(hooks=hooks).run("ev", data={"rows": rows}))

        assert any("Coordinates" in w for w in events[0].warnings)

    def test_never_matching_field_produces_warning(self, monkeypatch):
        schema = make_schema(fields=[
            DatasetField(name="Region", jsonPath="$['region']"),
            DatasetField(name="Ghost", jsonPath="$['not_in_data']"),
        ])
        monkeypatch.setattr("vizier_ai.core.call_llm", FakeLLM(schema=schema))

        result = asyncio.run(Vizier().run("sales", data={"rows": SALES_ROWS}))

        assert any("Ghost" in w for w in result.dataset_schema.warnings)

    def test_clean_schema_produces_no_warnings(self, monkeypatch):
        monkeypatch.setattr("vizier_ai.core.call_llm", FakeLLM())

        result = asyncio.run(Vizier().run("sales", data={"rows": SALES_ROWS}))

        assert result.dataset_schema.warnings == []

    def test_validation_skipped_without_real_data(self, monkeypatch):
        schema = make_schema(fields=[
            DatasetField(name="Ghost", jsonPath="$['not_in_data']"),
        ])
        monkeypatch.setattr("vizier_ai.core.call_llm", FakeLLM(schema=schema))

        result = asyncio.run(Vizier().run("orders"))

        assert result.dataset_schema.warnings == []

    def test_validation_can_be_disabled(self, monkeypatch):
        schema = make_schema(fields=[
            DatasetField(name="Ghost", jsonPath="$['not_in_data']"),
        ])
        monkeypatch.setattr("vizier_ai.core.call_llm", FakeLLM(schema=schema))

        result = asyncio.run(Vizier(validate_schema=False).run("sales", data={"rows": SALES_ROWS}))

        assert result.dataset_schema.warnings == []


class TestPackageExports:
    def test_vizier_and_hooks_exported(self):
        import vizier_ai

        for name in ("Vizier", "Hooks", "ParseEvent", "SchemaEvent", "InsightsEvent", "ChartEvent", "CompleteEvent"):
            assert hasattr(vizier_ai, name), name


class TestVizierExcelInput:
    """Vizier.run accepts .xlsx file paths directly."""

    def test_run_with_xlsx_file(self, monkeypatch, tmp_path):
        from openpyxl import Workbook

        fake = FakeLLM()
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)

        path = tmp_path / "sales.xlsx"
        wb = Workbook()
        wb.active.append(["region", "revenue"])
        wb.active.append(["EMEA", 10.0])
        wb.save(path)

        result = asyncio.run(Vizier().run("sales", data=str(path)))

        assert result.data_profile is None
        assert "EMEA" in fake.prompts[0]
