"""Chart builder — Python port of frontend chartSpec.ts.

Resolves JSONPath, applies filters and aggregation, and builds
Plotly-compatible trace and layout dicts for the frontend to render.
"""

import math
import os
from typing import Any

from jsonpath import ExprSyntaxError, JSONPathTypeError
from jsonpath import compile as jsonpath_compile

from vizier_ai.mock_data import generate_mock_rows
from vizier_ai.models.data_profile import DataProfile
from vizier_ai.models.insights import ChartSpec, Insight, TraceFilter, TraceSpec

FONT_COLOR = "#e2e8f0"
GRID_COLOR = "rgba(148, 163, 184, 0.15)"
AXIS_COLOR = "#94a3b8"
PAPER_BG = "rgba(15, 23, 42, 0.4)"
PLOT_BG = "rgba(15, 23, 42, 0.2)"

DEFAULT_GL_TRACE_THRESHOLD = 1000
DEFAULT_MAX_TRACE_POINTS = 10_000

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


def _compiled_pair(path: str):
    """Compile a field path into (primary, fallback) JSONPath instances.

    The LLM always emits bracket-notation paths ($['field']), which
    resolve on the primary attempt. The fallback is a safety net for
    dot-notation paths that name a single literal key with reserved
    characters (e.g. ``$.revenue.usd`` for the flat key ``revenue.usd``):
    it reinterprets the whole remainder as one bracket-escaped key.
    Returns ``None`` for the fallback when no remainder exists or the
    escaped variant is not a valid expression.
    """
    full_path = path if path.startswith("$") else f"$.{path}"
    primary = jsonpath_compile(full_path)

    rest = full_path[1:]
    if rest.startswith("."):
        rest = rest[1:]
    if not rest:
        return primary, None

    try:
        fallback = jsonpath_compile(f"$['{rest}']")
    except (ExprSyntaxError, JSONPathTypeError):
        return primary, None
    return primary, fallback


def _resolve_column(rows: list[dict], primary, fallback) -> list:
    """Resolve a compiled path over all rows into one value column."""
    column = []
    for row in rows:
        matches = primary.parse(row)
        if not matches and fallback is not None:
            matches = fallback.parse(row)
        column.append(matches[0] if matches else None)
    return column


def _to_axis_label(json_path: str) -> str:
    label = json_path.lstrip("$").lstrip(".")
    if not label:
        return json_path
    return label.split(".")[-1]


def _resolve_values(rows: list[dict], json_path: str) -> list:
    """Resolve a JSONPath over rows into a value list (kept for bundle
    compatibility checks and direct tests)."""
    primary, fallback = _compiled_pair(json_path)
    return _resolve_column(rows, primary, fallback)


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


def _matches_filter(value: Any, filter_spec: TraceFilter) -> bool:
    op = filter_spec.op
    filter_value = filter_spec.value

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


