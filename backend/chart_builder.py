"""Chart builder — Python port of frontend chartSpec.ts.

Resolves JSONPath, applies filters and aggregation, and builds
Plotly-compatible trace and layout dicts for the frontend to render.
"""

import math
from typing import Any

from jsonpath import search as jsonpath_search

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


def _to_axis_label(json_path: str) -> str:
    parts = json_path.lstrip("$.").split(".")
    return parts[-1] if parts else json_path


def _resolve_values(rows: list[dict], json_path: str) -> list:
    path = json_path if json_path.startswith("$") else f"$.{json_path}"
    result = []
    for row in rows:
        matches = jsonpath_search(path, row)
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


def _filter_dataset(rows: list[dict], filter_spec: dict) -> list[dict]:
    field = filter_spec.get("field", "")
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


def build_trace(trace_spec: dict, rows: list[dict], color_index: int) -> dict:
    color = TRACE_COLORS[color_index % len(TRACE_COLORS)]

    filtered = rows
    if trace_spec.get("filter"):
        filtered = _filter_dataset(rows, trace_spec["filter"])

    x = [_to_datum(v) for v in _resolve_values(filtered, trace_spec["xAxis"])]
    y = [_to_datum(v) for v in _resolve_values(filtered, trace_spec["yAxis"])]
    z = (
        [_to_number(v) for v in _resolve_values(filtered, trace_spec["zAxis"])]
        if trace_spec.get("zAxis")
        else None
    )

    if trace_spec.get("aggregation"):
        x, y = _aggregate(x, y, trace_spec["aggregation"])

    trace: dict = {}
    name = trace_spec.get("name")
    if name:
        trace["name"] = name

    chart_type = trace_spec.get("chartType", "bar")

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
            "lon": [_to_number(v) for v in _resolve_values(filtered, trace_spec["xAxis"])],
            "lat": [_to_number(v) for v in _resolve_values(filtered, trace_spec["yAxis"])],
        })
        if z:
            trace["marker"] = {
                "size": 8, "color": z, "colorscale": "Viridis", "showscale": True,
                "colorbar": {
                    "title": {
                        "text": _to_axis_label(trace_spec["zAxis"]) if trace_spec.get("zAxis") else "",
                        "font": {"color": FONT_COLOR},
                    },
                    "tickfont": {"color": FONT_COLOR},
                },
            }
        else:
            trace["marker"] = {"size": 8, "color": color}

    if trace_spec.get("yaxis2"):
        trace["yaxis"] = trace_spec["yaxis2"]

    return trace


def build_layout(title: str, trace_specs: list[dict]) -> dict:
    layout = _dark_layout(title)

    has_geomap = any(t.get("chartType") == "geomap" for t in trace_specs)
    has_pie = any(t.get("chartType") == "pie" for t in trace_specs)

    if not has_geomap and not has_pie:
        x_label = trace_specs[0].get("xAxis", "") if trace_specs else ""
        y_label = trace_specs[0].get("yAxis", "") if trace_specs else ""
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

    bar_count = sum(1 for t in trace_specs if t.get("chartType") == "bar")
    if bar_count > 1:
        layout["barmode"] = "group"

    has_y2 = any(t.get("yaxis2") for t in trace_specs)
    if has_y2:
        layout["yaxis2"] = {
            "title": {"text": "Secondary", "font": {"color": FONT_COLOR}},
            "side": "right", "overlaying": "y",
            "color": AXIS_COLOR, "gridcolor": GRID_COLOR, "zerolinecolor": GRID_COLOR,
        }

    return layout


def build_plotly_spec(insight: dict, rows: list[dict]) -> dict:
    """Build a full Plotly spec {data, layout} from an insight and data rows."""
    chart_spec = insight.get("chartSpec", {})
    mode = chart_spec.get("mode", "recipe")

    if mode == "custom":
        return {
            "data": chart_spec.get("plotlyData", []),
            "layout": {**_dark_layout(insight.get("title", "")),
                       **(chart_spec.get("plotlyLayout") or {})},
        }

    traces = chart_spec.get("traces", [])
    if not traces:
        return {"data": [], "layout": _dark_layout(insight.get("title", ""))}

    plotly_traces = [build_trace(t, rows, i) for i, t in enumerate(traces)]
    layout = build_layout(insight.get("title", ""), traces)

    return {"data": plotly_traces, "layout": layout}
