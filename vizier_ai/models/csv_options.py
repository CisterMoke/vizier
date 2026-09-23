import codecs

from pydantic import BaseModel, Field, field_validator


class CsvOptions(BaseModel):
    delimiter: str = Field(
        default=",",
        min_length=1,
        max_length=1,
        description="Field delimiter (single character).",
    )
    quote_char: str = Field(
        default='"',
        min_length=1,
        max_length=1,
        description="Quote character (single character).",
    )
    header: bool = Field(
        default=True,
        description="Whether the first row contains column names. When false, columns are named column_1, column_2, ...",
    )
    skip_rows: int = Field(
        default=0,
        ge=0,
        description="Number of leading rows to skip before the header row.",
    )
    encoding: str = Field(
        default="utf-8",
        description="File encoding — any Python codec, e.g. utf-8, latin-1, windows-1252, utf-16.",
    )

    @field_validator("encoding")
    @classmethod
    def _validate_encoding(cls, value: str) -> str:
        try:
            codecs.lookup(value)
        except LookupError as exc:
            raise ValueError(f"Unknown encoding: {value}") from exc
        return value
