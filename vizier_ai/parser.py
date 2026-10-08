"""Deterministic data parser for CSV, JSON array, and JSONL formats using pandas.

Supports reading from file paths (memory-efficient) or raw text.
Row limiting prevents OOM on large files.
"""

import io
import json
from pathlib import Path
from typing import Any

import pandas as pd

from vizier_ai.models.csv_options import CsvOptions
from vizier_ai.models.excel_options import ExcelOptions


def _df_to_result(df: pd.DataFrame, fmt: str) -> dict[str, Any]:
    """Convert a pandas DataFrame to the standard RawDataResult dict."""
    records = json.loads(df.to_json(orient="records", force_ascii=False, date_format="iso"))
    columns = [str(c) for c in df.columns]
    return {"format": fmt, "columns": columns, "rows": records, "rowCount": len(records)}


def parse_csv(source: str | Path, max_rows: int = None, csv_options: CsvOptions | None = None) -> dict[str, Any]:
    """Parse CSV from a file path or raw text using pandas."""
    options = csv_options or CsvOptions()
    handle = io.StringIO(source) if isinstance(source, str) else source
    df = pd.read_csv(
        handle,
        nrows=max_rows,
        sep=options.delimiter,
        quotechar=options.quote_char,
        header=0 if options.header else None,
        skiprows=options.skip_rows,
        encoding=options.encoding if isinstance(source, Path) else None,
    )
    if not options.header:
        df.columns = [f"column_{i + 1}" for i in range(len(df.columns))]
    return _df_to_result(df, "csv")


def parse_excel(source: str | Path, max_rows: int = None, excel_options: ExcelOptions | None = None) -> dict[str, Any]:
    """Parse an Excel (.xlsx) file via openpyxl.

    Excel is a binary format: ``source`` must be a file path (str naming an
    existing file, or Path) — raw text is rejected.
    """
    options = excel_options or ExcelOptions()
    if isinstance(source, str) and not Path(source).is_file():
        raise ValueError("Excel parsing requires a file path — raw text is not a spreadsheet.")

    sheet = options.sheet_name if options.sheet_name is not None else 0
    df = pd.read_excel(
        source,
        sheet_name=sheet,
        header=0 if options.header else None,
        skiprows=options.skip_rows,
        nrows=max_rows,
        engine="openpyxl",
    )
    if not options.header:
        df.columns = [f"column_{i + 1}" for i in range(len(df.columns))]
    return _df_to_result(df, "excel")


def parse_json(source: str | Path, max_rows: int = None) -> dict[str, Any]:
    """Parse JSON array (preserving nested structure for JSONPath) using pandas."""
    if isinstance(source, Path):
        parsed = json.loads(source.read_text())
    else:
        parsed = json.loads(source)

    arr = parsed if isinstance(parsed, list) else [parsed]
    if max_rows is not None:
        arr = arr[:max_rows]

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


def parse_jsonl(source: str | Path, max_rows: int = None) -> dict[str, Any]:
    """Parse JSONL (one JSON object per line) using pandas."""
    if isinstance(source, Path):
        with open(source, "r") as f:
            lines = []
            for i, line in enumerate(f):
                if max_rows is not None and i >= max_rows:
                    break
                stripped = line.strip()
                if stripped:
                    lines.append(json.loads(stripped))
        records = lines
    else:
        all_lines = [line.strip() for line in source.strip().split("\n") if line.strip()]
        if max_rows is not None:
            all_lines = all_lines[:max_rows]
        records = [json.loads(line) for line in all_lines]

    if not records:
        return {"format": "jsonl", "columns": [], "rows": [], "rowCount": 0}

    df = pd.DataFrame(records)
    return _df_to_result(df, "jsonl")


def _normalize_source(source: str | Path) -> str | Path:
    """A plain string is raw data text — unless it names an existing file,
    in which case the file is read instead. This makes both
    ``parse_data("data.csv", "csv")`` and ``parse_data(Path("data.csv"), "csv")``
    work; raw text that does not point at a file is parsed as-is."""
    if isinstance(source, str) and Path(source).is_file():
        return Path(source)
    return source


def parse_data(source: str | Path | pd.DataFrame, format_hint: str = "csv", max_rows: int = None, csv_options: CsvOptions | None = None, excel_options: ExcelOptions | None = None) -> dict[str, Any]:
    """Parse raw data from a file path, text, or a pandas DataFrame.

    Args:
        source: A pandas DataFrame, a file path (str naming an existing
            file, or Path), or raw text (str). A str that names an
            existing file is read from disk; any other str is parsed as
            raw data text.
        format_hint: "csv", "json", "jsonl", "excel" (or "xlsx"). Ignored
            for DataFrames.
        max_rows: Maximum number of rows to parse (safety limit).
        csv_options: Optional CSV parsing options (delimiter, quote char,
            header, skip rows, encoding). Only applied to CSV.
        excel_options: Optional Excel parsing options (sheet, header,
            skip rows). Only applied to Excel.

    Raises:
        ValueError: Unknown format_hint, or the data could not be parsed
            (e.g. malformed JSON or an empty CSV). Never returns a silent
            empty result: a failed parse would otherwise trigger the
            mock-data fallback downstream and mislead the caller.
        FileNotFoundError: ``source`` is a path that does not exist.
    """
    if isinstance(source, pd.DataFrame):
        if max_rows is not None:
            source = source.head(max_rows)
        return _df_to_result(source, "csv")

    source = _normalize_source(source)
    if format_hint == "csv":
        return parse_csv(source, max_rows, csv_options=csv_options)
    elif format_hint == "excel" or format_hint == "xlsx":
        return parse_excel(source, max_rows, excel_options=excel_options)
    elif format_hint == "json":
        return parse_json(source, max_rows)
    elif format_hint == "jsonl":
        return parse_jsonl(source, max_rows)
    else:
        raise ValueError(f"Unknown format_hint {format_hint!r}: expected 'csv', 'json', 'jsonl', or 'excel'.")
