"""Tests for insight generation constraints."""

import asyncio
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).parents[1]))

from vizier_ai.constraints import apply_constraints
from vizier_ai.core import UnsatisfiableConstraintsError, run_pipeline
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


def make_candidate(chart_type: str = "bar", x_axis: str = "$.county", y_axis: str = "$.revenue") -> InsightCandidate:
    return InsightCandidate(
        id="i1",
        metadata=InsightMetadata(title="T", summary="S", keyIdea="K"),
        traces=[TraceSpec(chart_type=chart_type, x_axis=x_axis, y_axis=y_axis)],
    )


def make_schema() -> DatasetSchema:
    return DatasetSchema(
        source="test",
        fields=[
            DatasetField(name="County", jsonPath="$.county"),
            DatasetField(name="Revenue USD", jsonPath="$['revenue.usd']"),
            DatasetField(name="Id", jsonPath="$.id"),
        ],
    )


class TestInsightConstraintsModel:
    def test_accepts_full_constraints(self):
        constraints = InsightConstraints(
            include_chart_types=["bar", "line"],
            include_fields=["county", "$['revenue.usd']"],
            guidance="focus on comparisons between counties",
        )

        assert constraints.include_chart_types == ["bar", "line"]
        assert constraints.include_fields == ["county", "$['revenue.usd']"]
        assert constraints.guidance == "focus on comparisons between counties"

    def test_accepts_exclusion_constraints(self):
        constraints = InsightConstraints(
            exclude_chart_types=["pie"],
            exclude_fields=["id"],
        )

        assert constraints.exclude_chart_types == ["pie"]
        assert constraints.exclude_fields == ["id"]

    def test_accepts_empty_constraints(self):
        constraints = InsightConstraints()

        assert constraints.include_chart_types is None
        assert constraints.exclude_chart_types is None
        assert constraints.include_fields is None
        assert constraints.exclude_fields is None
        assert constraints.guidance is None

    def test_accepts_soft_guidance_only(self):
        constraints = InsightConstraints(guidance="lean toward time trends")

        assert constraints.guidance == "lean toward time trends"

    def test_rejects_unknown_chart_type_in_include(self):
        with pytest.raises(ValidationError):
            InsightConstraints(include_chart_types=["bar", "donut"])

    def test_rejects_unknown_chart_type_in_exclude(self):
        with pytest.raises(ValidationError):
            InsightConstraints(exclude_chart_types=["radar"])

    def test_rejects_include_and_exclude_chart_types(self):
        with pytest.raises(ValidationError):
            InsightConstraints(include_chart_types=["bar"], exclude_chart_types=["pie"])

    def test_rejects_include_and_exclude_fields(self):
        with pytest.raises(ValidationError):
            InsightConstraints(include_fields=["county"], exclude_fields=["make"])

    def test_rejects_empty_chart_type_list(self):
        with pytest.raises(ValidationError):
            InsightConstraints(include_chart_types=[])

    def test_rejects_empty_field_list(self):
        with pytest.raises(ValidationError):
            InsightConstraints(exclude_fields=[])


class TestFallbackOutputModel:
    def test_unconstrained_candidates_requires_at_least_one(self):
        with pytest.raises(ValidationError):
            InsightCandidates(candidates=[])

    def test_constrained_candidates_allows_empty_with_fallback_reason(self):
        result = ConstrainedInsightCandidates(candidates=[], fallback_reason="No geo fields in schema")

        assert result.candidates == []
        assert result.fallback_reason == "No geo fields in schema"

    def test_constrained_candidates_allows_insights_without_fallback(self):
        result = ConstrainedInsightCandidates(candidates=[make_candidate()])

        assert len(result.candidates) == 1
        assert result.fallback_reason is None

    def test_constrained_candidates_rejects_empty_without_fallback(self):
        with pytest.raises(ValidationError):
            ConstrainedInsightCandidates(candidates=[])

    def test_constrained_candidates_rejects_insights_with_fallback(self):
        with pytest.raises(ValidationError):
            ConstrainedInsightCandidates(candidates=[make_candidate()], fallback_reason="not needed")


