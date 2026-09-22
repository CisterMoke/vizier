"""Deterministic post-generation check for hard insight constraints."""

from vizier_ai.models.constraints import InsightConstraints
from vizier_ai.models.data_schema import DatasetSchema
from vizier_ai.models.insights import InsightCandidate, TraceSpec


def _resolve_paths(entry: str, schema: DatasetSchema) -> set[str]:
    lowered = entry.strip().lower()
    for field in schema.fields:
        if lowered == field.name.lower() or lowered == field.jsonPath.lower():
            return {field.jsonPath.lower()}
    return {lowered}


def _trace_paths(trace: TraceSpec) -> set[str]:
    paths = {trace.x_axis.lower(), trace.y_axis.lower()}
    if trace.z_axis:
        paths.add(trace.z_axis.lower())
    if trace.filter:
        paths.add(trace.filter.field.lower())
    return paths


def _chart_type_ok(trace: TraceSpec, constraints: InsightConstraints) -> bool:
    if constraints.include_chart_types and trace.chart_type not in constraints.include_chart_types:
        return False
    if constraints.exclude_chart_types and trace.chart_type in constraints.exclude_chart_types:
        return False
    return True


def apply_constraints(
    candidates: list[InsightCandidate],
    constraints: InsightConstraints,
    schema: DatasetSchema,
) -> list[InsightCandidate]:
    excluded: set[str] = set()
    for entry in constraints.exclude_fields or []:
        excluded |= _resolve_paths(entry, schema)

    included: set[str] = set()
    for entry in constraints.include_fields or []:
        included |= _resolve_paths(entry, schema)

    result: list[InsightCandidate] = []
    for candidate in candidates:
        traces = [
            trace for trace in candidate.traces
            if _chart_type_ok(trace, constraints) and not (_trace_paths(trace) & excluded)
        ]
        if not traces:
            continue
        if included and not any(_trace_paths(trace) & included for trace in traces):
            continue
        if len(traces) != len(candidate.traces):
            candidate = candidate.model_copy(update={"traces": traces})
        result.append(candidate)

    return result
