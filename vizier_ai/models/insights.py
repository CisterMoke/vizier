from pydantic import BaseModel, Field, model_validator
from typing import Any

from vizier_ai.models.data_profile import DataProfile
from vizier_ai.models.data_schema import DatasetSchema


class TraceFilter(BaseModel):
    field: str = Field(..., description="JSONPath string of the field to filter on, copied exactly from the schema fields (including bracket-escaped paths like $['revenue.usd']) — do not modify it.")
    op: str = Field(default="eq", description="Comparison operator: eq, ne, gt, gte, lt, lte, in, or not_in.")
    value: Any = Field(default=None, description="Value to compare against: a string, number, or array of strings/numbers.")


class TraceSpec(BaseModel):
    chart_type: str = Field(..., description="Chart type: bar (categorical comparisons), line (trends over time), pie (share/proportion), scatter (correlation between two measures), heatmap (2D density/intensity views), or geomap (geographic coordinates — set x_axis to the longitude jsonPath, y_axis to the latitude jsonPath, and optionally z_axis to an intensity/value jsonPath).")
    x_axis: str = Field(..., description="JSONPath string of the field displayed on the x-axis (longitude for geomap). Copy the schema jsonPath exactly — do not modify bracket-escaped paths like $['revenue.usd'].")
    y_axis: str = Field(..., description="JSONPath string of the field displayed on the y-axis (latitude for geomap). Copy the schema jsonPath exactly — do not modify bracket-escaped paths like $['revenue.usd'].")
    z_axis: str | None = Field(default=None, description="Optional JSONPath string for heatmap intensity or geomap point coloring. Copy the schema jsonPath exactly.")
    aggregation: str | None = Field(default=None, description="Optional aggregation of y_axis values grouped by x_axis: sum, mean, count, min, max, median, first, or last (e.g. count of items by category, sum of revenue by region).")
    filter: TraceFilter | None = Field(default=None, description="Optional filter selecting a subset of the data for this trace only.")
    name: str | None = Field(default=None, description="Trace name shown in the legend.")


class ChartSpec(BaseModel):
    traces: list[TraceSpec] = Field(min_length=1, description="At least one trace. Multiple traces are overlaid in one chart; each additional trace automatically gets its own secondary y-axis.")
    plotlyData: list[Any] | None = None
    plotlyLayout: dict[str, Any] | None = None


class InsightMetadata(BaseModel):
    title: str = Field(..., description="Short, non-empty chart title.")
    summary: str = Field(..., description="Non-empty one-to-two sentence summary of what the chart shows.")
    keyIdea: str = Field(..., description="Non-empty concise reasoning for why this insight is interesting.")
    description: str | None = Field(default=None, description="Optional longer description.")


class InsightCandidate(BaseModel):
    id: str = Field(..., description="Unique, non-empty insight identifier.")
    metadata: InsightMetadata = Field(..., description="Insight metadata with non-empty title, summary, and keyIdea.")
    traces: list[TraceSpec] = Field(min_length=1, description="At least one trace defining the chart.")


class InsightCandidates(BaseModel):
    candidates: list[InsightCandidate] = Field(..., min_length=1, description="Up to 10 insight candidates. At least one is required.")


class ConstrainedInsightCandidates(BaseModel):
    candidates: list[InsightCandidate] = Field(
        default_factory=list,
        description="Insight candidates that satisfy every hard constraint. May be empty only when the constraints cannot be satisfied.",
    )
    fallback_reason: str | None = Field(
        default=None,
        description="Required when candidates is empty: explain why the hard constraints cannot be satisfied (e.g. an allowed chart type needs fields the schema lacks). Must be empty when candidates is non-empty.",
    )

    @model_validator(mode="after")
    def _check_fallback_xor_candidates(self):
        if not self.candidates and not self.fallback_reason:
            raise ValueError("fallback_reason is required when candidates is empty")
        if self.candidates and self.fallback_reason:
            raise ValueError("fallback_reason must be empty when candidates is non-empty")
        return self


class Insight(BaseModel):
    id: str = Field(...)
    metadata: InsightMetadata
    chart_spec: ChartSpec = Field(...)
    mock_seed: int | None = Field(
        default=None,
        description="Seed used by the mock data generator for this insight. Only set when no real data was provided.",
    )

    @classmethod
    def from_candidate(cls, candidate: InsightCandidate):
        insight = cls(
            id=candidate.id,
            metadata=candidate.metadata,
            chart_spec=ChartSpec(
                traces=candidate.traces,
            )
        )
        return insight


class Insights(BaseModel):
    insights: list[Insight]
    dataset_schema: DatasetSchema | None = Field(
        default=None,
        description="Dataset schema the insights were generated from. Present so insights can be saved to a bundle and re-rendered later.",
    )
    data_profile: DataProfile | None = Field(
        default=None,
        description="Mock-data recipe, present only when the insights were generated without real data.",
    )
