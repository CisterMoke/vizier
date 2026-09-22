from pydantic import BaseModel, Field
from typing import Any


class DatasetField(BaseModel):
    name: str = Field(..., description="Human-friendly field name (e.g. \"County\" or \"Geocoded Column Longitude\").")
    jsonPath: str = Field(..., description="JSONPath expression to access this field in a data record. Always use bracket notation with single quotes to prevent parsing errors: $['fieldname'] instead of $.fieldname.")
    type: str = Field(default="string", description="Field data type: string, number, boolean, date, or datetime.")
    nullable: bool = Field(default=False, description="Whether the field can be missing or null.")
    semanticType: str | None = Field(default=None, description="Semantic meaning of the field: identifier (primary key), measure (numeric metric), dimension (categorical label), timestamp, currency, percentage, count, text, latitude (lat/geo lat), longitude (lng/geo lon), or geohash.")
    sampleValues: Any | None = Field(default=None, description="3-5 representative values if they can be inferred from the input.")
    unique: bool | None = Field(default=None, description="True if the field is a primary key or unique identifier.")
    group: str | None = Field(default=None, description="Grouping label if the fields come from distinct nested objects or resources (e.g. \"order\", \"customer\").")


class DatasetSchema(BaseModel):
    source: str = Field(..., description="Short description of where the data comes from.")
    fields: list[DatasetField] = Field(..., description="Flat list of fields extracted from the data description.")
    warnings: list[str] = Field(default_factory=list, description="Warnings for any fields you are uncertain about.")
