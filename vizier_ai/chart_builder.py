"""Chart builder — Python port of frontend chartSpec.ts.

Resolves JSONPath, applies filters and aggregation, and builds
Plotly-compatible trace and layout dicts for the frontend to render.
"""

import re
from typing import Any

from jsonpath import search as jsonpath_search

from vizier_ai.models.insights import Insight, TraceFilter, TraceSpec

FONT_COLOR = "#e2e8f0"
GRID_COLOR = "rgba(148, 163, 184, 0.15)"
AXIS_COLOR = "#94a3b8"
PAPER_BG = "rgba(15, 23, 42, 0.4)"
PLOT_BG = "rgba(15, 23, 42, 0.2)"

TRACE_COLORS = [
    "#22d3ee", "#818cf8", "#f472b6", "#fbbf24",
    "#34d399", "#fb923c", "#a78bfa", "#f9a8d4",
]

MOCK_ROW_COUNT = 200


def _to_datum(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float, str)):
        return value
    return str(value)


def _to_number(value: Any) -> float:
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        try:
            return float(value)
        except (ValueError, TypeError):
            return 0.0
    return 0.0


_SAFE_SEGMENT = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _escape_jsonpath_segment(segment: str) -> str:
    """Return a safe JSONPath representation of a single path segment.

    Simple identifiers (letters, digits, underscore) are returned as-is.
    Anything else is wrapped in single-quoted bracket notation: ``['segment']``.
    """
    if _SAFE_SEGMENT.match(segment):
        return segment
    return f"['{segment}']"


def _safe_jsonpath(path: str, row: dict) -> list:
    """Resolve a JSONPath against a row, handling field names with reserved characters.

    The jsonpath-python library treats ``.`` as a path separator, so a field
    named ``revenue.usd`` accessed via ``$.revenue.usd`` is interpreted as
    nested access (``row['revenue']['usd']``) rather than a flat key.

    This function tries the path as-is first. If no match is found, it
    progressively merges dot-separated segments from the end and wraps them
    in bracket notation until a match is found or all options are exhausted.
    """
    if path.startswith("$"):
        rest = path[1:]
        if rest.startswith("."):
            rest = rest[1:]
    else:
        rest = path

    if not rest:
        return jsonpath_search(path, row) if path.startswith("$") else jsonpath_search(f"$.{path}", row)

    full_path = path if path.startswith("$") else f"$.{path}"
    result = jsonpath_search(full_path, row)
    if result:
        return result

    segments = rest.split(".")
    if len(segments) == 1:
        escaped = _escape_jsonpath_segment(segments[0])
        if escaped != segments[0]:
            return jsonpath_search(f"${escaped}" if escaped.startswith("[") else f"$.{escaped}", row)
        return result

    for merge_start in range(len(segments) - 1, -1, -1):
        merged_key = ".".join(segments[merge_start:])
        prefix_segments = segments[:merge_start]

        safe_path = "$"
        for seg in prefix_segments:
            escaped = _escape_jsonpath_segment(seg)
            if escaped.startswith("["):
                safe_path += escaped
            else:
                safe_path += f".{escaped}"
        safe_path += _escape_jsonpath_segment(merged_key)

        result = jsonpath_search(safe_path, row)
        if result:
            return result

    return []


def _to_axis_label(json_path: str) -> str:
    label = json_path.lstrip("$").lstrip(".")
    if not label:
        return json_path
    return label.split(".")[-1]


def _resolve_values(rows: list[dict], json_path: str) -> list:
    result = []
    for row in rows:
        matches = _safe_jsonpath(json_path, row)
        result.append(matches[0] if matches else None)
    return result


