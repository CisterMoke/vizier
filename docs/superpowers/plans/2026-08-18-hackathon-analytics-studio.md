# Hackathon Analytics Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone web app that turns freeform schema input into LLM-generated analytics hypotheses and interactive Plotly charts with synthetic data, then exports a reproducible report.

**Architecture:** Implement a frontend-only Preact + TypeScript app with focused services for schema normalization, insight generation, mock data generation, and chart spec mapping. Keep provider interfaces explicit so stage-2 connectors/scrapers can swap in with minimal UI changes.

**Tech Stack:** Vite, Preact, TypeScript, Plotly.js, react-plotly.js, Zustand, Zod, Vitest, Testing Library, Playwright, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-18-hackathon-analytics-studio-design.md`

## Global Constraints

- V1 is frontend-only; no backend dependency.
- Input supports paste-anything schema text plus manual repair/edit.
- LLM uses user-provided API key in browser session memory by default.
- Visualization library is Plotly.
- Demo success is end-to-end: schema -> ideas -> charts -> export.
- Deployment target is standalone static web app on Vercel.
- Include deterministic demo seed and offline fallback insights.
- Follow TDD for each task.

---

### Task 1: Add Testing and Tooling Baseline

**Files:**
- Modify: `stats-scraper/package.json`
- Modify: `stats-scraper/vite.config.ts`
- Create: `stats-scraper/src/app.test.tsx`
- Create: `stats-scraper/src/test/setup.ts`

**Interfaces:**
- Consumes: `App` from `stats-scraper/src/app.tsx`
- Produces: `npm run test`, `npm run test:coverage`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/preact'
import { App } from './app'

it('renders schema input heading', () => {
  render(<App />)
  expect(screen.getByText(/schema/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL because testing setup and scripts are not configured.

- [ ] **Step 3: Write minimal implementation**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

```ts
export default defineConfig({
  plugins: [preact()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts'
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test`
Expected: PASS for test bootstrap.

- [ ] **Step 5: Commit**

```bash
git add stats-scraper/package.json stats-scraper/vite.config.ts stats-scraper/src/app.test.tsx stats-scraper/src/test/setup.ts
git commit -m "test: add vitest and testing library baseline"
```

### Task 2: Define Domain Types and Runtime Schemas

**Files:**
- Create: `stats-scraper/src/domain/types.ts`
- Create: `stats-scraper/src/domain/schemas.ts`
- Create: `stats-scraper/src/domain/schemas.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `CanonicalSchema`
  - `InsightCandidate`
  - `GeneratedDataset`
  - `ChartCard`
  - `parseCanonicalSchema(input: unknown): CanonicalSchema`

- [ ] **Step 1: Write the failing test**

```ts
import { parseCanonicalSchema } from './schemas'

it('accepts a minimal canonical schema payload', () => {
  const parsed = parseCanonicalSchema({
    entities: [{ name: 'orders', fields: [{ name: 'id', type: 'number', nullable: false }] }],
    relationships: [],
    warnings: []
  })
  expect(parsed.entities[0].name).toBe('orders')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/domain/schemas.test.ts`
Expected: FAIL with missing schema parser.

- [ ] **Step 3: Write minimal implementation**

```ts
export const CanonicalSchemaSchema = z.object({
  entities: z.array(z.object({
    name: z.string(),
    fields: z.array(z.object({
      name: z.string(),
      type: z.enum(['string', 'number', 'boolean', 'date', 'datetime', 'unknown']),
      nullable: z.boolean()
    }))
  })),
  relationships: z.array(z.object({
    fromEntity: z.string(),
    fromField: z.string(),
    toEntity: z.string(),
    toField: z.string()
  })),
  warnings: z.array(z.string())
})

export const parseCanonicalSchema = (input: unknown) => CanonicalSchemaSchema.parse(input)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/domain/schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add stats-scraper/src/domain/types.ts stats-scraper/src/domain/schemas.ts stats-scraper/src/domain/schemas.test.ts
git commit -m "feat: add domain contracts and zod parsers"
```

### Task 3: Implement Schema Normalization and Repair UI

**Files:**
- Create: `stats-scraper/src/services/schemaNormalize.ts`
- Create: `stats-scraper/src/services/schemaNormalize.test.ts`
- Create: `stats-scraper/src/components/SchemaInputPanel.tsx`
- Create: `stats-scraper/src/components/SchemaPreviewEditor.tsx`
- Modify: `stats-scraper/src/app.tsx`

**Interfaces:**
- Consumes: `CanonicalSchema`
- Produces:
  - `normalizeSchema(rawText: string): CanonicalSchema`
  - `SchemaInputPanel({ onNormalize(rawText: string): void })`
  - `SchemaPreviewEditor({ schema, onChange })`

- [ ] **Step 1: Write the failing test**

```ts
import { normalizeSchema } from './schemaNormalize'

it('extracts at least one entity from freeform schema text', () => {
  const result = normalizeSchema('orders(id int, total decimal, created_at timestamp)')
  expect(result.entities.length).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/services/schemaNormalize.test.ts`
Expected: FAIL with missing normalizer.

- [ ] **Step 3: Write minimal implementation**

```ts
export function normalizeSchema(rawText: string): CanonicalSchema {
  // Heuristic extraction and type inference
  return { entities, relationships: [], warnings }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/services/schemaNormalize.test.ts`
Expected: PASS and basic ingest UI wiring in app.

- [ ] **Step 5: Commit**

```bash
git add stats-scraper/src/services/schemaNormalize.ts stats-scraper/src/services/schemaNormalize.test.ts stats-scraper/src/components/SchemaInputPanel.tsx stats-scraper/src/components/SchemaPreviewEditor.tsx stats-scraper/src/app.tsx
git commit -m "feat: add schema normalization and repair UI"
```

### Task 4: Implement LLM Provider and Insight Generation

**Files:**
- Create: `stats-scraper/src/services/llmProvider.ts`
- Create: `stats-scraper/src/services/insightGeneration.ts`
- Create: `stats-scraper/src/services/insightGeneration.test.ts`
- Create: `stats-scraper/src/components/InsightControls.tsx`
- Modify: `stats-scraper/src/app.tsx`

**Interfaces:**
- Consumes: `CanonicalSchema`, `InsightCandidate`
- Produces:
  - `interface LLMProvider { generateInsights(input: InsightPromptInput): Promise<InsightCandidate[]> }`
  - `createBrowserLLMProvider(apiKey: string, endpoint?: string): LLMProvider`
  - `generateInsightCandidates(schema: CanonicalSchema, provider: LLMProvider): Promise<InsightCandidate[]>`

- [ ] **Step 1: Write the failing test**

```ts
it('returns validated insight candidates from provider output', async () => {
  const provider = { generateInsights: async () => [{ id: 'i1', title: 'AOV by segment', hypothesis: '...', chartType: 'bar' }] }
  const items = await generateInsightCandidates(mockSchema, provider)
  expect(items[0].title).toMatch(/AOV/i)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/services/insightGeneration.test.ts`
Expected: FAIL with missing generation module.

- [ ] **Step 3: Write minimal implementation**

```ts
export async function generateInsightCandidates(schema: CanonicalSchema, provider: LLMProvider) {
  const raw = await provider.generateInsights({ schema, maxIdeas: 10 })
  return InsightCandidateArraySchema.parse(raw)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/services/insightGeneration.test.ts`
Expected: PASS and in-memory key + generate action in UI.

- [ ] **Step 5: Commit**

```bash
git add stats-scraper/src/services/llmProvider.ts stats-scraper/src/services/insightGeneration.ts stats-scraper/src/services/insightGeneration.test.ts stats-scraper/src/components/InsightControls.tsx stats-scraper/src/app.tsx
git commit -m "feat: add llm provider and insight generation pipeline"
```

### Task 5: Build Deterministic Mock Data Generator

**Files:**
- Create: `stats-scraper/src/services/mockData.ts`
- Create: `stats-scraper/src/services/mockData.test.ts`

**Interfaces:**
- Consumes: `CanonicalSchema`, `InsightCandidate`
- Produces:
  - `generateMockDataset(schema: CanonicalSchema, insight: InsightCandidate, opts?: { seed?: number; rowCount?: number }): GeneratedDataset`

- [ ] **Step 1: Write the failing test**

```ts
it('generates deterministic rows for same seed', () => {
  const a = generateMockDataset(mockSchema, mockInsight, { seed: 42, rowCount: 50 })
  const b = generateMockDataset(mockSchema, mockInsight, { seed: 42, rowCount: 50 })
  expect(a.rows).toEqual(b.rows)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/services/mockData.test.ts`
Expected: FAIL with missing generator.

- [ ] **Step 3: Write minimal implementation**

```ts
export function generateMockDataset(schema, insight, opts = {}) {
  const seed = opts.seed ?? 1337
  const rowCount = opts.rowCount ?? 200
  return { seed, rowCount, columns, rows }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/services/mockData.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add stats-scraper/src/services/mockData.ts stats-scraper/src/services/mockData.test.ts
git commit -m "feat: add deterministic mock data service"
```

### Task 6: Add Plotly Mapping and Chart Cards

**Files:**
- Create: `stats-scraper/src/services/chartSpec.ts`
- Create: `stats-scraper/src/services/chartSpec.test.ts`
- Create: `stats-scraper/src/components/ChartCard.tsx`
- Create: `stats-scraper/src/components/ChartGrid.tsx`
- Modify: `stats-scraper/src/app.tsx`

**Interfaces:**
- Consumes: `InsightCandidate`, `GeneratedDataset`
- Produces:
  - `buildPlotlySpec(insight: InsightCandidate, data: GeneratedDataset): { data: Plotly.Data[]; layout: Partial<Plotly.Layout> }`
  - `ChartCard({ insight, dataset, onRegenerate, onDelete })`

- [ ] **Step 1: Write the failing test**

```ts
it('maps bar chart intent to a bar trace', () => {
  const spec = buildPlotlySpec(mockBarInsight, mockDataset)
  expect(spec.data[0].type).toBe('bar')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/services/chartSpec.test.ts`
Expected: FAIL due missing mapper.

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildPlotlySpec(insight, dataset) {
  if (insight.chartType === 'bar') {
    return { data: [{ type: 'bar', x, y }], layout: { title: insight.title } }
  }
  return { data: [{ type: 'scatter', mode: 'lines+markers', x, y }], layout: { title: insight.title } }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/services/chartSpec.test.ts`
Expected: PASS with chart card rendering path.

- [ ] **Step 5: Commit**

```bash
git add stats-scraper/src/services/chartSpec.ts stats-scraper/src/services/chartSpec.test.ts stats-scraper/src/components/ChartCard.tsx stats-scraper/src/components/ChartGrid.tsx stats-scraper/src/app.tsx
git commit -m "feat: add plotly chart specs and chart card components"
```

### Task 7: Add Workspace Store, Export, Fallback, and Demo Seed

**Files:**
- Create: `stats-scraper/src/store/workspaceStore.ts`
- Create: `stats-scraper/src/store/workspaceStore.test.ts`
- Create: `stats-scraper/src/lib/exportReport.ts`
- Create: `stats-scraper/src/data/sampleSchemas.ts`
- Modify: `stats-scraper/src/app.tsx`

**Interfaces:**
- Consumes: service outputs from Tasks 3-6
- Produces:
  - `useWorkspaceStore()` actions:
    - `setRawSchema(text: string): void`
    - `setCanonicalSchema(schema: CanonicalSchema): void`
    - `setInsights(items: InsightCandidate[]): void`
    - `attachDataset(insightId: string, dataset: GeneratedDataset): void`
    - `removeInsight(insightId: string): void`
    - `exportReport(): ExportPayload`
  - `buildExportPayload(state: WorkspaceState): ExportPayload`

- [ ] **Step 1: Write the failing test**

```ts
it('builds export payload with schema, insights, datasets, and timestamp', () => {
  const payload = buildExportPayload(mockWorkspaceState)
  expect(payload.insights.length).toBeGreaterThan(0)
  expect(payload.generatedAt).toBeDefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/store/workspaceStore.test.ts`
Expected: FAIL with missing state/export utilities.

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildExportPayload(state: WorkspaceState): ExportPayload {
  return {
    schemaRaw: state.rawSchema,
    canonicalSchema: state.canonicalSchema,
    insights: state.cards,
    seed: state.demoSeed,
    generatedAt: new Date().toISOString()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/store/workspaceStore.test.ts`
Expected: PASS with fallback and deterministic seed paths wired.

- [ ] **Step 5: Commit**

```bash
git add stats-scraper/src/store/workspaceStore.ts stats-scraper/src/store/workspaceStore.test.ts stats-scraper/src/lib/exportReport.ts stats-scraper/src/data/sampleSchemas.ts stats-scraper/src/app.tsx
git commit -m "feat: add workspace store, export report, and demo fallback modes"
```

### Task 8: Add E2E Flow and Deployment Docs

**Files:**
- Create: `stats-scraper/e2e/app.spec.ts`
- Create: `stats-scraper/playwright.config.ts`
- Modify: `stats-scraper/package.json`
- Modify: `stats-scraper/README.md`

**Interfaces:**
- Consumes: complete user flow from prior tasks
- Produces: `npm run e2e` and deployment instructions

- [ ] **Step 1: Write the failing e2e test**

```ts
test('end-to-end flow from schema paste to report export', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel(/schema/i).fill('orders(id int, total decimal)')
  await page.getByRole('button', { name: /normalize/i }).click()
  await page.getByRole('button', { name: /generate/i }).click()
  await expect(page.getByTestId('chart-card')).toHaveCount(1)
  await page.getByRole('button', { name: /export/i }).click()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run e2e`
Expected: FAIL before e2e setup is complete.

- [ ] **Step 3: Write minimal implementation**

```json
{
  "scripts": {
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui"
  }
}
```

```md
README additions:
- local run steps
- API key handling rules
- demo seed and fallback behavior
- vercel deploy commands
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test && npm run e2e && npm run build`
Expected: PASS and production build completes.

- [ ] **Step 5: Commit**

```bash
git add stats-scraper/e2e/app.spec.ts stats-scraper/playwright.config.ts stats-scraper/package.json stats-scraper/README.md
git commit -m "test: add e2e flow and deployment documentation"
```

## Self-Review Notes

- **Spec coverage:** all required v1 features map to Tasks 1-8.
- **Placeholder scan:** no TODO/TBD placeholders in task execution instructions.
- **Type consistency:** service names and signatures are consistent with the design spec.
