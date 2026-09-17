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
from vizier_ai.mock_data import generate_mock_rows
from vizier_ai.models.insights import (
    InsightCandidates,
    Insight,
    Insights
)
from vizier_ai.models.data_schema import DatasetSchema
from vizier_ai.models.data_profile import DataProfile
from vizier_ai.prompts import (
    DEFAULT_SCHEMA_SYSTEM_PROMPT,
    DEFAULT_INSIGHT_SYSTEM_PROMPT,
    DEFAULT_DATA_PROFILE_SYSTEM_PROMPT,
)


T = TypeVar("T", covariant=True)


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
        schema_prompt += f"\nHere are some data samples:\n{'\n'.join(real_rows[:3])}"

    schema = await call_llm(
        schema_system,
        schema_prompt,
        DatasetSchema,
        **llm_kwargs,
    )

    insight_prompt = f"Given this dataset schema, produce up to 10 insight candidates:\n\n{json.dumps(schema)}"

    insights_task = call_llm(
        insight_system,
        insight_prompt,
        InsightCandidates,
        **llm_kwargs,
    )
    tasks = [insights_task]
    if use_mock:
        profile_task = call_llm(
            profile_system,
            f"Given this dataset schema, generate a dataProfile for mock data generation:\n\n{json.dumps(schema)}",
            DataProfile,
            **llm_kwargs,
        )
        tasks.append(profile_task)

    if not real_rows:
        insights_output, profile_output = await asyncio.gather(*tasks)
    else:
        insights_output = await insights_task
    
    insights_list = []
    for i, candidate in enumerate(insights_output.candidates):
        rows = real_rows if not use_mock else generate_mock_rows(profile_output, seed=1337 + i)

        insight = Insight.from_candidate(candidate)
        plotly_spec = build_plotly_spec(insight, rows)
        insight.chart_spec.plotlyData = plotly_spec["data"]
        insight["plotlyLayout"] = plotly_spec["layout"]

    return {
        "insights": {"insights": insights_list},
    }
