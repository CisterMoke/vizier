"""Deterministic data parser for CSV, JSON array, and JSONL formats using pandas.

Supports reading from file paths (memory-efficient) or raw text.
Row limiting prevents OOM on large files.
"""

import io
import json
from pathlib import Path
from typing import Any

import pandas as pd

MAX_ROWS = 5000  # Safety limit: only parse first 5000 rows


def _df_to_result(df: pd.DataFrame, fmt: str) -> dict[str, Any]:
    """Convert a pandas DataFrame to the standard RawDataResult dict."""
    records = json.loads(df.to_json(orient="records", force_ascii=False))
    columns = [str(c) for c in df.columns]
    return {"format": fmt, "columns": columns, "rows": records, "rowCount": len(records)}


def parse_csv(source: str | Path, max_rows: int = MAX_ROWS) -> dict[str, Any]:
    """Parse CSV from a file path or raw text using pandas."""
    df = pd.read_csv(source, nrows=max_rows)
    return _df_to_result(df, "csv")


def parse_json(source: str | Path, max_rows: int = MAX_ROWS) -> dict[str, Any]:
    """Parse JSON array (preserving nested structure for JSONPath) using pandas."""
    if isinstance(source, Path):
        with open(source, "r") as f:
            parsed = json.load(f)
    else:
        parsed = json.loads(source)

    arr = parsed if isinstance(parsed, list) else [parsed]
    arr = arr[:max_rows]  # Limit rows before DataFrame creation

    if not arr:
        return {"format": "json", "columns": [], "rows": [], "rowCount": 0}

    records = arr
    columns = sorted(set(
        key
        for item in records
        for key, value in item.items()
        if not (isinstance(value, dict) or isinstance(value, list))
    ))
    return {"format": "json", "columns": columns, "rows": records, "rowCount": len(records)}


def parse_jsonl(source: str | Path, max_rows: int = MAX_ROWS) -> dict[str, Any]:
    """Parse JSONL (one JSON object per line) using pandas."""
    if isinstance(source, Path):
        with open(source, "r") as f:
            lines = []
            for i, line in enumerate(f):
                if i >= max_rows:
                    break
                stripped = line.strip()
                if stripped:
                    lines.append(json.loads(stripped))
        records = lines
    else:
        all_lines = [line.strip() for line in source.strip().split("\n") if line.strip()]
        records = [json.loads(line) for line in all_lines[:max_rows]]

    if not records:
        return {"format": "jsonl", "columns": [], "rows": [], "rowCount": 0}

    df = pd.DataFrame(records)
    return _df_to_result(df, "jsonl")


def parse_data(source: str | Path, format_hint: str = "csv", max_rows: int = MAX_ROWS) -> dict[str, Any]:
    """Parse raw data from a file path or text using the specified format.

    Args:
        source: File path (Path) or raw text (str).
        format_hint: "csv", "json", or "jsonl".
        max_rows: Maximum number of rows to parse (safety limit).
    """
    try:
        if format_hint == "csv":
            return parse_csv(source, max_rows)
        elif format_hint == "json":
            return parse_json(source, max_rows)
        elif format_hint == "jsonl":
            return parse_jsonl(source, max_rows)
        else:
            return {"format": "unknown", "columns": [], "rows": [], "rowCount": 0}
    except Exception as e:
        print(f"[parser] Error parsing data: {e}")
        return {"format": "unknown", "columns": [], "rows": [], "rowCount": 0}
