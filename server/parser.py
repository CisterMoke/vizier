"""Deterministic data parser for CSV, JSON array, and JSONL formats."""

import json
import csv
import io
from typing import Any


def parse_csv(text: str) -> dict[str, Any]:
    """Parse CSV text into columns and rows."""
    reader = csv.DictReader(io.StringIO(text))
    columns = reader.fieldnames or []
    rows = []
    for row in reader:
        parsed_row: dict[str, Any] = {}
        for key, value in row.items():
            if key is None:
                continue
            try:
                parsed_row[key] = float(value) if value and not _is_int(value) else int(value) if _is_int(value) else value
            except (ValueError, TypeError):
                parsed_row[key] = value
        rows.append(parsed_row)
    return {"format": "csv", "columns": list(columns), "rows": rows, "rowCount": len(rows)}


def _is_int(value: str) -> bool:
    try:
        int(value)
        return True
    except ValueError:
        return False


def parse_json(text: str) -> dict[str, Any]:
    """Parse JSON array (with nested object flattening) into columns and rows."""
    parsed = json.loads(text)
    arr = parsed if isinstance(parsed, list) else [parsed]

    if not arr:
        return {"format": "json", "columns": [], "rows": [], "rowCount": 0}

    def flatten(obj: dict, prefix: str = "") -> dict:
        result = {}
        for key, value in obj.items():
            full_key = f"{prefix}.{key}" if prefix else key
            if isinstance(value, dict) and not isinstance(value, list):
                result.update(flatten(value, full_key))
            else:
                result[full_key] = value
        return result

    flat_rows = [flatten(item) if isinstance(item, dict) else {"value": item} for item in arr]
    columns = list(set(k for row in flat_rows for k in row))
    return {"format": "json", "columns": columns, "rows": flat_rows, "rowCount": len(flat_rows)}


def parse_jsonl(text: str) -> dict[str, Any]:
    """Parse JSONL (one JSON object per line) into columns and rows."""
    lines = [line.strip() for line in text.strip().split("\n") if line.strip()]
    rows = [json.loads(line) for line in lines]

    if not rows:
        return {"format": "jsonl", "columns": [], "rows": [], "rowCount": 0}

    columns = list(set(k for row in rows for k in row))
    return {"format": "jsonl", "columns": columns, "rows": rows, "rowCount": len(rows)}


def parse_data(text: str, format_hint: str = "csv") -> dict[str, Any]:
    """Parse raw data text using the specified format."""
    try:
        if format_hint == "csv":
            return parse_csv(text)
        elif format_hint == "json":
            return parse_json(text)
        elif format_hint == "jsonl":
            return parse_jsonl(text)
        else:
            return {"format": "unknown", "columns": [], "rows": [], "rowCount": 0}
    except Exception:
        return {"format": "unknown", "columns": [], "rows": [], "rowCount": 0}
