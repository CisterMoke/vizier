"""Tests for CSV parsing options and the parser."""

import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).parents[1]))

from vizier_ai.models.csv_options import CsvOptions
from vizier_ai.parser import parse_csv, parse_data


class TestCsvOptionsModel:
    def test_accepts_defaults(self):
        options = CsvOptions()

        assert options.delimiter == ","
        assert options.quote_char == '"'
        assert options.header is True
        assert options.skip_rows == 0
        assert options.encoding == "utf-8"

    def test_accepts_full_options(self):
        options = CsvOptions(
            delimiter=";",
            quote_char="'",
            header=False,
            skip_rows=2,
            encoding="latin-1",
        )

        assert options.delimiter == ";"
        assert options.quote_char == "'"
        assert options.header is False
        assert options.skip_rows == 2
        assert options.encoding == "latin-1"

    def test_rejects_multichar_delimiter(self):
        with pytest.raises(ValidationError):
            CsvOptions(delimiter=";;")

    def test_rejects_empty_quote_char(self):
        with pytest.raises(ValidationError):
            CsvOptions(quote_char="")

    def test_rejects_negative_skip_rows(self):
        with pytest.raises(ValidationError):
            CsvOptions(skip_rows=-1)

    def test_rejects_unknown_encoding(self):
        with pytest.raises(ValidationError):
            CsvOptions(encoding="not-a-codec")

    def test_accepts_utf_16_encoding(self):
        assert CsvOptions(encoding="utf-16").encoding == "utf-16"


class TestParseCsvOptions:
    def test_default_parses_comma_csv(self):
        text = "county,total\nKing,100\nPierce,200"

        result = parse_csv(text)

        assert result["columns"] == ["county", "total"]
        assert result["rowCount"] == 2

    def test_semicolon_delimiter(self):
        text = "county;total\nKing;100\nPierce;200"

        result = parse_csv(text, csv_options=CsvOptions(delimiter=";"))

        assert result["columns"] == ["county", "total"]
        assert result["rowCount"] == 2

    def test_tab_delimiter(self):
        text = "county\ttotal\nKing\t100"

        result = parse_csv(text, csv_options=CsvOptions(delimiter="\t"))

        assert result["columns"] == ["county", "total"]

    def test_no_header_generates_column_names(self):
        text = "King,100\nPierce,200"

        result = parse_csv(text, csv_options=CsvOptions(header=False))

        assert result["columns"] == ["column_1", "column_2"]
        assert result["rows"][0] == {"column_1": "King", "column_2": 100}

    def test_skip_rows_skips_leading_rows(self):
        text = "# generated 2024-01-01\n# source: DOL\ncounty,total\nKing,100"

        result = parse_csv(text, csv_options=CsvOptions(skip_rows=2))

        assert result["columns"] == ["county", "total"]
        assert result["rowCount"] == 1

    def test_latin1_encoding(self, tmp_path):
        path = tmp_path / "data.csv"
        path.write_bytes("département,total\nRhône,100".encode("latin-1"))

        result = parse_csv(path, csv_options=CsvOptions(encoding="latin-1"))

        assert result["columns"] == ["département", "total"]
        assert result["rows"][0]["département"] == "Rhône"

    def test_custom_quote_char(self):
        text = "name,note\n'King','a, quoted value'"

        result = parse_csv(text, csv_options=CsvOptions(quote_char="'"))

        assert result["rows"][0]["note"] == "a, quoted value"

    def test_parse_data_passes_csv_options(self):
        text = "county;total\nKing;100"

        result = parse_data(text, "csv", csv_options=CsvOptions(delimiter=";"))

        assert result["columns"] == ["county", "total"]

    def test_parse_data_ignores_csv_options_for_json(self):
        result = parse_data('[{"county": "King"}]', "json", csv_options=CsvOptions(delimiter=";"))

        assert result["columns"] == ["county"]
        assert result["rows"][0]["county"] == "King"
