# CLAUDE.md — YShvydak Test Dashboard

Playwright test dashboard. npm workspaces monorepo: `core`, `reporter`, `server` (Express + `sqlite3` with WAL), `web` (React + Vite), `mcp` (read-only stdio MCP server, built from `dist`, not part of the production build).

Frontend is feature-based — `features/{name}/` — over Atomic Design primitives in `shared/components/atoms/` and `shared/components/molecules/`. A new component belongs in its feature, not in `shared/`, unless it is genuinely shared.

## Architecture invariants

These four are load-bearing. Breaking any one of them corrupts historical tracking.

1. **Controller → Service → Repository → Database**, in `packages/server/src/{controllers,services,repositories}/`. Never call `DatabaseManager` from a service or controller. _(Enforced by a PreToolUse hook.)_
2. **INSERT-only test results.** Every execution is a NEW row: same `testId`, new `id`. Never `UPDATE test_results`. _(Enforced by a PreToolUse hook.)_ `test_catalog` is not execution history — one row per (project, testId) from the latest `--list`, UPSERT/DELETE allowed, never holds a status.
3. **`generateStableTestId()` is duplicated on purpose** in `packages/reporter/src/index.ts` and `packages/server/src/services/playwright.service.ts`. The two must stay byte-identical.
4. **Attachments are copied to permanent storage** (`packages/server/src/storage/attachmentManager.ts`) so they survive Playwright's cleanup.

`app_settings` is a server-side key-value table (`SettingsRepository`, UPSERT `ON CONFLICT(key) DO UPDATE`). Defaults live in the repository getter, not in the schema. Existing keys: `global_playwright_project`, `disk_warning_threshold_percent`, `disk_critical_threshold_percent`, `project_tab_configs`, `default_project_tab`, `ci_autorun_paused`, `ci_autorun_resume_at`, `ci_inflight_pipeline` (marker of a running CI pipeline — runIds, step projects, process-group ids; cleared on finish; found at startup = interrupted by a restart), `inflight_run` (same for a manual run-all/group/rerun: runId, pgid, project, discovery start), `jira_base_url` (default `''`, saved with trailing `/`), `chip_alignment` (`left`|`right` = tags column, `below` = chips under the test name; default `left`), `chip_tag_mode` (`tickets` = ticket-key tags only, `all` = every tag as a chip; default `tickets`), `catalog_last_full_scan` (ISO time of the last all-projects `--list`; written by `TestCatalogRepository`, read by the list query for `notInCode`; internal, not served by any settings endpoint) — all except `catalog_last_full_scan` served by `GET/PUT /api/settings/jira`.

Named CI pipelines: `ProjectTabConfig.pipelines` is `('develop' | 'production')[]` (a tab can be in zero or more). Tab list order = step order inside each pipeline. Shared helpers: `packages/server/src/utils/ciPipeline.util.ts` and `packages/web/src/constants/ciPipelines.ts`. Legacy `inPipeline: true` → `['develop']` via `normalizeCIPipelines`. `POST /api/pipeline/run` body `{pipeline, maxWorkers, source, notify}` — missing name → `develop`, unknown → 400. Script: `--pipeline <name>`; sends `notify: true` unless `--wait`.

Jira integration (optional, env-gated: `JIRA_BASE_URL`/`JIRA_EMAIL`/`JIRA_API_TOKEN`, all three or none — `config.jira.enabled`): read-only ticket type/status/summary/assignee for ticket-key tags, cached in `jira_ticket_cache`; last sync attempt (ok / error_reason / attempted_at) in single-row `jira_sync_status`. Fetch via `POST /rest/api/3/issue/bulkfetch` — legacy `GET /rest/api/3/search` was removed from Jira Cloud (2025-08); HTTP mocks won't catch an endpoint removal, check Atlassian docs. `JiraService.refreshAllKnownKeys()` runs every 30 min from `server.ts` + on-demand via `POST /api/jira/refresh`; ticket-key discovery duplicates the `@[A-Z][A-Z0-9]+-\d+` tag regex server-side (`utils/jiraTicketKey.util.ts`) on purpose, same reasoning as invariant 3. Separate from the pre-existing `jira_base_url` app_setting (chip link target, no env needed). A key absent from `GET /api/jira/tickets` (disabled/never synced/Jira error) is not an error — `TicketChips.tsx` falls back to the plain pre-existing chip render for that key.