class TestApplyConstraints:
    def test_drops_traces_with_excluded_chart_type(self):
        candidate = InsightCandidate(
            id="i1",
            metadata=InsightMetadata(title="T", summary="S", keyIdea="K"),
            traces=[
                TraceSpec(chart_type="bar", x_axis="$.county", y_axis="$.id"),
                TraceSpec(chart_type="pie", x_axis="$.county", y_axis="$.id"),
            ],
        )
        constraints = InsightConstraints(exclude_chart_types=["pie"])

        result = apply_constraints([candidate], constraints, make_schema())

        assert len(result) == 1
        assert [t.chart_type for t in result[0].traces] == ["bar"]

    def test_drops_traces_with_chart_type_not_included(self):
        candidates = [
            make_candidate(chart_type="bar"),
            make_candidate(chart_type="line"),
        ]
        constraints = InsightConstraints(include_chart_types=["bar"])

        result = apply_constraints(candidates, constraints, make_schema())

        assert [c.traces[0].chart_type for c in result] == ["bar"]

    def test_drops_insight_when_all_traces_violate(self):
        candidates = [make_candidate(chart_type="pie")]
        constraints = InsightConstraints(exclude_chart_types=["pie"])

        result = apply_constraints(candidates, constraints, make_schema())

        assert result == []

    def test_drops_traces_referencing_excluded_field_by_name(self):
        candidate = InsightCandidate(
            id="i1",
            metadata=InsightMetadata(title="T", summary="S", keyIdea="K"),
            traces=[
                TraceSpec(chart_type="bar", x_axis="$.county", y_axis="$.id"),
                TraceSpec(chart_type="line", x_axis="$.county", y_axis="$['revenue.usd']"),
            ],
        )
        constraints = InsightConstraints(exclude_fields=["Revenue USD"])

        result = apply_constraints([candidate], constraints, make_schema())

        assert len(result) == 1
        assert [t.y_axis for t in result[0].traces] == ["$.id"]

    def test_exclude_field_matches_case_insensitive(self):
        candidates = [make_candidate(x_axis="$.county")]
        constraints = InsightConstraints(exclude_fields=["COUNTY"])

        result = apply_constraints(candidates, constraints, make_schema())

        assert result == []

    def test_exclude_field_matches_filter_field(self):
        candidate = InsightCandidate(
            id="i1",
            metadata=InsightMetadata(title="T", summary="S", keyIdea="K"),
            traces=[
                TraceSpec(
                    chart_type="bar",
                    x_axis="$.county",
                    y_axis="$.id",
                    filter={"field": "$.county", "op": "eq", "value": "King"},
                ),
            ],
        )
        constraints = InsightConstraints(exclude_fields=["county"])

        result = apply_constraints([candidate], constraints, make_schema())

        assert result == []

    def test_include_field_keeps_only_insights_featuring_it(self):
        candidates = [
            InsightCandidate(
                id="i1",
                metadata=InsightMetadata(title="T", summary="S", keyIdea="K"),
                traces=[TraceSpec(chart_type="bar", x_axis="$.county", y_axis="$.id")],
            ),
            InsightCandidate(
                id="i2",
                metadata=InsightMetadata(title="T", summary="S", keyIdea="K"),
                traces=[TraceSpec(chart_type="bar", x_axis="$.id", y_axis="$['revenue.usd']")],
            ),
        ]
        constraints = InsightConstraints(include_fields=["county"])

        result = apply_constraints(candidates, constraints, make_schema())

        assert [c.id for c in result] == ["i1"]

    def test_returns_all_when_no_hard_constraints(self):
        candidates = [make_candidate(), make_candidate()]
        constraints = InsightConstraints(guidance="just a nudge")

        result = apply_constraints(candidates, constraints, make_schema())

        assert len(result) == 2

    def test_combines_chart_type_and_field_constraints(self):
        candidate = InsightCandidate(
            id="i1",
            metadata=InsightMetadata(title="T", summary="S", keyIdea="K"),
            traces=[
                TraceSpec(chart_type="bar", x_axis="$.county", y_axis="$.id"),
                TraceSpec(chart_type="line", x_axis="$.id", y_axis="$['revenue.usd']"),
            ],
        )
        constraints = InsightConstraints(include_chart_types=["bar"], exclude_fields=["Revenue USD"])

        result = apply_constraints([candidate], constraints, make_schema())

        assert len(result) == 1
        assert [t.chart_type for t in result[0].traces] == ["bar"]


