Status: DONE

Files changed:
- stats-scraper/src/services/llmProvider.ts
- stats-scraper/src/services/insightGeneration.ts
- stats-scraper/src/services/insightGeneration.test.ts
- stats-scraper/src/components/InsightControls.tsx
- stats-scraper/src/app.tsx
- stats-scraper/src/app.test.tsx

TDD flow:
1. Added failing test in `src/services/insightGeneration.test.ts` for validated provider output pass-through.
2. Ran `npm run test -- src/services/insightGeneration.test.ts`.
   - Outcome: FAILED as expected (`Failed to resolve import "./insightGeneration"`).
3. Added failing UI shell assertion in `src/app.test.tsx` for in-memory API key + generate action.
4. Ran `npm run test -- src/app.test.tsx`.
   - Outcome: FAILED as expected (missing `LLM API key` control).
5. Implemented minimal provider/service/UI wiring in:
   - `src/services/llmProvider.ts`
   - `src/services/insightGeneration.ts`
   - `src/components/InsightControls.tsx`
   - `src/app.tsx`
6. Ran `npm run test -- src/services/insightGeneration.test.ts src/app.test.tsx`.
   - Outcome: PASSED.

Verification:
1. Ran `npm run test`.
   - Outcome: PASSED (5 test files, 11 tests).

Commit hash(es):
- PENDING

Concerns:
- Browser provider currently assumes JSON response shape of either an array or `{ insights: [...] }`; additional provider-specific adapters may be needed for non-conforming APIs.
