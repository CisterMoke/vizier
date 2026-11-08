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
from vizier_ai.models.insights import (
    ChartSpec,
    Insight,
    InsightCandidate,
    InsightCandidates,
    InsightMetadata,
    Insights,
    TraceSpec,
)
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


def patch_vizier(monkeypatch, result=None, error=None):
    """Replace app.Vizier with a fake; returns the call log."""
    from vizier_ai.ui import app as app_module

    calls = []

    class FakeVizier:
        def __init__(self, *, constraints=None, **kwargs):
            self._constraints = constraints

        async def run(self, schema_text, *, data=None, **kwargs):
            calls.append({
                "schema_text": schema_text,
                "real_data": data,
                "constraints": self._constraints,
            })
            if error is not None:
                raise error
            return result if result is not None else make_insights_result()

    monkeypatch.setattr(app_module, "Vizier", FakeVizier)
    return calls


def stream_events(response):
    """Parse an NDJSON streaming response into its events."""
    return [json.loads(line) for line in response.text.strip().splitlines() if line.strip()]


def complete_payload(response):
    events = stream_events(response)
    assert events[-1]["type"] == "complete", events
    return events[-1]["payload"]


@pytest.mark.skipif(not HAS_FASTAPI, reason="fastapi not installed")
class TestConstraintsEndpoints:
    @pytest.fixture
    def captured(self, monkeypatch):
        return patch_vizier(monkeypatch)

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

    def test_regenerate_keeps_previous_session_insights(self, client, captured, monkeypatch):
        """The client appends regenerate results as new cards, so insights
        from earlier runs must stay resolvable on the session (their
        server-rendered SVGs are fetched by static cards)."""
        from vizier_ai.ui import app as app_module
        from vizier_ai.ui.sessions import _create_session

        def make_insight(insight_id: str) -> Insight:
            return Insight(
                id=insight_id,
                metadata=InsightMetadata(title=insight_id, summary="s"),
                chart_spec=ChartSpec(
                    traces=[TraceSpec(chart_type="bar", x_axis="$.x", y_axis="$.y")],
                    plotlyData=[{"type": "bar", "x": [1], "y": [2]}],
                    plotlyLayout={},
                ),
            )

        rows = {"rowCount": 1, "rows": [{"x": "a", "y": 1}]}
        session_id = _create_session(rows, "orders")

        patch_vizier(monkeypatch, result=Insights(insights=[make_insight("old_chart")]))
        response = client.post("/api/regenerate", json={"sessionId": session_id})
        assert response.status_code == 200
        complete_payload(response)

        patch_vizier(monkeypatch, result=Insights(insights=[make_insight("new_chart")]))
        response = client.post("/api/regenerate", json={"sessionId": session_id})
        assert response.status_code == 200
        complete_payload(response)

        monkeypatch.setattr(app_module.static_render, "render_static_svg", lambda spec: b"<svg/>")
        svg = client.get(f"/api/session/{session_id}/insight/old_chart/svg")
        assert svg.status_code == 200

    def test_unsatisfiable_constraints_stream_error_event(self, client, captured, monkeypatch):
        from vizier_ai.core import UnsatisfiableConstraintsError

        patch_vizier(
            monkeypatch,
            error=UnsatisfiableConstraintsError("No geographic fields in the schema"),
        )

        response = client.post("/api/generate", json={
            "schemaText": "orders",
            "dataSourceMode": "none",
            "constraints": {"include_chart_types": ["geomap"]},
        })

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("application/x-ndjson")
        events = stream_events(response)
        assert events[-1] == {"type": "error", "detail": "No geographic fields in the schema"}


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
            metadata=InsightMetadata(title="Counties", summary="S"),
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
        return patch_vizier(monkeypatch)

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
        assert complete_payload(response)["csv_options"]["delimiter"] == ";"

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

    def test_generate_upload_rejects_malformed_data(self, client, captured):
        response = client.post(
            "/api/generate-upload",
            files={"file": ("data.json", b'{"broken": json', "application/json")},
            data={"schemaText": "counties", "fileFormat": "json"},
        )

        assert response.status_code == 400
        assert "detail" in response.json()

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
        metadata=InsightMetadata(title="T", summary="S"),
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
        patch_vizier(monkeypatch, result=result)

        return client.post(
            "/api/generate-upload",
            files={"file": ("data.csv", b"x,y\n1,2\n3,4", "text/csv")},
            data={"schemaText": "numbers", "fileFormat": "csv"},
        )

    def test_session_stores_recipe_only_insights(self, client, monkeypatch):
        response = self.upload_csv(client, monkeypatch, make_large_insights_result())
        session_id = complete_payload(response)["sessionId"]

        from vizier_ai.ui.sessions import _get_session

        stored = _get_session(session_id)["insights"]
        assert stored[0].chart_spec.plotlyData is None
        assert stored[0].chart_spec.traces[0].x_axis == "$.x"

    def test_svg_endpoint_renders_insight(self, client, monkeypatch):
        response = self.upload_csv(client, monkeypatch, make_large_insights_result())
        body = complete_payload(response)

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
        session_id = complete_payload(response)["sessionId"]

        assert client.get(
            f"/api/session/{session_id}/insight/nope/svg"
        ).status_code == 404

    def test_svg_endpoint_requires_session_rows(self, client, monkeypatch):
        patch_vizier(monkeypatch, result=make_large_insights_result())
        response = client.post("/api/generate", json={"schemaText": "numbers"})
        session_id = complete_payload(response)["sessionId"]

        assert client.get(
            f"/api/session/{session_id}/insight/ins-1/svg"
        ).status_code == 404

    def test_regenerate_updates_stored_insights(self, client, monkeypatch):
        response = self.upload_csv(client, monkeypatch, make_large_insights_result())
        session_id = complete_payload(response)["sessionId"]

        patch_vizier(monkeypatch, result=make_large_insights_result(point_count=3))
        client.post("/api/regenerate", json={"sessionId": session_id})

        from vizier_ai.ui.sessions import _get_session

        stored = _get_session(session_id)["insights"]
        assert stored[0].chart_spec.plotlyData is None


