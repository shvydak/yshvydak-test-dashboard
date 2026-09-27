# CLAUDE.md — YShvydak Test Dashboard

Playwright test dashboard. npm workspaces monorepo: `core`, `reporter`, `server` (Express + `sqlite3` with WAL), `web` (React + Vite).

Frontend is feature-based — `features/{name}/` — over Atomic Design primitives in `shared/components/atoms/` and `shared/components/molecules/`. A new component belongs in its feature, not in `shared/`, unless it is genuinely shared.

## Architecture invariants

These four are load-bearing. Breaking any one of them corrupts historical tracking.

1. **Controller → Service → Repository → Database**, in `packages/server/src/{controllers,services,repositories}/`. Never call `DatabaseManager` from a service or controller. _(Enforced by a PreToolUse hook.)_
2. **INSERT-only test results.** Every execution is a NEW row: same `testId`, new `id`. Never `UPDATE test_results`. _(Enforced by a PreToolUse hook.)_
3. **`generateStableTestId()` is duplicated on purpose** in `packages/reporter/src/index.ts` and `packages/server/src/services/playwright.service.ts`. The two must stay byte-identical.
4. **Attachments are copied to permanent storage** (`packages/server/src/storage/attachmentManager.ts`) so they survive Playwright's cleanup.

`app_settings` is a server-side key-value table (`SettingsRepository`, UPSERT `ON CONFLICT(key) DO UPDATE`). Defaults live in the repository getter, not in the schema. Existing keys: `global_playwright_project`, `disk_warning_threshold_percent`, `disk_critical_threshold_percent`, `project_tab_configs`, `default_project_tab`, `ci_autorun_paused`, `ci_autorun_resume_at`, `jira_base_url` (default `''`, saved with trailing `/`), `chip_alignment` (`left`|`right` = tags column, `below` = chips under the test name; default `left`), `chip_tag_mode` (`tickets` = ticket-key tags only, `all` = every tag as a chip; default `tickets`) — all served by `GET/PUT /api/settings/jira`.

Named CI pipelines: `ProjectTabConfig.pipelines` is `('develop' | 'production')[]` (a tab can be in zero or more). Tab list order = step order inside each pipeline. Shared helpers: `packages/server/src/utils/ciPipeline.util.ts` and `packages/web/src/constants/ciPipelines.ts`. Legacy `inPipeline: true` → `['develop']` via `normalizeCIPipelines`. `POST /api/pipeline/run` body `{pipeline, maxWorkers, source}` — missing name → `develop`, unknown → 400. Script: `--pipeline <name>`.

Jira integration (optional, env-gated: `JIRA_BASE_URL`/`JIRA_EMAIL`/`JIRA_API_TOKEN`, all three or none — `config.jira.enabled`): read-only ticket type/status/summary/assignee for ticket-key tags, cached in `jira_ticket_cache`; last sync attempt (ok / error_reason / attempted_at) in single-row `jira_sync_status`. Fetch via `POST /rest/api/3/issue/bulkfetch` — legacy `GET /rest/api/3/search` was removed from Jira Cloud (2025-08); HTTP mocks won't catch an endpoint removal, check Atlassian docs. `JiraService.refreshAllKnownKeys()` runs every 30 min from `server.ts` + on-demand via `POST /api/jira/refresh`; ticket-key discovery duplicates the `@[A-Z][A-Z0-9]+-\d+` tag regex server-side (`utils/jiraTicketKey.util.ts`) on purpose, same reasoning as invariant 3. Separate from the pre-existing `jira_base_url` app_setting (chip link target, no env needed). A key absent from `GET /api/jira/tickets` (disabled/never synced/Jira error) is not an error — `TicketChips.tsx` falls back to the plain pre-existing chip render for that key.

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
- **Branch flow: `feature/*` → PR to `develop` → PR `develop` → `main`, merge commits.** No CI checks run on PRs — local gates are the only gate.
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

Blocks every `source: 'script'` call from `trigger-test-run.js`, regardless of pipeline name (`develop`, `production`, …). UI-triggered runs still work. HTTP 423 `CI_AUTORUN_PAUSED` → script exits 2, no retry. HTTP 409 `TESTS_ALREADY_RUNNING` → polls every 10s, max 30 min.

Settings-modal hooks don't share state with the `App.tsx` instance — they are separate `useCIAutoRun()` / `useProjectTabs()` calls. `App.tsx` must call each hook's `reload()` when Settings closes, or pause state and tab changes look stuck until a full page refresh.

# Compact instructions

When compacting, always preserve:

- The full list of files modified so far, with what changed in each
- Which of the 5 validation steps have run and their exact results — never restate an unrun check as passing
- Any decision made about the architecture invariants above, and why
- Open questions the user has not answered yet

Drop: file contents already read, command output that has been acted on, superseded approaches.
