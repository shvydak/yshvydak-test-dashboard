# @yshvydak/test-dashboard-mcp

[MCP](https://modelcontextprotocol.io) server (stdio) for the test dashboard. It lets an AI assistant answer questions such as "which failing tests are in the to-fix tab and have all their tickets Done?" without opening the UI, and (optionally) start a rerun or a file run and follow it. Read-only by default; the run tools sit behind a flag. Not published to npm: run it from the built `dist`.

## Guard: read-only by default, run tools behind a flag

Enforced in code, not by the server (a dashboard login always yields an admin token):

- `src/http.ts` is the only module that calls `fetch`. It allows `GET` on a fixed list of paths and `POST` to `/api/auth/login`. With **runs off** (see below) nothing else can be sent: any other request throws before a request is made.
- With **runs on** it also allows exactly two POSTs, each with a strictly validated body: `/api/tests/<execution-uuid>/rerun` (`{maxWorkers}` only) and `/api/tests/run-group` (`{filePath, maxWorkers, testNames?}` only; `filePath` must be a plain spec path matching `[A-Za-z0-9_.-]` segments and ending in `.spec|.test.[cm]?[jt]sx?`, because Playwright reads it as an unanchored regex (`.*`, `a|b`, `spec` are refused); at most 50 names; `maxWorkers` 1-4). Run-all, stop, force-reset, delete, settings, discovery and every `/api/pipeline/*` route can never be reached.
- One fixed path per endpoint, with strict id patterns (execution id = UUID, test id = `test-<base36>`). `/api/tests/projects` and `/api/tests/diagnostics` can never be reached: both spawn `playwright test --list` on the server. `POST /api/jira/refresh` is never called.
- Attachment URLs from responses are re-built from validated parts (UUID + encoded file name), same origin only, `redirect: 'error'`.
- A test (`guardSweep.test.ts`) runs every tool against a fake dashboard with runs off and on, and checks each request against the allowlist. Adding a tool that needs a new endpoint means adding its path to `ALLOWED_GET` (or, for a run start, to `isAllowedRunPost`).

## Run tools

On by default only when the `DASHBOARD_URL` host is `localhost`, `127.0.0.1` or `[::1]`. A tunnelled remote dashboard (SSH port-forward on `localhost:<port>`) counts as local: set `DASHBOARD_ALLOW_RUNS=false` for it. For any other host they are off unless `DASHBOARD_ALLOW_RUNS=true` is set in that MCP server's config; `DASHBOARD_ALLOW_RUNS=false` turns them off even locally. When off, the tools stay listed and answer "Runs are disabled for this dashboard (set DASHBOARD_ALLOW_RUNS=true ...)" without sending any request (so the model learns how to enable them).

- `run_test_file` also checks that the file is one the dashboard lists (exact `filePath` match). Playwright matches the path as a case-insensitive substring, so if another listed file contains it (`login.spec.ts` vs `admin-login.spec.ts`) the tool refuses and names those files; nothing starts. A server-side anchored match would remove the limit.
- A start while another run is active (or a CI run is queued) is refused by the server (409/423); the tool returns "Not started: ..." and never retries.
- There is **no stop tool**: the server has no way to stop one run (`/api/pipeline/stop` stops every active run and deletes its results). Stop in the dashboard UI.
- A 5xx on a start means the run may have started: check `get_run_status` or the UI before trying again.
- A run adds a new execution to the test's history (results are insert-only).

## Tools

| Tool                 | Use                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dashboard_overview` | Which dashboard, login on/off, tabs with latest passed/failed counts, Jira sync state. Start here.                                                                                                                             |
| `list_tests`         | Latest result per test. Filters: `tab` (project or display name), `status` (`failed` includes `timedOut`), `tag`, `search`, `includeNotInCode`, `ticketStatusCategory` (`new`/`indeterminate`/`done`) + `allTicketsMustMatch`. |
| `get_test`           | One execution: error, stack, failed steps, console, attachments list. By `testId` (latest) or `executionId`.                                                                                                                   |
| `get_test_history`   | Executions of one test, newest first, last pass, failing streak, `nextBefore` cursor.                                                                                                                                          |
| `get_screenshots`    | Screenshots of one execution as images (png/jpeg only, default 1, max 3, per-image size cap).                                                                                                                                  |
| `get_run_status`     | One run by `runId`: status (running/completed/failed), counters, per-test results so far, result ages, a hint when it may be stuck. A run-group's counters fill at its end. Read-only; also for runs started in the UI.        |
| `rerun_test`         | Run tools. Rerun one test by `testId` (default: the project of its latest execution; optional `project` picks another; the output names the project); returns a `runId`. `maxWorkers` default 2, max 4.                        |
| `run_test_file`      | Run tools. Run one spec file the dashboard lists (optionally only named tests) by plain relative `filePath`; returns a `runId`.                                                                                                |

Example: "to-fix tab tests whose tickets are Done" is one call: `list_tests({tab: "<to-fix tab>", ticketStatusCategory: "done"})`.

Jira data (ticket type/status) needs the dashboard's Jira integration. The `/jira` and `/settings` routes answer 403 when the dashboard runs with login off (`ENABLE_AUTH=false`): the tools then say `Jira unavailable: login is off` (and tab display names are unavailable) instead of failing. The server never refreshes Jira from here; statuses are as fresh as the last sync (`jira.asOf`).

Size limits: the text payload is capped at 40,000 characters (Claude Code saves larger results to a file). Lists return `{total, returned, truncated}`, default 50 rows, max 200, page with `offset`. Errors and stacks are cut with a `…[+N chars]` marker. File paths on the server and Jira summaries are never returned.

## Configuration (environment)

| Variable                 | Meaning                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `DASHBOARD_URL`          | Server root, e.g. `http://localhost:3001` (a trailing `/api` is stripped). Required. |
| `DASHBOARD_EMAIL`        | Login email, when the dashboard has login on.                                        |
| `DASHBOARD_PASSWORD_CMD` | Shell command that prints the password, e.g. a macOS Keychain lookup. Preferred.     |
| `DASHBOARD_PASSWORD`     | Plain password fallback (stored in the client's config file in clear text).          |
| `DASHBOARD_TOKEN`        | Ready JWT instead of email/password. Expires with the server's `JWT_EXPIRES_IN`.     |
| `DASHBOARD_ALLOW_RUNS`   | `true`/`false`. Run tools: default on for localhost only (see Run tools).            |

The server logs in once and keeps the token in memory; on a 401 it logs in again once and retries once. The token and password are never logged or returned in tool output. Use your own account, not a CI one.

## Install (Claude Code, user scope)

Needs Node 20+. Build once, then register the built file:

```bash
npm install && npm run build            # from the repo root
```

Local dashboard (login off):

```bash
claude mcp add --scope user test-dashboard-local \
  -e DASHBOARD_URL=http://localhost:3001 \
  -- node <repo>/packages/mcp/dist/index.js
```

Remote dashboard (login on; add `-e DASHBOARD_ALLOW_RUNS=true` only if this MCP may start runs), password from the macOS Keychain:

```bash
security add-generic-password -a "$USER" -s test-dashboard-work -w   # prompts for the password

claude mcp add --scope user test-dashboard-work \
  -e DASHBOARD_URL=https://dashboard.example.com \
  -e DASHBOARD_EMAIL=you@example.com \
  -e DASHBOARD_PASSWORD_CMD='security find-generic-password -s test-dashboard-work -w' \
  -- node <repo>/packages/mcp/dist/index.js
```

`<repo>` is the absolute path of this repository. Tools then appear as `mcp__test-dashboard-local__list_tests` etc. After switching branches in the checkout, rebuild (`npm run build`).

## Deploy note

The MCP server runs on the developer's machine, not on the dashboard host: `npm run build:prod` (used by `auto:prod` / `start:prod`) skips this package.

## Tests

From the repo root: `npx vitest run --project mcp`. Unit tests use a fake `fetch`; `integration.test.ts` boots the real server harness (temp DB) and runs the tools over HTTP; `stdio.smoke.test.ts` spawns `dist` (rebuilds it first) and checks `initialize` + `tools/list`.
