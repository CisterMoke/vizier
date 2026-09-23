"""Tests for static (server-side) chart rendering thresholds."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))

from vizier_ai.ui import static_render
from vizier_ai.ui.static_render import (
    StaticRenderUnavailableError,
    exceeds_static_threshold,
    is_static_rendering_available,
    static_gl_threshold,
    static_svg_threshold,
    trace_point_count,
)


class TestTracePointCount:
    def test_uses_x_array(self):
        assert trace_point_count({"type": "bar", "x": [1, 2, 3], "y": [1, 2, 3]}) == 3

    def test_uses_lon_array_for_geomaps(self):
        assert trace_point_count({"type": "scattergeo", "lon": [1, 2], "lat": [3, 4]}) == 2

    def test_uses_labels_array_for_pies(self):
        assert trace_point_count({"type": "pie", "labels": ["a", "b"], "values": [1, 2]}) == 2

    def test_returns_zero_without_arrays(self):
        assert trace_point_count({"type": "bar"}) == 0


class TestExceedsStaticThreshold:
    def test_svg_trace_over_default_limit(self):
        points = list(range(10_001))
        trace = {"type": "bar", "x": points, "y": points}
        assert exceeds_static_threshold([trace]) is True

    def test_svg_trace_at_default_limit_stays_interactive(self):
        points = list(range(10_000))
        trace = {"type": "bar", "x": points, "y": points}
        assert exceeds_static_threshold([trace]) is False

    def test_webgl_trace_uses_gl_limit(self):
        points = list(range(500_001))
        trace = {"type": "scattergl", "x": points, "y": points}
        assert exceeds_static_threshold([trace]) is True

        trace_at_limit = {"type": "scattergl", "x": points[:500_000], "y": points[:500_000]}
        assert exceeds_static_threshold([trace_at_limit]) is False

    def test_no_traces(self):
        assert exceeds_static_threshold([]) is False
        assert exceeds_static_threshold(None) is False

    def test_svg_threshold_configurable(self, monkeypatch):
        monkeypatch.setenv("STATIC_SVG_THRESHOLD", "5")
        trace = {"type": "bar", "x": list(range(6)), "y": list(range(6))}
        assert exceeds_static_threshold([trace]) is True

    def test_gl_threshold_configurable(self, monkeypatch):
        monkeypatch.setenv("STATIC_GL_THRESHOLD", "5")
        over = {"type": "scattergl", "x": list(range(6)), "y": list(range(6))}
        svg_over = {"type": "bar", "x": list(range(6)), "y": list(range(6))}

        assert exceeds_static_threshold([over]) is True
        assert exceeds_static_threshold([svg_over]) is False

    def test_invalid_env_falls_back_to_defaults(self, monkeypatch):
        monkeypatch.setenv("STATIC_SVG_THRESHOLD", "not-a-number")
        assert static_svg_threshold() == 10_000
        monkeypatch.setenv("STATIC_GL_THRESHOLD", "")
        assert static_gl_threshold() == 500_000


class TestAvailability:
    def test_available_when_kaleido_imported(self, monkeypatch):
        monkeypatch.setattr(static_render, "_KALEIDO_IMPORT_ERROR", None)
        assert is_static_rendering_available() is True

    def test_unavailable_when_import_failed(self, monkeypatch):
        monkeypatch.setattr(
            static_render, "_KALEIDO_IMPORT_ERROR", ImportError("no kaleido")
        )
        assert is_static_rendering_available() is False


class TestRenderStaticSvg:
    def test_raises_when_kaleido_missing(self, monkeypatch):
        monkeypatch.setattr(
            static_render, "_KALEIDO_IMPORT_ERROR", ImportError("no kaleido")
        )
        with pytest.raises(StaticRenderUnavailableError):
            static_render.render_static_svg({"data": [], "layout": {}})

    def test_writes_renders_and_reads_back_svg(self, monkeypatch):
        monkeypatch.setattr(static_render, "_KALEIDO_IMPORT_ERROR", None)

        def fake_write(fig, path=None, opts=None, **kwargs):
            Path(path).write_text("<svg>stub</svg>")

        monkeypatch.setattr(static_render.kaleido, "write_fig_sync", fake_write)

        svg = static_render.render_static_svg({"data": [], "layout": {}})

        assert svg == "<svg>stub</svg>"
