# Reporter

[`playwright-dashboard-reporter`](https://www.npmjs.com/package/playwright-dashboard-reporter) sends Playwright results to the dashboard. Source: [`packages/reporter/src/index.ts`](../packages/reporter/src/index.ts). Consumer-facing readme: [`packages/reporter/README.md`](../packages/reporter/README.md).

## Install and use

```bash
# in your Playwright project
npm install --save-dev playwright-dashboard-reporter
```

`playwright.config.ts` needs no change. When you run tests from the dashboard it spawns, in `PLAYWRIGHT_PROJECT_DIR`:

```
npx playwright test [--project=<name>] [--workers=<n>] --reporter=playwright-dashboard-reporter
```

with `DASHBOARD_API_URL` (always `http://localhost:<PORT>`) and `RUN_ID` in the environment. Discovery uses `npx playwright test --list --reporter=json`. The reporter is resolved from the test project's `node_modules`; if it is missing, `GET /api/tests/diagnostics` lists `Reporter npm package not found: ...` under `playwright.validation.issues`.

Manual use is possible too: `npx playwright test --reporter=playwright-dashboard-reporter` with `DASHBOARD_API_URL` set.

## Environment variables

The reporter takes no constructor options (`constructor()` reads only the environment). It also loads a `.env` from the current working directory (dotenv).

| Variable            | Default                 | Meaning                                                                                                |
| ------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `DASHBOARD_API_URL` | `http://localhost:3001` | Dashboard base URL; a trailing `/api` is stripped.                                                     |
| `RUN_ID`            | random UUID             | Run id. Falls back to `RERUN_ID`, then a new UUID. The dashboard sets it so results attach to its run. |
| `RERUN_MODE`        | unset                   | `true` announces the process as `rerun` instead of `run-all` in `process-start`.                       |

## What it sends

| Hook                    | Request                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `onBegin`               | `POST /api/tests/process-start` (`runId`, `type`, `totalTests`)                    |
| `onTestBegin`           | `POST /api/tests/test-start` (`runId`, `testId`, `name`, `filePath`)               |
| `onTestEnd`             | `POST /api/tests` (one result, fields below)                                       |
| `onEnd`                 | `PUT /api/runs/:id` (status, totals, duration), then `POST /api/tests/process-end` |
| `onStdOut` / `onStdErr` | collected per test into `metadata.console`                                         |

Requests are fire-and-forget: a failed request logs a warning and never fails the Playwright run.

Result fields: `id` (UUID per execution), `testId`, `runId`, `name`, `filePath`, `status` (`passed | failed | skipped | timedOut`; other Playwright statuses map to `failed`), `duration`, `timestamp`, `errorMessage` (for failures: the stack with a few source lines around the failing line, read from the test file), `errorStack`, `attachments` (`name`, `path`, `contentType`; the server copies files to permanent storage) and `metadata`.

### Test ID

`testId` = `test-` + base-36 hash of `<normalized file path>:<test title>`, where the path is relative to the working directory with a leading `e2e/tests/`, `tests/` or `e2e/` removed. `generateStableTestId()` exists in both `packages/reporter/src/index.ts` and `packages/server/src/services/playwright.service.ts` on purpose and must stay byte-identical: Discover and reporter rows share ids, and history depends on it. The `project` is not part of the id.

## Metadata fields

All keys are optional and additive; rows written before a field existed simply lack it. Empty lists are omitted, except `tags`, which is always sent (`[]` when there are none).

| Key                            | Type                                               | Source                                    | Notes                                                                                                                                                                                       |
| ------------------------------ | -------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `steps`                        | `{title, category, duration, startTime, error?}[]` | `result.steps`                            | Omitted when there are no steps.                                                                                                                                                            |
| `console`                      | `{entries: {type, text, timestamp}[], truncated?}` | `onStdOut`/`onStdErr` with a `TestResult` | Last 500 entries and at most 200,000 characters; `truncated: true` when cut. Global output is ignored.                                                                                      |
| `tags`                         | `string[]`                                         | `test.tags`                               | Keeps the leading `@`. Includes `@` tokens from test and suite titles. Playwright's `tag` option and `TestCase.tags` are from 1.42; on older versions the field is `[]`.                    |
| `describe`                     | `string[]`                                         | ancestors of `test.parent`                | Describe titles only, outermost first (see below).                                                                                                                                          |
| `annotations`                  | `{type, description?}[]`                           | `test.annotations` + `result.annotations` | De-duplicated by type + description. Max 10 entries, `type` max 100 chars, `description` max 300. Includes skip/fixme/fail reasons.                                                         |
| `line`, `column`               | `number`                                           | `test.location`                           | Where the test is declared.                                                                                                                                                                 |
| `errors`                       | `{message?, stack?, truncated?}[]`                 | `result.errors`                           | Every error (soft assertions too). Max 5 entries, `message` max 2000 chars, `stack` max 4000; `truncated: true` on an entry whose field was cut. `errorMessage`/`errorStack` are unchanged. |
| `errorsTruncated`              | `true`                                             | `result.errors`                           | Present when more than 5 errors existed.                                                                                                                                                    |
| `outcome`                      | `skipped \| expected \| unexpected \| flaky`       | `test.outcome()`                          | Outcome after this result.                                                                                                                                                                  |
| `expectedStatus`               | `string`                                           | `test.expectedStatus`                     | E.g. `failed` for `test.fail()`.                                                                                                                                                            |
| `retry`, `retries`             | `number`                                           | `result.retry`, `test.retries`            | Retry index of this result; configured retries.                                                                                                                                             |
| `timeout`                      | `number`                                           | `test.timeout`                            | Milliseconds.                                                                                                                                                                               |
| `startTime`                    | ISO string                                         | `result.startTime`                        | Start of this result.                                                                                                                                                                       |
| `workerIndex`, `parallelIndex` | `number`                                           | `result`                                  |                                                                                                                                                                                             |

Types: `TestMetadata` in `packages/core/src/types/index.ts`.

**`describe`.** Playwright's `titlePath()` is `['', <project>, <file>, ...describes, <test title>]`. The reporter walks the parent suites of the test and keeps those with `type === 'describe'` and a non-empty title (anonymous describes are skipped, as `titlePath()` does). When the suites carry no string `type` (a Playwright version without `Suite.type`), the three outermost ancestors (root, project, file) are dropped instead.

**Robustness.** The peer range starts at Playwright 1.40, so each field is read on its own inside `try`/`catch` with type checks. A missing API (for example `test.outcome`) or a getter that throws only omits that field; it never throws out of `onTestEnd`, never breaks the run and never blocks the POST. Non-finite numbers and non-string values are dropped.

**Discover parity.** Discover (`POST /api/tests/discovery`) writes `tags`, `describe`, `annotations`, `line`, `column`, `timeout` and `expectedStatus` in exactly this shape, plus `playwrightId` and `discoveredAt`, from the `--list` JSON. That JSON has the file as the top-level suite (nested suites are describes) and gives tags without `@`; Discover re-adds it. The dashboard shows the latest row per test, so the reporter and Discover must agree on these keys; a parity test in `packages/server/src/services/__tests__/metadataParity.test.ts` checks it. Runtime-only annotations (added during the test) exist only in reporter rows.

**Size.** A typical passing test adds about 220 bytes, a failing test with one error and one annotation about 1.3 KB, and the capped worst case is roughly 31–34 KB. The server accepts JSON bodies up to 50 MB (`config.api.requestLimit`).

### How the dashboard uses tags

Tag tests with Playwright's `tag` option, for example `test('...', {tag: ['@ABC-123', '@smoke']}, ...)`. The test list shows chips for them: tags matching `^@[A-Z][A-Z0-9]+-\d+$` are ticket keys and link to `<Jira base URL><KEY>`; other tags are shown only when Settings > Tags & tickets > Tags to show is `All tags`. Search matches the displayed tags. The other fields are stored for future use and are not displayed yet, apart from `steps` and `console`.

## Troubleshooting

**No data in the dashboard.**

1. `npm list playwright-dashboard-reporter` in the test project.
2. `curl http://localhost:3001/api/health`.
3. Check `PLAYWRIGHT_PROJECT_DIR` and `PORT` in the dashboard `.env`.
4. `curl http://localhost:3001/api/tests/diagnostics`.

**`Reporter npm package not found`.** Install the package in the test project (`npm install --save-dev playwright-dashboard-reporter`).

**Reporter changes have no effect.** Production loads the package from `node_modules`; edits in `packages/reporter/src` reach a project only through `npm link` or a published version.

## Development and publishing

```bash
cd packages/reporter
npm run dev          # tsup watch
npm run build        # tsup: dist/index.js, index.mjs, index.d.ts
npm run type-check
```

Tests run from the repo root: `npx vitest run --project reporter` (target: 90% coverage). Publishing steps, tag scheme and the checks before `npm publish` are in [RELEASING.md](RELEASING.md).

## Related

- [API reference](API_REFERENCE.md)
- [Configuration](CONFIGURATION.md)