class FakeLLM:
    def __init__(self, candidates=None, fallback_reason=None):
        self.calls = []
        self.candidates = candidates or []
        self.fallback_reason = fallback_reason

    async def __call__(self, system, prompt, output_type, *, model=None, api_key=None):
        self.calls.append({"system": system, "prompt": prompt, "output_type": output_type})
        if output_type is DatasetSchema:
            return make_schema()
        if output_type is DataProfile:
            return DataProfile(columns=[
                DataColumnSpec(name="$.county", generator="category", categories=["King", "Pierce"]),
                DataColumnSpec(name="$.id", generator="linear", start=1, step=1),
            ])
        if output_type is ConstrainedInsightCandidates:
            return ConstrainedInsightCandidates(
                candidates=self.candidates,
                fallback_reason=self.fallback_reason,
            )
        return InsightCandidates(candidates=self.candidates)

    def insight_call(self):
        for call in self.calls:
            if call["output_type"] in (InsightCandidates, ConstrainedInsightCandidates):
                return call
        raise AssertionError("no insight call was made")


def make_candidate_with_traces(traces, candidate_id="i1"):
    return InsightCandidate(
        id=candidate_id,
        metadata=InsightMetadata(title="T", summary="S", keyIdea="K"),
        traces=traces,
    )


class TestRunPipelineConstraints:
    def test_constraints_reach_insight_prompt(self, monkeypatch):
        fake = FakeLLM(candidates=[make_candidate()])
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)
        constraints = InsightConstraints(exclude_chart_types=["pie"], guidance="avoid 3D charts")

        asyncio.run(run_pipeline("ev registrations", {"rows": []}, constraints=constraints))

        insight_call = fake.insight_call()
        assert insight_call["output_type"] is ConstrainedInsightCandidates
        assert "Apply these constraints" in insight_call["prompt"]
        assert "pie" in insight_call["prompt"]
        assert "avoid 3D charts" in insight_call["prompt"]
        assert "fallback_reason" in insight_call["prompt"]

    def test_no_constraints_use_plain_output_type(self, monkeypatch):
        fake = FakeLLM(candidates=[make_candidate()])
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)

        asyncio.run(run_pipeline("ev registrations", {"rows": []}))

        insight_call = fake.insight_call()
        assert insight_call["output_type"] is InsightCandidates
        assert "Apply these constraints" not in insight_call["prompt"]
        assert "fallback_reason" not in insight_call["prompt"]

    def test_fallback_reply_raises_unsatisfiable(self, monkeypatch):
        fake = FakeLLM(candidates=[], fallback_reason="No geographic fields in the schema")
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)
        constraints = InsightConstraints(include_chart_types=["geomap"])

        with pytest.raises(UnsatisfiableConstraintsError) as exc_info:
            asyncio.run(run_pipeline("ev registrations", {"rows": []}, constraints=constraints))

        assert "No geographic fields" in str(exc_info.value)

    def test_post_filter_prunes_violating_traces(self, monkeypatch):
        candidate = make_candidate_with_traces([
            TraceSpec(chart_type="bar", x_axis="$.county", y_axis="$.id"),
            TraceSpec(chart_type="pie", x_axis="$.county", y_axis="$.id"),
        ])
        fake = FakeLLM(candidates=[candidate])
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)
        constraints = InsightConstraints(exclude_chart_types=["pie"])

        result = asyncio.run(run_pipeline("ev registrations", {"rows": []}, constraints=constraints))

        assert len(result.insights) == 1
        assert [t.chart_type for t in result.insights[0].chart_spec.traces] == ["bar"]

    def test_all_candidates_violating_raises(self, monkeypatch):
        fake = FakeLLM(candidates=[make_candidate(chart_type="pie")])
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)
        constraints = InsightConstraints(exclude_chart_types=["pie"])

        with pytest.raises(UnsatisfiableConstraintsError):
            asyncio.run(run_pipeline("ev registrations", {"rows": []}, constraints=constraints))

    def test_constraints_apply_with_real_rows(self, monkeypatch):
        fake = FakeLLM(candidates=[make_candidate()])
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)
        constraints = InsightConstraints(include_chart_types=["bar"])

        result = asyncio.run(run_pipeline(
            "ev registrations",
            {"rows": [{"county": "King", "id": 1}]},
            constraints=constraints,
        ))

        assert len(result.insights) == 1
        insight_call = fake.insight_call()
        assert "Apply these constraints" in insight_call["prompt"]
        assert "bar" in insight_call["prompt"]
