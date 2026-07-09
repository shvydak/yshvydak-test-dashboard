# CLAUDE.md - Quick Reference for AI Development

## CRITICAL: Architecture Invariants

### Repository Pattern — NEVER Bypass

**Controller → Service → Repository → Database**

- NEVER direct `DatabaseManager` calls from services or controllers
- ALWAYS use full chain for all operations
- Location: `packages/server/src/{controllers,services,repositories}/`
- Engine: **SQLite** (`sqlite3` + WAL). Schema: `packages/server/src/database/schema.sql`

### Test ID Generation — IDENTICAL algorithm

Discovery & Reporter use the SAME hash function — ensures historical tracking works.  
`packages/reporter/src/index.ts` + `packages/server/src/services/playwright.service.ts`

### INSERT-only Strategy — NEVER UPDATE test results

Each execution = NEW database row. `testId` same, `id` changes → history.  
`database.manager.ts` → `saveTestResult()`

### app_settings Table — Server-Side Key-Value Config

Pattern: `SettingsRepository` + UPSERT `ON CONFLICT(key) DO UPDATE`

Existing keys: `global_playwright_project`, `disk_warning_threshold_percent`, `disk_critical_threshold_percent`, `project_tab_configs`, `ci_autorun_paused`, `ci_autorun_resume_at`

Default values handled in repository getter when row absent.  
`packages/server/src/repositories/settings.repository.ts`

### Reporter Integration

Production: `playwright-dashboard-reporter` from node_modules  
Development: `npm link` for live changes — NO config changes to `playwright.config.ts`  
CLI injection: `--reporter=playwright-dashboard-reporter`

**Spawned Playwright env:** Server always passes `DASHBOARD_API_URL=http://localhost:PORT` to child Playwright process — bypasses Nginx/WAF. NEVER use the external `BASE_URL` here; WAF blocks `POST /api/tests` when the body contains stack traces / file paths (HTTP 403).  
`packages/server/src/services/playwright.service.ts` → `spawnPlaywrightProcess()`

### Attachment Storage — Permanent

Files copied from Playwright temp → permanent storage. Survives Playwright's cleanup cycles.  
`packages/server/src/storage/attachmentManager.ts`

### Context7-MCP — MANDATORY before dependency changes

ALWAYS check before adding/updating packages or changing config. Gets latest docs + breaking changes.

---

## Concept Flow

```
User clicks "Run All"
  → PlaywrightService → CLI: --reporter=playwright-dashboard-reporter
  → Reporter: testId (hash) + execution id (UUID)
  → POST /api/tests → Controller → Service → Repository → INSERT
  → AttachmentService → Permanent storage
  → WebSocket → Frontend → TestDetailModal → ExecutionSidebar (history)
```

---

## Specialized Agents

Use for post-development checks (`disable-model-invocation: true` — manual only):

- `validation-agent` — format, type-check, lint, tests, build
- `coverage-agent` — coverage vs targets (Reporter 90%, Server 80%, Web 70%)
- `documentation-agent` — detects docs needing updates after API/feature changes
- `architecture-review-agent` — Repository Pattern, dead code, duplicated logic
- `external-code-review-agent` — review & fix code from other AI assistants

---

## Quick File Finder

| Need to...                                      | File                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Generate testId                                 | `packages/reporter/src/index.ts`                                                                                                            |
| WebSocket URL                                   | `packages/web/src/features/authentication/utils/webSocketUrl.ts`                                                                            |
| Apply theme                                     | `packages/web/src/hooks/useTheme.ts`                                                                                                        |
| Rerun button                                    | `packages/web/src/features/tests/components/history/ExecutionSidebar.tsx`                                                                   |
| Copy attachments                                | `packages/server/src/storage/attachmentManager.ts`                                                                                          |
| Flaky detection                                 | `packages/server/src/repositories/test.repository.ts`                                                                                       |
| DB schema                                       | `packages/server/src/database/schema.sql`                                                                                                   |
| Disk thresholds                                 | `packages/server/src/repositories/settings.repository.ts`                                                                                   |
| Strip attachments                               | `packages/server/src/services/test.service.ts` (`cleanupData mode: 'strip'                                                                  | 'full'`) |
| Execution history pagination                    | `packages/web/src/features/tests/hooks/useTestExecutionHistory.ts`                                                                          |
| Disk warning banner                             | `packages/web/src/features/dashboard/components/DiskSpaceWarningBanner.tsx`                                                                 |
| Search input                                    | `packages/web/src/shared/components/molecules/SearchInput.tsx`                                                                              |
| Project tabs config                             | `packages/web/src/hooks/useProjectTabs.ts`                                                                                                  |
| Active project filter                           | `packages/web/src/features/tests/hooks/useTestFilters.ts`                                                                                   |
| CI auto-run pause                               | `packages/web/src/hooks/useCIAutoRun.ts` + `packages/web/src/features/dashboard/components/CIAutoRunPauseBanner.tsx`                        |
| CI pipeline (ordered multi-project runs)        | `packages/server/src/services/pipelineExecution.service.ts` + `packages/web/src/hooks/usePipelineStatus.ts`                                 |
| Tab status badge/dot (general, any run trigger) | `packages/server/src/repositories/test.repository.ts` (`getProjectStatusSummary`) + `packages/web/src/hooks/useProjectRunStatus.ts`         |
| GitHub Actions CI workflow                      | **Separate repo**, not this one — `probuildGit/test-dashboard` (`.github/workflows/trigger-tests.yml`), used by the self-hosted qa01 runner |

