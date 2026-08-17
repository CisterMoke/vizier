Status: DONE

Files changed:
- stats-scraper/src/services/schemaNormalize.ts
- stats-scraper/src/services/schemaNormalize.test.ts
- stats-scraper/src/components/SchemaInputPanel.tsx
- stats-scraper/src/components/SchemaPreviewEditor.tsx
- stats-scraper/src/components/schemaUi.test.tsx
- stats-scraper/src/app.tsx
- stats-scraper/src/app.test.tsx

TDD flow:
1. Added failing test in `src/services/schemaNormalize.test.ts` for entity extraction from freeform text.
2. Ran `npm run test -- src/services/schemaNormalize.test.ts`.
   - Outcome: FAILED as expected (`Failed to resolve import "./schemaNormalize"`).
3. Implemented `normalizeSchema(rawText)` in `src/services/schemaNormalize.ts` with heuristic parsing/type inference.
4. Added failing component tests in `src/components/schemaUi.test.tsx` for normalize callback wiring and canonical JSON edit emission.
5. Ran `npm run test -- src/services/schemaNormalize.test.ts src/components/schemaUi.test.tsx`.
   - Outcome: FAILED as expected (`Failed to resolve import "./SchemaInputPanel"`).
6. Added failing shell test update in `src/app.test.tsx` for studio heading and normalize action.
7. Ran `npm run test -- src/app.test.tsx`.
   - Outcome: FAILED as expected (new heading not present in scaffold app).
8. Implemented UI in `src/components/SchemaInputPanel.tsx`, `src/components/SchemaPreviewEditor.tsx`, and wired app state/actions in `src/app.tsx`.
9. Ran `npm run test -- src/services/schemaNormalize.test.ts src/components/schemaUi.test.tsx src/app.test.tsx`.
   - Outcome: PASSED.

Verification:
1. Ran `npm run test`.
   - Outcome: PASSED (4 test files, 5 tests).

Concerns:
- Input normalization is heuristic-first and currently focused on `entity(field type, ...)` patterns; non-parenthesized formats are returned as warnings.

Commit hash(es):
- 776a10e9f8f791a33f2d7683622bd8e8f9da838f

---

Fix status: DONE

Reviewer findings addressed:
1. High: `SchemaPreviewEditor` now keeps local draft JSON text during invalid intermediate edits and only calls `onChange` when parse+schema validation succeed.
2. Medium: `schemaNormalize` field splitting now ignores commas inside nested SQL type parentheses such as `decimal(10,2)`.

Files changed (fix pass):
- stats-scraper/src/components/SchemaPreviewEditor.tsx
- stats-scraper/src/components/schemaUi.test.tsx
- stats-scraper/src/services/schemaNormalize.ts
- stats-scraper/src/services/schemaNormalize.test.ts

Commands run with outcomes:
1. `npm run test -- src/components/schemaUi.test.tsx src/services/schemaNormalize.test.ts`
   - Outcome: FAILED as expected (draft JSON reset regression and decimal split regression reproduced).
2. Implemented focused fixes in the files listed above.
3. `npm run test -- src/components/schemaUi.test.tsx src/services/schemaNormalize.test.ts`
   - Outcome: PASSED (targeted reviewer-coverage tests).
4. `npm run test`
   - Outcome: PASSED (4 test files, 7 tests).

Tests:
- `src/components/schemaUi.test.tsx`: added `keeps local draft JSON when edit is invalid and only emits when valid`.
- `src/services/schemaNormalize.test.ts`: added `keeps decimal precision types intact when splitting fields`.

Commit hash(es):
- PENDING

Concerns:
- Entity extraction remains heuristic and top-level text-oriented; it handles nested parentheses in field types but is not a full SQL parser.