class FakeProgressLLM:
    """Canned LLM for exercising the real Vizier pipeline through the API."""

    def __init__(self, schema=None):
        self.schema = schema

    async def __call__(self, system, prompt, output_type, *, model=None, api_key=None):
        if output_type is DatasetSchema:
            return self.schema or DatasetSchema(
                source="numbers",
                fields=[
                    DatasetField(name="X", jsonPath="$['x']", type="number"),
                    DatasetField(name="Y", jsonPath="$['y']", type="number"),
                ],
            )
        if output_type is DataProfile:
            return DataProfile(columns=[
                DataColumnSpec(name="$.x", generator="uniform", min=0, max=10),
                DataColumnSpec(name="$.y", generator="uniform", min=0, max=10),
            ])
        return InsightCandidates(candidates=[
            InsightCandidate(
                id="chart-1",
                metadata=InsightMetadata(title="Y by X", summary="S"),
                traces=[TraceSpec(chart_type="bar", x_axis="$['x']", y_axis="$['y']")],
            ),
        ])


@pytest.mark.skipif(not HAS_FASTAPI, reason="fastapi not installed")
class TestGenerationProgressEvents:
    """The generation endpoints pipe the Vizier hook events to the client
    as an NDJSON stream, ending in a complete (or error) event."""

    @pytest.fixture
    def client(self, monkeypatch):
        from fastapi.testclient import TestClient

        from vizier_ai import core as core_module
        from vizier_ai.ui.app import app

        monkeypatch.setattr(core_module, "call_llm", FakeProgressLLM())
        return TestClient(app)

    def test_generate_upload_streams_progress_events(self, client):
        response = client.post(
            "/api/generate-upload",
            files={"file": ("data.csv", b"x,y\n1,2\n3,4", "text/csv")},
            data={"schemaText": "numbers", "fileFormat": "csv"},
        )

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("application/x-ndjson")

        events = stream_events(response)
        assert [e["type"] for e in events] == ["prepare", "schema", "insights", "chart", "complete"]

        # the prepare event fires once the upload is parsed, before the
        # pipeline starts — it marks data preparation as its own (quick) step
        assert events[0] == {"type": "prepare", "rowCount": 2}

        schema_event = events[1]
        assert schema_event["fieldCount"] == 2
        assert schema_event["warnings"] == []
        assert events[2] == {"type": "insights", "count": 1}
        chart_event = events[3]
        assert chart_event["index"] == 0
        assert chart_event["total"] == 1
        assert chart_event["insightId"] == "chart-1"
        assert chart_event["title"] == "Y by X"

        payload = events[4]["payload"]
        assert payload["sessionId"]
        trace = payload["insights"][0]["chart_spec"]["plotlyData"][0]
        assert trace["x"] == [1, 3]

    def test_schema_validation_warnings_reach_schema_event(self, client, monkeypatch):
        from vizier_ai import core as core_module

        monkeypatch.setattr(core_module, "call_llm", FakeProgressLLM(schema=DatasetSchema(
            source="numbers",
            fields=[
                DatasetField(name="X", jsonPath="$['x']", type="number"),
                DatasetField(name="Ghost", jsonPath="$['missing_column']", type="number"),
            ],
        )))

        response = client.post(
            "/api/generate-upload",
            files={"file": ("data.csv", b"x,y\n1,2\n3,4", "text/csv")},
            data={"schemaText": "numbers", "fileFormat": "csv"},
        )

        schema_event = stream_events(response)[1]
        assert any("Ghost" in warning for warning in schema_event["warnings"])

    def test_pipeline_error_streams_error_event(self, client, monkeypatch):
        from vizier_ai import core as core_module

        async def failing_llm(*args, **kwargs):
            raise RuntimeError("LLM is down")

        monkeypatch.setattr(core_module, "call_llm", failing_llm)

        response = client.post(
            "/api/generate-upload",
            files={"file": ("data.csv", b"x,y\n1,2\n3,4", "text/csv")},
            data={"schemaText": "numbers", "fileFormat": "csv"},
        )

        assert response.status_code == 200
        events = stream_events(response)
        assert events[-1] == {"type": "error", "detail": "LLM is down"}

    def test_edit_chart_uses_session_schema_for_axis_labels(self, client):
        upload = client.post(
            "/api/generate-upload",
            files={"file": ("data.csv", b"x,y\n1,2\n3,4", "text/csv")},
            data={"schemaText": "numbers", "fileFormat": "csv"},
        )
        session_id = complete_payload(upload)["sessionId"]

        from vizier_ai.ui.sessions import _get_session
        from vizier_ai.models.data_schema import DatasetSchema

        stored = _get_session(session_id)["dataset_schema"]
        assert isinstance(stored, DatasetSchema)
        assert stored.fields[0].name == "X"

        response = client.post("/api/edit-chart", json={
            "sessionId": session_id,
            "traces": [{"chart_type": "bar", "x_axis": "$['x']", "y_axis": "$['y']"}],
        })

        assert response.status_code == 200
        assert response.json()["plotlyLayout"]["xaxis"]["title"]["text"] == "X"

    def test_generate_streams_events_for_text_only(self, client):
        response = client.post("/api/generate", json={"schemaText": "numbers"})

        events = stream_events(response)
        assert [e["type"] for e in events] == ["prepare", "schema", "insights", "chart", "complete"]
        assert events[0] == {"type": "prepare", "rowCount": 0}
        payload = events[-1]["payload"]
        # mock path: charts render from the generated data profile
        assert len(payload["insights"][0]["chart_spec"]["plotlyData"][0]["x"]) == 200


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

    def test_llm_endpoints_still_limited(self, tight_client):
        for _ in range(3):
            assert tight_client.post("/api/regenerate", json={"sessionId": "s"}).status_code == 404

        response = tight_client.post("/api/regenerate", json={"sessionId": "s"})
        assert response.status_code == 429

    def test_non_llm_api_not_limited(self, tight_client):
        statuses = [tight_client.get("/api/session/s/insight/i/svg").status_code for _ in range(6)]
        assert all(status != 429 for status in statuses)


