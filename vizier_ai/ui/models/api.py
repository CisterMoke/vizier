from pydantic import BaseModel, Field

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

    model_config = {"populate_by_name": True}


class RegenerateRequest(BaseModel):
    session_id: str = Field(alias="sessionId")


class EditChartRequest(BaseModel):
    session_id: str = Field(alias="sessionId")
    traces: list[TraceSpec]


class InsightsResponse(Insights):
    session_id: str = Field(alias="sessionId")