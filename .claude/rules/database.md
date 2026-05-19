---
paths:
    - 'packages/server/**'
---

# SQLite Conventions

- Tests use in-memory DB: `new DatabaseManager(':memory:')` + `await dbManager.initialize()`
- Prefer `ROW_NUMBER() OVER (PARTITION BY ...)` over correlated subqueries (SQLite ≥ 3.25, already used in `getIdsPrunedByCount`)
- Add a composite index when filter + sort target the same query (e.g. `(test_id, created_at DESC)` for history)
- History defaults: `DEFAULT_LIMITS.TEST_HISTORY = 200` (`server/src/config/constants.ts`); frontend hook always sends `?limit=200&byTestId=true`
