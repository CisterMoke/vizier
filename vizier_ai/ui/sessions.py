import uuid


_sessions: dict[str, dict] = {}


def _create_session(real_data: dict | None, schema_text: str, insights: list | None = None, dataset_schema=None) -> str:
    session_id = uuid.uuid4().hex
    _sessions[session_id] = {
        "real_data": real_data,
        "schema_text": schema_text,
        "insights": insights or [],
        "dataset_schema": dataset_schema,
    }
    return session_id


def _set_session_insights(session_id: str, insights: list) -> None:
    session = _sessions.get(session_id)
    if session is not None:
        session["insights"] = insights


def _set_session_schema(session_id: str, dataset_schema) -> None:
    session = _sessions.get(session_id)
    if session is not None:
        session["dataset_schema"] = dataset_schema


def _session_field_labels(session: dict) -> dict[str, str] | None:
    """jsonPath→field-name map from the session's dataset schema."""
    schema = session.get("dataset_schema")
    if schema is None:
        return None
    return {field.jsonPath: field.name for field in schema.fields}


def _get_session(session_id: str) -> dict | None:
    return _sessions.get(session_id)


def _get_session_rows(session: dict) -> list[dict]:
    real_data = session.get("real_data")
    if real_data and real_data.get("rowCount", 0) > 0:
        return real_data.get("rows", [])
    return []
