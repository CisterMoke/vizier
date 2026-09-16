from pydantic import BaseModel, Field
from typing import Any


class TraceFilter(BaseModel):
    field: str = Field(...)
    op: str = "eq"
    value: Any = None


class TraceSpec(BaseModel):
    chart_type: str = Field(...)
    x_axis: str = Field(...)
    y_axis: str = Field(...)
    z_axis: str | None = None
    aggregation: str | None = None
    filter: TraceFilter | None = None
    name: str | None = None


class ChartSpec(BaseModel):
    traces: list[TraceSpec] = Field(min_length=1)
    plotlyData: list[Any] | None = None
    plotlyLayout: dict[str, Any] | None = None


class InsightMetadata(BaseModel):
    title: str = Field(...)
    summary: str = Field(...)
    keyIdea: str = Field(...)
    description: str | None = Field(default=None)


class InsightCandidate(BaseModel):
    id: str = Field(...)
    metadata: InsightMetadata
    traces: list[TraceSpec] = Field(min_length=1)


class InsightCandidates(BaseModel):
    candidates: list[InsightCandidate]


class Insight(BaseModel):
    id: str = Field(...)
    metadata: InsightMetadata
    chart_spec: ChartSpec= Field(...)

    @classmethod
    def from_candidate(cls, candidate: InsightCandidate):
        insight = cls(
            id=candidate.id,
            metadata=candidate.metadata,
            chart=ChartSpec(
                traces=candidate.traces,
            )
        )
        return insight


class Insights(BaseModel):
    Insights: list[Insight]