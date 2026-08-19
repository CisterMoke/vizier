"""Deterministic data parser for CSV, JSON array, and JSONL formats using pandas."""

import io
import json
from typing import Any

import pandas as pd


def _df_to_result(df: pd.DataFrame, fmt: str) -> dict[str, Any]:
    """Convert a pandas DataFrame to the standard RawDataResult dict."""
    records = json.loads(df.to_json(orient="records", force_ascii=False))
    columns = list(df.columns)
    return {"format": fmt, "columns": columns, "rows": records, "rowCount": len(records)}


def parse_csv(text: str) -> dict[str, Any]:
    """Parse CSV text using pandas."""
    df = pd.read_csv(io.StringIO(text))
    return _df_to_result(df, "csv")


def parse_json(text: str) -> dict[str, Any]:
    """Parse JSON array (with nested object flattening) using pandas."""
    parsed = json.loads(text)
    arr = parsed if isinstance(parsed, list) else [parsed]

    if not arr:
        return {"format": "json", "columns": [], "rows": [], "rowCount": 0}

    df = pd.json_normalize(arr)
    return _df_to_result(df, "json")


def parse_jsonl(text: str) -> dict[str, Any]:
    """Parse JSONL (one JSON object per line) using pandas."""
    lines = [line.strip() for line in text.strip().split("\n") if line.strip()]
    records = [json.loads(line) for line in lines]

    if not records:
        return {"format": "jsonl", "columns": [], "rows": [], "rowCount": 0}

    df = pd.DataFrame(records)
    return _df_to_result(df, "jsonl")


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