def _aggregate(x: list, y: list, func: str) -> tuple[list, list]:
    groups: dict[str, list[float]] = {}
    for i in range(len(x)):
        key = str(x[i])
        if key not in groups:
            groups[key] = []
        groups[key].append(_to_number(y[i]))

    sorted_keys = sorted(groups.keys())
    result_x = []
    result_y = []

    for key in sorted_keys:
        values = groups[key]
        if func == "sum":
            agg = sum(values)
        elif func == "mean":
            agg = sum(values) / len(values) if values else 0
        elif func == "count":
            agg = len(values)
        elif func == "min":
            agg = min(values) if values else 0
        elif func == "max":
            agg = max(values) if values else 0
        elif func == "median":
            sv = sorted(values)
            n = len(sv)
            if n % 2 == 0:
                agg = (sv[n // 2 - 1] + sv[n // 2]) / 2
            else:
                agg = sv[n // 2]
        elif func == "first":
            agg = values[0] if values else 0
        elif func == "last":
            agg = values[-1] if values else 0
        else:
            agg = sum(values)
        result_x.append(key)
        result_y.append(round(agg * 100) / 100)

    return result_x, result_y


def _matches_filter(value: Any, filter_spec: dict) -> bool:
    op = filter_spec.get("op", "eq")
    filter_value = filter_spec.get("value")

    if op == "eq":
        return str(value) == str(filter_value)
    elif op == "ne":
        return str(value) != str(filter_value)
    elif op == "gt":
        return _to_number(value) > _to_number(filter_value)
    elif op == "gte":
        return _to_number(value) >= _to_number(filter_value)
    elif op == "lt":
        return _to_number(value) < _to_number(filter_value)
    elif op == "lte":
        return _to_number(value) <= _to_number(filter_value)
    elif op == "in":
        if isinstance(filter_value, list):
            return str(value) in [str(v) for v in filter_value]
        return str(value) == str(filter_value)
    elif op == "not_in":
        if isinstance(filter_value, list):
            return str(value) not in [str(v) for v in filter_value]
        return str(value) != str(filter_value)
    return True


def _filter_dataset(rows: list[dict], filter_spec: TraceFilter) -> list[dict]:
    field = filter_spec.field
    field_values = _resolve_values(rows, field)
    return [
        rows[i] for i in range(len(field_values))
        if _matches_filter(field_values[i], filter_spec)
    ]


def _dark_layout(title: str) -> dict:
    return {
        "title": {"text": title, "font": {"color": FONT_COLOR, "size": 14}},
        "font": {"color": FONT_COLOR},
        "paper_bgcolor": PAPER_BG,
        "plot_bgcolor": PLOT_BG,
        "margin": {"l": 48, "r": 48, "b": 48, "t": 48},
    }


def _dark_axes(x_label: str = "", y_label: str = "") -> dict:
    return {
        "xaxis": {
            "title": {"text": x_label, "font": {"color": FONT_COLOR}},
            "color": AXIS_COLOR,
            "gridcolor": GRID_COLOR,
            "zerolinecolor": GRID_COLOR,
        },
        "yaxis": {
            "title": {"text": y_label, "font": {"color": FONT_COLOR}},
            "color": AXIS_COLOR,
            "gridcolor": GRID_COLOR,
            "zerolinecolor": GRID_COLOR,
        },
    }


def build_trace(
        trace_spec: TraceSpec,
        rows: list[dict],
        color_index: int,
        y_index: int,
    ) -> dict:
    color = TRACE_COLORS[color_index % len(TRACE_COLORS)]

    filtered = rows
    if trace_spec.filter:
        filtered = _filter_dataset(rows, trace_spec.filter)

    x = [_to_datum(v) for v in _resolve_values(filtered, trace_spec.x_axis)]
    y = [_to_datum(v) for v in _resolve_values(filtered, trace_spec.y_axis)]
    z = (
        [_to_number(v) for v in _resolve_values(filtered, trace_spec.z_axis)]
        if trace_spec.z_axis
        else None
    )

    if trace_spec.aggregation:
        x, y = _aggregate(x, y, trace_spec.aggregation)

    trace: dict = {}
    name = trace_spec.name
    if name:
        trace["name"] = name

    chart_type = trace_spec.chart_type

    if chart_type == "bar":
        trace.update({"type": "bar", "x": x, "y": y, "marker": {"color": color}})
    elif chart_type == "line":
        trace.update({
            "type": "scatter", "mode": "lines+markers",
            "x": x, "y": y,
            "line": {"color": color}, "marker": {"color": color},
        })
    elif chart_type == "scatter":
        trace.update({
            "type": "scatter", "mode": "markers",
            "x": x, "y": y, "marker": {"color": color, "size": 8},
        })
    elif chart_type == "pie":
        trace.update({
            "type": "pie", "labels": x, "values": y,
            "textfont": {"color": FONT_COLOR},
            "marker": {"colors": TRACE_COLORS},
        })
    elif chart_type == "heatmap":
        trace.update({
            "type": "heatmap", "x": x, "y": y,
            "z": z if z else [i + 1 for i in range(len(x))],
        })
    elif chart_type == "geomap":
        trace.update({
            "type": "scattergeo", "mode": "markers",
            "lon": [_to_number(v) for v in _resolve_values(filtered, trace_spec.x_axis)],
            "lat": [_to_number(v) for v in _resolve_values(filtered, trace_spec.y_axis)],
        })
        if z:
            trace["marker"] = {
                "size": 8, "color": z, "colorscale": "Viridis", "showscale": True,
                "colorbar": {
                    "title": {
                        "text": _to_axis_label(trace_spec.z_axis) if trace_spec.z_axis else "",
                        "font": {"color": FONT_COLOR},
                    },
                    "tickfont": {"color": FONT_COLOR},
                },
            }
        else:
            trace["marker"] = {"size": 8, "color": color}

    if y_index > 1:
        trace["yaxis"] = f"y{y_index}"

    return trace


def build_layout(title: str, trace_specs: list[TraceSpec]) -> dict:
    layout = _dark_layout(title)

    has_geomap = any(t.chart_type == "geomap" for t in trace_specs)
    has_pie = any(t.chart_type == "pie" for t in trace_specs)

    if not has_geomap and not has_pie:
        x_label = trace_specs[0].x_axis if trace_specs else ""
        y_label = trace_specs[0].y_axis if trace_specs else ""
        layout.update(_dark_axes(_to_axis_label(x_label), _to_axis_label(y_label)))

    if has_geomap:
        layout["geo"] = {
            "bgcolor": "rgba(0, 0, 0, 0)",
            "showland": True, "landcolor": "rgb(17, 24, 39)",
            "showocean": True, "oceancolor": "rgb(8, 12, 20)",
            "showcountries": True, "countrycolor": "rgb(55, 65, 81)",
            "showcoastlines": True, "coastlinecolor": "rgb(55, 65, 81)",
            "projection": {"type": "natural earth"},
            "showframe": False,
        }

    bar_count = sum(1 for t in trace_specs if t.chart_type == "bar")
    if bar_count > 1:
        layout["barmode"] = "group"

    for i in range(1, len(trace_specs)):
        spec = trace_specs[i]
        layout[f"yaxis{i+1}"] = {
            "title": {"text": spec.y_axis, "font": {"color": FONT_COLOR}},
            "side": "right", "overlaying": "y",
            "color": AXIS_COLOR, "gridcolor": GRID_COLOR, "zerolinecolor": GRID_COLOR,
        }

    return layout


def build_plotly_spec(insight: Insight, rows: list[dict]) -> dict:
    """Build a full Plotly spec {data, layout} from an insight and data rows."""
    chart_spec = insight.chart_spec
    traces = chart_spec.traces
    title = insight.metadata.title
    if not traces:
        return {"data": [], "layout": _dark_layout(title)}

    plotly_traces = [build_trace(t, rows, i, i+1) for i, t in enumerate(traces)]
    layout = build_layout(title, traces)

    return {"data": plotly_traces, "layout": layout}
