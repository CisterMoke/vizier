from pydantic import BaseModel, Field
from typing import Any


class DataColumnSpec(BaseModel):
    name: str = Field(min_length=1)
    generator: str = "uniform"
    categories: list[str] | None = None
    min: float | None = None
    max: float | None = None
    mean: float | None = None
    stddev: float | None = None
    start: float | None = None
    end: float | None = None
    step: float | None = None
    value: Any | None = None


class DataProfile(BaseModel):
    columns: list[DataColumnSpec] = Field(min_length=1, default_factory=list)