"""Tests for API-layer constraint wiring."""

import asyncio
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).parents[1]))

from vizier_ai.models.bundle import InsightBundle, SavedInsight
from vizier_ai.models.constraints import InsightConstraints
from vizier_ai.models.data_profile import DataColumnSpec, DataProfile
from vizier_ai.models.data_schema import DatasetField, DatasetSchema
from vizier_ai.models.insights import Insights, InsightMetadata, TraceSpec
from vizier_ai.ui.models.api import GenerateRequest, RegenerateRequest


class TestRequestModels:
    def test_generate_request_accepts_constraints(self):
        request = GenerateRequest.model_validate({
            "schemaText": "orders",
            "constraints": {
                "include_chart_types": ["bar", "line"],
                "guidance": "focus on trends",
            },
        })

        assert request.constraints is not None
        assert request.constraints.include_chart_types == ["bar", "line"]
        assert request.constraints.guidance == "focus on trends"

    def test_generate_request_constraints_default_to_none(self):
        request = GenerateRequest.model_validate({"schemaText": "orders"})

        assert request.constraints is None

    def test_generate_request_rejects_unknown_chart_type(self):
        with pytest.raises(ValidationError):
            GenerateRequest.model_validate({
                "schemaText": "orders",
                "constraints": {"include_chart_types": ["donut"]},
            })

    def test_regenerate_request_accepts_constraints(self):
        request = RegenerateRequest.model_validate({
            "sessionId": "abc",
            "constraints": {"exclude_fields": ["id"]},
        })

        assert request.constraints is not None
        assert request.constraints.exclude_fields == ["id"]


try:
    import fastapi  # noqa: F401

    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False


def make_insights_result() -> Insights:
    return Insights(insights=[])


@pytest.mark.skipif(not HAS_FASTAPI, reason="fastapi not installed")
class TestConstraintsEndpoints:
    @pytest.fixture
    def captured(self, monkeypatch):
        calls = []

        async def fake_pipeline(schema_text, real_data=None, *, constraints=None, **kwargs):
            calls.append({"schema_text": schema_text, "real_data": real_data, "constraints": constraints})
            return make_insights_result()

        monkeypatch.setattr("vizier_ai.ui.app.run_pipeline", fake_pipeline)
        return calls

    @pytest.fixture
    def client(self, captured):
        from fastapi.testclient import TestClient

        from vizier_ai.ui.app import app

        return TestClient(app)

    def test_generate_passes_constraints_to_pipeline(self, client, captured):
        response = client.post("/api/generate", json={
            "schemaText": "orders",
            "dataSourceMode": "none",
            "constraints": {"include_chart_types": ["bar"], "guidance": "compare regions"},
        })

        assert response.status_code == 200
        assert captured[0]["constraints"] == InsightConstraints(
            include_chart_types=["bar"], guidance="compare regions"
        )

    def test_generate_without_constraints_passes_none(self, client, captured):
        response = client.post("/api/generate", json={
            "schemaText": "orders",
            "dataSourceMode": "none",
        })

        assert response.status_code == 200
        assert captured[0]["constraints"] is None

    def test_generate_rejects_invalid_chart_type(self, client, captured):
        response = client.post("/api/generate", json={
            "schemaText": "orders",
            "dataSourceMode": "none",
            "constraints": {"include_chart_types": ["donut"]},
        })

        assert response.status_code == 422

    def test_regenerate_passes_constraints_to_pipeline(self, client, captured, monkeypatch):
        from vizier_ai.ui.sessions import _create_session

        session_id = _create_session(None, "orders")

        response = client.post("/api/regenerate", json={
            "sessionId": session_id,
            "constraints": {"exclude_chart_types": ["pie"]},
        })

        assert response.status_code == 200
        assert captured[0]["constraints"] == InsightConstraints(exclude_chart_types=["pie"])

    def test_unsatisfiable_constraints_map_to_422(self, client, captured, monkeypatch):
        from vizier_ai.core import UnsatisfiableConstraintsError

        async def failing_pipeline(schema_text, real_data=None, *, constraints=None, **kwargs):
            raise UnsatisfiableConstraintsError("No geographic fields in the schema")

        monkeypatch.setattr("vizier_ai.ui.app.run_pipeline", failing_pipeline)

        response = client.post("/api/generate", json={
            "schemaText": "orders",
            "dataSourceMode": "none",
            "constraints": {"include_chart_types": ["geomap"]},
        })

        assert response.status_code == 422
        assert "No geographic fields" in response.json()["detail"]


def make_bundle_json(mock: bool) -> str:
    bundle = InsightBundle(
        dataset_schema=DatasetSchema(
            source="test",
            fields=[DatasetField(name="County", jsonPath="$.county")],
        ),
        data_profile=DataProfile(columns=[
            DataColumnSpec(name="$.county", generator="category", categories=["King", "Pierce"]),
        ]) if mock else None,
        insights=[SavedInsight(
            id="i1",
            metadata=InsightMetadata(title="Counties", summary="S", keyIdea="K"),
            traces=[TraceSpec(chart_type="bar", x_axis="$.county", y_axis="$.county")],
            mock_seed=1337 if mock else None,
        )],
    )
    return bundle.model_dump_json()


@pytest.mark.skipif(not HAS_FASTAPI, reason="fastapi not installed")
class TestLoadBundleEndpoint:
    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient

        from vizier_ai.ui.app import app

        return TestClient(app)

    def test_loads_mock_bundle_without_data(self, client):
        response = client.post("/api/load-bundle", files={
            "bundle": ("bundle.json", make_bundle_json(mock=True).encode(), "application/json"),
        })

        assert response.status_code == 200
        body = response.json()
        assert body["sessionId"]
        assert len(body["insights"]) == 1
        assert body["insights"][0]["chart_spec"]["plotlyData"][0]["x"]
        assert body["dataset_schema"]["fields"][0]["name"] == "County"
        assert body["data_profile"] is not None
        assert body["insights"][0]["mock_seed"] == 1337
        assert body.get("warnings") in ([], None)

    def test_loads_bundle_with_real_data_file(self, client):
        data_json = '[{"county": "King"}, {"county": "Pierce"}]'

        response = client.post(
            "/api/load-bundle",
            files={
                "bundle": ("bundle.json", make_bundle_json(mock=False).encode(), "application/json"),
                "data": ("data.json", data_json.encode(), "application/json"),
            },
            data={"dataFormat": "json"},
        )

        assert response.status_code == 200
        body = response.json()
        trace = body["insights"][0]["chart_spec"]["plotlyData"][0]
        assert trace["x"] == ["King", "Pierce"]
        assert body["data_profile"] is None

    def test_warns_on_incompatible_data_file(self, client):
        data_json = '[{"state": "WA"}]'

        response = client.post(
            "/api/load-bundle",
            files={
                "bundle": ("bundle.json", make_bundle_json(mock=False).encode(), "application/json"),
                "data": ("data.json", data_json.encode(), "application/json"),
            },
            data={"dataFormat": "json"},
        )

        assert response.status_code == 200
        warnings = response.json().get("warnings") or []
        assert any("$.county" in w for w in warnings)

    def test_rejects_invalid_bundle(self, client):
        response = client.post("/api/load-bundle", files={
            "bundle": ("bundle.json", b"{\"version\": 99}", "application/json"),
        })

        assert response.status_code == 422
        assert "Invalid bundle" in response.json()["detail"]
