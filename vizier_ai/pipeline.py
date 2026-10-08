"""Vizier — the object-oriented pipeline entry point.

``Vizier`` bundles the pipeline configuration (model, api key, prompts,
constraints, hooks) in one object, like pydantic-ai's ``Agent``. ``run()``
takes per-call optional overrides:

    from vizier_ai import Vizier, Hooks

    vizier = Vizier(model="google:gemini-2.0-flash")
    result = await vizier.run("orders table with region, revenue", data="sales.csv")

    hooks = Hooks(on_schema=lambda e: print(len(e.schema.fields), "fields"))
    result = await vizier.run("orders", data=df, hooks=hooks)

Hooks fire at every pipeline step — data parsing, schema generation,
insight generation, per-chart building, completion — and may be sync or
async. They are the integration point for progress feedback in the UI.
"""

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import pandas as pd

from vizier_ai import core
from vizier_ai.chart_builder import _resolve_values, build_plotly_spec
from vizier_ai.constraints import apply_constraints
from vizier_ai.mock_data import generate_mock_rows
from vizier_ai.models.constraints import InsightConstraints
from vizier_ai.models.data_profile import DataProfile
from vizier_ai.models.data_schema import DatasetSchema
from vizier_ai.models.insights import (
    ConstrainedInsightCandidates,
    Insight,
    InsightCandidates,
    Insights,
)
from vizier_ai.parser import parse_data
from vizier_ai.prompts import DEFAULT_CONSTRAINT_FAILSAFE_INSTRUCTION

import json


# --- Hook events ---

@dataclass
class ParseEvent:
    """Emitted after Vizier parsed a data source itself (file, raw text,
    DataFrame). Not emitted for pre-parsed dicts — parsing already
    happened before Vizier was involved."""

    source: str
    row_count: int
    columns: list[str]


@dataclass
class SchemaEvent:
    """Emitted after the dataset schema was generated and validated."""

    schema: DatasetSchema
    warnings: list[str]


@dataclass
class InsightsEvent:
    """Emitted after insight candidates were generated (and constraints
    verified)."""

    count: int


@dataclass
class ChartEvent:
    """Emitted before each chart is built."""

    index: int
    total: int
    insight_id: str
    title: str


@dataclass
class CompleteEvent:
    """Emitted once the whole pipeline finished."""

    insights: Insights


HookCallable = Callable[[Any], Any]


class Hooks:
    """Pipeline callbacks; each receives a typed event.

    Every callback may be a plain function or a coroutine function. Use
    these to surface progress in your UI (e.g. "schema ready", "building
    chart 3 of 8") or to log pipeline steps.
    """

    def __init__(
        self,
        on_parse: HookCallable | None = None,
        on_schema: HookCallable | None = None,
        on_insights: HookCallable | None = None,
        on_chart: HookCallable | None = None,
        on_complete: HookCallable | None = None,
    ):
        self.on_parse = on_parse
        self.on_schema = on_schema
        self.on_insights = on_insights
        self.on_chart = on_chart
        self.on_complete = on_complete


async def _dispatch(hook: HookCallable, event: Any) -> None:
    result = hook(event)
    if asyncio.iscoroutine(result):
        await result


def _build_constraint_block(constraints: InsightConstraints) -> str:
    lines = ["", "Apply these constraints:"]
    if constraints.include_chart_types:
        lines.append(f"- Every trace must use one of these chart types: {', '.join(constraints.include_chart_types)}.")
    if constraints.exclude_chart_types:
        lines.append(f"- No trace may use these chart types: {', '.join(constraints.exclude_chart_types)}.")
    if constraints.include_fields:
        lines.append(f"- Every insight must feature at least one of these fields: {', '.join(constraints.include_fields)}.")
    if constraints.exclude_fields:
        lines.append(f"- No trace may reference these fields in its axes or filter: {', '.join(constraints.exclude_fields)}.")
    if constraints.guidance:
        lines.append(f"- Guidance (soft, not verified): {constraints.guidance}")
    lines.append(DEFAULT_CONSTRAINT_FAILSAFE_INSTRUCTION)
    return "\n".join(lines)


