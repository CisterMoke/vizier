"""Static (server-side) chart rendering for oversized datasets.

When an insight's plotted points exceed a renderer-specific threshold, its
interactive plotly data is replaced by a server-rendered SVG (via kaleido /
headless Chrome), so the client never receives large data arrays.

This is purely a rendering-mode switch: no data is dropped, sampled, or
approximated. Thresholds are configurable via environment variables:

- ``STATIC_SVG_THRESHOLD`` (default 10,000) for SVG-rendered traces such as
  bar, pie, heatmap, and scattergeo.
- ``STATIC_GL_THRESHOLD`` (default 500,000) for WebGL-rendered traces
  (scattergl), which comfortably handle far larger point counts.
"""

import os
import tempfile
from pathlib import Path

try:
    import kaleido

    _KALEIDO_IMPORT_ERROR: Exception | None = None
except ImportError as exc:  # pragma: no cover - depends on environment
    kaleido = None
    _KALEIDO_IMPORT_ERROR = exc

DEFAULT_STATIC_SVG_THRESHOLD = 10_000
DEFAULT_STATIC_GL_THRESHOLD = 500_000

GL_TRACE_TYPES = {"scattergl"}

STATIC_IMAGE_WIDTH = 900
STATIC_IMAGE_HEIGHT = 500


class StaticRenderUnavailableError(RuntimeError):
    """Raised when a static SVG cannot be rendered (kaleido or Chrome missing)."""


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def static_svg_threshold() -> int:
    return _env_int("STATIC_SVG_THRESHOLD", DEFAULT_STATIC_SVG_THRESHOLD)


def static_gl_threshold() -> int:
    return _env_int("STATIC_GL_THRESHOLD", DEFAULT_STATIC_GL_THRESHOLD)


def trace_point_count(trace: dict) -> int:
    """Number of plotted points in a materialized plotly trace."""
    for key in ("x", "lon", "labels"):
        value = trace.get(key)
        if isinstance(value, (list, tuple)):
            return len(value)
    return 0


def exceeds_static_threshold(plotly_data: list[dict] | None) -> bool:
    """Whether any trace in a materialized plotly spec exceeds its renderer threshold."""
    for trace in plotly_data or []:
        count = trace_point_count(trace)
        if trace.get("type") in GL_TRACE_TYPES:
            limit = static_gl_threshold()
        else:
            limit = static_svg_threshold()
        if count > limit:
            return True
    return False


def is_static_rendering_available() -> bool:
    """True when the kaleido backend is importable (Chrome is checked at render time)."""
    return _KALEIDO_IMPORT_ERROR is None


def render_static_svg(plotly_spec: dict) -> bytes:
    """Render a plotly figure dict to an SVG image (bytes) via kaleido."""
    if _KALEIDO_IMPORT_ERROR is not None:
        raise StaticRenderUnavailableError(
            f"Static rendering is unavailable: {_KALEIDO_IMPORT_ERROR}"
        ) from _KALEIDO_IMPORT_ERROR

    try:
        svg = kaleido.calc_fig_sync(
            plotly_spec,
            opts={
                "format": "svg",
                "width": STATIC_IMAGE_WIDTH,
                "height": STATIC_IMAGE_HEIGHT,
            },
        )
        return svg
    except StaticRenderUnavailableError:
        raise
    except Exception as exc:
        raise StaticRenderUnavailableError(
            f"Static rendering failed: {exc}"
        ) from exc
