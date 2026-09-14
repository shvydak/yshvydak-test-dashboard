---
paths:
    - 'packages/server/**'
---

# SQLite Conventions

- Tests use in-memory DB: `new DatabaseManager(':memory:')` + `await dbManager.initialize()`
- Prefer `ROW_NUMBER() OVER (PARTITION BY ...)` over correlated subqueries (SQLite ≥ 3.25, already used in `getIdsPrunedByCount`)
- Add a composite index when filter + sort target the same query (e.g. `(test_id, created_at DESC)` for history)
- History defaults: `DEFAULT_LIMITS.TEST_HISTORY = 200` (`server/src/config/constants.ts`); frontend hook always sends `?limit=200&byTestId=true`

# Server Anti-Patterns

Hook-enforced (a `PreToolUse` hook blocks these before the write lands):

- **Never bypass the Repository.** `dbManager.run/get/all/exec(...)` belongs only in `src/repositories/`. Everything else goes Controller → Service → Repository.
- **Never `UPDATE test_results`.** Each execution is a NEW row: same `testId`, new `id`. That is what makes history work. Only `src/database/` may UPDATE, and only for column migrations. The INSERT itself lives in `database.manager.ts` → `saveTestResult()`. Schema: `src/database/schema.sql` (SQLite + WAL).

Not enforced — you have to remember these:

- **`getTestResultsByTestId` already JOINs attachments + notes.** Don't loop and re-query it (N+1).
- **`getAllTests` filters by project AFTER picking the latest row per `test_id`** — same semantics as `getProjectStatusSummary`. Filtering before the window would diverge from the tab badge.
- **"Latest row" = `created_at`, never `updated_at`.** The `update_test_results_timestamp` trigger sets `updated_at = CURRENT_TIMESTAMP` on ANY UPDATE, so a migration touching old rows makes them "latest" and hides real results (2026-09-14: legacy June rows hid 78 WEB tests after each restart). Migrations must also skip rows they can't change (EXISTS guard).
- **`testId` has no project dimension.** The hash is `filePath:title` only. `test_notes` / `note_images` are keyed by `test_id` alone, so any per-project feature must scope via `test_results.project`, and can't cleanly scope notes when two projects share a file + title.
- **`activeProcessesTracker` run-all lock is global on purpose.** One active run blocks every project. Concurrent Playwright processes conflict and the reporter drops results — don't "fix" it to be per-project.
- **`activeProcessesTracker.addProcess()` fires twice per run.** The dashboard registers first (knows `project`, not `totalTests`); the reporter's `/process-start` registers again for the same `runId` (knows `totalTests`, not `project`). Merge the fields — an overwrite silently drops `project` and resets in-flight `progress` to zero. Symptom: "N of 0 tests".
- **Playwright JSON is not grouped by project.** Top-level suites are per FILE; the project name sits at `spec.tests[0].projectName`. Nesting depth is arbitrary (file > describe > nested describe > …) — traverse recursively. A fixed 2-level walk silently drops deeper tests.
- **Spawned Playwright always gets `DASHBOARD_API_URL=http://localhost:PORT`**, never the external `BASE_URL` — the WAF returns 403 on `POST /api/tests` when the body carries stack traces or file paths. See `playwright.service.ts` → `spawnPlaywrightProcess()`.
- **Rerun reporter output is invisible by default.** `type: 'rerun'` uses `stdio: pipe` with no listeners. To see reporter warnings such as `⚠️ Failed to send test result`, temporarily attach `process.stdout?.on('data', ...)`.

# Dev loop

- **`tsx watch` goes stale.** Symptom: new routes 404 while old ones 401. Restart the server.
- **Never `kill` the tsx-watch child PID.** It cascades into the `npm run dev` / turbo supervisor and takes Vite down too. Run `npm run dev` inside `packages/server` directly instead.
