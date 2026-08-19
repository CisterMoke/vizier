# JSONPath + Aggregation + Overlay Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add JSONPath to DatasetField (eliminating the field-mapping LLM call), add Plotly transform-based aggregation (fixing bar chart stacking), and add a traces array for overlay plots (bar + line, dual-axis, etc.).

**Architecture:** The backend pipeline drops from 3 LLM calls to 2 (schema mapping + insight generation). ChartSpec gains a `traces` array where each trace has its own chartType, JSONPath axes, optional Plotly aggregate transform, and optional secondary y-axis. The frontend resolves JSONPath against data rows (mock or real), embeds transforms in Plotly traces, and renders multi-trace charts with appropriate layout (barmode, yaxis2).

**Tech Stack:** Preact + Vite + TypeScript + Mantine + Tailwind CSS v4 + Plotly.js + Zod + jsonpath-plus (frontend); Python FastAPI + pydantic-ai + pandas (backend)

**Spec:** `docs/superpowers/specs/2026-08-20-jsonpath-aggregation-overlays-design.md`

## Global Constraints

- LLM model is configured server-side via `LLM_MODEL` env var (default: `google:gemini-3.5-flash-lite`)
- All Pydantic model fields have defaults to handle partial LLM output
- All Zod schema optional fields accept `null` (LLM returns `null` instead of omitting fields)
- `sampleValues` accepts both `array` and `string` (LLM sometimes returns JSON-encoded strings)
- Backend parser `MAX_ROWS = 5000` safety limit must be preserved
- File upload max size: 10 MB (`MAX_FILE_SIZE_MB`)
- Rate limiting: per-IP + global sliding window limiters must be preserved
- Dark theme: MantineProvider `defaultColorScheme="dark"` with dark gradient backgrounds
- 34 existing frontend tests must continue to pass (after updates)

---

## File Structure

### Files to modify

| File | Responsibility |
|------|---------------|
| `frontend/src/domain/types.ts` | TypeScript interfaces: add `jsonPath` to `DatasetField`, add `TraceSpec`/`PlotlyTransform`/`PlotlyAggregation`, add `traces` to `ChartSpec`, remove `FieldMapping`/`FieldMappingResult` |
| `frontend/src/domain/schemas.ts` | Zod schemas: mirror all type changes |
| `frontend/src/services/chartSpec.ts` | Chart builder refactor: `resolveValues`, `buildTrace`, multi-trace layout with `barmode`/`yaxis2` |
| `frontend/src/services/mockData.ts` | Mock data: use last segment of JSONPath as row key |
| `frontend/src/services/apiClient.ts` | Remove `fieldMappings` from `GenerateResponse` |
| `frontend/src/app.tsx` | Remove `applyFieldMapping`; use `buildDatasetFromRaw` directly for real data; simplify `handleGenerate` |
| `frontend/src/services/dataIngest.ts` | Stop flattening nested JSON in `parseJSON` (preserve nesting for JSONPath) |
| `backend/main.py` | Pydantic models: add `jsonPath`, `TraceSpec`, `PlotlyTransform`, `PlotlyAggregation`; update prompts; remove field-mapping code |
| `backend/parser.py` | Stop using `pd.json_normalize` (which flattens); preserve nested structure in JSON parsing |
| `frontend/package.json` | Add `jsonpath-plus` dependency |

### Test files to update

| File | Tests |
|------|-------|
| `frontend/src/domain/schemas.test.ts` | Add tests for `TraceSpec`, `PlotlyTransform`, `PlotlyAggregation`, `jsonPath` on `DatasetField` |
| `frontend/src/services/chartSpec.test.ts` | Update fixtures to JSONPath axes; add multi-trace, transform, barmode, yaxis2 tests |
| `frontend/src/services/mockData.test.ts` | Update column name expectations for JSONPath format |
| `frontend/src/app.test.tsx` | Remove `fieldMappings` from mock response |

---

## Task 1: Add `jsonPath` to DatasetField (types + schemas)

**Files:**
- Modify: `frontend/src/domain/types.ts:16-24`
- Modify: `frontend/src/domain/schemas.ts:19-27`
- Test: `frontend/src/domain/schemas.test.ts`

