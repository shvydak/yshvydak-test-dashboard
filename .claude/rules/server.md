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
- **Spawned Playwright gets `DASHBOARD_API_URL=http://127.0.0.1:<internal port>`** (loopback listener, `utils/internalListener.util.ts`), never the external `BASE_URL` — the WAF returns 403 on `POST /api/tests` when the body carries stack traces or file paths. Only the 5 reporter routes skip the JWT there, decided by `req.socket.localPort`, never `remoteAddress` (nginx proxies from localhost). The listener starts before the main `listen`/PM2 ready, so no run starts without it. See `playwright.service.ts` → `spawnPlaywrightProcess()`.
- **The child env drops server secrets** (`SERVER_SECRET_ENV` in `utils/security.util.ts`). A new server-only secret env var goes into that list.
- **`/api/tests`, `/api/runs`, `/api/storage`, `/api/pipeline/status/*` need a JWT when `ENABLE_AUTH=true`.** Keep new routes behind it; `PUBLIC_ENDPOINTS` matches the full URL (`originalUrl`), not `req.path`.
- **Discover has two modes** (`POST /api/tests/discovery` `mode`): `reset` (default; Run All, auto-discover, pipelines) rebuilds pending rows, `incremental` (manual button) keeps statuses, calls Jira once and ignores `project` (always lists all projects, so a `@to-fix` move is seen). `--list` runs first: a failed list writes nothing; a 0-test list deletes no catalog rows and flags nothing (reset still drops pending rows, as before). Catalog stale pruning only after an all-projects scan; scoped resets never prune.
- **Tags/describe/annotations on `GET /api/tests` come through the catalog overlay** (`utils/catalogMetadata.util.ts`): the catalog wins only when strictly newer than the row's `created_at`. `notInCode` needs all of: an all-projects scan has happened (`catalog_last_full_scan` app setting, written by `TestCatalogRepository.markFullScan` on an unscoped scan; none yet = nothing flagged); no catalog row for (project, test); latest row older than that scan; test in no project's catalog; the project has catalog rows. Scoped scans don't move the full-scan time, so they can't flag a moved test. Any new metadata reader goes through `getAllTests` or that util, never raw `test_results.metadata`.
- **Ids from a request that become paths/argv** go through `isSafeId` / `isSafeCliPath` / `isInsideDir` (`utils/security.util.ts`).
- **Rerun reporter output is invisible by default.** `type: 'rerun'` uses `stdio: pipe` with no listeners. To see reporter warnings such as `⚠️ Failed to send test result`, temporarily attach `process.stdout?.on('data', ...)`.

# Dev loop

- **`tsx watch` goes stale.** Symptom: new routes 404 while old ones 401. Restart the server.
- **Never `kill` the tsx-watch child PID.** It cascades into the `npm run dev` / turbo supervisor and takes Vite down too. Run `npm run dev` inside `packages/server` directly instead.