**Full structure:** [docs/ai/FILE_LOCATIONS.md](docs/ai/FILE_LOCATIONS.md)

---

## Top Anti-Patterns

Full catalog with examples: [docs/ai/ANTI_PATTERNS.md](docs/ai/ANTI_PATTERNS.md)

**Critical (memorize these):**

- **Bypass Repository** — never `this.dbManager.run(...)` directly, always go through Repository
- **UPDATE test results** — WRONG: `UPDATE test_results SET ...` / RIGHT: `INSERT INTO test_results ...`
- **Duplicate utilities** — always check for existing utils before writing (WebSocket URL, auth, etc.)
- **N+1 over JOIN** — `getTestResultsByTestId` already JOINs attachments+notes; don't loop & re-query
- **Change without checking dependents** — grep all usages + tests before changing any value/default
- **tsx watch stale** — restart server after significant changes; symptom: new routes return 404 while old return 401
- **Playwright JSON not project-grouped** — top-level suites are per-FILE; project name at `spec.tests[0].projectName`. Suite nesting depth is arbitrary (file > describe > nested describe > ...) — traverse recursively, not at fixed levels; a 2-level traversal silently drops deeper-nested tests.
- **Reporter changes without npm link** — changes to `packages/reporter/src/` only apply via `npm link` or publish
- **Rerun reporter output invisible** — `type: 'rerun'` uses `stdio: pipe` but has no listeners by default; add `process.stdout?.on('data', ...)` to rerun process temporarily to see reporter warnings (e.g. `⚠️ Failed to send test result`)
- **testId has no project dimension** — hash is `filePath:title` only. `test_notes`/`note_images` are keyed by `test_id` alone (no `project` column) — any per-project feature (discovery, clear-data) must scope via `test_results.project`, not testId, and can't cleanly scope notes if two projects share a file+title.
- **`activeProcessesTracker` run-all lock is global by design** — one active run blocks ALL projects, not just one. Intentional: concurrent Playwright processes conflict and the reporter drops results. Don't "fix" this to be per-project.
- **`activeProcessesTracker.addProcess()` fires twice per run** — the dashboard registers the process first (knows `project`, not `totalTests`), then the Playwright reporter's own `/process-start` call registers again for the same `runId` (knows `totalTests`, not `project`). Must merge fields, never overwrite — an overwrite silently drops `project`/other details and resets in-flight `progress` back to zero (symptom: progress bar shows "N of 0 tests").

**Frontend rules (auto-loaded for packages/web/**):** [.claude/rules/frontend.md](.claude/rules/frontend.md)  
**Testing rules (auto-loaded for test files):\*\* [.claude/rules/testing.md](.claude/rules/testing.md)

---

## Architecture Quick Ref

- Backend: Controller → Service → Repository → Database
- Frontend: Feature-Based (`features/{name}/`) + Atomic Design (`shared/components/atoms/`, `molecules/`)
- Reporter: npm package, CLI injection, environment config
- Database: INSERT-only, testId grouping, execution history
- Attachments: Permanent storage, unique filenames, isolated dirs

Deep dive: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Essential Commands

```bash
npm run dev          # All packages (web + server + reporter watch)
npm run type-check   # TypeScript validation
npm run lint:fix     # ESLint auto-fix
npm test             # All tests (73 files, 2111+ tests)
npm run test:watch   # Watch mode
npm run test:coverage
npx vitest run --project server <path>   # single file — MUST run from repo root, not packages/*
npx vitest run --project web <path>
npm run build
npm run format       # Prettier
```

---

## Development Checklist (after any code change)

1. `npm run format`
2. `npm run type-check`
3. `npm run lint:fix`
4. `npm test`
5. `npm run build`

Run via `@validation-agent` or manually.

**NEVER commit unless explicitly asked.**  
**NEVER skip hooks (`--no-verify`).**

---

## CI Auto-run Pause

Blocks `source: 'script'` calls (from `trigger-test-run.js`) — UI-triggered runs still work.  
HTTP 423 `CI_AUTORUN_PAUSED` → script exits code 2 (no retry). HTTP 409 `TESTS_ALREADY_RUNNING` → polls 10s, max 30 min.  
Settings-modal hooks don't share state with their `App.tsx` instance (separate `useCIAutoRun()`/`useProjectTabs()` calls) — `App.tsx` must call each hook's `reload()` on Settings close, or changes (pause state, tab order/rename/visibility) look "stuck" until a full page refresh.

---

**Docs:** [docs/ai/](docs/ai/) | **Last Updated:** June 2026
