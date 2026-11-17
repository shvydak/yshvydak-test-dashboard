# playwright-dashboard-reporter

Playwright reporter for [YShvydak Test Dashboard](https://github.com/shvydak/yshvydak-test-dashboard). It sends each test result, its attachments, console output and run progress to the dashboard server.

## Requirements

- `@playwright/test` >= 1.40 (peer dependency)
- Node.js >= 18
- A running dashboard server

Some fields need a newer Playwright and are simply omitted on older versions (for example `tags` need 1.42). See [Metadata](#metadata).

## Install

```bash
npm install --save-dev playwright-dashboard-reporter
```

## Use

### With the dashboard (normal case)

Nothing to configure. The dashboard runs Playwright in your project with `--reporter=playwright-dashboard-reporter` and passes `DASHBOARD_API_URL` and `RUN_ID` in the environment. Your `playwright.config.ts` and its other reporters stay as they are. Setup of the dashboard itself: see the [repository README](https://github.com/shvydak/yshvydak-test-dashboard#readme).

### Manual run

```bash
DASHBOARD_API_URL=http://localhost:3001 npx playwright test --reporter=playwright-dashboard-reporter
```

The dashboard has to know the run first: it creates the run record before it starts Playwright. A manual run has none (see `RUN_ID` below), so the dashboard refuses its results. Start runs from the dashboard.

## Configuration

The reporter has no options. It reads these environment variables (and a `.env` file in the working directory):

| Variable            | Default                 | Meaning                                                                                                                                                                                                                           |
| ------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DASHBOARD_API_URL` | `http://localhost:3001` | Dashboard base URL (a trailing `/api` is stripped).                                                                                                                                                                               |
| `RUN_ID`            | random UUID             | Run id; falls back to `RERUN_ID`, then a new UUID. The dashboard sets it and creates the run record first. A result for a run id the dashboard does not know is refused (HTTP 500, foreign key), so a random UUID stores nothing. |
| `RERUN_MODE`        | unset                   | `true` marks the process as a single-test rerun.                                                                                                                                                                                  |

## What is sent

- Run start, test start and process end notifications, run totals at the end (`/api/tests/process-start`, `/api/tests/test-start`, `/api/tests/process-end`, `PUT /api/runs/:id`).
- One result per finished test attempt (`POST /api/tests`): `testId`, `name`, `filePath`, `status`, `duration`, error message (with source lines around the failing line) and stack, attachments (name, path, content type) and `metadata`.
- `testId` is a stable hash of the file path and the test title, so the same test keeps the same id across runs.

Requests never fail the Playwright run: on an error the reporter logs a warning and continues.

### Delivery and stops

- A result request has a 25 s timeout, every other request 5 s. Result, run and process-end requests are retried twice on a 5xx or a network error (not on a 4xx).
- At the end of the run the reporter waits for all result requests to finish (at most 8 s) before it sends the run totals. Sending after the end of the run or a stop signal stops 15 s after it starts, and after a stop the run totals and process-end are sent once, without retries.
- `timedOut` tests count as failed in the totals.
- A test cut short by a stop (Playwright status `interrupted`) is not sent. It is logged and counted as `Interrupted` in the summary, not as failed.
- The reporter handles `SIGINT` and `SIGTERM` only; it does not add `uncaughtException` or `unhandledRejection` handlers.

### Known limits

- **`testId` has no describe chain.** It is a hash of the file path and the test title only. Two tests with the same title in one file (for example in different `describe` blocks) share one id and one row in the dashboard, and a rerun of either runs both.
- **`testDir` path.** Discover reports paths relative to Playwright's `testDir`, the reporter relative to the working directory. They match only when `testDir` is `tests`, `e2e/tests`, `e2e` or the project root (the dashboard strips those prefixes). With another directory, such as `./specs`, the two paths differ: each test shows up twice, a never-run `pending` row from Discover plus its real result.

## Metadata

Each result carries extra keys in `metadata`. All are optional and missing values are omitted.

| Key                            | Content                                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rawStatus`                    | Playwright's own status of the attempt (`passed`, `failed`, `timedOut`, `skipped`).                                                                                    |
| `tags`                         | Playwright tags with the leading `@` (`[]` on Playwright < 1.42).                                                                                                      |
| `describe`                     | Describe titles only, outermost first.                                                                                                                                 |
| `annotations`                  | `{type, description?}`, de-duplicated; max 10, type <= 100 chars, description <= 300 chars.                                                                            |
| `line`, `column`               | Where the test is declared.                                                                                                                                            |
| `errors`, `errorsTruncated`    | All result errors (soft assertions too): max 5, message <= 2000 chars, stack <= 4000 chars; `truncated: true` marks cut entries, `errorsTruncated` marks dropped ones. |
| `outcome`                      | `skipped`, `expected`, `unexpected` or `flaky`.                                                                                                                        |
| `expectedStatus`               | Expected status of the test.                                                                                                                                           |
| `retry`, `retries`             | Retry index of this attempt; configured retries.                                                                                                                       |
| `timeout`                      | Test timeout in ms.                                                                                                                                                    |
| `startTime`                    | ISO start time of this attempt.                                                                                                                                        |
| `workerIndex`, `parallelIndex` | Worker that ran the attempt.                                                                                                                                           |
| `steps`                        | Playwright steps (title, category, duration, start time, error).                                                                                                       |
| `console`                      | Per-test stdout/stderr (last 500 entries, at most 200,000 characters).                                                                                                 |

Each field is read defensively: a Playwright API that does not exist in your version, or a getter that throws, only omits that field. Details: [docs/REPORTER.md](https://github.com/shvydak/yshvydak-test-dashboard/blob/main/docs/REPORTER.md).

## Troubleshooting

No data in the dashboard:

1. The dashboard server is running: `curl http://localhost:3001/api/health`.
2. `DASHBOARD_API_URL` points at it.
3. Integration status: `curl http://localhost:3001/api/tests/diagnostics`.

## Links

- [Repository](https://github.com/shvydak/yshvydak-test-dashboard)
- [Issues](https://github.com/shvydak/yshvydak-test-dashboard/issues)
- [Reporter documentation](https://github.com/shvydak/yshvydak-test-dashboard/blob/main/docs/REPORTER.md)

## License

MIT
