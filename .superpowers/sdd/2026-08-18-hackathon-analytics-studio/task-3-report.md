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
