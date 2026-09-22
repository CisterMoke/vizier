from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

CHART_TYPE = Literal["bar", "line", "pie", "scatter", "heatmap", "geomap"]

FieldName = Annotated[str, Field(min_length=1)]


class InsightConstraints(BaseModel):
    include_chart_types: list[CHART_TYPE] | None = Field(
        default=None,
        min_length=1,
        description="Hard constraint: every trace must use one of these chart types.",
    )
    exclude_chart_types: list[CHART_TYPE] | None = Field(
        default=None,
        min_length=1,
        description="Hard constraint: no trace may use these chart types.",
    )
    include_fields: list[FieldName] | None = Field(
        default=None,
        min_length=1,
        description="Hard constraint: every insight must feature at least one of these fields, given by field name or jsonPath.",
    )
    exclude_fields: list[FieldName] | None = Field(
        default=None,
        min_length=1,
        description="Hard constraint: no trace may reference these fields, given by field name or jsonPath.",
    )
    guidance: str | None = Field(
        default=None,
        description="Soft constraint: free-form direction for the insight generation (e.g. \"focus on trends\", \"compare regions\"). Never verified, only passed to the model.",
    )

    @model_validator(mode="after")
    def _check_mutual_exclusion(self):
        if self.include_chart_types and self.exclude_chart_types:
            raise ValueError("include_chart_types and exclude_chart_types are mutually exclusive")
        if self.include_fields and self.exclude_fields:
            raise ValueError("include_fields and exclude_fields are mutually exclusive")
        return self
