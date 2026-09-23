"""Tests for API-layer constraint wiring."""

import asyncio
import json
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).parents[1]))

from vizier_ai.models.bundle import InsightBundle, SavedInsight
from vizier_ai.models.constraints import InsightConstraints
from vizier_ai.models.data_profile import DataColumnSpec, DataProfile
from vizier_ai.models.data_schema import DatasetField, DatasetSchema
from vizier_ai.models.insights import ChartSpec, Insights, Insight, InsightMetadata, TraceSpec
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


@pytest.mark.skipif(not HAS_FASTAPI, reason="fastapi not installed")
class TestCsvOptionsEndpoints:
    @pytest.fixture
    def captured(self, monkeypatch):
        calls = []

        async def fake_pipeline(schema_text, real_data=None, *, constraints=None, **kwargs):
            calls.append({"schema_text": schema_text, "real_data": real_data})
            return Insights(insights=[])

        monkeypatch.setattr("vizier_ai.ui.app.run_pipeline", fake_pipeline)
        return calls

    @pytest.fixture
    def client(self, captured):
        from fastapi.testclient import TestClient

        from vizier_ai.ui.app import app

        return TestClient(app)

    def test_generate_upload_applies_csv_options(self, client, captured):
        csv_content = "county;total\nKing;100\nPierce;200"

        response = client.post(
            "/api/generate-upload",
            files={"file": ("data.csv", csv_content.encode(), "text/csv")},
            data={
                "schemaText": "counties",
                "fileFormat": "csv",
                "csvOptions": '{"delimiter": ";"}',
            },
        )

        assert response.status_code == 200
        real_data = captured[0]["real_data"]
        assert real_data["columns"] == ["county", "total"]
        assert real_data["rowCount"] == 2
        # The options are echoed back so the client can persist them in a bundle
        assert response.json()["csv_options"]["delimiter"] == ";"

    def test_load_bundle_uses_csv_options_saved_in_bundle(self, client):
        bundle = json.loads(make_bundle_json(mock=False))
        bundle["csv_options"] = {"delimiter": ";"}
        csv_content = "county;count\nKing;5\nPierce;10"

        response = client.post(
            "/api/load-bundle",
            files={
                "bundle": ("bundle.json", json.dumps(bundle).encode(), "application/json"),
                "data": ("data.csv", csv_content.encode(), "text/csv"),
            },
            data={"dataFormat": "csv"},
        )

        assert response.status_code == 200
        trace = response.json()["insights"][0]["chart_spec"]["plotlyData"][0]
        assert trace["x"] == ["King", "Pierce"]

    def test_load_bundle_request_csv_options_override_saved(self, client):
        bundle = json.loads(make_bundle_json(mock=False))
        bundle["csv_options"] = {"delimiter": "|"}
        csv_content = "county;count\nKing;5\nPierce;10"

        response = client.post(
            "/api/load-bundle",
            files={
                "bundle": ("bundle.json", json.dumps(bundle).encode(), "application/json"),
                "data": ("data.csv", csv_content.encode(), "text/csv"),
            },
            data={
                "dataFormat": "csv",
                "csvOptions": '{"delimiter": ";"}',
            },
        )

        assert response.status_code == 200
        trace = response.json()["insights"][0]["chart_spec"]["plotlyData"][0]
        assert trace["x"] == ["King", "Pierce"]

    def test_generate_upload_rejects_invalid_csv_options(self, client, captured):
        response = client.post(
            "/api/generate-upload",
            files={"file": ("data.csv", b"a,b\n1,2", "text/csv")},
            data={
                "schemaText": "counties",
                "fileFormat": "csv",
                "csvOptions": '{"delimiter": ";;"}',
            },
        )

        assert response.status_code == 422
        assert "Invalid CSV options" in response.json()["detail"]

    def test_load_bundle_applies_csv_options(self, client):
        csv_content = "county;count\nKing;5\nPierce;10"

        response = client.post(
            "/api/load-bundle",
            files={
                "bundle": ("bundle.json", make_bundle_json(mock=False).encode(), "application/json"),
                "data": ("data.csv", csv_content.encode(), "text/csv"),
            },
            data={
                "dataFormat": "csv",
                "csvOptions": '{"delimiter": ";"}',
            },
        )

        assert response.status_code == 200
        trace = response.json()["insights"][0]["chart_spec"]["plotlyData"][0]
        assert trace["x"] == ["King", "Pierce"]

    def test_load_bundle_without_csv_options_yields_empty_rows(self, client):
        csv_content = "county;count\nKing;5\nPierce;10"

        response = client.post(
            "/api/load-bundle",
            files={
                "bundle": ("bundle.json", make_bundle_json(mock=False).encode(), "application/json"),
                "data": ("data.csv", csv_content.encode(), "text/csv"),
            },
            data={"dataFormat": "csv"},
        )

        assert response.status_code == 200
        warnings = response.json().get("warnings") or []
        assert any("$.county" in w for w in warnings)


