# CLAUDE.md — YShvydak Test Dashboard

Playwright test dashboard. npm workspaces monorepo: `core`, `reporter`, `server` (Express + `sqlite3` with WAL), `web` (React + Vite).

Frontend is feature-based — `features/{name}/` — over Atomic Design primitives in `shared/components/atoms/` and `shared/components/molecules/`. A new component belongs in its feature, not in `shared/`, unless it is genuinely shared.

## Architecture invariants

These four are load-bearing. Breaking any one of them corrupts historical tracking.

1. **Controller → Service → Repository → Database**, in `packages/server/src/{controllers,services,repositories}/`. Never call `DatabaseManager` from a service or controller. _(Enforced by a PreToolUse hook.)_
2. **INSERT-only test results.** Every execution is a NEW row: same `testId`, new `id`. Never `UPDATE test_results`. _(Enforced by a PreToolUse hook.)_
3. **`generateStableTestId()` is duplicated on purpose** in `packages/reporter/src/index.ts` and `packages/server/src/services/playwright.service.ts`. The two must stay byte-identical.
4. **Attachments are copied to permanent storage** (`packages/server/src/storage/attachmentManager.ts`) so they survive Playwright's cleanup.

`app_settings` is a server-side key-value table (`SettingsRepository`, UPSERT `ON CONFLICT(key) DO UPDATE`). Defaults live in the repository getter, not in the schema. Existing keys: `global_playwright_project`, `disk_warning_threshold_percent`, `disk_critical_threshold_percent`, `project_tab_configs`, `default_project_tab`, `ci_autorun_paused`, `ci_autorun_resume_at`.

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
npm test             # 84 files, 2273 tests
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

## Where the rest lives

| Topic                                  | Loads                                                        |
| -------------------------------------- | ------------------------------------------------------------ |
| Where a file lives                     | `/file-map` skill                                            |
| Server, SQLite, process tracking traps | `.claude/rules/server.md` — auto on `packages/server/**`     |
| React, Tailwind, caches, counts        | `.claude/rules/frontend.md` — auto on `packages/web/**`      |
| Reporter and `npm link`                | `.claude/rules/reporter.md` — auto on `packages/reporter/**` |
| Vitest conventions                     | `.claude/rules/testing.md` — auto on test files              |
| Full anti-pattern catalogue            | [docs/ai/ANTI_PATTERNS.md](docs/ai/ANTI_PATTERNS.md)         |
| Architecture deep dive                 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                 |
| REST + WebSocket API                   | [docs/API_REFERENCE.md](docs/API_REFERENCE.md)               |

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