**Interfaces:**
- Produces: `DatasetField.jsonPath: string` (required field on the TypeScript interface and Zod schema)

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/domain/schemas.test.ts`:

```typescript
it('accepts a dataset schema with jsonPath on fields', () => {
  const parsed = parseDatasetSchema({
    source: 'REST API: EV population',
    fields: [
      { name: 'county', jsonPath: '$.county', type: 'string', nullable: false, semanticType: 'dimension' },
      { name: 'longitude', jsonPath: '$.geocoded_column.longitude', type: 'number', nullable: false, semanticType: 'longitude' }
    ],
    warnings: []
  })

  expect(parsed.fields[0].jsonPath).toBe('$.county')
  expect(parsed.fields[1].jsonPath).toBe('$.geocoded_column.longitude')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/domain/schemas.test.ts`
Expected: FAIL — `jsonPath` not on the parsed object (Zod schema doesn't include it)

- [ ] **Step 3: Add `jsonPath` to TypeScript interface**

In `frontend/src/domain/types.ts`, update the `DatasetField` interface:

```typescript
export interface DatasetField {
  name: string
  jsonPath: string
  type: FieldType
  nullable: boolean
  semanticType?: SemanticType
  sampleValues?: unknown[] | string
  unique?: boolean
  group?: string | null
}
```

- [ ] **Step 4: Add `jsonPath` to Zod schema**

In `frontend/src/domain/schemas.ts`, update `datasetFieldSchema`:

```typescript
export const datasetFieldSchema = z.object({
  name: z.string(),
  jsonPath: z.string().optional(),
  type: fieldTypeSchema,
  nullable: z.boolean(),
  semanticType: semanticTypeSchema.optional(),
  sampleValues: z.union([z.array(z.unknown()), z.string()]).optional(),
  unique: z.boolean().optional(),
  group: z.string().nullable().optional()
})
```

Note: `jsonPath` is `optional()` in Zod because the LLM may not always produce it, but the TypeScript type marks it as required (the parser will default it to `$.<name>` if missing — handled in a later task). For now, make the TS type optional too to avoid breaking the build:

```typescript
export interface DatasetField {
  name: string
  jsonPath?: string
  type: FieldType
  nullable: boolean
  semanticType?: SemanticType
  sampleValues?: unknown[] | string
  unique?: boolean
  group?: string | null
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/domain/schemas.test.ts`
Expected: PASS

- [ ] **Step 6: Run all tests to verify no regressions**

Run: `cd frontend && npm run test`
Expected: All 34 tests pass (existing tests don't use `jsonPath` so they're unaffected)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/domain/types.ts frontend/src/domain/schemas.ts frontend/src/domain/schemas.test.ts
git commit -m "feat: add jsonPath field to DatasetField in types and schemas"
```

---

## Task 2: Add `TraceSpec`, `PlotlyTransform`, `PlotlyAggregation` types and schemas

**Files:**
- Modify: `frontend/src/domain/types.ts:32-42`
- Modify: `frontend/src/domain/schemas.ts:35-43`
- Test: `frontend/src/domain/schemas.test.ts`

**Interfaces:**
- Produces: `TraceSpec`, `PlotlyTransform`, `PlotlyAggregation` TypeScript interfaces and Zod schemas
- Produces: `ChartSpec.traces` field (nullable, optional)

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/domain/schemas.test.ts`:

```typescript
import { parseInsightEnvelope } from './schemas'

it('parses an insight with traces array and transforms', () => {
  const parsed = parseInsightEnvelope({
    insights: [
      {
        id: 'ins-1',
        title: 'EV Count + Avg Range',
        summary: 'Bar chart with line overlay',
        confidence: 0.9,
        hypothesis: 'Urban counties have more EVs',
        metricDescription: 'Count and avg range by county',
        chartSpec: {
          mode: 'recipe',
          traces: [
            {
              chartType: 'bar',
              xAxis: '$.county',
              yAxis: '$.dol_vehicle_id',
              transform: {
                type: 'aggregate',
                groups: '$.county',
                aggregations: [{ func: 'count', target: 'y' }]
              },
              name: 'EV Count'
            },
            {
              chartType: 'line',
              xAxis: '$.county',
              yAxis: '$.electric_range',
              transform: {
                type: 'aggregate',
                groups: '$.county',
                aggregations: [{ func: 'mean', target: 'y' }]
              },
              yaxis2: 'y2',
              name: 'Avg Range'
            }
          ]
        },
        dataProfile: null,
        assumptions: []
      }
    ]
  })

  const spec = parsed.insights[0].chartSpec!
  expect(spec.traces).toHaveLength(2)
  expect(spec.traces![0].chartType).toBe('bar')
  expect(spec.traces![0].transform!.type).toBe('aggregate')
  expect(spec.traces![0].transform!.aggregations[0].func).toBe('count')
  expect(spec.traces![1].yaxis2).toBe('y2')
})

it('parses an insight with shorthand axes (no traces)', () => {
  const parsed = parseInsightEnvelope({
    insights: [
      {
        id: 'ins-2',
        title: 'Simple bar',
        summary: 'Just a bar chart',
        confidence: 0.8,
        hypothesis: 'Revenue varies',
        metricDescription: 'Revenue by category',
        chartSpec: {
          mode: 'recipe',
          chartType: 'bar',
          xAxis: '$.category',
          yAxis: '$.revenue'
        },
        dataProfile: null,
        assumptions: []
      }
    ]
  })

  const spec = parsed.insights[0].chartSpec!
  expect(spec.traces).toBeUndefined()
  expect(spec.chartType).toBe('bar')
  expect(spec.xAxis).toBe('$.category')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/domain/schemas.test.ts`
Expected: FAIL — `TraceSpec`, `PlotlyTransform`, `PlotlyAggregation` not defined; `traces` not on `chartSpecSchema`

- [ ] **Step 3: Add TypeScript types**

In `frontend/src/domain/types.ts`, add after the `ChartType` type (line 32):

```typescript
export interface PlotlyAggregation {
  func: 'sum' | 'mean' | 'count' | 'min' | 'max' | 'median' | 'first' | 'last'
  target: string
}

export interface PlotlyTransform {
  type: 'aggregate'
  groups: string
  aggregations: PlotlyAggregation[]
}

export interface TraceSpec {
  chartType: ChartType
  xAxis: string
  yAxis: string
  zAxis?: string | null
  transform?: PlotlyTransform | null
  yaxis2?: string | null
  name?: string | null
}
```

Update `ChartSpec` interface:

```typescript
export interface ChartSpec {
  mode: 'recipe' | 'custom'
  chartType?: ChartType
  xAxis?: string
  yAxis?: string
  zAxis?: string | null
  traces?: TraceSpec[] | null
  plotlyData?: unknown[] | null
  plotlyLayout?: Record<string, unknown> | null
}
```

- [ ] **Step 4: Add Zod schemas**

In `frontend/src/domain/schemas.ts`, add after `chartSpecSchema` definition:

```typescript
const plotlyAggregationSchema = z.object({
  func: z.enum(['sum', 'mean', 'count', 'min', 'max', 'median', 'first', 'last']),
  target: z.string()
})

const plotlyTransformSchema = z.object({
  type: z.literal('aggregate'),
  groups: z.string(),
  aggregations: z.array(plotlyAggregationSchema)
})

const traceSpecSchema = z.object({
  chartType: z.enum(['bar', 'line', 'pie', 'scatter', 'heatmap', 'geomap']),
  xAxis: z.string(),
  yAxis: z.string(),
  zAxis: z.string().nullable().optional(),
  transform: plotlyTransformSchema.nullable().optional(),
  yaxis2: z.string().nullable().optional(),
  name: z.string().nullable().optional()
})
```

Update `chartSpecSchema` to include `traces`:

```typescript
export const chartSpecSchema = z.object({
  mode: z.enum(['recipe', 'custom']).default('recipe'),
  chartType: z.enum(['bar', 'line', 'pie', 'scatter', 'heatmap', 'geomap']).optional(),
  xAxis: z.string().optional(),
  yAxis: z.string().optional(),
  zAxis: z.string().nullable().optional(),
  traces: z.array(traceSpecSchema).nullable().optional(),
  plotlyData: z.array(z.unknown()).nullable().optional(),
  plotlyLayout: z.record(z.string(), z.unknown()).nullable().optional()
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/domain/schemas.test.ts`
Expected: PASS

- [ ] **Step 6: Run all tests to verify no regressions**

Run: `cd frontend && npm run test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add frontend/src/domain/types.ts frontend/src/domain/schemas.ts frontend/src/domain/schemas.test.ts
git commit -m "feat: add TraceSpec, PlotlyTransform, PlotlyAggregation types and schemas"
```

---

## Task 3: Remove `FieldMapping`/`FieldMappingResult` types and schemas

**Files:**
- Modify: `frontend/src/domain/types.ts:102-109`
- Modify: `frontend/src/domain/schemas.ts:84-93`

**Interfaces:**
- Consumes: nothing (these types are being removed)
- Produces: removal of `FieldMapping`, `FieldMappingResult`, `fieldMappingSchema`, `fieldMappingResultSchema`, `parseFieldMappingResult`

- [ ] **Step 1: Remove TypeScript types**

In `frontend/src/domain/types.ts`, delete lines 102-109:

```typescript
export interface FieldMapping {
  insightId: string
  mappings: Record<string, string>
}

export interface FieldMappingResult {
  mappings: FieldMapping[]
}
```

- [ ] **Step 2: Remove Zod schemas**

In `frontend/src/domain/schemas.ts`, delete the `fieldMappingSchema`, `fieldMappingResultSchema`, and `parseFieldMappingResult` definitions (lines 84-93):

```typescript
const fieldMappingSchema = z.object({
  insightId: z.string().min(1),
  mappings: z.record(z.string(), z.string())
})

export const fieldMappingResultSchema = z.object({
  mappings: z.array(fieldMappingSchema)
})

export const parseFieldMappingResult = (input: unknown) => fieldMappingResultSchema.parse(input)
```

- [ ] **Step 3: Verify build still compiles**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | head -20`
Expected: May show errors in `apiClient.ts` and `app.tsx` referencing `fieldMappings` — these will be fixed in Task 6 and Task 7. Note any errors for reference.

If there are import errors for `parseFieldMappingResult` or `FieldMappingResult` from other files, check if they're actually imported anywhere:

Run: `cd frontend && grep -r "FieldMapping\|parseFieldMappingResult\|fieldMappingResult" src/ --include="*.ts" --include="*.tsx" -l`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/domain/types.ts frontend/src/domain/schemas.ts
git commit -m "refactor: remove FieldMapping and FieldMappingResult types (will be replaced by JSONPath)"
```

---

## Task 4: Add `jsonpath-plus` dependency and `resolveValues` helper

**Files:**
- Modify: `frontend/package.json` (add dependency)
- Create: `frontend/src/services/jsonPath.ts`
- Test: `frontend/src/services/jsonPath.test.ts`

**Interfaces:**
- Produces: `resolveValues(dataset: GeneratedDataset, jsonPath: string): unknown[]` — resolves a JSONPath against each row of a dataset, returning an array of values (one per row)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/services/jsonPath.test.ts`:

```typescript
import { resolveValues } from './jsonPath'
import type { GeneratedDataset } from '../domain/types'

const mockDataset: GeneratedDataset = {
  id: 'ds-1',
  name: 'test',
  columns: ['county', 'revenue'],
  rows: [
    { county: 'King', revenue: 120 },
    { county: 'Pierce', revenue: 95 }
  ]
}

const nestedDataset: GeneratedDataset = {
  id: 'ds-2',
  name: 'nested',
  columns: ['geocoded_column.longitude', 'geocoded_column.latitude'],
  rows: [
    { geocoded_column: { longitude: -122.3, latitude: 47.6 } },
    { geocoded_column: { longitude: -120.5, latitude: 46.5 } }
  ]
}

it('resolves a simple top-level JSONPath', () => {
  const values = resolveValues(mockDataset, '$.county')
  expect(values).toEqual(['King', 'Pierce'])
})

it('resolves a nested JSONPath', () => {
  const values = resolveValues(nestedDataset, '$.geocoded_column.longitude')
  expect(values).toEqual([-122.3, -120.5])
})

it('resolves a JSONPath that does not match (returns nulls)', () => {
  const values = resolveValues(mockDataset, '$.nonexistent')
  expect(values).toEqual([null, null])
})

it('handles plain column name as fallback (no $ prefix)', () => {
  const values = resolveValues(mockDataset, 'county')
  expect(values).toEqual(['King', 'Pierce'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/services/jsonPath.test.ts`
Expected: FAIL — module `./jsonPath` not found

- [ ] **Step 3: Install jsonpath-plus**

Run: `cd frontend && npm install jsonpath-plus`

- [ ] **Step 4: Implement `resolveValues`**

Create `frontend/src/services/jsonPath.ts`:

```typescript
import { JSONPath } from 'jsonpath-plus'
import type { GeneratedDataset } from '../domain/types'

export const resolveValues = (dataset: GeneratedDataset, jsonPath: string): unknown[] => {
  return dataset.rows.map((row) => {
    const path = jsonPath.startsWith('$') ? jsonPath : `$.${jsonPath}`
    const result = JSONPath({ path, json: row })
    return result.length > 0 ? result[0] : null
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/services/jsonPath.test.ts`
Expected: PASS

- [ ] **Step 6: Run all tests to verify no regressions**

Run: `cd frontend && npm run test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/services/jsonPath.ts frontend/src/services/jsonPath.test.ts
git commit -m "feat: add jsonpath-plus dependency and resolveValues helper"
```

---

## Task 5: Refactor chart builder to support traces, transforms, and JSONPath

**Files:**
- Modify: `frontend/src/services/chartSpec.ts` (full refactor)
- Test: `frontend/src/services/chartSpec.test.ts`

**Interfaces:**
- Consumes: `resolveValues` from `./jsonPath`, `TraceSpec`/`PlotlyTransform`/`ChartSpec` from `../domain/types`
- Produces: `buildPlotlySpec(insight, dataset): PlotlySpec` — same signature, now supports `traces` array, transforms, `yaxis2`, and JSONPath resolution

- [ ] **Step 1: Write the failing tests**

Replace `frontend/src/services/chartSpec.test.ts` with:

```typescript
import { buildPlotlySpec } from './chartSpec'
import type { GeneratedDataset, InsightCandidate } from '../domain/types'
import type * as Plotly from 'plotly.js'

const mockDataset: GeneratedDataset = {
  id: 'dataset-1',
  name: 'Revenue sample',
  columns: ['category', 'revenue'],
  rows: [
    { category: 'A', revenue: 120 },
    { category: 'A', revenue: 80 },
    { category: 'B', revenue: 95 }
  ]
}

const mockBarInsight: InsightCandidate = {
  id: 'ins-1',
  title: 'Revenue by category',
  summary: 'Show revenue by category as a bar chart.',
  confidence: 0.91,
  hypothesis: 'Revenue varies by category.',
  metricDescription: 'Sum of revenue grouped by category.',
  chartSpec: {
    mode: 'recipe',
    chartType: 'bar',
    xAxis: '$.category',
    yAxis: '$.revenue'
  },
  dataProfile: {
    rowCount: 4,
    columns: [
      { name: '$.category', generator: 'category', categories: ['A', 'B', 'C', 'D'] },
      { name: '$.revenue', generator: 'uniform', min: 100, max: 500 }
    ]
  },
  assumptions: ['Category and revenue columns are present.']
}

it('maps bar chart recipe to a bar trace', () => {
  const spec = buildPlotlySpec(mockBarInsight, mockDataset)
  expect(spec.data[0]?.type).toBe('bar')
})

it('resolves JSONPath axes from dataset rows', () => {
  const spec = buildPlotlySpec(mockBarInsight, mockDataset)
  const trace = spec.data[0] as Plotly.Data
  expect(trace.x).toEqual(['A', 'A', 'B'])
  expect(trace.y).toEqual([120, 80, 95])
})

it('maps line chart recipe to a scatter trace with lines+markers', () => {
  const lineInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: { mode: 'recipe', chartType: 'line', xAxis: '$.week', yAxis: '$.count' }
  }
  const spec = buildPlotlySpec(lineInsight, mockDataset)
  expect(spec.data[0]?.type).toBe('scatter')
  expect((spec.data[0] as Plotly.Data).mode).toBe('lines+markers')
})

it('maps pie chart recipe to a pie trace', () => {
  const pieInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: { mode: 'recipe', chartType: 'pie', xAxis: '$.segment', yAxis: '$.share' }
  }
  const spec = buildPlotlySpec(pieInsight, mockDataset)
  expect(spec.data[0]?.type).toBe('pie')
})

it('maps scatter chart recipe to a scatter trace with markers only', () => {
  const scatterInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: { mode: 'recipe', chartType: 'scatter', xAxis: '$.orders', yAxis: '$.revenue' }
  }
  const spec = buildPlotlySpec(scatterInsight, mockDataset)
  expect(spec.data[0]?.type).toBe('scatter')
  expect((spec.data[0] as Plotly.Data).mode).toBe('markers')
})

it('maps heatmap chart recipe to a heatmap trace', () => {
  const heatmapInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: { mode: 'recipe', chartType: 'heatmap', xAxis: '$.longitude', yAxis: '$.latitude', zAxis: '$.intensity' }
  }
  const heatmapDataset: GeneratedDataset = {
    ...mockDataset,
    columns: ['longitude', 'latitude', 'intensity'],
    rows: [
      { longitude: -74.0, latitude: 40.7, intensity: 10 },
      { longitude: -73.9, latitude: 40.8, intensity: 25 }
    ]
  }
  const spec = buildPlotlySpec(heatmapInsight, heatmapDataset)
  expect(spec.data[0]?.type).toBe('heatmap')
})

it('maps geomap chart recipe to a scattergeo trace on a world map', () => {
  const geomapInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: { mode: 'recipe', chartType: 'geomap', xAxis: '$.lng', yAxis: '$.lat', zAxis: '$.score' }
  }
  const geoDataset: GeneratedDataset = {
    ...mockDataset,
    columns: ['lng', 'lat', 'score'],
    rows: [
      { lng: -74.0, lat: 40.7, score: 4.5 },
      { lng: -118.2, lat: 34.0, score: 4.8 }
    ]
  }
  const spec = buildPlotlySpec(geomapInsight, geoDataset)
  expect(spec.data[0]?.type).toBe('scattergeo')
  expect((spec.layout as { geo: { projection: { type: string } } }).geo.projection.type).toBe('natural earth')
})

it('passes through custom plotly spec directly', () => {
  const customInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: {
      mode: 'custom',
      plotlyData: [{ type: 'heatmap', z: [[1, 2], [3, 4]] }],
      plotlyLayout: { title: { text: 'Custom Heatmap' } }
    }
  }
  const spec = buildPlotlySpec(customInsight, mockDataset)
  expect(spec.data[0]?.type).toBe('heatmap')
  expect((spec.layout as { title: { text: string } }).title.text).toBe('Custom Heatmap')
})

it('works when mode is omitted (defaults to recipe)', () => {
  const noModeInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: {
      chartType: 'bar',
      xAxis: '$.category',
      yAxis: '$.revenue'
    } as InsightCandidate['chartSpec']
  }
  const spec = buildPlotlySpec(noModeInsight, mockDataset)
  expect(spec.data[0]?.type).toBe('bar')
})

it('returns the required plotly contract shape', () => {
  const spec = buildPlotlySpec(mockBarInsight, mockDataset)
  expectTypeOf(spec).toMatchTypeOf<{
    data: Plotly.Data[]
    layout: Partial<Plotly.Layout>
  }>()
})

it('builds multiple traces from traces array', () => {
  const multiTraceInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: {
      mode: 'recipe',
      traces: [
        {
          chartType: 'bar',
          xAxis: '$.category',
          yAxis: '$.revenue',
          name: 'Revenue'
        },
        {
          chartType: 'line',
          xAxis: '$.category',
          yAxis: '$.revenue',
          yaxis2: 'y2',
          name: 'Trend'
        }
      ]
    }
  }
  const spec = buildPlotlySpec(multiTraceInsight, mockDataset)
  expect(spec.data).toHaveLength(2)
  expect(spec.data[0]?.type).toBe('bar')
  expect(spec.data[1]?.type).toBe('scatter')
  expect((spec.data[1] as Plotly.Data).yaxis).toBe('y2')
})

it('embeds aggregate transform in trace data', () => {
  const aggInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: {
      mode: 'recipe',
      chartType: 'bar',
      xAxis: '$.category',
      yAxis: '$.revenue',
      traces: [
        {
          chartType: 'bar',
          xAxis: '$.category',
          yAxis: '$.revenue',
          transform: {
            type: 'aggregate',
            groups: '$.category',
            aggregations: [{ func: 'sum', target: 'y' }]
          }
        }
      ]
    }
  }
  const spec = buildPlotlySpec(aggInsight, mockDataset)
  const trace = spec.data[0] as Plotly.Data & { transforms?: unknown[] }
  expect(trace.transforms).toBeDefined()
  expect((trace.transforms as [{ type: string }])[0].type).toBe('aggregate')
})

it('sets barmode group when multiple bar traces exist', () => {
  const multiBarInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: {
      mode: 'recipe',
      traces: [
        { chartType: 'bar', xAxis: '$.category', yAxis: '$.revenue', name: 'A' },
        { chartType: 'bar', xAxis: '$.category', yAxis: '$.revenue', name: 'B' }
      ]
    }
  }
  const spec = buildPlotlySpec(multiBarInsight, mockDataset)
  expect((spec.layout as { barmode?: string }).barmode).toBe('group')
})

it('adds yaxis2 layout when a trace uses yaxis2', () => {
  const overlayInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: {
      mode: 'recipe',
      traces: [
        { chartType: 'bar', xAxis: '$.category', yAxis: '$.revenue', name: 'Bars' },
        { chartType: 'line', xAxis: '$.category', yAxis: '$.revenue', yaxis2: 'y2', name: 'Line' }
      ]
    }
  }
  const spec = buildPlotlySpec(overlayInsight, mockDataset)
  const layout = spec.layout as { yaxis2?: { side: string; overlaying: string } }
  expect(layout.yaxis2).toBeDefined()
  expect(layout.yaxis2!.side).toBe('right')
  expect(layout.yaxis2!.overlaying).toBe('y')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/services/chartSpec.test.ts`
Expected: FAIL — `resolveValues` not imported, traces not supported, JSONPath not resolved

- [ ] **Step 3: Implement the refactored chart builder**

Replace the contents of `frontend/src/services/chartSpec.ts` with:

```typescript
import type { ChartSpec, ChartType, GeneratedDataset, InsightCandidate, TraceSpec } from '../domain/types'
import type * as Plotly from 'plotly.js'
import { resolveValues } from './jsonPath'

export type PlotlySpec = { data: Plotly.Data[]; layout: Partial<Plotly.Layout> }

const FONT_COLOR = '#e2e8f0'
const GRID_COLOR = 'rgba(148, 163, 184, 0.15)'
const AXIS_COLOR = '#94a3b8'
const PAPER_BG = 'rgba(15, 23, 42, 0.4)'
const PLOT_BG = 'rgba(15, 23, 42, 0.2)'

const TRACE_COLORS = ['#22d3ee', '#818cf8', '#f472b6', '#fbbf24', '#34d399', '#fb923c', '#a78bfa', '#f9a8d4']

const darkLayout = (title: string): Partial<Plotly.Layout> => ({
  title: { text: title, font: { color: FONT_COLOR, size: 14 } },
  font: { color: FONT_COLOR },
  paper_bgcolor: PAPER_BG,
  plot_bgcolor: PLOT_BG,
  margin: { l: 48, r: 48, b: 48, t: 48 }
})

const darkAxes = (xLabel?: string, yLabel?: string) => ({
  xaxis: {
    title: { text: xLabel ?? '', font: { color: FONT_COLOR } },
    color: AXIS_COLOR,
    gridcolor: GRID_COLOR,
    zerolinecolor: GRID_COLOR
  },
  yaxis: {
    title: { text: yLabel ?? '', font: { color: FONT_COLOR } },
    color: AXIS_COLOR,
    gridcolor: GRID_COLOR,
    zerolinecolor: GRID_COLOR
  }
})

const toDatum = (value: unknown): Plotly.Datum => {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value
  return 0
}

const toAxisLabel = (jsonPath: string): string => {
  const parts = jsonPath.replace(/^\$\.?/, '').split('.')
  return parts[parts.length - 1] ?? jsonPath
}

interface ResolvedTrace {
  type: Plotly.Data['type']
  x?: Plotly.Datum[]
  y?: Plotly.Datum[]
  z?: Plotly.Datum[] | Plotly.Datum[][]
  labels?: Plotly.Datum[]
  values?: Plotly.Datum[]
  lon?: number[]
  lat?: number[]
  mode?: string
  marker?: Record<string, unknown>
  line?: Record<string, unknown>
  textfont?: Record<string, unknown>
  transforms?: unknown[]
  yaxis?: string
  name?: string
}

const buildTraceData = (
  traceSpec: TraceSpec,
  dataset: GeneratedDataset,
  colorIndex: number
): ResolvedTrace => {
  const color = TRACE_COLORS[colorIndex % TRACE_COLORS.length]
  const x = resolveValues(dataset, traceSpec.xAxis).map(toDatum)
  const y = resolveValues(dataset, traceSpec.yAxis).map(toDatum)
  const z = traceSpec.zAxis ? resolveValues(dataset, traceSpec.zAxis).map(toNumber) : undefined

  const trace: ResolvedTrace = { name: traceSpec.name ?? undefined }

  switch (traceSpec.chartType) {
    case 'bar':
      trace.type = 'bar'
      trace.x = x
      trace.y = y
      trace.marker = { color }
      break
    case 'line':
      trace.type = 'scatter'
      trace.mode = 'lines+markers'
      trace.x = x
      trace.y = y
      trace.line = { color }
      trace.marker = { color }
      break
    case 'scatter':
      trace.type = 'scatter'
      trace.mode = 'markers'
      trace.x = x
      trace.y = y
      trace.marker = { color, size: 8 }
      break
    case 'pie':
      trace.type = 'pie'
      trace.labels = x
      trace.values = y
      trace.textfont = { color: FONT_COLOR }
      trace.marker = { colors: TRACE_COLORS }
      break
    case 'heatmap':
      trace.type = 'heatmap'
      trace.x = x
      trace.y = y
      trace.z = z ?? dataset.rows.map((_, i) => i + 1)
      break
    case 'geomap':
      trace.type = 'scattergeo'
      trace.mode = 'markers'
      trace.lon = resolveValues(dataset, traceSpec.xAxis).map(toNumber)
      trace.lat = resolveValues(dataset, traceSpec.yAxis).map(toNumber)
      if (z) {
        trace.marker = { size: 8, color: z, colorscale: 'Viridis', showscale: true, colorbar: { title: { text: traceSpec.zAxis ? toAxisLabel(traceSpec.zAxis) : '', font: { color: FONT_COLOR } }, tickfont: { color: FONT_COLOR } } }
      } else {
        trace.marker = { size: 8, color }
      }
      break
  }

  if (traceSpec.transform) {
    trace.transforms = [{
      type: 'aggregate',
      groups: resolveValues(dataset, traceSpec.transform.groups).map(toDatum),
      aggregations: traceSpec.transform.aggregations
    }]
  }

  if (traceSpec.yaxis2) {
    trace.yaxis = traceSpec.yaxis2
  }

  return trace
}

const isGeomap = (chartType?: string) => chartType === 'geomap'
const isPie = (chartType?: string) => chartType === 'pie'

const buildLayout = (
  title: string,
  traces: ResolvedTrace[],
  traceSpecs: TraceSpec[],
  xLabel?: string,
  yLabel?: string
): Partial<Plotly.Layout> => {
  const layout: Partial<Plotly.Layout> & Record<string, unknown> = { ...darkLayout(title) }

  const hasGeomap = traceSpecs.some(t => isGeomap(t.chartType))
  const hasPie = traceSpecs.some(t => isPie(t.chartType))

  if (!hasGeomap && !hasPie) {
    Object.assign(layout, darkAxes(xLabel, yLabel))
  }

  if (hasGeomap) {
    layout.geo = {
      showland: true,
      landcolor: 'rgb(17, 24, 39)',
      showocean: true,
      oceancolor: 'rgb(8, 12, 20)',
      showcountries: true,
      countrycolor: 'rgb(55, 65, 81)',
      showcoastlines: true,
      coastlinecolor: 'rgb(55, 65, 81)',
      projection: { type: 'natural earth' },
      showframe: false
    }
  }

  const barCount = traceSpecs.filter(t => t.chartType === 'bar').length
  if (barCount > 1) {
    layout.barmode = 'group'
  }

  const hasY2 = traceSpecs.some(t => t.yaxis2)
  if (hasY2) {
    layout.yaxis2 = {
      title: { text: 'Secondary', font: { color: FONT_COLOR } },
      side: 'right',
      overlaying: 'y',
      color: AXIS_COLOR,
      gridcolor: GRID_COLOR,
      zerolinecolor: GRID_COLOR
    }
  }

  return layout
}

const buildCustomChart = (spec: ChartSpec, title: string): PlotlySpec => {
  const layout = (spec.plotlyLayout as Partial<Plotly.Layout>) ?? {}
  return {
    data: (spec.plotlyData as Plotly.Data[]) ?? [],
    layout: {
      ...darkLayout(title),
      ...layout,
      title: layout.title ?? { text: title, font: { color: FONT_COLOR } }
    }
  }
}

export const buildPlotlySpec = (
  insight: InsightCandidate,
  dataset: GeneratedDataset
): PlotlySpec => {
  const spec = insight.chartSpec
  const title = insight.title

  if (!spec) {
    return { data: [], layout: { ...darkLayout(title) } }
  }

  if (spec.mode === 'custom') {
    return buildCustomChart(spec, title)
  }

  if (spec.traces && spec.traces.length > 0) {
    const traces = spec.traces.map((t, i) => buildTraceData(t, dataset, i))
    const layout = buildLayout(title, traces, spec.traces)
    return { data: traces as Plotly.Data[], layout }
  }

  const chartType = (spec.chartType ?? 'bar') as ChartType
  const singleTrace: TraceSpec = {
    chartType,
    xAxis: spec.xAxis ?? '',
    yAxis: spec.yAxis ?? '',
    zAxis: spec.zAxis ?? null,
    transform: null,
    yaxis2: null,
    name: null
  }
  const trace = buildTraceData(singleTrace, dataset, 0)
  const layout = buildLayout(title, [trace], [singleTrace], spec.xAxis, spec.yAxis)
  return { data: [trace as Plotly.Data], layout }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/services/chartSpec.test.ts`
Expected: PASS — all 13 tests

- [ ] **Step 5: Run all tests to verify no regressions**

Run: `cd frontend && npm run test`
Expected: All tests pass (mockData tests may fail if they use plain column names — will be fixed in Task 6)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/chartSpec.ts frontend/src/services/chartSpec.test.ts
git commit -m "feat: refactor chart builder with JSONPath, traces, transforms, and overlay support"
```

---

## Task 6: Update mock data generator for JSONPath column names

**Files:**
- Modify: `frontend/src/services/mockData.ts:72-100`
- Test: `frontend/src/services/mockData.test.ts`

**Interfaces:**
- Consumes: `DataColumnSpec.name` will now contain JSONPath strings (e.g. `$.county`) from the LLM
- Produces: `generateMockDataset` produces rows where the key is the last segment of the JSONPath (e.g. `county` from `$.county`)

- [ ] **Step 1: Update the test to use JSONPath column names**

Replace `frontend/src/services/mockData.test.ts` with:

```typescript
import { generateMockDataset } from './mockData'
import type { DatasetSchema, InsightCandidate } from '../domain/types'

const mockSchema: DatasetSchema = {
  source: 'SQL: orders table',
  fields: [
    { name: 'id', jsonPath: '$.id', type: 'number', nullable: false, semanticType: 'identifier', unique: true },
    { name: 'customer_name', jsonPath: '$.customer_name', type: 'string', nullable: false, semanticType: 'dimension' },
    { name: 'is_repeat', jsonPath: '$.is_repeat', type: 'boolean', nullable: false }
  ],
  warnings: []
}

const mockInsight: InsightCandidate = {
  id: 'ins-1',
  title: 'Repeat customer rate trend',
  summary: 'Track repeat rate by week.',
  confidence: 0.9,
  hypothesis: 'Repeat rate changes week to week.',
  metricDescription: 'Share of repeat customers by week.',
  chartSpec: {
    mode: 'recipe',
    chartType: 'line',
    xAxis: '$.week',
    yAxis: '$.repeat_rate'
  },
  dataProfile: {
    rowCount: 52,
    columns: [
      { name: '$.week', generator: 'linear', start: 1, end: 52, step: 1 },
      { name: '$.repeat_rate', generator: 'normal', mean: 0.4, stddev: 0.1, min: 0, max: 1 }
    ]
  },
  assumptions: ['Customer IDs are stable across orders.']
}

it('generates deterministic rows for same seed', () => {
  const a = generateMockDataset(mockSchema, mockInsight, { seed: 42 })
  const b = generateMockDataset(mockSchema, mockInsight, { seed: 42 })
  expect(a.rows).toEqual(b.rows)
})

it('generates rows matching the data profile column count', () => {
  const dataset = generateMockDataset(mockSchema, mockInsight, { seed: 42 })
  expect(dataset.columns).toHaveLength(2)
  expect(dataset.columns).toContain('$.week')
  expect(dataset.columns).toContain('$.repeat_rate')
})

it('generates linear values for linear generator', () => {
  const dataset = generateMockDataset(mockSchema, mockInsight, { seed: 42 })
  expect(dataset.rows[0].week).toBe(1)
  expect(dataset.rows[1].week).toBe(2)
  expect(dataset.rows[51].week).toBe(52)
})

it('generates category values from the categories array', () => {
  const categoryInsight: InsightCandidate = {
    ...mockInsight,
    dataProfile: {
      rowCount: 10,
      columns: [
        { name: '$.segment', generator: 'category', categories: ['A', 'B', 'C'] },
        { name: '$.value', generator: 'uniform', min: 10, max: 100 }
      ]
    }
  }
  const dataset = generateMockDataset(mockSchema, categoryInsight, { seed: 7 })
  for (const row of dataset.rows) {
    expect(['A', 'B', 'C']).toContain(row.segment)
  }
})

it('generates constant values', () => {
  const constantInsight: InsightCandidate = {
    ...mockInsight,
    dataProfile: {
      rowCount: 5,
      columns: [
        { name: '$.label', generator: 'constant', value: 'fixed' }
      ]
    }
  }
  const dataset = generateMockDataset(mockSchema, constantInsight, { seed: 1 })
  for (const row of dataset.rows) {
    expect(row.label).toBe('fixed')
  }
})

it('handles plain column names (non-JSONPath) as fallback', () => {
  const plainInsight: InsightCandidate = {
    ...mockInsight,
    dataProfile: {
      rowCount: 5,
      columns: [
        { name: 'category', generator: 'category', categories: ['X', 'Y'] }
      ]
    }
  }
  const dataset = generateMockDataset(mockSchema, plainInsight, { seed: 1 })
  expect(dataset.rows[0].category).toBeDefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/services/mockData.test.ts`
Expected: FAIL — rows are keyed by full JSONPath string (e.g. `$.week` instead of `week`)

- [ ] **Step 3: Update mock data generator to extract key from JSONPath**

In `frontend/src/services/mockData.ts`, update `generateMockDataset`:

```typescript
const jsonPathToKey = (jsonPath: string): string => {
  return jsonPath.replace(/^\$\.?/, '')
}

export const generateMockDataset = (
  _schema: DatasetSchema,
  insight: InsightCandidate,
  opts: MockDataOptions = {}
): GeneratedDataset => {
  const seed = opts.seed ?? 1337
  const profile = insight.dataProfile
  const rowCount = opts.rowCount ?? profile?.rowCount ?? 200
  const random = createSeededRandom(seed)
  const columns = profile?.columns ?? []
  const columnNames = columns.map((col) => col.name)

  const rows = Array.from({ length: rowCount }, (_, rowIndex) => {
    const row: Record<string, unknown> = {}

    for (const col of columns) {
      const key = jsonPathToKey(col.name)
      row[key] = generateValue(col, rowIndex, random)
    }

    return row
  })

  return {
    id: `dataset-${insight.id}-${seed}`,
    name: `${insight.title} sample`,
    columns: columnNames.length > 0 ? columnNames : ['x', 'y'],
    rows
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/services/mockData.test.ts`
Expected: PASS

- [ ] **Step 5: Run all tests to verify no regressions**

Run: `cd frontend && npm run test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/mockData.ts frontend/src/services/mockData.test.ts
git commit -m "feat: mock data generator extracts row key from JSONPath column names"
```

---

## Task 7: Remove `fieldMappings` from apiClient and app

**Files:**
- Modify: `frontend/src/services/apiClient.ts:5-23`
- Modify: `frontend/src/app.tsx:1-106`
- Test: `frontend/src/app.test.tsx`

**Interfaces:**
- Consumes: `GenerateResponse` no longer has `fieldMappings`
- Produces: `handleGenerate` uses `buildDatasetFromRaw` directly for real data (no field mapping step)

- [ ] **Step 1: Update the app test to remove fieldMappings**

In `frontend/src/app.test.tsx`, update the mock response (around line 30-65):

Remove `fieldMappings: []` from the mock response object. The response should end with `realData: null` (no comma after, no fieldMappings).

```typescript
callGenerateMock.mockResolvedValue({
  schema: {
    source: 'SQL: orders table',
    fields: [
      { name: 'id', jsonPath: '$.id', type: 'number', nullable: false, semanticType: 'identifier' },
      { name: 'total', jsonPath: '$.total', type: 'number', nullable: false, semanticType: 'currency' }
    ],
    warnings: []
  },
  insights: [
    {
      id: 'insight-1',
      title: 'Orders trend',
      summary: 'Orders over time',
      confidence: 0.82,
      hypothesis: 'Orders climb weekly',
      metricDescription: 'Weekly order count',
      chartSpec: {
        mode: 'recipe',
        chartType: 'line',
        xAxis: '$.week',
        yAxis: '$.order_count'
      },
      dataProfile: {
        rowCount: 12,
        columns: [
          { name: '$.week', generator: 'linear', start: 1, end: 12, step: 1 },
          { name: '$.order_count', generator: 'normal', mean: 200, stddev: 50, min: 50, max: 400 }
        ]
      },
      assumptions: ['created_at is present']
    }
  ],
  realData: null
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/app.test.tsx`
Expected: FAIL — `fieldMappings` referenced in `app.tsx` but no longer in response

- [ ] **Step 3: Remove `fieldMappings` from `GenerateResponse`**

In `frontend/src/services/apiClient.ts`, update:

```typescript
export interface GenerateResponse {
  schema: DatasetSchema
  insights: InsightCandidate[]
  realData: RawDataResult | null
}
```

And in `parseResponse`:

```typescript
async function parseResponse(response: Response): Promise<GenerateResponse> {
  const raw = await response.json()

  return {
    schema: parseDatasetSchema(raw.schema),
    insights: parseInsightEnvelope(raw.insights).insights,
    realData: raw.realData ?? null
  }
}
```

- [ ] **Step 4: Remove `applyFieldMapping` and simplify `handleGenerate` in app.tsx**

In `frontend/src/app.tsx`, replace the `handleGenerate` function and remove `applyFieldMapping`:

```typescript
const handleGenerate = async (request: GenerateRequest) => {
  workspace.setRawSchema(request.schemaText)
  workspace.setInsights([])
  workspace.setDatasetSchema({ source: '', fields: [], warnings: [] })
  setGenerationError(null)
  setStatusMessage(null)
  setHasRealData(false)

  setIsGenerating(true)

  try {
    setStatusMessage('Analyzing data and generating insights...')
    const result = await callGenerate(request)

    workspace.setDatasetSchema(result.schema)

    const insights = result.insights
    workspace.setInsights(insights)

    if (result.realData && result.realData.rowCount > 0) {
      insights.forEach((insight) => {
        const dataset = buildDatasetFromRaw(insight.id, result.realData!)
        workspace.attachDataset(insight.id, dataset)
      })
      setHasRealData(true)
    } else {
      insights.forEach((insight, index) => {
        workspace.attachDataset(
          insight.id,
          generateMockDataset(result.schema, insight, { seed: workspace.demoSeed + index })
        )
      })
    }

    setStatusMessage(null)
  } catch (error) {
    setGenerationError(
      error instanceof Error ? error.message : 'Failed to generate analytics.'
    )
  } finally {
    setIsGenerating(false)
    setStatusMessage(null)
  }
}
```

Remove the entire `applyFieldMapping` function (lines 67-106).

Remove the `RawDataResult` import if it's no longer used (it's still used via `buildDatasetFromRaw`'s parameter type, but that's imported in the function — check):

Update the import line at the top of `app.tsx`:

```typescript
import type { InsightCandidate, GeneratedDataset } from './domain/types'
```

(Remove `RawDataResult` from the import if it's no longer directly referenced — `buildDatasetFromRaw` handles the type internally.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/app.test.tsx`
Expected: PASS

- [ ] **Step 6: Run all tests to verify no regressions**

Run: `cd frontend && npm run test`
Expected: All tests pass

- [ ] **Step 7: Run build to verify TypeScript compiles**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add frontend/src/services/apiClient.ts frontend/src/app.tsx frontend/src/app.test.tsx
git commit -m "refactor: remove fieldMappings from frontend, use buildDatasetFromRaw directly"
```

---

## Task 8: Stop flattening nested JSON in backend parser and frontend dataIngest

**Files:**
- Modify: `backend/parser.py:30-45`
- Modify: `frontend/src/services/dataIngest.ts:63-88`

**Interfaces:**
- Produces: `parse_json` in backend preserves nested objects (no `pd.json_normalize`); `parseJSON` in frontend preserves nesting (no `flatten`)

- [ ] **Step 1: Update backend parser to preserve nested JSON**

In `backend/parser.py`, replace the `parse_json` function:

```python
def parse_json(source: str | Path, max_rows: int = MAX_ROWS) -> dict[str, Any]:
    """Parse JSON array (preserving nested structure for JSONPath) using pandas."""
    if isinstance(source, Path):
        with open(source, "r") as f:
            parsed = json.load(f)
    else:
        parsed = json.loads(source)

    arr = parsed if isinstance(parsed, list) else [parsed]
    arr = arr[:max_rows]

    if not arr:
        return {"format": "json", "columns": [], "rows": [], "rowCount": 0}

    records = arr
    columns = sorted(set(
        key
        for item in records
        for key, value in item.items()
        if not (isinstance(value, dict) or isinstance(value, list))
    ))
    return {"format": "json", "columns": columns, "rows": records, "rowCount": len(records)}
```

This preserves the nested structure in `rows` (so `$.geocoded_column.longitude` can be resolved by JSONPath) while `columns` lists only top-level scalar keys (for backward compatibility with the `columns` field in `RawDataResult`).

- [ ] **Step 2: Update frontend dataIngest to preserve nested JSON**

In `frontend/src/services/dataIngest.ts`, update `parseJSON`:

```typescript
const parseJSON = (text: string): RawDataResult => {
  const parsed = JSON.parse(text)
  const arr = Array.isArray(parsed) ? parsed : [parsed]

  if (arr.length === 0) {
    return { format: 'json', columns: [], rows: [], rowCount: 0 }
  }

  const rows = arr as Record<string, unknown>[]
  const columns = [...new Set(rows.flatMap((row) =>
    Object.keys(row).filter((key) => {
      const val = row[key]
      return val !== null && typeof val !== 'object'
    })
  ))]

  return { format: 'json', columns, rows, rowCount: rows.length }
}
```

This removes the `flatten` function and preserves the original nested structure.

- [ ] **Step 3: Update dataIngest test to expect nested (non-flattened) JSON**

In `frontend/src/services/dataIngest.test.ts`, update the test "parses JSON array with nested objects flattened" (line 14-23) to instead test that nesting is preserved:

```typescript
it('parses JSON array preserving nested objects', () => {
  const result = parseRawData('[{"id":1,"info":{"name":"Alice","city":"NYC"}},{"id":2,"info":{"name":"Bob","city":"LA"}}]')

  expect(result.format).toBe('json')
  expect(result.rowCount).toBe(2)
  expect(result.columns).toContain('id')
  expect(result.rows[0].info).toEqual({ name: 'Alice', city: 'NYC' })
  expect(result.rows[0].info.name).toBe('Alice')
})
```

Note: `columns` will only contain top-level scalar keys (like `id`), not nested keys like `info.name`. The nested structure is preserved in `rows` for JSONPath resolution.

- [ ] **Step 4: Run dataIngest tests to verify they pass**

Run: `cd frontend && npx vitest run src/services/dataIngest.test.ts`
Expected: PASS

- [ ] **Step 5: Verify backend imports cleanly**

Run: `cd backend && python -c "from parser import parse_json; print('ok')"`
Expected: prints `ok`

- [ ] **Step 6: Run all frontend tests to verify no regressions**

Run: `cd frontend && npm run test`
Expected: All tests pass

- [ ] **Step 7: Run build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add backend/parser.py frontend/src/services/dataIngest.ts frontend/src/services/dataIngest.test.ts
git commit -m "fix: preserve nested JSON structure for JSONPath resolution (stop flattening)"
```

---

## Task 9: Update backend Pydantic models and prompts

**Files:**
- Modify: `backend/main.py:114-176` (prompts and models)
- Modify: `backend/main.py:290-345` (`_run_pipeline`)

**Interfaces:**
- Produces: Updated `DatasetField` with `jsonPath`; new `PlotlyAggregation`, `PlotlyTransform`, `TraceSpec` Pydantic models; updated `ChartSpec` with `traces`; updated `MAP_SCHEMA_PROMPT` and `INSIGHT_PROMPT`; removed `FIELD_MAPPING_PROMPT`, `FieldMappingResult`; simplified `_run_pipeline` (2 LLM calls instead of 3)

- [ ] **Step 1: Update `MAP_SCHEMA_PROMPT`**

In `backend/main.py`, replace `MAP_SCHEMA_PROMPT` (lines 114-124):

```python
MAP_SCHEMA_PROMPT = """You are a data schema analyzer. Given free-form text (SQL DDL, CSV headers, JSON, OpenAPI spec, scraped HTML, or any data description), extract a flat list of fields with their types and semantics.

For each field, provide:
- name: a human-friendly field name (e.g. "County" or "Geocoded Column Longitude")
- jsonPath: a JSONPath expression to access this field in a data record. For top-level fields: "$.field_name". For nested fields: "$.parent.child" (e.g. "$.geocoded_column.longitude")
- type: string, number, boolean, date, or datetime
- semanticType: identifier (primary key), measure (numeric metric), dimension (categorical label), timestamp, currency, percentage, count, text, latitude (lat/geo lat), longitude (lng/geo lon), or geohash
- sampleValues: 3-5 representative values if they can be inferred from the input
- unique: true if the field is a primary key or unique identifier
- group: a grouping label if the fields come from distinct nested objects or resources (e.g. "order", "customer")

Set the source to a short description of where the data comes from.
Include warnings for any fields you are uncertain about."""
```

- [ ] **Step 2: Update `INSIGHT_PROMPT`**

In `backend/main.py`, replace `INSIGHT_PROMPT` (lines 126-147):

```python
INSIGHT_PROMPT = """You are an analytics brainstorming assistant. Given a dataset schema with field semantics and jsonPath values, generate creative analytics hypotheses suitable for a hackathon demo.

For each insight, provide a chartSpec object that MUST include "mode": "recipe".

SINGLE-TRACE CHARTS (simple):
  "chartSpec": { "mode": "recipe", "chartType": "bar", "xAxis": "$.category", "yAxis": "$.revenue" }
  - xAxis and yAxis must be jsonPath strings from the schema fields.
  - chartType can be: bar, line, pie, scatter, heatmap, or geomap.
    - Use "geomap" when the data has geographic coordinates (latitude/longitude fields). Provide xAxis as the longitude jsonPath, yAxis as the latitude jsonPath, and optionally zAxis as the intensity/value jsonPath.
    - Use "heatmap" for 2D density/intensity views.
    - Use "scatter" for correlation between two measures.
    - Use "bar" for categorical comparisons.
    - Use "line" for trends over time.
    - Use "pie" for share/proportion.
  - zAxis is optional, for heatmap intensity or geomap point coloring.

MULTI-TRACE CHARTS (overlays, dual-axis):
  For overlay plots (e.g. a line chart on top of a bar chart), use a "traces" array:
  "chartSpec": {
    "mode": "recipe",
    "traces": [
      {
        "chartType": "bar",
        "xAxis": "$.county",
        "yAxis": "$.dol_vehicle_id",
        "transform": { "type": "aggregate", "groups": "$.county", "aggregations": [{"func": "count", "target": "y"}] },
        "name": "EV Count"
      },
      {
        "chartType": "line",
        "xAxis": "$.county",
        "yAxis": "$.electric_range",
        "transform": { "type": "aggregate", "groups": "$.county", "aggregations": [{"func": "mean", "target": "y"}] },
        "yaxis2": "y2",
        "name": "Avg Range"
      }
    ]
  }
  - Each trace has its own chartType, xAxis, yAxis (jsonPath strings).
  - transform: optional Plotly aggregate transform. Use { "type": "aggregate", "groups": "<xAxis jsonPath>", "aggregations": [{"func": "sum|mean|count|min|max|median", "target": "y"}] }.
  - yaxis2: set to "y2" to use a secondary y-axis (for overlays with different scales).
  - name: trace name for the legend.

AGGREGATION:
  When you want to aggregate Y values by X (e.g. sum of revenue by category, count of vehicles by county, average range by make), ALWAYS include a transform on the trace. Common patterns:
  - Count: { "type": "aggregate", "groups": "$.county", "aggregations": [{"func": "count", "target": "y"}] }
  - Sum: { "type": "aggregate", "groups": "$.category", "aggregations": [{"func": "sum", "target": "y"}] }
  - Mean: { "type": "aggregate", "groups": "$.make", "aggregations": [{"func": "mean", "target": "y"}] }

Provide a dataProfile with rowCount and columns. Each column must have a "generator" field:
  - "category": include "categories" array
  - "normal": include "mean" and "stddev", optionally "min" and "max"
  - "uniform": include "min" and "max"
  - "linear": include "start", "end", and "step"
  - "constant": include "value"
Column names in dataProfile must be jsonPath strings matching the chartSpec xAxis/yAxis/zAxis values.
Return practical, visually interesting ideas with concise reasoning."""
```

- [ ] **Step 3: Remove `FIELD_MAPPING_PROMPT`**

In `backend/main.py`, delete line 149:

```python
FIELD_MAPPING_PROMPT = """You are a field mapping assistant. Given a list of insights with their chart axis column names (from mock data profiles) and a list of real data column names, map each insight's axis columns to the best matching real column. Return a mappings array where each entry has insightId and a mappings object mapping axis names to real column names."""
```

- [ ] **Step 4: Add new Pydantic models and update existing ones**

In `backend/main.py`, update the Pydantic models section (lines 153-216):

```python
class DatasetField(BaseModel):
    name: str = ""
    jsonPath: str = ""
    type: str = "string"
    nullable: bool = False
    semanticType: str | None = None
    sampleValues: Any | None = None
    unique: bool | None = None
    group: str | None = None


class DatasetSchema(BaseModel):
    source: str
    fields: list[DatasetField]
    warnings: list[str] = []


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


class DataColumnSpec(BaseModel):
    name: str = ""
    generator: str = "uniform"
    categories: list[str] | None = None
    min: float | None = None
    max: float | None = None
    mean: float | None = None
    stddev: float | None = None
    start: float | None = None
    end: float | None = None
    step: float | None = None
    value: Any | None = None


class DataProfile(BaseModel):
    rowCount: int = 100
    columns: list[DataColumnSpec] = []


class InsightCandidate(BaseModel):
    id: str = ""
    title: str = ""
    summary: str = ""
    confidence: float = 0.5
    hypothesis: str = ""
    metricDescription: str = ""
    chartSpec: ChartSpec | None = None
    dataProfile: DataProfile | None = None
    assumptions: list[str] = []
    description: str | None = None


class InsightEnvelope(BaseModel):
    insights: list[InsightCandidate]
```

Remove the `FieldMappingResult` class (line 215-216).

- [ ] **Step 5: Update `_run_pipeline` to remove the field-mapping LLM call**

In `backend/main.py`, replace `_run_pipeline` (lines 290-345):

```python
async def _run_pipeline(
    schema_text: str,
    real_data: dict | None = None,
) -> dict:
    """Run the LLM pipeline: schema mapping → insights (2 calls, no field mapping)."""
    # 1. Map schema
    schema = await call_llm(
        MAP_SCHEMA_PROMPT,
        f"Analyze this data description and extract the dataset schema:\n\n{schema_text}",
        DatasetSchema,
    )

    # 2. Generate insights
    insights = await call_llm(
        INSIGHT_PROMPT,
        f"Given this dataset schema, produce up to 10 insight candidates:\n\n{json.dumps(schema)}",
        InsightEnvelope,
        retry_prompt=(
            f"Generate 5 analytics insights for this schema. Each insight MUST have all fields: "
            f'id, title, summary, confidence (0-1), hypothesis, metricDescription, '
            f'chartSpec (with mode="recipe", chartType, xAxis, yAxis as jsonPath strings), '
            f'dataProfile (with rowCount and columns, each column needs name and generator), '
            f'and assumptions (array of strings).\n\nSchema: {json.dumps(schema)}'
        ),
    )

    return {
        "schema": schema,
        "insights": insights,
        "realData": real_data,
    }
```

- [ ] **Step 6: Verify backend imports cleanly**

Run: `cd backend && python -c "import main; print('ok')"`
Expected: prints `ok`

- [ ] **Step 7: Commit**

```bash
git add backend/main.py
git commit -m "feat: backend JSONPath, traces, transforms, remove field-mapping LLM call"
```

---

## Task 10: Final verification and cleanup

**Files:**
- Verify: all frontend tests pass
- Verify: frontend build succeeds
- Verify: backend imports cleanly

- [ ] **Step 1: Run all frontend tests**

Run: `cd frontend && npm run test`
Expected: All tests pass

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 3: Verify backend imports**

Run: `cd backend && python -c "import main; print('Backend OK')"`
Expected: prints `Backend OK`

- [ ] **Step 4: Verify no stale references to fieldMappings**

Run: `cd frontend && grep -r "fieldMapping\|FieldMapping\|applyFieldMapping" src/ --include="*.ts" --include="*.tsx"`
Expected: No matches (all references removed)

Run: `cd backend && grep -r "field_mapping\|FIELD_MAPPING\|FieldMappingResult" . --include="*.py"`
Expected: No matches (all references removed)

- [ ] **Step 5: Commit any final cleanup**

If any files were modified during cleanup:

```bash
git add -A
git commit -m "chore: final cleanup for JSONPath + aggregation + overlays feature"
```

- [ ] **Step 6: Print summary**

Print a summary of all changes made across all tasks, including:
- Number of LLM calls reduced (3 → 2)
- New types added (TraceSpec, PlotlyTransform, PlotlyAggregation, jsonPath on DatasetField)
- Types removed (FieldMapping, FieldMappingResult)
- Chart builder features (multi-trace, transforms, barmode, yaxis2)
- Test count (should be >34 due to new tests)