def make_large_insights_result(point_count: int = 10) -> Insights:
    points = list(range(point_count))
    insight = Insight(
        id="ins-1",
        metadata=InsightMetadata(title="T", summary="S", keyIdea="K"),
        chart_spec=ChartSpec(
            traces=[TraceSpec(chart_type="bar", x_axis="$.x", y_axis="$.y")],
            plotlyData=[{"type": "bar", "x": points, "y": points}],
            plotlyLayout={"title": {"text": "T"}},
        ),
    )
    return Insights(insights=[insight])


@pytest.mark.skipif(not HAS_FASTAPI, reason="fastapi not installed")
class TestSessionInsights:
    """Sessions store recipe-only insights, served by the static SVG endpoint."""

    @pytest.fixture
    def client(self, monkeypatch):
        from fastapi.testclient import TestClient

        from vizier_ai.ui import static_render
        from vizier_ai.ui.app import app

        monkeypatch.setattr(static_render, "_KALEIDO_IMPORT_ERROR", None)
        monkeypatch.setattr(
            static_render, "render_static_svg", lambda spec: "<svg>stub</svg>"
        )

        return TestClient(app)

    def upload_csv(self, client, monkeypatch, result):
        async def fake_pipeline(schema_text, real_data=None, *, constraints=None, **kwargs):
            return result

        monkeypatch.setattr("vizier_ai.ui.app.run_pipeline", fake_pipeline)

        return client.post(
            "/api/generate-upload",
            files={"file": ("data.csv", b"x,y\n1,2\n3,4", "text/csv")},
            data={"schemaText": "numbers", "fileFormat": "csv"},
        )

    def test_session_stores_recipe_only_insights(self, client, monkeypatch):
        response = self.upload_csv(client, monkeypatch, make_large_insights_result())
        session_id = response.json()["sessionId"]

        from vizier_ai.ui.sessions import _get_session

        stored = _get_session(session_id)["insights"]
        assert stored[0].chart_spec.plotlyData is None
        assert stored[0].chart_spec.traces[0].x_axis == "$.x"

    def test_svg_endpoint_renders_insight(self, client, monkeypatch):
        response = self.upload_csv(client, monkeypatch, make_large_insights_result())
        body = response.json()

        svg = client.get(
            f"/api/session/{body['sessionId']}/insight/ins-1/svg"
        )

        assert svg.status_code == 200
        assert svg.headers["content-type"] == "image/svg+xml"
        assert svg.text == "<svg>stub</svg>"

    def test_svg_endpoint_unknown_session(self, client):
        response = client.get("/api/session/missing/insight/ins-1/svg")
        assert response.status_code == 404

    def test_svg_endpoint_unknown_insight(self, client, monkeypatch):
        response = self.upload_csv(client, monkeypatch, make_large_insights_result())
        session_id = response.json()["sessionId"]

        assert client.get(
            f"/api/session/{session_id}/insight/nope/svg"
        ).status_code == 404

    def test_svg_endpoint_requires_session_rows(self, client, monkeypatch):
        async def fake_pipeline(schema_text, real_data=None, *, constraints=None, **kwargs):
            return make_large_insights_result()

        monkeypatch.setattr("vizier_ai.ui.app.run_pipeline", fake_pipeline)
        response = client.post("/api/generate", json={"schemaText": "numbers"})
        session_id = response.json()["sessionId"]

        assert client.get(
            f"/api/session/{session_id}/insight/ins-1/svg"
        ).status_code == 404

    def test_regenerate_updates_stored_insights(self, client, monkeypatch):
        response = self.upload_csv(client, monkeypatch, make_large_insights_result())
        session_id = response.json()["sessionId"]

        async def fake_pipeline(schema_text, real_data=None, *, constraints=None, **kwargs):
            return make_large_insights_result(point_count=3)

        monkeypatch.setattr("vizier_ai.ui.app.run_pipeline", fake_pipeline)
        client.post("/api/regenerate", json={"sessionId": session_id})

        from vizier_ai.ui.sessions import _get_session

        stored = _get_session(session_id)["insights"]
        assert stored[0].chart_spec.plotlyData is None


@pytest.mark.skipif(not HAS_FASTAPI, reason="fastapi not installed")
class TestRateLimitExemptions:
    """Rate limits protect the LLM API only: page loads (static assets,
    config) must never consume the budget."""

    @pytest.fixture
    def tight_client(self, monkeypatch):
        from fastapi.testclient import TestClient

        from vizier_ai.ui import app as app_module
        from vizier_ai.ui.ratelimit import RateLimiter, RateLimitConfig

        tight = RateLimiter(RateLimitConfig(max_requests=3, window_seconds=60))
        monkeypatch.setattr(app_module, "_per_ip_limiter", tight)
        return TestClient(app_module.app)

    def test_static_requests_are_not_limited(self, tight_client):
        statuses = [tight_client.get("/").status_code for _ in range(6)]
        assert all(status != 429 for status in statuses)

    def test_config_endpoint_is_not_limited(self, tight_client):
        statuses = [tight_client.get("/api/config").status_code for _ in range(6)]
        assert all(status != 429 for status in statuses)

    def test_api_requests_still_limited(self, tight_client):
        for _ in range(3):
            assert tight_client.get("/api/session/s/insight/i/svg").status_code == 404

        response = tight_client.get("/api/session/s/insight/i/svg")
        assert response.status_code == 429
