Status: DONE

Files changed:
- stats-scraper/src/domain/types.ts
- stats-scraper/src/domain/schemas.ts
- stats-scraper/src/domain/schemas.test.ts

TDD flow:
1. Added failing test in `src/domain/schemas.test.ts` for minimal canonical schema payload parse.
2. Ran `npm run test -- src/domain/schemas.test.ts`.
   - Outcome: FAILED as expected (`Failed to resolve import "./schemas"`).
3. Implemented runtime parser and domain contracts in `src/domain/schemas.ts` and `src/domain/types.ts`.
4. Ran `npm run test -- src/domain/schemas.test.ts`.
   - Outcome: PASSED.

Verification:
1. Ran `npm run test`.
   - Outcome: PASSED (2 test files, 2 tests).

Concerns:
- Runtime schema implementation is framework-agnostic and does not use Zod to avoid widening Task 2 scope into dependency management.
