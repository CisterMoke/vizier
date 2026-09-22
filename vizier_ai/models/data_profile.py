from pydantic import BaseModel, Field
from typing import Any


class DataColumnSpec(BaseModel):
    name: str = Field(min_length=1, description="JSONPath string of the schema field this column generates data for, copied exactly from the schema (e.g. \"$.county\" or \"$['revenue.usd']\").")
    generator: str = Field(default="uniform", description="Mock data generator: category, normal, uniform, linear, or constant. Choose based on the field's type and semanticType: dimension → category; measure → normal; currency → normal with a realistic mean and stddev and min 0; percentage → uniform 0-100; count → uniform from 0 to a reasonable max; timestamp/date → linear across a year of epoch timestamps with a step sized for 200 rows; identifier → linear starting at 1 with step 1; latitude → uniform -90 to 90; longitude → uniform -180 to 180; text → category; boolean → category with categories [\"true\", \"false\"]; anything else → uniform with sensible defaults.")
    categories: list[str] | None = Field(default=None, description="Required for the category generator: 5-10 realistic values inferred from the field name and semantics (e.g. counties, statuses, makes).")
    min: float | None = Field(default=None, description="Lower bound for the uniform generator; optional lower bound for normal.")
    max: float | None = Field(default=None, description="Upper bound for the uniform generator; optional upper bound for normal.")
    mean: float | None = Field(default=None, description="Required for the normal generator: realistic mean inferred from the field semantics (e.g. 50000 for currency).")
    stddev: float | None = Field(default=None, description="Required for the normal generator: realistic standard deviation inferred from the field semantics (e.g. 20000 for currency).")
    start: float | None = Field(default=None, description="Required for the linear generator: start value (epoch timestamp for date fields, 1 for identifiers).")
    end: float | None = Field(default=None, description="Required for the linear generator: end value (epoch timestamp for date fields).")
    step: float | None = Field(default=None, description="Required for the linear generator: increment per row, sized so start-to-end spans 200 rows (1 for identifiers).")
    value: Any | None = Field(default=None, description="Required for the constant generator: the fixed value.")


class DataProfile(BaseModel):
    columns: list[DataColumnSpec] = Field(min_length=1, default_factory=list, description="One column per schema field.")
