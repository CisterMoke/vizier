"""Tests for the run_pipeline entry point — the library user's main API."""

import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))

from vizier_ai.core import call_llm, run_pipeline
from vizier_ai.models.data_profile import DataColumnSpec, DataProfile
from vizier_ai.models.data_schema import DatasetField, DatasetSchema
from vizier_ai.models.insights import (
    InsightCandidate,
    InsightCandidates,
    InsightMetadata,
    TraceSpec,
)


class TestCallLlmKeyHandling:
    """A missing API key must produce an actionable error naming
    vizier-ai's LLM_API_KEY — not a cryptic AttributeError (which is what
    an empty-string env var caused) or a bare provider error."""

    def test_empty_env_key_raises_friendly_error(self, monkeypatch):
        import pytest
        from pydantic_ai.exceptions import UserError

        monkeypatch.setenv("LLM_API_KEY", "")
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

        with pytest.raises(UserError, match="LLM_API_KEY"):
            asyncio.run(call_llm("sys", "prompt", DatasetSchema))

    def test_missing_env_key_error_mentions_llm_api_key(self, monkeypatch):
        import pytest
        from pydantic_ai.exceptions import UserError

        monkeypatch.delenv("LLM_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

        with pytest.raises(UserError, match="LLM_API_KEY"):
            asyncio.run(call_llm("sys", "prompt", DatasetSchema))


def make_schema() -> DatasetSchema:
    return DatasetSchema(
        source="orders",
        fields=[DatasetField(name="Region", jsonPath="$['region']", type="string")],
    )


def make_profile() -> DataProfile:
    return DataProfile(columns=[
        DataColumnSpec(name="$.region", generator="category", categories=["EMEA", "APAC"]),
    ])


def make_candidate() -> InsightCandidate:
    return InsightCandidate(
        id="rev-by-region",
        metadata=InsightMetadata(title="Revenue by region", summary="S"),
        traces=[TraceSpec(chart_type="bar", x_axis="$['region']", y_axis="$['region']", aggregation="count")],
    )


class FakeLLM:
    """Stub for vizier_ai.core.call_llm returning canned valid outputs."""

    def __init__(self):
        self.calls = []
        self.prompts = []

    async def __call__(self, system, prompt, output_type, *, model=None, api_key=None):
        self.calls.append({"output_type": output_type})
        self.prompts.append(prompt)
        if output_type is DatasetSchema:
            return make_schema()
        if output_type is DataProfile:
            return make_profile()
        return InsightCandidates(candidates=[make_candidate()])


class TestRunPipelineNoData:
    """run_pipeline's signature defaults real_data to None — the library's
    headline no-data path (generate ideas from a text description alone)."""

    def test_no_real_data_uses_mock_path(self, monkeypatch):
        fake = FakeLLM()
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)

        result = asyncio.run(run_pipeline("orders table with region and revenue"))

        assert len(result.insights) == 1
        insight = result.insights[0]
        assert insight.mock_seed is not None
        assert insight.chart_spec.plotlyData, "plotly data must be pre-built"
        assert insight.chart_spec.plotlyLayout
        assert result.data_profile is not None, "mock path must return the profile"

    def test_empty_rows_dict_uses_mock_path(self, monkeypatch):
        fake = FakeLLM()
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)

        result = asyncio.run(run_pipeline("orders", {"rows": []}))

        assert result.data_profile is not None


class TestFetchers:
    """REST/SQL fetchers return the parser dict contract directly — the same
    shape parse_data produces and run_pipeline accepts."""

    def _sqlite_db(self, tmp_path):
        import sqlite3

        db = tmp_path / "sales.db"
        conn = sqlite3.connect(db)
        conn.execute("CREATE TABLE orders (region TEXT, revenue REAL)")
        conn.executemany("INSERT INTO orders VALUES (?, ?)", [("EMEA", 10.0), ("APAC", 20.0)])
        conn.commit()
        conn.close()
        return f"sqlite:///{db}"

    def test_fetch_sql_data_returns_parser_dict(self, tmp_path):
        from vizier_ai import fetch_sql_data

        data = asyncio.run(fetch_sql_data(self._sqlite_db(tmp_path), "SELECT * FROM orders"))

        assert data["format"] == "json"
        assert data["columns"] == ["region", "revenue"]
        assert data["rowCount"] == 2
        assert data["rows"][0] == {"region": "EMEA", "revenue": 10.0}

    def test_sniff_json_array(self):
        from vizier_ai.core import _parse_payload

        data = _parse_payload('[{"region": "EMEA"}]')

        assert data["format"] == "json"
        assert data["rowCount"] == 1

    def test_sniff_jsonl(self):
        from vizier_ai.core import _parse_payload

        data = _parse_payload('{"region": "EMEA"}\n{"region": "APAC"}\n')

        assert data["format"] == "jsonl"
        assert data["rowCount"] == 2

    def test_sniff_csv(self):
        from vizier_ai.core import _parse_payload

        data = _parse_payload("region,revenue\nEMEA,10\n")

        assert data["format"] == "csv"
        assert data["rowCount"] == 1

    def test_fetch_rest_data_returns_parser_dict(self):
        import json as _json
        import threading
        from http.server import HTTPServer, SimpleHTTPRequestHandler

        from vizier_ai import fetch_rest_data

        payload = _json.dumps([{"region": "EMEA", "revenue": 10.0}]).encode()

        class Handler(SimpleHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, *args):
                pass

        server = HTTPServer(("127.0.0.1", 0), Handler)
        port = server.server_address[1]
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            data = asyncio.run(fetch_rest_data(
                "GET", f"http://127.0.0.1:{port}/orders", {"X-Test": "1"}, "",
            ))
        finally:
            server.shutdown()

        assert data["format"] == "json"
        assert data["rowCount"] == 1
        assert data["rows"][0]["region"] == "EMEA"

    def test_run_pipeline_accepts_dataframe(self, monkeypatch):
        import pandas as pd

        fake = FakeLLM()
        monkeypatch.setattr("vizier_ai.core.call_llm", fake)

        df = pd.DataFrame({"region": ["EMEA", "APAC"], "revenue": [10.0, 20.0]})
        result = asyncio.run(run_pipeline("sales", df))

        assert result.data_profile is None, "real rows must flow through, not mock"
        assert "EMEA" in fake.prompts[0], "sample rows must reach the schema prompt"
