# YShvydak Test Dashboard

Web dashboard for Playwright tests: live results, execution history with per-run attachments, one-click reruns, CI pipeline triggering, and per-test notes.

The Playwright side is the npm package [`playwright-dashboard-reporter`](https://www.npmjs.com/package/playwright-dashboard-reporter) (source: [`packages/reporter`](packages/reporter)). The dashboard adds it to the Playwright CLI (`--reporter=playwright-dashboard-reporter`), so your `playwright.config.ts` stays unchanged.

## Features

- **Test list**: status filter, search by name, file path, error text and displayed tags (URL-persistent `?q=`), counts aggregated in the database (not capped by the page size).
- **Runs**: Run All (per project tab), run a file group, rerun one test, live progress over WebSocket, test discovery (`playwright test --list`).
- **History**: every execution is a new record (same `testId`, new row). Each keeps its own screenshots, videos and traces, stored permanently and independent of Playwright's cleanup. Console output (stdout/stderr) and steps are captured per test.
- **Dashboard page**: status counts, flaky tests (last 30 days, at least two runs, failing share >= 10% and < 100%), 30-day timeline.
- **Project tabs**: one tab per Playwright project with display name, visibility, order, workers override and a default tab. Tabs whose project is gone from the Playwright config are marked and can be removed.
- **CI pipelines**: `develop` and `production` pipelines are ordered lists of project tabs, triggered by `POST /api/pipeline/run` or `scripts/trigger-test-run.js`. See [CI pipelines](#ci-pipelines).
- **Notes**: per-test notes with links and pasted or dropped images ([docs/features/TEST_NOTES.md](docs/features/TEST_NOTES.md)).
- **Tags and tickets**: Playwright tags such as `@ABC-123` become chips; ticket keys link to your tracker. See [Tags and tickets](#tags-and-tickets).
- **Storage**: disk usage with warning and critical thresholds; cleanup by date or by run count, either stripping attachments (history kept) or deleting executions permanently.
- **Theme**: Auto, Light or Dark.

## Requirements

- Node.js >= 18 and npm >= 10 (`engines` in the root `package.json`)
- A Playwright project (the reporter needs `@playwright/test` >= 1.40)

## Quick start

```bash
git clone https://github.com/shvydak/yshvydak-test-dashboard.git
cd yshvydak-test-dashboard
npm install
npm run build
```

Install the reporter in **your Playwright project** (not in this repo):

```bash
cd /path/to/your/playwright/project
npm install --save-dev playwright-dashboard-reporter
```

Create `.env` in the dashboard repo root. There is no `.env.example`; every variable is listed under [Configuration](#configuration). Minimal local setup:

```bash
PLAYWRIGHT_PROJECT_DIR=/path/to/your/playwright/project
PORT=3001
BASE_URL=http://localhost:3001
VITE_BASE_URL=http://localhost:3001

# Optional. With ENABLE_AUTH=true the next three are required.
# Replace the change-me values with your own before the first run.
ENABLE_AUTH=true
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=change-me-before-first-run
JWT_SECRET=change-me-to-a-long-random-string
```

Start everything (web, server, reporter watch build):

```bash
npm run dev
```

- Web UI: http://localhost:3000 (see [Ports](#ports))
- API: http://localhost:3001

Open the web UI, log in if auth is enabled, press **Discover Tests**, then run tests from the UI.

## Configuration

Variables are read from the root `.env` (the server loads `../../.env` relative to `packages/server`; Vite uses `envDir: '../..'`). Sources: `packages/server/src/config/environment.config.ts`, `packages/web/vite.config.ts`, `packages/web/src/config/environment.config.ts`.

| Variable                                      | Default                                       | Notes                                                                                                           |
| --------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `PLAYWRIGHT_PROJECT_DIR`                      | server working directory                      | Path to your Playwright project. Set it: the server starts in `packages/server`.                                |
| `PORT`                                        | `3001`                                        | API server port.                                                                                                |
| `NODE_ENV`                                    | `development`                                 |                                                                                                                 |
| `BASE_URL`                                    | `http://localhost:<PORT>`                     | Used to derive the API URL.                                                                                     |
| `DASHBOARD_API_URL`                           | `BASE_URL`                                    | Overrides the API base URL. Playwright processes spawned by the dashboard always get `http://localhost:<PORT>`. |
| `OUTPUT_DIR`                                  | `<server working dir>/test-results`           | Permanent attachment storage.                                                                                   |
| `ENABLE_AUTH`                                 | off                                           | Auth is on only when the value is exactly `true`.                                                               |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `JWT_SECRET` | none                                          | Required when `ENABLE_AUTH=true` (the server throws otherwise). There are no default credentials.               |
| `JWT_EXPIRES_IN`                              | `30d`                                         |                                                                                                                 |
| `VITE_PORT`                                   | see [Ports](#ports)                           | Web dev and preview port.                                                                                       |
| `VITE_BASE_URL`, `VITE_SERVER_URL`            | `http://localhost:3001`                       | Server URL for the web client (`VITE_SERVER_URL` wins).                                                         |
| `VITE_API_BASE_URL`, `VITE_WEBSOCKET_URL`     | `<server URL>/api`, `ws(s)://<server URL>/ws` | Optional overrides.                                                                                             |

### Ports

- API: `PORT`, default 3001.
- Web dev server: `VITE_PORT`, else `PORT - 1` when `PORT` is set, else 3000 (`packages/web/vite.config.ts`). With `PORT=3001` that is 3000. `vite preview` uses `VITE_PORT` or 3000.

### Authentication

With `ENABLE_AUTH=true` the web UI requires login (`POST /api/auth/login`, JWT). Middleware coverage as implemented (`packages/server/src/app.ts`, `routes/index.routes.ts`):

- JWT required: `/api/settings/*` and the static routes `/reports`, `/attachments`, `/note-images`, `/test-results`. `/api/settings/*` also demands a JWT specifically, so it answers 403 when `ENABLE_AUTH` is not `true`.
- No auth middleware: `/api/health`, `/api/auth/*`, `/api/tests/*` (including the reporter's `POST /api/tests` and `/api/tests/diagnostics`), `/api/runs/*`, `/api/storage/*`, `/api/pipeline/*`.

## Usage

### Running tests

From the UI: **Discover Tests**, **Run All** for the selected project tab, run a file group, or rerun one test. The server spawns `npx playwright test --reporter=playwright-dashboard-reporter` in `PLAYWRIGHT_PROJECT_DIR` with `DASHBOARD_API_URL` and `RUN_ID` set. One run is active at a time; starting another is rejected (`TESTS_ALREADY_RUNNING`). Your own `npx playwright test` runs are unaffected.

### Settings

Sections in the Settings modal: Theme, Project Tabs (including the default tab on open), Test Execution (max workers, manual run defaults: project and auto-discover before run, CI auto-run pause), Tags & tickets, Actions (Discover Tests, Clear All Data, clear one project's data), Storage (disk space, thresholds, cleanup). Settings are stored on the server and apply to all users.

### CI pipelines

Settings > Project Tabs assigns each tab to the `develop` and/or `production` pipeline. Tab order is step order, and "Stop on failure" skips the remaining steps of that pipeline after a failed step.

```bash
node scripts/trigger-test-run.js --pipeline develop --wait
```

Options: `--pipeline develop|production` (default `develop`), `--max-workers <n>`, `--wait`, `--timeout <seconds>`, `--silent`. Exit codes: 0 success, 1 stopped on a blocking failure / API error / timeout, 2 CI auto-run paused, 3 configuration error, 4 authentication error. A final `::PIPELINE_RESULT::{...}` JSON line is always printed. The script reads `BASE_URL`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the repo-root `.env`, so it has to run where that file exists. `scripts/trigger-test-run.sh` is a wrapper.

Endpoints: `POST /api/pipeline/run` (`{pipeline, maxWorkers, source}`; an unknown pipeline name is a 400), `GET /api/pipeline/status/current`, `GET /api/pipeline/status/:pipelineRunId`.

**Auto-run pause** (Settings > Test Execution, `GET/PUT /api/settings/ci-autorun-pause`) blocks every request with `source: 'script'`, whatever the pipeline name, with HTTP 423 `CI_AUTORUN_PAUSED`; the script exits 2 without retrying. UI-started runs still work. When a run is already active the API answers 409 `TESTS_ALREADY_RUNNING`; the script polls every 10 s for up to 30 min.

### Tags and tickets

Tag tests with Playwright's `tag` option:

```ts
test('logs in', {tag: ['@ABC-123', '@smoke']}, async ({page}) => {
    /* ... */
})
```

The reporter sends `metadata.tags` (`TestCase.tags` needs Playwright >= 1.42; older versions send `[]`) and Discover sends the same. A tag is a ticket key when it matches `^@[A-Z][A-Z0-9]+-\d+$` (after trimming). Settings > **Tags & tickets** (`GET/PUT /api/settings/jira`, see [docs/API_REFERENCE.md](docs/API_REFERENCE.md)):

- **Jira base URL**: empty or an http(s) URL. Ticket chips link to `<base URL><KEY>`; with an empty URL they are plain labels.
- **Tags to show**: `Ticket keys only` (default) or `All tags` (other tags are grey and not clickable).
- **Chip position**: a Tickets/Tags column on wide screens, left or right aligned (chips move under the test name on narrow screens), or `Under test name` at every width.

Search matches the tags that are currently displayed. Existing rows have no tags until the test runs again or Discover Tests is pressed.

### Reporter metadata

Besides the result fields, the reporter stores extra keys in each result's `metadata`: `tags`, `describe`, `annotations`, `line`, `column`, `errors` (+ `errorsTruncated`), `outcome`, `expectedStatus`, `retry`, `retries`, `timeout`, `startTime`, `workerIndex`, `parallelIndex`, plus `steps` and `console`. Discover writes `tags`, `describe`, `annotations`, `line`, `column`, `timeout` and `expectedStatus` in the same shape. Caps and Playwright-version behaviour: [docs/REPORTER.md](docs/REPORTER.md).

### Troubleshooting

- Health: `curl http://localhost:3001/api/health`. Integration status: `curl http://localhost:3001/api/tests/diagnostics`.
- Tests not listed: check `PLAYWRIGHT_PROJECT_DIR` and press Discover Tests (the server runs `playwright test --list --reporter=json` there).
- No results arrive: check that `playwright-dashboard-reporter` is installed in the test project (`npm list playwright-dashboard-reporter`).
- A "failed" count that matches no visible test is usually a renamed test: the old `testId` row is never updated again. Delete it with `DELETE /api/tests/:testId`.
- Web cannot reach the API: `PORT`, `BASE_URL` and `VITE_BASE_URL` must point at the same server.

## Architecture

```
packages/
  core/      shared TypeScript types
  reporter/  playwright-dashboard-reporter (published to npm)
  server/    Express + SQLite (WAL) + WebSocket
  web/       React + Vite UI
```

```
Run All -> server spawns Playwright with --reporter=playwright-dashboard-reporter
  -> reporter POSTs each result to /api/tests -> Controller -> Service -> Repository -> INSERT
  -> attachments copied to permanent storage -> WebSocket -> UI
```

Invariants (details in [CLAUDE.md](CLAUDE.md)): layered server (controller > service > repository > database), INSERT-only test results, and `generateStableTestId()` duplicated on purpose in the reporter and the server and kept byte-identical.

Stack: React 18, Vite 6, Tailwind 3, Zustand, TanStack Query, Express 4, sqlite3, ws, Turborepo, TypeScript 5, Vitest.

## Development

```bash
npm run dev            # all packages
npm run type-check
npm run lint:fix
npm test               # Vitest, all packages
npm run build
```

Other root scripts: `test:watch`, `test:ui`, `test:coverage`, `lint`, `format`, `format:check`, `clean`, `trigger-tests`, `trigger-tests:wait`, `trigger-tests:silent`, `changeset`, `changeset:status`, `version`, `release:reporter` (see [docs/RELEASING.md](docs/RELEASING.md)).

Production with pm2 (`ecosystem.config.js`): `start:prod`, `auto:prod`, `deploy:prod` (`git pull && npm install && npm run auto:prod`), `stop:prod`, `restart:prod`, `reload:prod`, `delete:prod`, `logs:prod`, `status:prod`, `dev:prod`.

Run one test file with `npx vitest run --project server <path>` from the repo root. Coverage targets: reporter 90%, server 80%, web 70%.

## Documentation

- [docs/README.md](docs/README.md): index
- [docs/API_REFERENCE.md](docs/API_REFERENCE.md): REST and WebSocket API
- [docs/REPORTER.md](docs/REPORTER.md): reporter usage, metadata, publishing
- [docs/RELEASING.md](docs/RELEASING.md): releases
- [CLAUDE.md](CLAUDE.md): architecture invariants and conventions

Other files in `docs/` (QUICKSTART, CONFIGURATION, DEPLOYMENT, ARCHITECTURE, DEVELOPMENT, TESTING, `features/`) predate several changes. Where they disagree with this README, the README and the code win.

## Contributing

1. Fork the repository and create a branch.
2. Make the change and add tests.
3. Run type-check, lint, tests and build (commands above).
4. Open a pull request.

## License

MIT, see [LICENSE](LICENSE).
