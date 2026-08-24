---
name: new-endpoint
description: Add a new REST endpoint through the full Controller - Service - Repository chain, with tests at each layer and the API_REFERENCE entry. Use when asked to add an API endpoint, a new route, or a new server-side query the frontend needs.
argument-hint: [what the endpoint returns]
---

# Add a REST endpoint: $ARGUMENTS

Reference implementation: `git show 2435222` (the `GET /api/tests/status-counts` endpoint). It touches every layer this skill lists.

Build bottom-up. Each layer gets its own test file before you move up.

## 1. Repository — `packages/server/src/repositories/*.repository.ts`

The SQL lives here and nowhere else. Use `queryOne` / `queryAll` / `execute` from `BaseRepository`; a hook blocks direct `dbManager` calls outside this directory.

Two rules that have caused real bugs here:

- **Aggregate counts must be computed in SQL, not derived from a paginated list.** `getAllTests` is capped (200 without a project tab, 5000 with one), so counting its rows silently caps the number at page size.
- **Filter by project AFTER picking the latest row per `test_id`**, matching `getProjectStatusSummary`. Filtering before the window function gives different numbers than the tab badge.

Prefer `ROW_NUMBER() OVER (PARTITION BY ...)` over correlated subqueries. If the query filters and sorts on the same columns, add a composite index.

## 2. Types — `packages/server/src/types/service.types.ts`

Declare the return shape. No `any`.

## 3. Service — `services/*.service.ts`

Business logic, validation, cross-repository coordination. Usually thin: call the repository, reconcile, return. Never reach past the repository into the database.

## 4. Controller — `controllers/*.controller.ts`

An arrow-function property, `try/catch`, `ResponseHelper` for every exit:

```ts
getThing = async (req: ServiceRequest, res: Response): Promise<Response> => {
    try {
        const result = await this.thingService.getThing()
        return ResponseHelper.success(res, result)
    } catch (error) {
        Logger.error('Error getting thing', error)
        return ResponseHelper.error(
            res,
            error instanceof Error ? error.message : 'Unknown error',
            'Failed to get thing',
            500
        )
    }
}
```

Validate query params and body here; `ResponseHelper.badRequest` on bad input. No business logic and no SQL.

## 5. Route — `routes/*.routes.ts`

One line inside the existing `createXRoutes(container)`:

```ts
router.get('/status-counts', testController.getTestStatusCounts)
```

`kebab-case` path. Routes mount under `/api` in `app.ts`. Order matters — a literal path must come before a `/:param` route that would swallow it.

## 6. Tests

One file per layer, in `__tests__/` beside the code. Server integration tests use `new DatabaseManager(':memory:')` + `await dbManager.initialize()`. Run from the repo ROOT:

```bash
npx vitest run packages/server/src/repositories/__tests__/x.test.ts
```

## 7. Frontend consumer, if there is one

React Query hook in `features/{name}/hooks/`, exported from that folder's `index.ts`. Two things:

- `enabled: isAuthenticated`, or the hook fires before `checkAuth()` resolves and the server logs `WARN: No authentication provided`.
- If the endpoint returns counts that any mutation can change, invalidate its cache inside `testsStore.fetchTests()` — one central place — rather than at each mutation call site. Zustand reaches React Query through the shared singleton in `packages/web/src/config/queryClient.ts`, not a client created in `main.tsx`. Note that `test_notes` mutations bypass `fetchTests()` entirely and must invalidate explicitly in `TestDetailModal.tsx`.

## 8. Finish

Document the endpoint in `docs/API_REFERENCE.md` — request, response shape, status codes. Then `npm run format` → `type-check` → `lint:fix` → `test` → `build`.
