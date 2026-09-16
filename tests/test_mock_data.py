"""Tests for mock_data jsonPath-to-key conversion with bracket notation."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from vizier_ai.mock_data import _json_path_to_key, generate_mock_rows


class TestJsonPathToKey:
    """Test that _json_path_to_key correctly handles both dot and bracket notation."""

    def test_simple_dot_notation(self):
        assert _json_path_to_key("$.county") == "county"

    def test_nested_dot_notation(self):
        assert _json_path_to_key("$.parent.child") == "parent.child"

    def test_bracket_notation_with_dot(self):
        assert _json_path_to_key("$['revenue.usd']") == "revenue.usd"

    def test_bracket_notation_with_hyphen(self):
        assert _json_path_to_key("$['status-code']") == "status-code"

    def test_bracket_notation_with_space(self):
        assert _json_path_to_key("$['total revenue']") == "total revenue"

    def test_bracket_notation_with_at_symbol(self):
        assert _json_path_to_key("$['data@special']") == "data@special"

    def test_no_dollar_prefix(self):
        assert _json_path_to_key("county") == "county"

    def test_empty_string(self):
        assert _json_path_to_key("") == ""


class TestGenerateMockRowsWithBracketNotation:
    """Test that generate_mock_rows creates rows with correct keys from bracket-escaped jsonPaths."""

    def test_mock_rows_with_dotted_field(self):
        data_profile = {
            "columns": [
                {"name": "$.county", "generator": "category", "categories": ["King", "Pierce"]},
                {"name": "$['revenue.usd']", "generator": "uniform", "min": 100, "max": 200},
            ]
        }
        rows = generate_mock_rows(data_profile, seed=42)
        assert len(rows) == 200
        assert "county" in rows[0]
        assert "revenue.usd" in rows[0]
        assert "['revenue.usd']" not in rows[0]

    def test_mock_rows_mixed_notation(self):
        data_profile = {
            "columns": [
                {"name": "$.normal_field", "generator": "constant", "value": 5},
                {"name": "$['dotted.field']", "generator": "constant", "value": 10},
                {"name": "$['hyphen-field']", "generator": "constant", "value": 20},
            ]
        }
        rows = generate_mock_rows(data_profile, seed=42)
        assert "normal_field" in rows[0]
        assert "dotted.field" in rows[0]
        assert "hyphen-field" in rows[0]
        assert rows[0]["normal_field"] == 5
        assert rows[0]["dotted.field"] == 10
        assert rows[0]["hyphen-field"] == 20

    def test_none_returns_empty(self):
        assert generate_mock_rows(None, seed=42) == []

    def test_empty_profile_returns_empty(self):
        assert generate_mock_rows({"columns": []}, seed=42) == []
