"""Mock data generator — Python port of frontend mockData.ts.

Generates deterministic mock data from an insight's dataProfile.
Uses the same Linear Congruential Generator algorithm as the frontend.
"""

from typing import Any

MOCK_ROW_COUNT = 200


def _create_seeded_random(seed: int):
    state = seed & 0xFFFFFFFF or 1

    def random():
        nonlocal state
        state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
        return state / 4294967296

    return random


def _clamp(value: float, min_val: Any, max_val: Any) -> float:
    result = value
    if min_val is not None and result < min_val:
        result = min_val
    if max_val is not None and result > max_val:
        result = max_val
    return result


def _generate_category(spec: dict, random) -> Any:
    categories = spec.get("categories") or ["A", "B", "C"]
    return categories[int(random() * len(categories))]


def _generate_normal(spec: dict, random) -> float:
    mean = spec.get("mean") or 0
    stddev = spec.get("stddev") or 1
    u1 = max(random(), 1e-10)
    u2 = random()
    z = math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)
    return round(_clamp(
        round((mean + z * stddev) * 100) / 100,
        spec.get("min"), spec.get("max")
    ), 2)


def _generate_uniform(spec: dict, random) -> float:
    min_val = spec.get("min") or 0
    max_val = spec.get("max") or 100
    return round(_clamp(
        round((min_val + random() * (max_val - min_val)) * 100) / 100,
        spec.get("min"), spec.get("max")
    ), 2)


def _generate_linear(spec: dict, index: int) -> float:
    start = spec.get("start") or 0
    end = spec.get("end") or 100
    step = spec.get("step") or ((end - start) / 200 if end != start else 1)
    return round(start + index * step, 2)


def _generate_constant(spec: dict) -> Any:
    return spec.get("value") or 0


def _generate_value(spec: dict, index: int, random) -> Any:
    generator = spec.get("generator", "uniform")
    if generator == "category":
        return _generate_category(spec, random)
    elif generator == "normal":
        return _generate_normal(spec, random)
    elif generator == "uniform":
        return _generate_uniform(spec, random)
    elif generator == "linear":
        return _generate_linear(spec, index)
    elif generator == "constant":
        return _generate_constant(spec)
    return None


def _json_path_to_key(json_path: str) -> str:
    return json_path.lstrip("$.")


def generate_mock_rows(insight: dict, seed: int = 1337) -> list[dict]:
    """Generate mock data rows from an insight's dataProfile."""
    profile = insight.get("dataProfile")
    if not profile:
        return []

    columns = profile.get("columns", [])
    if not columns:
        return []

    random = _create_seeded_random(seed)
    rows = []

    for row_index in range(MOCK_ROW_COUNT):
        row = {}
        for col in columns:
            key = _json_path_to_key(col.get("name", ""))
            row[key] = _generate_value(col, row_index, random)
        rows.append(row)

    return rows
