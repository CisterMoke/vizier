## Task 7 Report - Workspace Store, Export, Fallback, Demo Seed

Date: 2026-08-18

### Scope Delivered

- Added workspace state store with typed actions and export payload builder.
- Added report serialization utility.
- Added sample schema and fallback insight templates for offline/demo mode.
- Wired app to use store-driven state, deterministic seed dataset generation, fallback generation path, and export UI action.

### Files Changed

- Created `stats-scraper/src/store/workspaceStore.ts`
- Created `stats-scraper/src/store/workspaceStore.test.ts`
- Created `stats-scraper/src/lib/exportReport.ts`
- Created `stats-scraper/src/data/sampleSchemas.ts`
- Modified `stats-scraper/src/app.tsx`
- Modified `stats-scraper/src/app.test.tsx`
- Modified `stats-scraper/src/components/InsightControls.tsx`

### TDD Evidence

1. RED: Added `src/store/workspaceStore.test.ts` before store implementation.
2. RED verification command:

```bash
npm run test -- src/store/workspaceStore.test.ts
```

Observed fail reason: import resolution error for missing `./workspaceStore` module.

3. RED: Added app behavior test for fallback/no-key path and export button in `src/app.test.tsx`.
4. RED verification command:

```bash
npm run test -- src/app.test.tsx
```

Observed fail reason: generate button disabled without API key.

5. GREEN: Implemented workspace store, fallback paths, deterministic dataset seeding, and export action.
6. GREEN verification commands:

```bash
npm run test -- src/store/workspaceStore.test.ts
npm run test -- src/app.test.tsx
npm run test
```

All commands passed.

### Implementation Notes

- `useWorkspaceStore()` now exposes required actions:
  - `setRawSchema(text)`
  - `setCanonicalSchema(schema)`
  - `setInsights(items)`
  - `attachDataset(insightId, dataset)`
  - `removeInsight(insightId)`
  - `exportReport()`
- `buildExportPayload(state)` includes raw schema, canonical schema, insight list, dataset map, deterministic seed, and `generatedAt` timestamp.
- Fallback behavior:
  - If API key is empty, app loads fallback insights and datasets deterministically.
  - If provider call fails, app reports provider error and loads fallback insights/datasets.
- Deterministic seed behavior:
  - Initial card datasets use `demoSeed + insightIndex`.
  - Regenerate uses a deterministic offset `demoSeed + insightIndex + 1000`.
- Export behavior:
  - Export button now renders serialized report JSON from store payload.

### Test Results

- `npm run test -- src/store/workspaceStore.test.ts`: PASS (2 tests)
- `npm run test -- src/app.test.tsx`: PASS (3 tests)
- `npm run test`: PASS (9 files, 18 tests)

### Risks / Follow-ups

- Export currently serializes to on-page JSON preview; download-to-file behavior can be added later if required by Task 8/e2e.
- Regenerate path is deterministic by formula, not per-click variant; this favors reproducibility over varied refresh samples.
