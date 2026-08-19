# JSONPath + Aggregation + Overlay Charts Design

Date: 2026-08-20

## Summary

Three improvements to the Analytics Idea Lab:

1. **JSONPath on DatasetField** — every field gets a `jsonPath` (e.g. `$.county`, `$.geocoded_column.longitude`) so chart axes can reference data precisely. This eliminates the separate field-mapping LLM call (3 calls → 2).

2. **Aggregation via Plotly transforms** — chart traces carry optional Plotly `aggregate` transforms (sum/mean/count/min/max/median). Plotly groups and aggregates natively before rendering, fixing the bar chart Y-value stacking issue.

3. **Overlay plots via traces array** — `ChartSpec` gains a `traces` array where each entry has its own `chartType`, axes (JSONPath), transform, and optional secondary y-axis. This enables bar + line overlays, dual-axis charts, etc.

## DatasetField + JSONPath

### Schema change

Add `jsonPath: string` to `DatasetField` in all three layers:

| Layer | File |
|-------|------|
| TypeScript | `frontend/src/domain/types.ts:16-24` |
| Zod | `frontend/src/domain/schemas.ts:19-27` |
| Pydantic | `backend/main.py:153-160` |

```typescript
export interface DatasetField {
  name: string          // human-friendly name, e.g. "County"
  jsonPath: string      // "$.county" or "$.geocoded_column.longitude"
  type: FieldType
  nullable: boolean
  semanticType?: SemanticType
  sampleValues?: unknown[] | string
  unique?: boolean
  group?: string | null
}
```

### MAP_SCHEMA_PROMPT update