`packages/mcp` is read-only: every request goes through the allowlist in `packages/mcp/src/http.ts` (GET on fixed paths + the login POST). A new tool that needs a new endpoint adds its exact path there, with strict id patterns. Never allowlist `/api/tests/projects` or `/api/tests/diagnostics` (they spawn `playwright --list`) or any POST/PUT/DELETE. `npm run build:prod` (deploy) skips the package.

## Flow

```
"Run All" → PlaywrightService → CLI --reporter=playwright-dashboard-reporter
  → reporter: testId (hash) + execution id (UUID)
  → POST /api/tests → Controller → Service → Repository → INSERT
  → AttachmentService → permanent storage
  → WebSocket → TestDetailModal → ExecutionSidebar (history)
```

## Commands

```bash
npm run dev          # all packages (web + server + reporter watch)
npm run type-check
npm run lint:fix
npm test
npm run build
npm run format
npx vitest run --project server <path>   # single file — from repo ROOT, never packages/*
```

Root npm scripts silently scope to one workspace if your cwd drifted into `packages/*`. Run `pwd` first if unsure.

## After any code change

`npm run format` → `npm run type-check` → `npm run lint:fix` → `npm test` → `npm run build`

**NEVER commit unless explicitly asked. NEVER skip hooks (`--no-verify`).**

## Before changing dependencies

Check Context7-MCP for current docs and breaking changes before adding, updating, or reconfiguring any package.

## Habits that keep costing us

- **Check dependents before changing any value or default.** Grep all usages _and_ tests first.
- **Look for an existing utility before writing one.** WebSocket URL, auth fetch and date formatting have all been reimplemented at least once.
- **CI pause is global for `source: 'script'`.** Do not special-case a pipeline name unless there is a user-facing setting for it.
- **`pipelines: ['develop']` in tests infers `string[]`.** Type the fixture as `ProjectTabConfig[]` (or `as const`) or `tsc` fails.
- **Renaming a test orphans its old `testId` row forever.** INSERT-only + hash-based id (invariant 2/3) means the old id never updates again but still counts in aggregates (`status-counts`, etc.) until deleted via `DELETE /api/tests/:testId`. A "failed" count that doesn't match any visible test is often one of these.
- **Branch flow: `feature/*` → PR to `main`, merge commits; no `develop` branch.** No CI checks run on PRs — local gates are the only gate.
- **Popovers/tooltips in the test list must portal to `document.body`.** Sticky group headers and the `overflow-y-auto` list clip or cover absolutely positioned children (see `TicketChips.tsx`).
- **`npm run format` (including via pre-commit/pre-push hooks) redrifts `CLAUDE.md` and `docs/README.md` table widths on every run, even with no content changes.** `git checkout -- CLAUDE.md docs/README.md` after formatting/committing to keep it out of your diff.

## Where the rest lives

| Topic                                  | Loads                                                              |
| -------------------------------------- | ------------------------------------------------------------------ |
| Where a file lives                     | `/file-map` skill                                                  |
| Server, SQLite, process tracking traps | `.claude/rules/server.md` — auto on `packages/server/**`           |
| React, Tailwind, caches, counts        | `.claude/rules/frontend.md` — auto on `packages/web/**`            |
| Reporter and `npm link`                | `.claude/rules/reporter.md` — auto on `packages/reporter/**`       |
| Vitest conventions                     | `.claude/rules/testing.md` — auto on test files                    |
| Named pipeline membership              | `ciPipeline.util.ts` / `constants/ciPipelines.ts` + Settings chips |
| Full anti-pattern catalogue            | [docs/ai/ANTI_PATTERNS.md](docs/ai/ANTI_PATTERNS.md)               |
| Architecture deep dive                 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                       |
| REST + WebSocket API                   | [docs/API_REFERENCE.md](docs/API_REFERENCE.md)                     |

## Specialized agents

Invoke explicitly — `@"validation-agent (agent)"`. Their descriptions tell Claude not to auto-delegate.

`validation-agent` (format/type-check/lint/test/build) · `coverage-agent` (Reporter 90%, Server 80%, Web 70%) · `documentation-agent` · `architecture-review-agent` · `external-code-review-agent`

