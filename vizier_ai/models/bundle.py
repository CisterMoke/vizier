from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from vizier_ai.models.data_profile import DataProfile
from vizier_ai.models.data_schema import DatasetSchema
from vizier_ai.models.insights import InsightCandidate


class SavedInsight(InsightCandidate):
    mock_seed: int | None = Field(
        default=None,
        description="Seed for the mock data generator. Only set when the insight was generated without real data; guarantees the exact same chart reproduces on load.",
    )


class InsightBundle(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    version: Literal[1] = Field(
        default=1,
        description="Bundle format version. Bump when the structure changes incompatibly.",
    )
    dataset_schema: DatasetSchema = Field(
        ...,
        alias="schema",
        serialization_alias="schema",
        description="Dataset schema the insights' trace jsonPaths refer to. The compatibility contract for connecting a dataset to this bundle.",
    )
    data_profile: DataProfile | None = Field(
        default=None,
        description="Mock-data recipe. Present only when the insights were generated without real data, so the exact same charts can be reproduced without any attached dataset. Null when a real dataset was used.",
    )
    insights: list[SavedInsight] = Field(
        ...,
        min_length=1,
        description="Saved insights: metadata and chart recipes only, no rendered data points.",
    )
