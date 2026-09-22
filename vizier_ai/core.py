"""Core library — standalone chart brainstorming and generation.

This module contains all the library-grade logic with zero FastAPI/HTTP
dependencies. It can be used independently as a Python library:

    from vizier_ai.core import run_pipeline, call_llm, build_plotly_spec

The LLM model and API key are injectable via parameters with env-based
defaults. Prompts are overridable constants.
"""

import aiohttp
import asyncio
import json
import os
import pandas as pd

from typing import TypeVar

from pydantic_ai import Agent
from pydantic_ai.models import infer_model
from pydantic_ai.providers import infer_provider_class

from vizier_ai.chart_builder import build_plotly_spec
from vizier_ai.constraints import apply_constraints
from vizier_ai.mock_data import generate_mock_rows
from vizier_ai.models.insights import (
    ConstrainedInsightCandidates,
    InsightCandidates,
    Insight,
    Insights
)
from vizier_ai.models.data_schema import DatasetSchema
from vizier_ai.models.data_profile import DataProfile
from vizier_ai.models.constraints import InsightConstraints
from vizier_ai.prompts import (
    DEFAULT_SCHEMA_SYSTEM_PROMPT,
    DEFAULT_INSIGHT_SYSTEM_PROMPT,
    DEFAULT_DATA_PROFILE_SYSTEM_PROMPT,
    DEFAULT_CONSTRAINT_FAILSAFE_INSTRUCTION,
)


T = TypeVar("T", covariant=True)