## CI auto-run pause

Blocks every `source: 'script'` call from `trigger-test-run.js`, regardless of pipeline name (`develop`, `production`, …). UI-triggered runs still work. HTTP 423 `CI_AUTORUN_PAUSED` → script exits 2, no retry.

Settings-modal hooks don't share state with the `App.tsx` instance — they are separate `useCIAutoRun()` / `useProjectTabs()` calls. `App.tsx` must call each hook's `reload()` when Settings closes, or pause state and tab changes look stuck until a full page refresh.

## CI queue and result Slack

`CIRunQueueService` is the single owner of "busy" (a live child in `RunProcessRegistry` OR pipeline running, incl. between steps, OR a run still starting OR a stop cleaning up) and of the queue. The registry (runId → ChildProcess, set at spawn, dropped on `close`) is the busy source — never `activeProcessesTracker`, which only feeds progress UI and drops entries on reporter `process-end` and after 30 min. `source: 'script'` + `notify: true` while busy → HTTP 202 `{status:'queued'}` (one in-memory slot per pipeline, newest replaces, production drains first, lost on restart); without `notify` (`--wait`) → HTTP 409 `TESTS_ALREADY_RUNNING`, script polls every 10s, max 30 min. Manual run-all/group/rerun/pipeline starts get 409 `CI_RUN_QUEUED` while a slot is filled; manual run-all/group/rerun/pipeline starts get 409 `TESTS_ALREADY_RUNNING` whenever busy; every run button (and the Settings data actions) is disabled in the UI while a pipeline runs or a slot is filled; the UI re-reads `/pipeline/status/current` on every WebSocket (re)connect. Drain only on ChildProcess `close` of a non-pipeline run, on pipeline finish, when the last start claim is released without a process (failed start), and after `POST /tests/force-reset` — never on reporter `/process-end`, never between steps. At drain, pause/empty pipeline drops the request with a Slack line.

Replace: `script` + `notify` request for pipeline X while X's own CI run (running or starting, also `script` + `notify`) is active → `stop('replaced')` (fire-and-forget) and the request fills X's slot; the answer stays 202 `queued` and it starts on the normal drain (production first — no special ordering). Never replaced: `--wait`/manual runs and pipelines, other pipeline names. A stop already in flight is never repeated or re-announced (burst of requests = one stop, newest wins; the watchdog skips its timeout line when a stop already ends the pipeline). Pause/empty pipeline refuse the request before anything is stopped. `POST /pipeline/run` runs behind `authMiddleware` only: JWT required when `ENABLE_AUTH=true` (401), open when auth is off so local use and the script work — differs from `/settings/*` and `/pipeline/stop` (`requireJWT`, 403 when auth is off).

`notify: true` pipelines post the result via `CINotifierService` (`CI_SLACK_WEBHOOK_URL`, `PUBLIC_DASHBOARD_URL`, `CI_PIPELINE_TIMEOUT_MINUTES`); message and link rules live in `utils/ciSlackMessage.util.ts` (docs: API_REFERENCE → CI Pipelines). A step whose process closed with the run row still `running` is a crash: step `failed`, pipeline `stopped_early`. Pausing CI auto-run mid-pipeline lets the running step finish, skips the rest (not failed) and ends the pipeline `paused`.

Stop (`POST /api/pipeline/stop`; order, timings, markers and events: API_REFERENCE → CI Pipelines): a stopped run counts as never run, so everything it wrote is deleted and the pipeline ends in-memory `cancelled` (no DB status, no migration). Invariants: Playwright is spawned `detached` and signalled by process group (a test pins it); a start still preparing notices the stop generation and throws `RUN_CANCELLED` instead of spawning; `finish()` ignores non-`cancelled` endings while a stop is in progress; startup deletes the marker's runIds only — never sweep all `running` rows; web "Stopping..." holds until `run:cancelled`.

# Compact instructions

When compacting, always preserve:

- The full list of files modified so far, with what changed in each
- Which of the 5 validation steps have run and their exact results — never restate an unrun check as passing
- Any decision made about the architecture invariants above, and why
- Open questions the user has not answered yet

Drop: file contents already read, command output that has been acted on, superseded approaches.