def _filter_indices(columns: dict[str, list], filter_spec: TraceFilter) -> list[int]:
    """Row indices whose filter-field values match the filter spec."""
    field_values = columns[filter_spec.field]
    return [
        i for i in range(len(field_values))
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


def _gl_trace_threshold() -> int:
    """Point count above which scatter/line traces switch to WebGL.

    Purely a rendering choice: the plotted points are identical either way.
    Configurable via the GL_TRACE_THRESHOLD environment variable.
    """
    try:
        return int(os.getenv("GL_TRACE_THRESHOLD", DEFAULT_GL_TRACE_THRESHOLD))
    except (TypeError, ValueError):
        return DEFAULT_GL_TRACE_THRESHOLD


def _scatter_type(point_count: int) -> str:
    return "scattergl" if point_count > _gl_trace_threshold() else "scatter"


def _max_trace_points() -> int:
    """Maximum plotted points per trace; 0 disables the cap. Configurable
    via MAX_TRACE_POINTS (default 10,000), independent of the MAX_ROWS
    parse limit."""
    raw = os.getenv("MAX_TRACE_POINTS")
    if raw is None or raw.strip() == "":
        return DEFAULT_MAX_TRACE_POINTS
    try:
        return max(0, int(raw))
    except ValueError:
        return DEFAULT_MAX_TRACE_POINTS


def _sample_indices(count: int, limit: int) -> list[int] | None:
    """Uniform stride indices over `count` items (real values, evenly
    spread), or None when no cap is needed."""
    if limit <= 0 or count <= limit:
        return None
    step = math.ceil(count / limit)
    return list(range(0, count, step))


def _take(values: list, indices: list[int]) -> list:
    return [values[i] for i in indices]


def _trace_paths(trace_spec: TraceSpec) -> list[str]:
    """All field paths a trace reads: x, y, optional z and filter field."""
    paths = [trace_spec.x_axis, trace_spec.y_axis]
    if trace_spec.z_axis:
        paths.append(trace_spec.z_axis)
    if trace_spec.filter:
        paths.append(trace_spec.filter.field)
    return paths


def build_trace(
        trace_spec: TraceSpec,
        rows: list[dict],
        color_index: int,
        y_index: int,
        columns: dict[str, list] | None = None,
    ) -> dict:
    """Build one Plotly trace dict.

    ``columns`` holds pre-resolved value columns keyed by field path (see
    ``build_plotly_spec``, which resolves each unique path once for all
    traces). When omitted, the trace resolves its own paths over ``rows``.
    """
    color = TRACE_COLORS[color_index % len(TRACE_COLORS)]

    if columns is None:
        columns = {
            path: _resolve_column(rows, *_compiled_pair(path))
            for path in _trace_paths(trace_spec)
        }

    if trace_spec.filter:
        indices = _filter_indices(columns, trace_spec.filter)
        x = [_to_datum(columns[trace_spec.x_axis][i]) for i in indices]
        y = [_to_datum(columns[trace_spec.y_axis][i]) for i in indices]
        z = (
            [_to_number(columns[trace_spec.z_axis][i]) for i in indices]
            if trace_spec.z_axis
            else None
        )
    else:
        x = [_to_datum(v) for v in columns[trace_spec.x_axis]]
        y = [_to_datum(v) for v in columns[trace_spec.y_axis]]
        z = (
            [_to_number(v) for v in columns[trace_spec.z_axis]]
            if trace_spec.z_axis
            else None
        )

    if trace_spec.aggregation:
        x, y = _aggregate(x, y, trace_spec.aggregation)

    # Cap plotted points AFTER filters and aggregations. Stride sampling
    # keeps real values and even coverage; geomap traces are capped in
    # their own branch (lon/lat/z), so skip the generic cap for them.
    if trace_spec.chart_type != "geomap":
        cap_indices = _sample_indices(len(x), _max_trace_points())
        if cap_indices is not None:
            x = _take(x, cap_indices)
            y = _take(y, cap_indices)
            z = _take(z, cap_indices) if z is not None else None

    trace: dict = {}
    name = trace_spec.name
    if name:
        trace["name"] = name

    chart_type = trace_spec.chart_type

    if chart_type == "bar":
        trace.update({"type": "bar", "x": x, "y": y, "marker": {"color": color}})
    elif chart_type == "line":
        trace.update({
            "type": _scatter_type(len(x)), "mode": "lines+markers",
            "x": x, "y": y,
            "line": {"color": color}, "marker": {"color": color},
        })
    elif chart_type == "scatter":
        trace.update({
            "type": _scatter_type(len(x)), "mode": "markers",
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
        lon = [_to_number(v) for v in x]
        lat = [_to_number(v) for v in y]
        geo_indices = _sample_indices(len(lon), _max_trace_points())
        if geo_indices is not None:
            lon = _take(lon, geo_indices)
            lat = _take(lat, geo_indices)
            z = _take(z, geo_indices) if z is not None else None

        trace.update({
            "type": "scattergeo", "mode": "markers",
            "lon": lon, "lat": lat,
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


def edit_chart(
        insight: Insight,
        rows: list[dict] | None = None,
        *,
        chart_type: str | None = None,
        traces: list[TraceSpec] | None = None,
        data_profile: DataProfile | dict | None = None,
    ) -> dict:
    """Rebuild an insight's Plotly spec with a modified chart type or traces.

    The most common edit — "show this chart as a line instead" — needs only
    ``edit_chart(insight, rows, chart_type="line")``. The insight's own
    traces are reused with only the chart type substituted, so repeated
    edits always start from the original recipe.

    Args:
        insight: The insight to re-render (traces and metadata are reused).
        rows: Data rows to plot. When omitted, mock rows are regenerated
            from ``data_profile`` and the insight's ``mock_seed`` (the
            no-real-data path).
        chart_type: New chart type applied to every trace (bar, line, pie,
            scatter, heatmap, geomap). When omitted, the insight's traces
            are re-rendered unchanged. Ignored when ``traces`` is given.
        traces: Full trace override; takes precedence over ``chart_type``.
        data_profile: Mock-data recipe (``Insights.data_profile``) used to
            regenerate rows when ``rows`` is omitted.

    Returns:
        A Plotly ``{data, layout}`` dict, like ``build_plotly_spec``.
    """
    if traces is None:
        if chart_type is None:
            traces = list(insight.chart_spec.traces)
        else:
            traces = [
                t.model_copy(update={"chart_type": chart_type})
                for t in insight.chart_spec.traces
            ]

    if rows is None:
        if data_profile is None:
            raise ValueError("edit_chart needs rows, or data_profile to regenerate mock rows")
        profile = data_profile.model_dump() if isinstance(data_profile, DataProfile) else data_profile
        seed = insight.mock_seed if insight.mock_seed is not None else 1337
        rows = generate_mock_rows(profile, seed=seed)

    shell = Insight(
        id=insight.id,
        metadata=insight.metadata,
        chart_spec=ChartSpec(traces=traces),
    )
    return build_plotly_spec(shell, rows)


def build_plotly_spec(insight: Insight, rows: list[dict]) -> dict:
    """Build a full Plotly spec {data, layout} from an insight and data rows.

    Each unique field path across all traces is compiled and resolved once
    over all rows; traces (and their filters) index into the shared columns
    instead of re-resolving the same paths per trace.
    """
    chart_spec = insight.chart_spec
    traces = chart_spec.traces
    title = insight.metadata.title
    if not traces:
        return {"data": [], "layout": _dark_layout(title)}

    columns: dict[str, list] = {}
    for trace in traces:
        for path in _trace_paths(trace):
            if path not in columns:
                columns[path] = _resolve_column(rows, *_compiled_pair(path))

    plotly_traces = [
        build_trace(t, rows, i, i+1, columns=columns)
        for i, t in enumerate(traces)
    ]
    layout = build_layout(title, traces)

    return {"data": plotly_traces, "layout": layout}
