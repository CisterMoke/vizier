import uuid


_sessions: dict[str, dict] = {}


def _create_session(real_data: dict | None, schema_text: str, insights: list | None = None) -> str:
    session_id = uuid.uuid4().hex
    _sessions[session_id] = {
        "real_data": real_data,
        "schema_text": schema_text,
        "insights": insights or [],
    }
    return session_id


def _set_session_insights(session_id: str, insights: list) -> None:
    session = _sessions.get(session_id)
    if session is not None:
        session["insights"] = insights


def _get_session(session_id: str) -> dict | None:
    return _sessions.get(session_id)


def _get_session_rows(session: dict) -> list[dict]:
    real_data = session.get("real_data")
    if real_data and real_data.get("rowCount", 0) > 0:
        return real_data.get("rows", [])
    return []
