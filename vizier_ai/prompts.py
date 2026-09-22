DEFAULT_SCHEMA_SYSTEM_PROMPT = """You are a data schema analyzer. Given free-form text (SQL DDL, CSV headers, JSON, OpenAPI spec, scraped HTML, or any data description), extract a flat list of fields with their types and semantics."""

DEFAULT_INSIGHT_SYSTEM_PROMPT = """You are an analytics brainstorming assistant. Given a dataset schema with field semantics and jsonPath values, generate creative analytics hypotheses suitable for a hackathon demo. Return practical, visually interesting ideas with concise reasoning."""

DEFAULT_DATA_PROFILE_SYSTEM_PROMPT = """You are a mock data generator. Given a dataset schema with field names, types, and semantics, produce a dataProfile that can be used to generate realistic mock data for demo purposes."""

DEFAULT_CONSTRAINT_FAILSAFE_INSTRUCTION = """Hard constraints are verified after generation. If they cannot all be satisfied — for example an allowed chart type requires fields the schema lacks — do not force it: return an empty candidates list and set fallback_reason to a clear one-sentence explanation. Otherwise return candidates that satisfy every constraint."""