The schema-mapping LLM prompt instructs the LLM to generate a `jsonPath` for every field. For flat top-level fields: `$.<field_name>`. For nested fields (e.g. Socrata's `geocoded_column` object): `$.geocoded_column.longitude`.

### Field-mapping LLM call eliminated

Removed from `_run_pipeline`:
- `FIELD_MAPPING_PROMPT` constant
- `FieldMappingResult` Pydantic model
- `FieldMapping` Pydantic model
- The third LLM call (`main.py:317-338`)

The insight-generation LLM uses JSONPath strings directly from the schema fields in chart axes. No intermediate mapping step is needed.

### Frontend JSONPath resolution

The frontend uses the `jsonpath-plus` library (~5KB gzipped) to resolve JSONPath strings against data rows. A new `resolveValues(dataset, jsonPath)` helper extracts arrays of values:

```typescript
import { JSONPath } from 'jsonpath-plus'

const resolveValues = (dataset: Dataset, jsonPath: string): unknown[] => {
  return dataset.rows.map(row => {
    const result = JSONPath({ path: jsonPath, json: row })
    return result.length > 0 ? result[0] : null
  })
}
```

For mock data, rows are flat objects keyed by the last segment of the JSONPath (`$.county` → key `county`). For real data, rows may be nested JSON objects (e.g. from REST APIs), and JSONPath navigates the nesting.

### Files touched

- `frontend/src/domain/types.ts` — add `jsonPath` to `DatasetField`
- `frontend/src/domain/schemas.ts` — add `jsonPath` to `datasetFieldSchema`
- `backend/main.py` — add `jsonPath` to `DatasetField` Pydantic model; update `MAP_SCHEMA_PROMPT`; remove `FIELD_MAPPING_PROMPT`, `FieldMappingResult`, `FieldMapping`, and the field-mapping LLM call from `_run_pipeline`
- `frontend/src/app.tsx` — replace `applyFieldMapping` with JSONPath resolution
- `frontend/src/services/apiClient.ts` — remove `fieldMappings` from `GenerateResponse`
- `frontend/package.json` — add `jsonpath-plus` dependency

## ChartSpec — Traces Array + Plotly Transforms

### New types

```typescript
export interface PlotlyAggregation {
  func: 'sum' | 'mean' | 'count' | 'min' | 'max' | 'median' | 'first' | 'last'
  target: string  // field key to aggregate, usually 'y'
}

export interface PlotlyTransform {
  type: 'aggregate'
  groups: string  // JSONPath or field key for grouping, usually same as xAxis
  aggregations: PlotlyAggregation[]
}

export interface TraceSpec {
  chartType: ChartType
  xAxis: string                 // JSONPath string
  yAxis: string                 // JSONPath string
  zAxis?: string | null         // JSONPath string
  transform?: PlotlyTransform | null
  yaxis2?: string | null        // 'y2' for secondary y-axis
  name?: string | null          // trace name for legend
}
```

### ChartSpec update

```typescript
export interface ChartSpec {
  mode: 'recipe' | 'custom'
  chartType?: ChartType         // shorthand for single-trace
  xAxis?: string                // shorthand for single-trace
  yAxis?: string                // shorthand for single-trace
  zAxis?: string | null         // shorthand for single-trace
  traces?: TraceSpec[] | null  // multi-trace: overrides shorthand if present
  plotlyData?: unknown[] | null
  plotlyLayout?: Record<string, unknown> | null
}
```

### Backward compatibility

Top-level `chartType`/`xAxis`/`yAxis`/`zAxis` remain as shorthand. The chart builder:
1. If `spec.traces` is present and non-empty → build one Plotly trace per entry
2. Else → build a single trace from the top-level shorthand fields

Existing LLM output (shorthand) continues to work. New output can use the richer `traces` array.

### Plotly transform embedding

When building a Plotly trace, the frontend embeds the `transform` as a Plotly `transforms` array:

```javascript
{
  type: 'bar',
  x: resolvedXValues,
  y: resolvedYValues,
  transforms: [{
    type: 'aggregate',
    groups: resolvedXValues,
    aggregations: [{ func: 'sum', target: 'y' }]
  }]
}
```

Plotly handles the aggregation natively — grouping by `groups` and applying `func` to `target`. This eliminates the stacking problem.

### Overlay example

```json
{
  "mode": "recipe",
  "traces": [
    {
      "chartType": "bar",
      "xAxis": "$.county",
      "yAxis": "$.dol_vehicle_id",
      "transform": {
        "type": "aggregate",
        "groups": "$.county",
        "aggregations": [{ "func": "count", "target": "y" }]
      },
      "name": "EV Count"
    },
    {
      "chartType": "line",
      "xAxis": "$.county",
      "yAxis": "$.electric_range",
      "transform": {
        "type": "aggregate",
        "groups": "$.county",
        "aggregations": [{ "func": "mean", "target": "y" }]
      },
      "yaxis2": "y2",
      "name": "Avg Range"
    }
  ]
}
```

The builder sets `yaxis: 'y2'` on the second trace and adds a `yaxis2` layout entry (side: 'right', overlaying: 'y').

### INSIGHT_PROMPT update

The insight-generation prompt is updated to:
- Instruct the LLM to use `jsonPath` values from the schema in trace axes
- Explain the `traces` array format for multi-trace charts
- Explain the `transform` object for aggregation with examples (sum/count/mean)
- Explain `yaxis2` for secondary axes
- Keep `mode: 'recipe'` default and shorthand fields for simple charts
- Provide examples of common patterns: aggregated bar chart, line overlay on bar chart, pie chart with count aggregation

### Files touched

- `frontend/src/domain/types.ts` — add `TraceSpec`, `PlotlyTransform`, `PlotlyAggregation`; add `traces` to `ChartSpec`
- `frontend/src/domain/schemas.ts` — add Zod schemas for `TraceSpec`, `PlotlyTransform`, `PlotlyAggregation`; add `traces` to `chartSpecSchema`
- `backend/main.py` — add Pydantic models for `TraceSpec`, `PlotlyTransform`, `PlotlyAggregation`; add `traces` to `ChartSpec`; update `INSIGHT_PROMPT` and retry prompt

## Chart Builder Refactor

### New architecture

```
buildPlotlySpec(insight, dataset)
  └── resolveTraces(spec, dataset)
       ├── If spec.traces exists → build one trace per TraceSpec entry
       └── Else → build one trace from shorthand (chartType + xAxis + yAxis + zAxis)
            └── buildTrace(chartType, xValues, yValues, zValues, transform, yaxis2)
                 ├── Resolve JSONPath → extract x/y/z arrays from dataset rows
                 ├── Embed transform as Plotly transforms array on the trace
                 └── Set yaxis: 'y2' if yaxis2 is present
  └── Merge all traces into one Plotly data array
  └── Build layout (title, xaxis, yaxis, yaxis2 if any, barmode)
```

### resolveValues helper

```typescript
const resolveValues = (dataset: Dataset, jsonPath: string): unknown[] => {
  return dataset.rows.map(row => {
    const result = JSONPath({ path: jsonPath, json: row })
    return result.length > 0 ? result[0] : null
  })
}
```

### buildTrace function

A unified `buildTrace` function replaces the six separate builders. It:
- Resolves JSONPath → extracts x/y/z arrays
- Sets the Plotly trace type (bar, scatter+lines, scatter+markers, pie, heatmap, scattergeo)
- Embeds the transform as a Plotly `transforms` array if present
- Sets `yaxis: 'y2'` if `yaxis2` is present
- Sets trace `name` for legend if present

### Layout changes

`darkLayout` and `darkAxes` are updated to:
- Accept an optional list of trace specs (to determine if any use `yaxis2`)
- Add `yaxis2` layout entry (title, side: 'right', overlaying: 'y') when any trace has `yaxis2`
- Set `barmode: 'group'` by default when multiple bar traces exist (prevents stacking)
- For geomap traces, use the existing scattergeo layout (no xaxis/yaxis)

### Mock data column names

`mockData.ts` generates rows keyed by column name from `dataProfile.columns`. The column `name` field will now be a JSONPath string (e.g. `$.county`). The mock data generator uses the last segment of the JSONPath as the row key:

```typescript
const key = column.name.replace(/^\$\.?/, '')  // '$.county' → 'county'
```

This keeps mock data rows as flat objects (`{ county: 'King', dol_vehicle_id: 1234 }`), and JSONPath `$.<key>` resolves correctly against them.

### Files touched

- `frontend/src/services/chartSpec.ts` — full refactor: `resolveTraces` + `buildTrace` + `resolveValues`; multi-trace layout with secondary axes and barmode
- `frontend/src/services/mockData.ts` — update column name handling to support JSONPath-format names
- `frontend/src/app.tsx` — remove `applyFieldMapping`; simplify `handleGenerate`

## Backend Pipeline Simplification

### Pipeline (2 LLM calls instead of 3)

1. Schema mapping → `DatasetSchema` (now includes `jsonPath` per field)
2. Insight generation → `InsightEnvelope` (axes use JSONPath strings, traces array, transforms)

### Response shape

```python
# Before: { schema, insights, realData, fieldMappings }
# After:  { schema, insights, realData }
```

`fieldMappings` removed from `GenerateResponse` in `apiClient.ts`.

### Backend Pydantic models

```python
class PlotlyAggregation(BaseModel):
    func: str = "count"
    target: str = "y"

class PlotlyTransform(BaseModel):
    type: str = "aggregate"
    groups: str = ""
    aggregations: list[PlotlyAggregation] = []

class TraceSpec(BaseModel):
    chartType: str = "bar"
    xAxis: str = ""
    yAxis: str = ""
    zAxis: str | None = None
    transform: PlotlyTransform | None = None
    yaxis2: str | None = None
    name: str | None = None

class ChartSpec(BaseModel):
    mode: str = "recipe"
    chartType: str | None = None
    xAxis: str | None = None
    yAxis: str | None = None
    zAxis: str | None = None
    traces: list[TraceSpec] | None = None
    plotlyData: list[Any] | None = None
    plotlyLayout: dict[str, Any] | None = None
```

All fields have defaults to handle partial LLM output, same as existing patterns.

### Error handling for partial output

Existing resilience patterns preserved:
- `traces` defaults to `null` — if omitted, frontend falls back to shorthand axes
- `TraceSpec` fields (`transform`, `yaxis2`, `name`, `zAxis`) all default to `null`
- `PlotlyTransform` and `PlotlyAggregation` fields all have defaults
- If `transform` is omitted, no aggregation is applied (raw data), but `barmode: 'group'` still prevents stacking

### Files touched

- `backend/main.py` — new Pydantic models; updated prompts; removed field-mapping code
- `frontend/src/services/apiClient.ts` — remove `fieldMappings` from `GenerateResponse`
- `frontend/src/app.tsx` — remove field-mapping consumption logic

## Testing

### Frontend tests to update

| Test file | Current tests | Changes |
|-----------|--------------|---------|
| `chartSpec.test.ts` | 9 | Update fixtures to JSONPath axes; verify transforms; add multi-trace and secondary axis tests |
| `mockData.test.ts` | 5 | Update column name expectations for JSONPath format |
| `app.test.tsx` | 2 | Remove `fieldMappings` from mock response; update to new response shape |
| `schemas.test.ts` | 2 | Add tests for `TraceSpec`, `PlotlyTransform`, `PlotlyAggregation` |
| `dataInputPanel.test.tsx` | 3 | No changes expected |
| `chartCarousel.test.tsx` | 3 | Update fixtures if consuming traces |
| `dataIngest.test.ts` | 6 | Likely no changes |
| `workspaceStore.test.ts` | 2 | Likely no changes |
| `exportReport.test.ts` | 2 | Likely no changes |

### New tests to add

- `resolveValues` — JSONPath resolution against flat mock data and nested real data
- `buildTrace` with transforms — verify Plotly `transforms` array embedded correctly
- Multi-trace chart — bar + line overlay with `yaxis2`; verify `yaxis: 'y2'` and layout `yaxis2`
- Aggregation transform — verify `groups` and `aggregations` set correctly
- `barmode: 'group'` — verify layout sets `barmode` when multiple bar traces exist
- Shorthand fallback — verify single-trace charts still work with top-level axes
- Mock data with JSONPath column names — verify `$.county` resolves to `county` property

### Backend verification

No formal test suite. Verify by:
- `python -c "import main"` — imports cleanly
- Manual end-to-end testing via frontend
- Verify `call_llm` returns expected Pydantic models

### Final verification

1. `cd frontend && npm run test` — all tests pass
2. `cd frontend && npm run build` — TypeScript compiles
3. `cd backend && python -c "import main"` — backend imports
4. Manual test: submit a data description, verify charts render with aggregation

## Data Flow Summary

### Before

```
User input → /api/generate
  ├─ LLM call 1: MAP_SCHEMA_PROMPT → DatasetSchema
  ├─ LLM call 2: INSIGHT_PROMPT → InsightEnvelope
  ├─ LLM call 3: FIELD_MAPPING_PROMPT → FieldMappingResult
  └─ Response: { schema, insights, realData, fieldMappings }

Frontend:
  ├─ Mock data: generateMockDataset → ChartCarousel (no aggregation, stacking bug)
  └─ Real data: applyFieldMapping (rename columns) → ChartCarousel (no aggregation, stacking bug)
```

### After

```
User input → /api/generate
  ├─ LLM call 1: MAP_SCHEMA_PROMPT → DatasetSchema (with jsonPath)
  ├─ LLM call 2: INSIGHT_PROMPT → InsightEnvelope (JSONPath axes + traces + transforms)
  └─ Response: { schema, insights, realData }

Frontend:
  ├─ Mock data: generateMockDataset (rows keyed by last JSONPath segment)
  │   └─ resolveValues(row, '$.county') → row['county']
  ├─ Real data: raw rows from backend (may be nested JSON)
  │   └─ resolveValues(row, '$.geocoded_column.longitude') → row.geocoded_column.longitude
  └─ buildPlotlySpec:
       ├─ resolveTraces → one Plotly trace per TraceSpec
       │   └─ buildTrace: resolve JSONPath, embed transforms, set yaxis2
       └─ buildLayout: title, axes, yaxis2, barmode: 'group'
```

### Key improvements

1. **One fewer LLM call** — field mapping eliminated (3 → 2, ~33% faster)
2. **Aggregation built-in** — Plotly transforms group + aggregate before rendering (fixes stacking)
3. **Overlays supported** — traces array enables bar + line, dual-axis, etc.
4. **Nested data handled** — JSONPath navigates nested REST API responses
5. **Backward compatible** — shorthand axes still work for simple charts
