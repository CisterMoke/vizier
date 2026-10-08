from pydantic import BaseModel, Field


class ExcelOptions(BaseModel):
    sheet_name: str | int | None = Field(
        default=None,
        description="Sheet to parse: sheet name, 0-based index, or None for the first sheet.",
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
