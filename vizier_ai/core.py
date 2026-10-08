"""Core library — standalone chart brainstorming and generation.

This module contains all the library-grade logic with zero FastAPI/HTTP
dependencies. It can be used independently as a Python library:

    from vizier_ai.core import run_pipeline, call_llm

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
from pydantic_ai.exceptions import UserError
from pydantic_ai.models import infer_model
from pydantic_ai.providers import infer_provider_class

from vizier_ai.models.constraints import InsightConstraints
from vizier_ai.models.insights import Insights
from vizier_ai.parser import _df_to_result, parse_data
from vizier_ai.prompts import (
    DEFAULT_SCHEMA_SYSTEM_PROMPT,
    DEFAULT_INSIGHT_SYSTEM_PROMPT,
    DEFAULT_DATA_PROFILE_SYSTEM_PROMPT,
)


T = TypeVar("T", covariant=True)


class UnsatisfiableConstraintsError(ValueError):
    """Raised when insight generation constraints cannot be satisfied."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


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
        The validated output as an instance of ``output_type``.
    """
    model_str = model or os.getenv("LLM_MODEL", "google:gemini-3.5-flash-lite")
    key = api_key or os.getenv("LLM_API_KEY")
    if key is not None and not key.strip():
        # An empty env var must behave like an unset one, not leak an
        # empty string into provider construction (cryptic failures).
        key = None

    try:
        llm_model = infer_model(model_str, lambda s: infer_provider_class(s)(api_key=key))
    except UserError as exc:
        raise UserError(
            f"{exc.args[0] if exc.args else exc} "
            f"(vizier-ai: set the LLM_API_KEY environment variable, or pass "
            f"api_key=... to run_pipeline/call_llm.)"
        ) from exc

    agent = Agent(llm_model, system_prompt=system, output_type=output_type)
    result = await agent.run(user_prompt=prompt)

    return result.output


# --- Data fetching ---

def _sniff_format(text: str) -> str:
    """Infer the payload format of a fetched response: json, jsonl, or csv."""
    stripped = text.lstrip()
    if stripped.startswith("[") or stripped.startswith("{"):
        try:
            json.loads(text)
            return "json"
        except json.JSONDecodeError:
            return "jsonl"
    return "csv"


def _parse_payload(text: str, max_rows: int | None = None) -> dict:
    """Parse a fetched response into the parser dict contract, sniffing the format."""
    return parse_data(text, _sniff_format(text), max_rows=max_rows)


async def fetch_rest_data(method: str, url: str, headers: str | dict | None, body: str | None = None) -> dict:
    """Fetch data from a REST API and parse it into the standard data dict.

    ``headers`` may be a dict or a JSON object string. The response format
    (JSON, JSONL, or CSV) is sniffed automatically.
    """
    parsed_headers: dict[str, str] = {}
    if headers:
        parsed_headers = headers if isinstance(headers, dict) else json.loads(headers)

    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
        async with session.request(
            method,
            url,
            headers=parsed_headers,
            data=body.encode() if body else None,
        ) as resp:
            resp.raise_for_status()
            text = await resp.text()

    return _parse_payload(text)


async def fetch_sql_data(connection_string: str, query: str) -> dict:
    """Execute a SQL query and return the standard data dict."""
    from sqlalchemy import create_engine, text

    engine = create_engine(connection_string)
    try:
        with engine.connect() as conn:
            df = pd.read_sql(text(query), conn)
    finally:
        engine.dispose()

    return _df_to_result(df, "json")

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

    Functional one-shot counterpart of ``Vizier``: constructs a bare
    ``Vizier`` with the given options and runs it once.

    Args:
        schema_text: Free-form text description of the dataset.
        real_data: Parsed data dict (from parse_data or the fetchers), a
            pandas DataFrame, or None (mock-data path).
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
        An ``Insights`` object. Each ``result.insights[i]`` carries its
        pre-built Plotly spec in ``chart_spec.plotlyData`` /
        ``chart_spec.plotlyLayout``; render with ``insight.show()`` (browser
        or inline), ``insight.figure()``, or ``result.save_html(directory)``
        (requires ``vizier-ai[plot]``). ``dataset_schema`` and
        ``data_profile`` are included so the result can be saved to a bundle
        and re-rendered later.
    """
    from vizier_ai.pipeline import Vizier

    return await Vizier(
        model=model,
        api_key=api_key,
        schema_system_prompt=schema_system_prompt,
        insight_prompt=insight_prompt,
        data_profile_system_prompt=data_profile_system_prompt,
        constraints=constraints,
    ).run(schema_text, data=real_data)
