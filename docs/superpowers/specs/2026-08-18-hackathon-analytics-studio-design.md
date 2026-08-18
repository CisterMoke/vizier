# Hackathon Analytics Studio Design

## Goal

Build a standalone web app for hackathon demos that turns freeform data schema input into brainstormed analytics and hypotheses, visualizes them as interactive charts with synthetic data, and exports a portable result package.

## Product Scope

### V1 (in scope)

- Frontend-only SPA using existing Vite + Preact + TypeScript project.
- User can paste any schema-like text input (SQL, JSON-ish, prose, mixed formats).
- App normalizes input into an editable canonical schema preview.
- LLM generates candidate insights, metrics, and chart intents.
- App generates mock data matching schema and insight intent.
- App renders interactive charts using Plotly.
- User can edit, regenerate, and remove cards.
- User can export a JSON report with schema, insights, chart specs, and generated data.
- Deploy as static standalone app on Vercel.

### Stage 2 (out of scope for v1, but designed for)

- Validate hypotheses with real data connectors.
- Add web scraping ingestion path.
- Optional backend key proxy and governance.

## Architecture

V1 runs fully in the browser for fastest hackathon iteration and lowest operational risk. The app is organized around focused services and stable interfaces so stage-2 backend-backed providers can be introduced without rewriting UI and workflows.

### Runtime model

- Client-only execution for parsing, generation orchestration, synthetic data, and chart rendering.
- Optional direct LLM API call from browser using user-provided key.
- No server required for core flow.

### Core modules

- `schema-ingest`: collects raw schema text.
- `schema-normalizer`: transforms freeform input into canonical schema with warnings.
- `idea-engine`: sends canonical schema and constraints to LLM provider and validates response.
- `mock-data-engine`: creates deterministic synthetic datasets by seed.
- `viz-engine`: maps insight intent and data to Plotly spec.
- `workspace`: stores user session state and card actions.
- `export`: emits one reproducible JSON artifact.

## Technology Choices

## Language strategy

- V1 language: TypeScript only.
- Python environment remains reserved for stage-2 connector/scraping services.

### Libraries

- UI/runtime: `preact`, `vite`, `typescript`
- Charts: `plotly.js` and `react-plotly.js` (via `preact/compat`)
- State: `zustand`
- Contracts: `zod`
- Testing: `vitest`, `@testing-library/preact`, `playwright` (light e2e)

### Deployment

- Build artifact: static Vite bundle.
- Hosting: Vercel.
- No required server environment variables for baseline app behavior.

## Data and UX Flow

1. User pastes freeform schema text.
2. App normalizes and shows editable parsed schema preview.
3. User triggers insight generation.
4. LLM returns hypotheses, metrics, chart suggestions, assumptions, and confidence.
5. App creates synthetic datasets for selected insights.
6. Plotly renders interactive chart cards.
7. User tunes or regenerates individual cards.
8. User exports a report JSON.

## Domain Contracts

### Canonical schema

- Entities/tables
- Fields with inferred types and nullability
- Relationships
- Warning list for uncertain parsing

### Insight candidate

- ID
- Title
- Hypothesis statement
- Metric logic description
- Recommended chart type
- Assumptions
- Confidence score

### Generated dataset

- Dataset metadata: seed, row count
- Column definitions
- Row values

### Chart card

- Insight payload
- Synthetic dataset reference
- Plotly spec
- UI state (loading/error/ready)

## Service Boundaries

- `SchemaIngestService`
  - Input: raw text
  - Output: ingest payload with parse hints
- `SchemaNormalizeService`
  - Input: raw text
  - Output: canonical schema
- `InsightGenerationService`
  - Input: canonical schema
  - Output: insight candidates
- `MockDataService`
  - Input: canonical schema + insight candidate
  - Output: generated dataset
- `ChartSpecService`
  - Input: insight candidate + generated dataset
  - Output: Plotly data/layout config
- `ExportService`
  - Input: workspace state
  - Output: report JSON

## Adapter Interfaces for Stage 2

- `LLMProvider`
  - v1: browser key + direct API call.
  - stage 2: backend-proxied provider.
- `DataProvider`
  - v1: mock-only generator.
  - stage 2: connector-backed and scraper-backed providers.

This keeps UI and workspace logic stable while replacing only provider implementations.

## Error Handling

- Parsing never hard-fails; it returns best-effort output plus warnings.
- LLM failures expose retry and fallback options.
- Chart rendering failure falls back to dataset table preview for affected card.
- Errors are scoped per card when possible to avoid breaking the full session.

## Security and Privacy (v1)

- API key is session-memory only by default.
- API key must never be logged in plaintext.
- Any persistence of API key is opt-in and explicit.
- UI copy states that browser session is used for model calls.

## Reliability for Demo Conditions

- Deterministic demo seed mode for repeatable outputs.
- Built-in sample schemas for instant demo paths.
- Offline fallback insight templates when LLM is unavailable.

## Testing Strategy

- Unit tests for normalization, mock data generation, and chart spec mapping.
- Contract tests for provider output validation.
- Snapshot/golden tests for export payload shape.
- Lightweight e2e: paste schema -> generate ideas -> render chart -> export report.

## Non-Goals for V1

- Real connector execution.
- Scraping execution pipeline.
- Multi-user collaboration and auth.
- Production-grade governance and billing controls.

## Success Criteria

- End-to-end flow works in one session from freeform schema to export.
- At least 6-10 meaningful insight cards per sample schema.
- Charts are interactive and understandable for judges.
- Static deploy runs successfully on Vercel without backend dependency.