class UnsatisfiableConstraintsError(ValueError):
    """Raised when insight generation constraints cannot be satisfied."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


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


async def call_llm(
    system: str,
    prompt: str,
    output_type: type[T],
    *,
    model: str | None = None,
    api_key: str | None = None,
) -> T:
    """Call LLM via pydantic-ai with structured output.

    Args:
        system: System prompt for the LLM.
        prompt: User prompt for the LLM.
        output_type: Pydantic model class for structured output.
        model: LLM model string (e.g. "google:gemini-3.5-flash-lite").
               Defaults to env LLM_MODEL or "google:gemini-3.5-flash-lite".
        api_key: API key for the LLM provider.
                Defaults to env LLM_API_KEY.

    Returns:
        The validated output as a plain dict (via model_dump).
    """
    model_str = model or os.getenv("LLM_MODEL", "google:gemini-3.5-flash-lite")
    key = api_key or os.getenv("LLM_API_KEY")

    llm_model = infer_model(model_str, lambda s: infer_provider_class(s)(api_key=key))

    agent = Agent(llm_model, system_prompt=system, output_type=output_type)
    result = await agent.run(user_prompt=prompt)

    return result.output


# --- Data fetching ---

async def fetch_rest_data(method: str, url: str, headers: str, body: str) -> str:
    """Fetch data from a REST API using aiohttp."""
    parsed_headers: dict[str, str] = {}
    if headers:
        parsed_headers = json.loads(headers)

    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
        async with session.request(
            method,
            url,
            headers=parsed_headers,
            data=body.encode() if body else None,
        ) as resp:
            resp.raise_for_status()
            return await resp.text()


async def fetch_sql_data(connection_string: str, query: str) -> str:
    """Execute a SQL query and return results as JSON using pandas."""
    from sqlalchemy import create_engine, text

    engine = create_engine(connection_string)
    with engine.connect() as conn:
        df = pd.read_sql(text(query), conn)

    return df.to_json(orient="records", force_ascii=False)

# --- Pipeline ---

async def run_pipeline(
    schema_text: str,
    real_data: dict | None = None,
    *,
    model: str | None = None,
    api_key: str | None = None,
    schema_system_prompt: str | None = None,
    insight_prompt: str | None = None,
    data_profile_system_prompt: str | None = None,
    constraints: InsightConstraints | None = None,
) -> Insights:
    """Run the full LLM pipeline and build Plotly specs.

    1. Call LLM to extract a dataset schema from the text description.
    2. Call LLM to generate insights from the schema.
    3. If no real data: call LLM to generate a data profile from the schema,
       then generate mock rows from that profile for chart building.
    4. Build Plotly specs for each insight.

    Args:
        schema_text: Free-form text description of the dataset.
        real_data: Parsed data dict (from parse_data) or None.
        model: LLM model string (e.g. "google:gemini-3.5-flash-lite").
        api_key: API key for the LLM provider.
        schema_system_prompt: Override the default schema-mapping prompt.
        insight_prompt: Override the default insight-generation prompt.
        data_profile_system_prompt: Override the default data-profile prompt.
        constraints: Optional hard/soft constraints for the insight generation
            (chart types, fields, guidance). When given, the model may reply
            with a fallback reason instead of insights if the constraints
            cannot be satisfied; UnsatisfiableConstraintsError is raised then.

    Returns:
        dict with shape: { "insights": { "insights": [...] } }
        Each insight has plotlyData/plotlyLayout pre-built.
    """
    schema_system = schema_system_prompt or DEFAULT_SCHEMA_SYSTEM_PROMPT
    insight_system = insight_prompt or DEFAULT_INSIGHT_SYSTEM_PROMPT
    profile_system = data_profile_system_prompt or DEFAULT_DATA_PROFILE_SYSTEM_PROMPT


    real_rows = real_data.get("rows", [])
    use_mock = len(real_rows) == 0
    llm_kwargs = {"model": model, "api_key": api_key}

    schema_prompt = f"Analyze this data description and extract the dataset schema:\n\n{schema_text}"
    if not use_mock:
        schema_prompt += f"\nHere are some data samples:\n{'\n'.join([json.dumps(row, ensure_ascii=False) for row in real_rows[:3]])}"

    schema = await call_llm(
        schema_system,
        schema_prompt,
        DatasetSchema,
        **llm_kwargs,
    )

    insight_output_type: type = InsightCandidates
    constraint_block = ""
    if constraints is not None:
        insight_output_type = ConstrainedInsightCandidates
        constraint_block = _build_constraint_block(constraints)

    insight_prompt = f"Given this dataset schema, produce up to 10 insight candidates:{constraint_block}\n\n{schema.model_dump_json()}"

    insights_task = call_llm(
        insight_system,
        insight_prompt,
        insight_output_type,
        **llm_kwargs,
    )
    tasks = [insights_task]
    if use_mock:
        profile_task = call_llm(
            profile_system,
            f"Given this dataset schema, generate a dataProfile for mock data generation:\n\n{schema.model_dump_json()}",
            DataProfile,
            **llm_kwargs,
        )
        tasks.append(profile_task)

    if not real_rows:
        insights_output, profile_output = await asyncio.gather(*tasks)
    else:
        insights_output = await insights_task

    if constraints is not None:
        if not insights_output.candidates:
            raise UnsatisfiableConstraintsError(
                insights_output.fallback_reason or "The hard constraints could not be satisfied."
            )
        filtered = apply_constraints(insights_output.candidates, constraints, schema)
        if not filtered:
            raise UnsatisfiableConstraintsError(
                "No generated insight satisfied the hard constraints."
            )
        insights_output = InsightCandidates(candidates=filtered)

    insights_list = []
    for i, candidate in enumerate(insights_output.candidates):
        rows = real_rows if not use_mock else generate_mock_rows(profile_output.model_dump(), seed=1337 + i)

        insight = Insight.from_candidate(candidate)
        if use_mock:
            insight.mock_seed = 1337 + i
        plotly_spec = build_plotly_spec(insight, rows)
        insight.chart_spec.plotlyData = plotly_spec["data"]
        insight.chart_spec.plotlyLayout = plotly_spec["layout"]
        insights_list.append(insight)

    return Insights(
        insights=insights_list,
        dataset_schema=schema,
        data_profile=profile_output if use_mock else None,
    )