def validate_schema_fields(schema: DatasetSchema, rows: list[dict], sample_size: int = 20) -> list[str]:
    """Validate schema jsonPaths against sample rows.

    The schema instructs the LLM that every jsonPath must end at a
    primitive; this enforces it against real data. Fields that never
    match, or that resolve to objects/lists, produce warnings (not
    exceptions) — a bad field only breaks the traces that use it, and the
    warnings flow to the SchemaEvent hook and the response's
    dataset_schema.warnings.

    Only meaningful on the real-data path; there is nothing to check
    against when the schema was extracted from text alone.
    """
    warnings: list[str] = []
    sample = rows[:sample_size]
    for field in schema.fields:
        values = _resolve_values(sample, field.jsonPath)
        present = [v for v in values if v is not None]
        if not present:
            warnings.append(
                f"Field '{field.name}' ({field.jsonPath}) did not match any value in the data."
            )
        elif any(isinstance(v, (dict, list)) for v in present):
            warnings.append(
                f"Field '{field.name}' ({field.jsonPath}) resolves to a non-primitive value "
                f"(object or list); jsonPaths must end at a primitive type."
            )
    return warnings


class Vizier:
    """Configurable pipeline runner — the object-oriented counterpart of
    ``run_pipeline``.

    Constructor arguments are defaults for every ``run()`` call; ``run()``
    accepts the same options per call (later value wins):

        vizier = Vizier(model="mistral:mistral-large-latest", api_key="...")
        result = await vizier.run("orders table")                     # mock path
        result = await vizier.run("sales", data="sales.csv")         # real data
        result = await vizier.run("sales", data=my_dataframe)
    """

    def __init__(
        self,
        *,
        model: str | None = None,
        api_key: str | None = None,
        schema_system_prompt: str | None = None,
        insight_prompt: str | None = None,
        data_profile_system_prompt: str | None = None,
        constraints: InsightConstraints | None = None,
        hooks: Hooks | None = None,
        max_rows: int | None = None,
        validate_schema: bool = True,
    ):
        self.model = model
        self.api_key = api_key
        self.schema_system_prompt = schema_system_prompt
        self.insight_prompt = insight_prompt
        self.data_profile_system_prompt = data_profile_system_prompt
        self.constraints = constraints
        self.hooks = hooks
        self.max_rows = max_rows
        self.validate_schema = validate_schema

    async def _emit(self, hooks: Hooks | None, name: str, event: Any) -> None:
        if hooks is None:
            return
        hook = getattr(hooks, name, None)
        if hook is not None:
            await _dispatch(hook, event)

    def _parse_data(self, data: Any, max_rows: int | None) -> tuple[dict, str]:
        """Normalize a data source into the parser dict contract."""
        if isinstance(data, pd.DataFrame):
            return parse_data(data if max_rows is None else data.head(max_rows)), "dataframe"
        if isinstance(data, Path) or (isinstance(data, str) and Path(data).is_file()):
            suffix = str(data).lower().rsplit(".", 1)[-1] if "." in str(data) else ""
            fmt = {
                "jsonl": "jsonl", "ndjson": "jsonl", "json": "json",
                "xlsx": "excel", "xls": "excel",
            }.get(suffix, "csv")
            return parse_data(data, fmt, max_rows=max_rows), "file"
        if isinstance(data, str):
            return core._parse_payload(data, max_rows=max_rows), "text"
        raise TypeError(
            f"data must be a dict, pandas DataFrame, file path, raw text, or None — got {type(data).__name__}"
        )

    async def run(
        self,
        schema_text: str,
        *,
        data: Any = None,
        model: str | None = None,
        api_key: str | None = None,
        constraints: InsightConstraints | None = None,
        hooks: Hooks | None = None,
        max_rows: int | None = None,
    ) -> Insights:
        """Run the full pipeline and build Plotly specs.

        Args:
            schema_text: Free-form text description of the dataset.
            data: Pre-parsed dict (parser contract), pandas DataFrame,
                file path, raw text (format sniffed), or None for the
                mock-data path.
            model / api_key: Per-call LLM overrides.
            constraints: Per-call constraint override (constructor
                default applies when None).
            hooks: Per-call hook override (constructor default applies
                when None).
            max_rows: Per-call row cap applied when parsing data here.

        Returns:
            An ``Insights`` object; each insight carries its pre-built
            Plotly spec (see ``Insight.figure``).
        """
        model = model or self.model
        api_key = api_key or self.api_key
        constraints = constraints if constraints is not None else self.constraints
        hooks = hooks if hooks is not None else self.hooks
        max_rows = max_rows if max_rows is not None else self.max_rows
        llm_kwargs = {"model": model, "api_key": api_key}

        # --- data parsing ---
        if isinstance(data, dict):
            real_data = data
        elif data is None:
            real_data = None
        else:
            real_data, source = self._parse_data(data, max_rows)
            await self._emit(
                hooks, "on_parse",
                ParseEvent(
                    source=source,
                    row_count=real_data.get("rowCount", 0),
                    columns=real_data.get("columns", []),
                ),
            )

        real_rows = (real_data or {}).get("rows", [])
        use_mock = len(real_rows) == 0

        # --- schema generation ---
        schema_prompt = f"Analyze this data description and extract the dataset schema:\n\n{schema_text}"
        if not use_mock:
            schema_prompt += f"\nHere are some data samples:\n{'\n'.join([json.dumps(row, ensure_ascii=False) for row in real_rows[:3]])}"

        schema = await core.call_llm(
            self.schema_system_prompt or core.DEFAULT_SCHEMA_SYSTEM_PROMPT,
            schema_prompt,
            DatasetSchema,
            **llm_kwargs,
        )

        # --- schema validation (real-data path only) ---
        if self.validate_schema and real_rows:
            schema.warnings.extend(validate_schema_fields(schema, real_rows))
        await self._emit(hooks, "on_schema", SchemaEvent(schema, list(schema.warnings)))

        # --- insight generation (+ parallel mock profile) ---
        insight_output_type = InsightCandidates
        constraint_block = ""
        if constraints is not None:
            insight_output_type = ConstrainedInsightCandidates
            constraint_block = _build_constraint_block(constraints)

        insight_user_prompt = f"Given this dataset schema, produce up to 10 insight candidates:{constraint_block}\n\n{schema.model_dump_json()}"

        insights_task = core.call_llm(
            self.insight_prompt or core.DEFAULT_INSIGHT_SYSTEM_PROMPT,
            insight_user_prompt,
            insight_output_type,
            **llm_kwargs,
        )
        tasks = [insights_task]
        if use_mock:
            tasks.append(core.call_llm(
                self.data_profile_system_prompt or core.DEFAULT_DATA_PROFILE_SYSTEM_PROMPT,
                f"Given this dataset schema, generate a dataProfile for mock data generation:\n\n{schema.model_dump_json()}",
                DataProfile,
                **llm_kwargs,
            ))

        if not real_rows:
            insights_output, profile_output = await asyncio.gather(*tasks)
        else:
            insights_output = await insights_task
            profile_output = None

        if constraints is not None:
            if not insights_output.candidates:
                raise core.UnsatisfiableConstraintsError(insights_output.fallback_reason)
            filtered = apply_constraints(insights_output.candidates, constraints, schema)
            if not filtered:
                raise core.UnsatisfiableConstraintsError(
                    "No generated insight satisfied the hard constraints."
                )
            insights_output = InsightCandidates(candidates=filtered)

        await self._emit(hooks, "on_insights", InsightsEvent(count=len(insights_output.candidates)))

        # --- chart building ---
        field_labels = {f.jsonPath: f.name for f in schema.fields}
        insights_list = []
        total = len(insights_output.candidates)
        for i, candidate in enumerate(insights_output.candidates):
            await self._emit(
                hooks, "on_chart",
                ChartEvent(index=i, total=total, insight_id=candidate.id, title=candidate.metadata.title),
            )

            rows = real_rows if not use_mock else generate_mock_rows(
                profile_output.model_dump(), seed=1337 + i
            )
            insight = Insight.from_candidate(candidate)
            if use_mock:
                insight.mock_seed = 1337 + i
            plotly_spec = build_plotly_spec(insight, rows, field_labels=field_labels)
            insight.chart_spec.plotlyData = plotly_spec["data"]
            insight.chart_spec.plotlyLayout = plotly_spec["layout"]
            insights_list.append(insight)

        result = Insights(
            insights=insights_list,
            dataset_schema=schema,
            data_profile=profile_output if use_mock else None,
        )
        await self._emit(hooks, "on_complete", CompleteEvent(result))
        return result
