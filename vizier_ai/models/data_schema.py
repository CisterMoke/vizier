from pydantic import BaseModel, Field
from typing import Any


class DatasetField(BaseModel):
    name: str = Field(...)
    jsonPath: str = Field(...)
    type: str = "string"
    nullable: bool = False
    semanticType: str | None = None
    sampleValues: Any | None = None
    unique: bool | None = None
    group: str | None = None


class DatasetSchema(BaseModel):
    source: str = Field(...)
    fields: list[DatasetField] = Field(...)
    warnings: list[str] = []