@pytest.mark.skipif(not HAS_FASTAPI, reason="fastapi not installed")
class TestExcelEndpoints:
    """Excel uploads accept parsing options (sheet, header, skip rows) and
    echo them so the client can persist them in a bundle."""

    @pytest.fixture
    def captured(self, monkeypatch):
        return patch_vizier(monkeypatch)

    @pytest.fixture
    def client(self, captured):
        from fastapi.testclient import TestClient

        from vizier_ai.ui.app import app

        return TestClient(app)

    @staticmethod
    def make_xlsx_bytes():
        from openpyxl import Workbook

        wb = Workbook()
        wb.remove(wb.active)
        data = wb.create_sheet("Data")
        data.append(["county", "count"])
        data.append(["King", 5])
        wb.create_sheet("Notes")
        import io

        buffer = io.BytesIO()
        wb.save(buffer)
        return buffer.getvalue()

    def test_generate_upload_parses_excel_with_options(self, client, captured):
        response = client.post(
            "/api/generate-upload",
            files={"file": ("data.xlsx", self.make_xlsx_bytes(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={
                "schemaText": "counties",
                "fileFormat": "excel",
                "excelOptions": '{"sheet_name": "Data"}',
            },
        )

        assert response.status_code == 200
        real_data = captured[0]["real_data"]
        assert real_data["format"] == "excel"
        assert real_data["columns"] == ["county", "count"]
        assert real_data["rowCount"] == 1
        # options are echoed back so the client can persist them in a bundle
        assert complete_payload(response)["excel_options"]["sheet_name"] == "Data"

    def test_generate_upload_rejects_invalid_excel_options(self, client):
        response = client.post(
            "/api/generate-upload",
            files={"file": ("data.xlsx", self.make_xlsx_bytes(), "application/octet-stream")},
            data={
                "schemaText": "counties",
                "fileFormat": "excel",
                "excelOptions": '{"skip_rows": -3}',
            },
        )

        assert response.status_code == 422
        assert "Invalid Excel options" in response.json()["detail"]

    def test_load_bundle_applies_saved_excel_options(self, client):
        bundle = json.loads(make_bundle_json(mock=False))
        bundle["excel_options"] = {"sheet_name": "Data"}

        response = client.post(
            "/api/load-bundle",
            files={
                "bundle": ("bundle.json", json.dumps(bundle).encode(), "application/json"),
                "data": ("data.xlsx", self.make_xlsx_bytes(), "application/octet-stream"),
            },
            data={"dataFormat": "excel"},
        )

        assert response.status_code == 200
        payload = response.json()
        trace = payload["insights"][0]["chart_spec"]["plotlyData"][0]
        assert trace["x"] == ["King"]
        assert payload["excel_options"]["sheet_name"] == "Data"
