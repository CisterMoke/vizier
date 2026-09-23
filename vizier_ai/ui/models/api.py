from pydantic import BaseModel, Field

from vizier_ai.models.constraints import InsightConstraints
from vizier_ai.models.csv_options import CsvOptions
from vizier_ai.models.insights import Insights, TraceSpec


class GenerateRequest(BaseModel):
    schema_text: str = Field(alias="schemaText")
    data_source_mode: str = Field(default="none", alias="dataSourceMode")
    rest_method: str | None = Field(default=None, alias="restMethod")
    rest_url: str | None = Field(default=None, alias="restUrl")
    rest_headers: str | None = Field(default=None, alias="restHeaders")
    rest_body: str | None = Field(default=None, alias="restBody")
    sql_connection: str | None = Field(default=None, alias="sqlConnection")
    sql_query: str | None = Field(default=None, alias="sqlQuery")
    constraints: InsightConstraints | None = None

    model_config = {"populate_by_name": True}


class RegenerateRequest(BaseModel):
    session_id: str = Field(alias="sessionId")
    constraints: InsightConstraints | None = None


class EditChartRequest(BaseModel):
    session_id: str = Field(alias="sessionId")
    traces: list[TraceSpec]


class InsightsResponse(Insights):
    session_id: str = Field(alias="sessionId")
    csv_options: CsvOptions | None = Field(
        default=None,
        description="Parsing options used for the CSV upload, echoed so clients can persist them in a saved bundle.",
    )
    warnings: list[str] | None = None