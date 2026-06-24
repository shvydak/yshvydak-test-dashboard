---
paths:
    - 'packages/*/src/__tests__/**'
    - 'packages/*/vitest.config.ts'
    - 'vitest.config.ts'
---

# Testing Rules (auto-loaded for test files)

## Framework

Vitest 3.2. Config: `vitest.config.ts` (root) + `packages/{package}/vitest.config.ts`.  
Write tests in: `packages/{package}/src/__tests__/`

## Coverage targets

- Reporter: 90%+ (Test ID generation — CRITICAL)
- Server: 80%+ (services, repositories)
- Web: 70%+ (hooks, utilities)

## Do NOT use git stash to check pre-existing failures

`git stash` stashes ALL WIP and may lose in-progress work.  
Instead: `npx vitest run path/to/test.ts` — if it fails without touching that file, it's pre-existing.

## useSearchParams in web tests requires MemoryRouter

```tsx
render(<MemoryRouter initialEntries={['/?project=All_Tests']}><Component /></MemoryRouter>)
```

Vary `initialEntries` URL per test case to test different URL states.

## In-memory DB for integration tests

```typescript
const dbManager = new DatabaseManager(':memory:')
await dbManager.initialize()
```

## SQLite window functions

`ROW_NUMBER() OVER (PARTITION BY ...)` is supported (SQLite ≥ 3.25). Prefer over correlated subqueries.
