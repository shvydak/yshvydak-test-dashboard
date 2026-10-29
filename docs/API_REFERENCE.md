# API Reference

## Overview

All API endpoints return consistent `ApiResponse<T>` format with proper error handling and status codes.

## Authentication

With `ENABLE_AUTH=false` (local use) nothing needs a token. With `ENABLE_AUTH=true`:

| Route group                                                            | Auth on the main port                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `/api/health`, `/api/auth/*`                                           | none                                                                |
| `/api/tests/*` (incl. `/diagnostics`), `/api/runs/*`, `/api/storage/*` | JWT (`Authorization: Bearer <token>` or `?token=<token>`), else 401 |
| `/api/pipeline/status/*`, `POST /api/pipeline/run`                     | JWT, else 401                                                       |
| `/api/pipeline/stop`, `/api/settings/*`, `/api/jira/*`                 | JWT, else 401 (403 when auth is off)                                |

**Internal reporter listener.** Besides `PORT`, the server listens on `127.0.0.1` on an ephemeral port. Playwright processes it spawns get `DASHBOARD_API_URL=http://127.0.0.1:<port>`. Only the five reporter routes skip the JWT there — `POST /api/tests`, `POST /api/tests/process-start`, `/test-start`, `/process-end`, `PUT /api/runs/:id` — and only when the request arrived on that local port (`req.socket.localPort`; never the remote address, because nginx proxies public traffic from localhost). Every other route on that port still needs a JWT. A reporter started outside the dashboard (not spawned by it) therefore gets 401 when auth is on.

## Base URL

- **Development**: `http://localhost:3001/api`
- **Production**: `https://api-dashboard.shvydak.com/api`

## Health & Diagnostics

### GET /api/health

Health check endpoint for monitoring dashboard status.

**Response:**

```json
{
    "status": "success",
    "data": {
        "status": "healthy",
        "timestamp": "2024-09-25T12:00:00.000Z"
    }
}
```

### GET /api/tests/diagnostics

Complete integration status and configuration validation. Requires a JWT when `ENABLE_AUTH=true`.

**Response:**

```json
{
    "status": "success",
    "data": {
        "dashboard": {
            "status": "healthy",
            "version": "1.0.0"
        },
        "playwright": {
            "configured": true,
            "project_dir": "/path/to/tests"
        },
        "reporter": {
            "type": "file",
            "path": "/path/to/yshvydakReporter.ts"
        }
    }
}
```

## Test Management

### GET /api/tests

Retrieve all test results with optional filtering.

**Query Parameters:**

- `limit` - Maximum number of results (default: 200)
- `status` - Filter by test status
- `file` - Filter by test file

**Response:**

```json
{
    "status": "success",
    "data": [
        {
            "testId": "test-66jqtq",
            "name": "API - Update Order Status",
            "status": "passed",
            "timestamp": "2025-09-24 13:41:11",
            "createdAt": "2025-09-24 13:41:11",
            "updatedAt": "2025-09-24 13:44:50",
            "file": "tests/api/actions.spec.ts",
            "duration": 1500
        }
    ]
}
```

**Which rows are returned.** One row per test (its latest execution, by `created_at`). Without `project` and without `runId`, tests whose latest row has no project (`''` or NULL: legacy rows, results without a project) are left out only when at least one named project exists, the same rule as `GET /api/tests/status-counts`. If no row in the database has a project (a Playwright config without named projects), nothing is hidden. With `project`, only that project's tests are returned. With `runId`, that run's results are returned as stored, without this filter. The limit is applied after these filters.

### POST /api/tests

Save test results from Playwright reporter. Reporter route: accepted without a JWT on the internal listener, JWT on the main port (see **Authentication**).

Validation: `id`, `testId` and `runId` must match `[A-Za-z0-9_-]{1,128}` (UUID or stable-hash shape), else 400 — they become directory names. An `attachments[].path` is copied only if it resolves (symlinks followed) inside the Playwright output dir (`PLAYWRIGHT_OUTPUT_DIR`, default `<PLAYWRIGHT_PROJECT_DIR>/test-results`); other attachments are skipped and logged, the result is still saved.

**Request Body:**

```json
{
    "testId": "test-66jqtq",
    "name": "API - Update Order Status",
    "status": "passed",
    "file": "tests/api/actions.spec.ts",
    "duration": 1500,
    "error": null,
    "attachments": []
}
```

### POST /api/tests/discovery

Runs `playwright test --list` and records what it found in `test_catalog` (one row per project + test; it is not execution history and never holds a status).

**Request Body:** `{"project"?: string, "mode"?: "reset" | "incremental"}`. In `reset` mode `project` scopes the `--list` and the pending-row rebuild to one Playwright project (the catalog is still refreshed for what it lists, but nothing is pruned). In `incremental` mode `project` is ignored: manual Discover always scans every project, because a scoped scan cannot see a test that moved to another project (`@to-fix`) and would flag it as not in code in the tab it left; the `discovery:completed` event then carries no `project`. `mode` omitted = `reset`; any other value → 400.

- `reset` (Run All's pre-discovery, server auto-discover, pipeline steps): pending rows are rebuilt, so every listed test starts as `pending`. Makes no Jira call.
- `incremental` (tests-page Discover button, Settings > Discover Tests; both scan all projects): existing tests keep their last status. A test gets a `pending` row only when it has no row at all, or its latest row is in a project the spec no longer runs in (e.g. `@to-fix` added or removed moves it between projects). Afterwards a full Jira sync runs in the background and `jira:synced` is broadcast when it ends. If a background sync was already running it is joined, so a tag added just now may wait for the next 30-minute sync.

A failed `--list` (non-zero exit, e.g. a spec file that throws on import) answers 500 and changes nothing: no pending delete, no catalog write. Stale catalog rows (tests the scan no longer lists) are pruned only after an all-projects scan (`incremental`, or an unscoped `reset`) and only in projects where it found at least one test; a project-scoped `reset` (tab Run All, pipeline step) never prunes, because it cannot see a test that moved to another project.

**Response:**

```json
{
    "success": true,
    "data": {
        "discovered": 80,
        "saved": 3,
        "mode": "incremental",
        "timestamp": "2026-10-26T12:00:00.000Z"
    }
}
```

`saved` = pending rows written. After a Discover, `GET /api/tests` shows the catalog's tags, describe, annotations and line for each test whose scan is newer than its latest result row; a newer run wins.

`notInCode: true` on a `GET /api/tests` row (latest-row lists only, not `?runId=`) means the last all-projects scan no longer lists the test. All must hold: an all-projects scan has run (its time is kept in the `catalog_last_full_scan` app setting; before that nothing is flagged); no catalog row for (project, test); the test's latest row is older than that scan; the test is in no project's catalog; the project has catalog rows. A test first run after the last full scan, a test that moved to another project (`@to-fix`) while its new project is not yet scanned, and a project never scanned are not flagged. A scoped scan (tab Run All, pipeline step) refreshes tags but doesn't move the full-scan time, so a moved test is not flagged. The UI dims such a row, turns Run off, and the details modal says that Delete removes the whole history in every project. Flagged tests still count in status totals. Catalog rows are removed with `DELETE /api/tests/:testId` (all projects), `DELETE /api/tests/all` (also `?project=`).

### DELETE /api/tests/:testId

**✨ New in v1.0.2** - Delete a specific test and all its execution history.

**Description**: Permanently deletes a test by its `testId`, including:

- All execution records (test_results table)
- All attachment records (attachments table via CASCADE)
- All physical attachment files (screenshots, videos, traces) from disk

**Important Notes**:

- This action is **irreversible** and cannot be undone
- The test will reappear if it exists in the codebase and "Discover Tests" or "Run All Tests" is executed
- Use this for cleaning up renamed or removed tests
- Frontend shows confirmation dialog before deletion

**Path Parameters:**

- `testId` - The stable test identifier (e.g., `test-66jqtq`)

**Example Request:**

```http
DELETE /api/tests/test-66jqtq
Authorization: Bearer {jwt-token}
```

**Response (200 - Success):**

```json
{
    "status": "success",
    "data": {
        "message": "Test deleted successfully",
        "deletedExecutions": 15
    }
}
```

**Response (400 - Bad Request):**

```json
{
    "status": "error",
    "error": {
        "message": "Missing testId parameter",
        "code": "BAD_REQUEST"
    }
}
```

**Response (500 - Server Error):**

```json
{
    "status": "error",
    "error": {
        "message": "Failed to delete test",
        "code": "SERVER_ERROR"
    }
}
```

**What Gets Deleted:**

1. **Database Records**: All rows in `test_results` where `test_id = testId`
2. **Attachment Records**: CASCADE deletion from `attachments` table
3. **Physical Files**: All files in `{OUTPUT_DIR}/attachments/{executionId}/` directories

**Example Use Cases:**

- Cleaning up after renaming a test (old test remains in history)
- Removing obsolete tests that no longer exist in codebase
- Clearing failed test runs with corrupted data
- Managing storage space by removing old test data

**Related Endpoints:**

- `GET /api/tests/:id/history` - View execution history before deletion
- `DELETE /api/tests/:testId/executions/:executionId` - Delete a single execution
- `DELETE /api/tests/all` - Clear ALL test data (more destructive)

### DELETE /api/tests/:testId/executions/:executionId

Delete a specific test execution while preserving other executions of the same test.

**URL Parameters:**

- `testId` (required) - The unique identifier for the test
- `executionId` (required) - The unique identifier for the specific execution to delete

**Authentication:** Required (JWT token)

**Request:**

```bash
DELETE /api/tests/test_abc123/executions/exec_xyz789
Authorization: Bearer <token>
```

**Response (200 - Success):**

```json
{
    "status": "success",
    "data": {
        "message": "Execution deleted successfully"
    }
}
```

**Response (400 - Bad Request):**

```json
{
    "status": "error",
    "error": {
        "message": "Missing executionId parameter",
        "code": "BAD_REQUEST"
    }
}
```

**Response (404 - Not Found):**

```json
{
    "status": "error",
    "error": {
        "message": "Execution not found",
        "code": "NOT_FOUND"
    }
}
```

**Response (500 - Server Error):**

```json
{
    "status": "error",
    "error": {
        "message": "Failed to delete execution",
        "code": "SERVER_ERROR"
    }
}
```

**What Gets Deleted:**

1. **Database Record**: Single row in `test_results` where `id = executionId`
2. **Attachment Records**: CASCADE deletion from `attachments` table for this execution
3. **Physical Files**: All files in `{OUTPUT_DIR}/attachments/{executionId}/` directory

**Example Use Cases:**

- Removing a single failed execution while keeping successful ones
- Cleaning up executions with corrupted attachments
- Managing storage by removing old executions selectively
- Deleting accidental test runs

**Important Notes:**

- ⚠️ Deletion is permanent and cannot be undone
- ✅ Other executions of the same test remain intact
- ✅ If the deleted execution was currently viewed in UI, the next execution is automatically selected
- ✅ Attachments are safely deleted from filesystem to prevent orphaned files

**Related Endpoints:**

- `GET /api/tests/:id/history` - View execution history before deletion
- `DELETE /api/tests/:testId` - Delete all executions of a test
- `POST /api/tests/:id/rerun` - Rerun a test to create new execution

### DELETE /api/tests/all

Clear all test data from the database.

**Response:**

```json
{
    "status": "success",
    "data": {
        "deleted": 150,
        "message": "All tests cleared successfully"
    }
}
```

### POST /api/tests/cleanup

**✨ New in v1.4.0** - Selective data cleanup to manage storage.

**Description**: Free disk space from historical test data based on date or retention count per test.

Two modes (`mode` parameter):

- **`strip`** (default): deletes only the physical attachments (videos, traces, screenshots) and their `attachments` rows. The `test_results` rows are **kept**, so the Test Execution Timeline and per-test history are preserved. Stripped executions are recorded in `attachment_cleanups` so the UI can show "Attachments removed to free space". The most recent execution per test is never stripped.
- **`full`**: permanently deletes the matching `test_results` rows _and_ their attachments (the original behaviour). This shrinks the timeline.

**✨ Updated in v1.8.0** — added the `strip`/`full` mode. Prior versions always behaved like `full`.

**Authentication**: Required (JWT token)

**Request Body (Date-based, strip default):**

```json
{
    "type": "date",
    "value": "2023-01-01T00:00:00.000Z",
    "mode": "strip"
}
```

**Request Body (Count-based, full delete):**

```json
{
    "type": "count",
    "value": 20,
    "mode": "full"
}
```

**Parameters:**

- `type` (required) - Cleanup strategy: `"date"` (older than date) or `"count"` (retain latest N per test)
- `value` (required) - ISO date string for `"date"` type, or integer number for `"count"` type
- `mode` (optional) - `"strip"` (default, keeps history) or `"full"` (deletes executions)

**Response (200 - Success):**

```json
{
    "status": "success",
    "data": {
        "deletedExecutions": 45,
        "freedSpace": 52428800,
        "message": "Freed space from 45 executions (history kept)",
        "mode": "strip"
    }
}
```

`freedSpace` is computed from the `attachments.file_size` column (an indexed aggregate), and `deletedExecutions` counts the executions stripped (or deleted in `full` mode).

**Response (400 - Bad Request):**

```json
{
    "status": "error",
    "error": {
        "message": "Invalid type. Must be \"date\" or \"count\"",
        "code": "BAD_REQUEST"
    }
}
```

**Response (409 - Conflict):**

```json
{
    "status": "error",
    "error": {
        "message": "Cannot clean up data while tests are running",
        "code": "CONFLICT"
    }
}
```

**What Gets Removed:**

- **`strip` mode**: physical attachment files + `attachments` rows only. `test_results` rows are kept and marked in `attachment_cleanups`.
- **`full` mode**: physical attachment files _and_ the matching `test_results` rows.

**Use Cases:**

- "Free space but keep the timeline" → `strip` (default): remove attachments older than 30 days, or keep attachments only for the latest 20 runs per test
- "Permanently prune history" → `full`: delete executions older than 30 days, or keep only the last 20 runs per test

## Test Execution

### GET /api/tests/projects

**✨ New in v1.5.0** - Get available Playwright projects defined in `playwright.config.ts`.

**Authentication**: JWT when `ENABLE_AUTH=true`

**Response (200 - Success):**

```json
{
    "success": true,
    "data": ["All_Tests", "Sanity"]
}
```

**Response when no projects configured:**

```json
{
    "success": true,
    "data": []
}
```

**Notes**:

- Returns an empty array (not an error) if Playwright is not installed or the config has no projects
- Project names come from the `name` field in `playwright.config.ts` `projects[]` array
- Used by Settings modal to populate the Playwright Project selector

---

### POST /api/tests/run-all

Execute all tests in the project.

**Request Body (Optional):**

```json
{
    "maxWorkers": 4,
    "project": "Sanity"
}
```

**Parameters:**

- `maxWorkers` (optional) - Maximum number of parallel workers
- `project` (optional) - Playwright project name to run (e.g. `"All_Tests"`, `"Sanity"`). When omitted, all projects are run

**Response (200 - Success):**

```json
{
    "status": "success",
    "data": {
        "message": "Tests execution started",
        "processId": "proc_123456"
    }
}
```

**Response (409 - Tests Already Running):**

```json
{
    "success": false,
    "error": "Tests are already running",
    "code": "TESTS_ALREADY_RUNNING",
    "currentRunId": "existing-run-123",
    "estimatedTimeRemaining": 120,
    "startedAt": "2025-10-26T10:00:00.000Z",
    "timestamp": "2025-10-26T10:02:00.000Z"
}
```

**Notes:**

- This endpoint prevents duplicate test runs. If anything is busy (a tracked run, a CI pipeline incl. the gap between its steps, a run still starting), it returns HTTP 409 `TESTS_ALREADY_RUNNING`; while a CI request waits in the queue, 409 `CI_RUN_QUEUED`. `run-group` and rerun answer the same two 409s.
- The `estimatedTimeRemaining` field provides seconds until the current run is expected to complete.
- Clients should wait and retry after the estimated time, or check status via WebSocket events.
- Useful for automation systems (n8n, CI/CD) to avoid triggering duplicate runs.

### POST /api/tests/run-group

Execute a group of tests by file path, with optional filtering by test names.

**✨ Enhanced in v1.0.3** - Added support for running specific tests within a file using `testNames` parameter.

**Request Body:**

```json
{
    "filePath": "tests/api/actions.spec.ts",
    "maxWorkers": 4,
    "testNames": ["should create action", "should update action"]
}
```

**Parameters:**

- `filePath` (required) - Path to the test file relative to Playwright's testDir (e.g., `"api/actions.spec.ts"` or `"auth.spec.ts"`). Paths are determined by your Playwright project structure. Values starting with `-` or resolving outside `PLAYWRIGHT_PROJECT_DIR` are rejected with 400 (they would reach the Playwright CLI as options).
- `maxWorkers` (optional) - Maximum number of parallel workers (default: Playwright config)
- `testNames` (optional) - Array of test names to run. When provided, only specified tests are executed using Playwright's `--grep` flag

**Response (200 - Success):**

```json
{
    "status": "success",
    "data": {
        "runId": "run-abc-123",
        "message": "Tests started for tests/api/actions.spec.ts",
        "timestamp": "2025-10-30T10:00:00.000Z"
    }
}
```

**Response (400 - Bad Request):**

```json
{
    "status": "error",
    "error": {
        "message": "Missing filePath parameter",
        "code": "BAD_REQUEST"
    }
}
```

**Use Cases:**

1. **Run all tests in a file:**

    ```json
    {
        "filePath": "tests/api/actions.spec.ts"
    }
    ```

    Executes: `npx playwright test tests/api/actions.spec.ts`

2. **Run specific tests from "Failed" filter:**

    ```json
    {
        "filePath": "tests/api/actions.spec.ts",
        "testNames": ["should handle error", "should validate input"]
    }
    ```

    Executes: `npx playwright test tests/api/actions.spec.ts --grep "pattern"`

    This is used by the dashboard's "Failed" filter - when running a group of tests from the failed filter, only the failed tests are executed instead of all tests in the file.

3. **Run with custom worker count:**
    ```json
    {
        "filePath": "tests/api/actions.spec.ts",
        "maxWorkers": 2
    }
    ```

**Notes:**

- The `testNames` parameter uses Playwright's `--grep` flag with regex pattern matching
- Special characters in test names are automatically escaped
- When `testNames` is provided, the test run metadata includes `filteredTests` count
- Empty `testNames` array is treated as no filter (runs all tests)
- Test names must match exactly (uses word boundary matching to prevent partial matches)

### POST /api/tests/:id/rerun

Rerun a specific test by ID.

**Response:**

```json
{
    "status": "success",
    "data": {
        "message": "Test rerun started",
        "testId": "test-66jqtq"
    }
}
```

## Test Notes

### GET /api/tests/:testId/notes

**✨ New in v1.2.0** - Get note for a specific test.

**Description**: Retrieves the note content associated with a test. Notes are stored at the test level and persist across multiple executions.

**Path Parameters:**

- `testId` (required) - The unique test identifier (e.g., `test-66jqtq`)

**Example Request:**

```http
GET /api/tests/test-66jqtq/notes
Authorization: Bearer {jwt-token}
```

**Response (200 - Success with note):**

```json
{
    "success": true,
    "data": {
        "testId": "test-66jqtq",
        "content": "This test is flaky due to timing issues.\nKnown bug: https://github.com/example/repo/issues/123",
        "createdAt": "2024-11-01T10:00:00.000Z",
        "updatedAt": "2024-11-02T14:30:00.000Z"
    }
}
```

**Response (200 - Success with no note):**

```json
{
    "success": true,
    "data": null
}
```

**Response (500 - Server Error):**

```json
{
    "success": false,
    "error": "Failed to get note"
}
```

**Notes:**

- Returns `null` if no note exists for the test
- Note content supports URLs (auto-detected and made clickable in UI)
- Maximum 1000 characters per note
- Timestamps track creation and last update time

### POST /api/tests/:testId/notes

**✨ New in v1.2.0** - Save or update note for a specific test.

**Description**: Creates or updates a note for a test. If a note already exists, it will be updated with new content and timestamp.

**Path Parameters:**

- `testId` (required) - The unique test identifier (e.g., `test-66jqtq`)

**Request Body:**

```json
{
    "content": "This test is flaky due to timing issues.\nKnown bug: https://github.com/example/repo/issues/123"
}
```

**Validation Rules:**

- `content` must be a string
- Content cannot be empty after trimming
- Maximum 1000 characters
- Leading/trailing whitespace is trimmed automatically

**Example Request:**

```http
POST /api/tests/test-66jqtq/notes
Authorization: Bearer {jwt-token}
Content-Type: application/json

{
    "content": "Test note with URL: https://example.com/issue/123"
}
```

**Response (200 - Success):**

```json
{
    "success": true,
    "data": {
        "message": "Note saved successfully"
    }
}
```

**Response (400 - Invalid Content):**

```json
{
    "success": false,
    "message": "Content must be a string",
    "error": "Invalid content"
}
```

**Response (400 - Validation Error):**

```json
{
    "success": false,
    "error": "Note content cannot be empty"
}
```

or

```json
{
    "success": false,
    "error": "Note content exceeds maximum length of 1000 characters"
}
```

**Response (500 - Server Error):**

```json
{
    "success": false,
    "error": "Failed to save note"
}
```

**Notes:**

- Content is trimmed before validation
- Special characters and URLs are fully supported
- Multiline content is preserved
- Updates `updatedAt` timestamp on each save

### DELETE /api/tests/:testId/notes

**✨ New in v1.2.0** - Delete note for a specific test.

**Description**: Permanently deletes the note associated with a test. This action cannot be undone.

**Path Parameters:**

- `testId` (required) - The unique test identifier (e.g., `test-66jqtq`)

**Example Request:**

```http
DELETE /api/tests/test-66jqtq/notes
Authorization: Bearer {jwt-token}
```

**Response (200 - Success):**

```json
{
    "success": true,
    "message": "Note deleted successfully"
}
```

**Response (500 - Server Error):**

```json
{
    "success": false,
    "error": "Failed to delete note"
}
```

**Notes:**

- Deletion succeeds even if no note exists (idempotent)
- Permanently removes note from database
- Does not affect test execution history or results

**Use Cases:**

- Cleaning up outdated notes
- Removing incorrect information
- Resetting note content

**Related Features:**

- See [Test Notes Documentation](features/TEST_NOTES.md) for detailed feature description
- Notes displayed in Test Detail Modal (Overview tab)
- Truncated note preview (50 chars) shown in Test Row
- URLs in notes are automatically converted to clickable links

## Test Note Images

### POST /api/tests/:testId/notes/images

**✨ New in v1.3.0** - Upload an image for a test note.

**Description**: Uploads an image file to be embedded in a test note. Images are stored permanently and can be referenced in note content using `[IMAGE:image-id]` markers.

**Path Parameters:**

- `testId` (required) - The unique test identifier (e.g., `test-66jqtq`)

**Request:**

- **Content-Type**: `multipart/form-data`
- **Body**: Form data with `image` field containing the image file

**Validation Rules:**

- File must be an image (MIME type starting with `image/`), except `image/svg+xml` (rejected: SVG can carry script)
- Maximum file size: 5MB
- Supported formats: PNG, JPEG, GIF, WebP, etc. (any valid image format)

**Example Request:**

```http
POST /api/tests/test-66jqtq/notes/images
Authorization: Bearer {jwt-token}
Content-Type: multipart/form-data

[Form data with 'image' field]
```

**Response (200 - Success):**

```json
{
    "success": true,
    "data": {
        "id": "img-abc123",
        "testId": "test-66jqtq",
        "fileName": "screenshot.png",
        "fileSize": 245678,
        "mimeType": "image/png",
        "url": "/note-images/test-66jqtq/img-abc123.png",
        "createdAt": "2025-01-15T10:30:00.000Z"
    }
}
```

**Response (400 - Bad Request):**

```json
{
    "success": false,
    "error": "Image file is required"
}
```

or

```json
{
    "success": false,
    "error": "File must be an image"
}
```

or

```json
{
    "success": false,
    "error": "Image size exceeds maximum of 5MB"
}
```

**Response (500 - Server Error):**

```json
{
    "success": false,
    "error": "Failed to upload image"
}
```

**Notes:**

- Image is stored in `{OUTPUT_DIR}/note-images/{testId}/{imageId}.{ext}`
- A placeholder note is automatically created if no note exists (required for foreign key)
- Image ID can be embedded in note content using `[IMAGE:image-id]` syntax
- Images are served statically via `/note-images` endpoint (JWT protected)

### GET /api/tests/:testId/notes/images

**✨ New in v1.3.0** - Get all images for a test note.

**Description**: Retrieves all images associated with a test note.

**Path Parameters:**

- `testId` (required) - The unique test identifier (e.g., `test-66jqtq`)

**Example Request:**

```http
GET /api/tests/test-66jqtq/notes/images
Authorization: Bearer {jwt-token}
```

**Response (200 - Success):**

```json
{
    "success": true,
    "data": [
        {
            "id": "img-abc123",
            "testId": "test-66jqtq",
            "fileName": "screenshot.png",
            "fileSize": 245678,
            "mimeType": "image/png",
            "url": "/note-images/test-66jqtq/img-abc123.png",
            "createdAt": "2025-01-15T10:30:00.000Z"
        },
        {
            "id": "img-xyz789",
            "testId": "test-66jqtq",
            "fileName": "error-log.png",
            "fileSize": 189234,
            "mimeType": "image/png",
            "url": "/note-images/test-66jqtq/img-xyz789.png",
            "createdAt": "2025-01-15T11:00:00.000Z"
        }
    ]
}
```

**Response (200 - Success with no images):**

```json
{
    "success": true,
    "data": []
}
```

**Response (400 - Bad Request):**

```json
{
    "success": false,
    "error": "Test ID is required"
}
```

**Response (500 - Server Error):**

```json
{
    "success": false,
    "error": "Failed to get images"
}
```

**Notes:**

- Returns empty array if no images exist for the test
- Images are ordered by creation date (oldest first)
- URLs are relative paths that require JWT authentication to access

### DELETE /api/tests/:testId/notes/images/:imageId

**✨ New in v1.3.0** - Delete an image from a test note.

**Description**: Permanently deletes an image associated with a test note. This action cannot be undone.

**Path Parameters:**

- `testId` (required) - The unique test identifier (e.g., `test-66jqtq`)
- `imageId` (required) - The unique image identifier (e.g., `img-abc123`)

**Example Request:**

```http
DELETE /api/tests/test-66jqtq/notes/images/img-abc123
Authorization: Bearer {jwt-token}
```

**Response (200 - Success):**

```json
{
    "success": true,
    "data": {
        "message": "Image deleted successfully"
    }
}
```

**Response (400 - Bad Request):**

```json
{
    "success": false,
    "error": "Image ID is required"
}
```

**Response (500 - Server Error):**

```json
{
    "success": false,
    "error": "Failed to delete image"
}
```

**Notes:**

- Deletes both the database record and the physical file
- If the image is referenced in note content (`[IMAGE:image-id]`), the marker remains but the image won't display
- Empty directories are automatically cleaned up after deletion

**Related Features:**

- See [Test Notes Documentation](features/TEST_NOTES.md) for detailed feature description
- Images can be embedded in notes using drag & drop or paste
- Images display as thumbnails in notes and open in full size on click

## Test Information

### GET /api/tests/:id/history

Get complete execution history for a specific test.

**Description**: Retrieves all historical executions of a test, including independent attachments for each run. Pending test results are automatically filtered out.

**Path Parameters:**

- `id` - Test ID (testId) or test result ID (supports both for backward compatibility)

**Query Parameters:**

- `limit` - Maximum number of historical executions to return (default: 50)
- `byTestId` - Set `true`/`1`/`yes` when `id` is already the stable `testId` (skips an extra lookup)
- `before` - ISO `createdAt` cursor for keyset pagination. Returns the next page of executions older than this timestamp. Pass the `createdAt` of the last item from the previous page to "load more".

The response `count` field is the **total** execution count for the test (excludes pending/skipped placeholders), not the page length — use it to show "N of TOTAL" and to decide whether more pages remain. Each execution may include `attachmentsClearedAt` (ISO timestamp) when its attachments were stripped to free space via `strip` cleanup.

**Response:**

```json
{
    "status": "success",
    "data": [
        {
            "id": "af679466-96f7-4a00-ad72-c02adc779fd8",
            "testId": "test-66jqtq",
            "runId": "run_123",
            "name": "API - Update Order Status",
            "filePath": "tests/api/actions.spec.ts",
            "status": "passed",
            "duration": 1500,
            "errorMessage": null,
            "errorStack": null,
            "retryCount": 0,
            "metadata": {},
            "timestamp": "2025-09-24 13:44:50",
            "createdAt": "2025-09-24 13:44:50",
            "updatedAt": "2025-09-24 13:44:50",
            "attachments": [
                {
                    "id": "att_123",
                    "testResultId": "af679466-96f7-4a00-ad72-c02adc779fd8",
                    "type": "video",
                    "fileName": "video-1759177234271-k4bhye.webm",
                    "url": "/attachments/af679466-96f7-4a00-ad72-c02adc779fd8/video-1759177234271-k4bhye.webm"
                }
            ]
        },
        {
            "id": "bf789577-a8e8-5b11-be83-d13bec889fe9",
            "testId": "test-66jqtq",
            "runId": "run_456",
            "name": "API - Update Order Status",
            "status": "failed",
            "duration": 2100,
            "errorMessage": "Expected 200 but got 500",
            "timestamp": "2025-09-24 12:30:15",
            "createdAt": "2025-09-24 12:30:15",
            "updatedAt": "2025-09-24 12:30:15",
            "attachments": [
                {
                    "id": "att_456",
                    "type": "screenshot",
                    "fileName": "screenshot-1759174615000-abc123.png",
                    "url": "/attachments/bf789577-a8e8-5b11-be83-d13bec889fe9/screenshot-1759174615000-abc123.png"
                }
            ]
        }
    ],
    "count": 2
}
```

**Notes**:

- Results ordered by `created_at DESC` (newest first)
- Each execution maintains independent attachments
- Pending results automatically excluded from history
- Parameter `id` supports both testId and result ID for flexibility

## Dashboard Analytics

### GET /api/tests/flaky

Retrieve flaky tests with configurable filtering.

**Description**: Identifies tests with intermittent failures using stable `testId` grouping across multiple executions. Excludes tests that are 100% failing (always failing, not flaky).

**Query Parameters:**

- `days` (optional) - Time range in days (default: 30)
- `threshold` (optional) - Minimum failure percentage (default: 10)

**Example Request:**

```http
GET /api/tests/flaky?days=30&threshold=15
Authorization: Bearer {jwt-token}
```

**Response:**

```json
{
    "status": "success",
    "data": [
        {
            "testId": "test-xv3dl2",
            "name": "Update order status",
            "filePath": "tests/api/actions.spec.ts",
            "totalRuns": 8,
            "failedRuns": 2,
            "passedRuns": 6,
            "flakyPercentage": 25,
            "history": [
                "passed",
                "failed",
                "passed",
                "passed",
                "failed",
                "passed",
                "passed",
                "passed"
            ],
            "lastRun": "2025-10-09 14:32:15"
        }
    ],
    "count": 1
}
```

**Notes**:

- Groups by stable `test_id` (hash-based identifier)
- Calculates failure rate: `failedRuns / totalRuns * 100`
- Returns up to 50 results, ordered by flakiness percentage DESC
- Requires at least 2 runs per test
- Excludes tests with 0% or 100% failure rate
- History array contains status for each execution (newest last)

### GET /api/tests/timeline

Retrieve daily test execution statistics.

**Description**: Returns aggregated test counts grouped by day, showing passed/failed/skipped distribution over time.

**Query Parameters:**

- `days` (optional) - Time range in days (default: 30)

**Example Request:**

```http
GET /api/tests/timeline?days=30
Authorization: Bearer {jwt-token}
```

**Response:**

```json
{
    "status": "success",
    "data": [
        {
            "date": "2025-10-09",
            "total": 80,
            "passed": 75,
            "failed": 3,
            "skipped": 2
        },
        {
            "date": "2025-10-08",
            "total": 80,
            "passed": 78,
            "failed": 2,
            "skipped": 0
        }
    ],
    "count": 2
}
```

**Notes**:

- Data grouped by `DATE(created_at)` for daily aggregation
- Excludes pending test results (discovery-generated)
- Results ordered by date ASC (chronological)
- Separate counts for passed/failed/skipped/total tests per day

### GET /api/tests/:id/attachments

Get attachments (screenshots, videos, traces) for a test.

**Important**: Attachments are automatically copied to permanent storage (`{OUTPUT_DIR}/attachments/{testResultId}/`) when tests are reported. URLs point to permanent storage locations that survive Playwright's cleanup cycles.

**Response:**

```json
{
    "status": "success",
    "data": [
        {
            "id": "att_123",
            "testResultId": "af679466-96f7-4a00-ad72-c02adc779fd8",
            "type": "screenshot",
            "fileName": "screenshot-1759177234280-abc123.png",
            "filePath": "/absolute/path/to/attachments/af679466.../screenshot-1759177234280-abc123.png",
            "fileSize": 45678,
            "mimeType": "image/png",
            "url": "/attachments/af679466-96f7-4a00-ad72-c02adc779fd8/screenshot-1759177234280-abc123.png"
        }
    ]
}
```

**URL Format**: `/attachments/{testResultId}/{fileName}`

- Files are served from permanent storage with JWT authentication
- Each test result has isolated directory
- Files use unique names with timestamp + random suffix

### GET /api/tests/traces/:attachmentId

Download trace file for Playwright Trace Viewer with JWT authentication.

**Query Parameters:**

- `token` (required) - JWT authentication token

**Example:**

```
GET /api/tests/traces/att_123?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**

- Returns the trace file (application/zip) as a download
- Used by Playwright Trace Viewer to load trace files
- Requires valid JWT token for authentication

**Headers:**

```
Content-Type: application/zip
Content-Disposition: attachment; filename="trace.zip"
Cache-Control: private, no-cache, no-store, must-revalidate
X-Content-Type-Options: nosniff
```

**Error Responses:**

- `401` - Invalid or missing JWT token
- `404` - Trace file not found or attachment is not a trace type
- `500` - Server error reading file

## Test Runs

### POST /api/runs

Create a new test run.

**Request Body:**

```json
{
    "status": "running",
    "startTime": "2024-09-25T12:00:00.000Z",
    "totalTests": 80
}
```

### GET /api/runs

Get all test runs with pagination.

**Query Parameters:**

- `limit` - Maximum number of results
- `offset` - Skip number of results

### PUT /api/runs/:id

Update an existing test run.

**Request Body:**

```json
{
    "status": "completed",
    "endTime": "2024-09-25T12:05:00.000Z",
    "passedTests": 75,
    "failedTests": 3,
    "skippedTests": 2
}
```

### GET /api/runs/:id

Get a specific test run by ID.

### GET /api/runs/stats

Get test run statistics and analytics.

**Response:**

```json
{
    "status": "success",
    "data": {
        "totalRuns": 25,
        "successRate": 85.5,
        "averageDuration": 180000,
        "recentRuns": []
    }
}
```

### GET /api/tests/stats

Get test statistics and summary data.

**Response:**

```json
{
    "status": "success",
    "data": {
        "total": 80,
        "passed": 75,
        "failed": 3,
        "skipped": 2,
        "pending": 0
    }
}
```

### GET /api/tests/status-counts

Status breakdown over the **latest row per test** (`created_at`), aggregated in the database and not limited by any page size. Powers the Dashboard cards and the filter-bar counts.

**Query Parameters:**

- `project` (optional) - count only tests whose latest row belongs to this project

**Response:**

```json
{
    "success": true,
    "data": {"total": 277, "passed": 270, "failed": 2, "skipped": 3, "pending": 2, "noted": 4},
    "timestamp": "2026-09-20T10:00:00.000Z"
}
```

Without `project`, tests whose latest row has no project (`''` or NULL: legacy rows, results without a project) are left out only when at least one named project exists; if no row has a project (a Playwright config without named projects), all tests are counted. With `project`, only that project's rows are counted. `GET /api/tests` applies the same rule, so the list and these counts agree. The per-project summary behind the tab badges always skips project-less rows.

## Storage Management

### GET /api/storage/stats

**✨ New in v1.0.4** - Get comprehensive storage statistics for the dashboard.

**Description**: Returns detailed storage usage information including database size, attachment storage breakdown by type, and total storage consumption. Useful for monitoring disk usage and planning storage capacity.

**Example Request:**

```http
GET /api/storage/stats
Authorization: Bearer {jwt-token}
```

**Response (200 - Success):**

```json
{
    "status": "success",
    "data": {
        "database": {
            "size": 2097152,
            "totalRuns": 203,
            "totalResults": 1532,
            "totalAttachments": 2532
        },
        "attachments": {
            "totalSize": 5027020800,
            "totalFiles": 2532,
            "testDirectories": 1399,
            "typeBreakdown": {
                "video": {
                    "count": 977,
                    "size": 711231488
                },
                "screenshot": {
                    "count": 89,
                    "size": 5976064
                },
                "trace": {
                    "count": 1394,
                    "size": 4204883968
                },
                "log": {
                    "count": 0,
                    "size": 0
                },
                "other": {
                    "count": 72,
                    "size": 1041408
                }
            }
        },
        "total": {
            "size": 5029117952,
            "averageSizePerTest": 3282397
        }
    }
}
```

**Response (500 - Server Error):**

```json
{
    "status": "error",
    "error": {
        "message": "Failed to retrieve storage statistics",
        "code": "SERVER_ERROR"
    }
}
```

**Storage Breakdown:**

1. **Database**: SQLite database file size including:
    - Main database file (`test-results.db`)
    - Write-Ahead Log file (`test-results.db-wal`)
    - Shared memory file (`test-results.db-shm`)
    - Record counts for runs, results, and attachment metadata

2. **Attachments**: Physical file storage including:
    - Total size of all attachment files
    - Count of files by type (video, screenshot, trace, log, other)
    - Number of test execution directories
    - Per-type breakdown with individual counts and sizes

3. **Total**: Combined statistics including:
    - Total storage consumption (database + attachments)
    - Average storage per test execution

**Storage Location:**

- **Database**: `{OUTPUT_DIR}/test-results.db`
- **Attachments**: `{OUTPUT_DIR}/attachments/{testResultId}/`

**Notes:**

- All sizes are in bytes
- Database size includes WAL and SHM files if present
- Attachments are organized by test result ID for isolation
- Files are categorized by extension into types
- Storage statistics reflect current disk usage
- Used by Settings Modal to display storage information

**Use Cases:**

- Monitor storage consumption over time
- Plan storage capacity and cleanup schedules
- Identify storage-heavy test types (e.g., videos)
- Track attachment growth trends
- Debug storage-related issues

**Related Endpoints:**

- `DELETE /api/tests/all` - Clear all test data to free storage
- `DELETE /api/tests/:testId` - Delete specific test to free storage

## Settings

All `/api/settings/*` endpoints require a JWT (`Authorization: Bearer <token>`). Without a token they answer 401; when `ENABLE_AUTH` is not `true` they answer 403 (`JWT authentication required for this endpoint`). Settings are global (shared by all users) and stored in the `app_settings` table.

### GET /api/settings/jira

Ticket and tag chip settings.

**Response:**

```json
{
    "success": true,
    "data": {
        "baseUrl": "https://your-company.atlassian.net/browse/",
        "chipAlignment": "left",
        "tagMode": "tickets"
    },
    "timestamp": "2026-09-20T10:00:00.000Z"
}
```

| Field           | Values                   | Default   | Stored as        |
| --------------- | ------------------------ | --------- | ---------------- |
| `baseUrl`       | `""` or an http(s) URL   | `""`      | `jira_base_url`  |
| `chipAlignment` | `left`, `right`, `below` | `left`    | `chip_alignment` |
| `tagMode`       | `tickets`, `all`         | `tickets` | `chip_tag_mode`  |

- `baseUrl`: ticket chips link to `<baseUrl><KEY>`; empty means chips are plain labels.
- `chipAlignment`: `left` / `right` place chips in a fixed column on wide screens (aligned left or right; under the test name on narrow screens); `below` shows them under the test name at every width, with no column.
- `tagMode`: `tickets` shows only ticket-key tags (`@ABC-123`, pattern `^@[A-Z][A-Z0-9]+-\d+$`); `all` shows every tag, non-ticket tags as grey, non-clickable chips.
- An unknown stored `chipAlignment` or `tagMode` value reads back as the default.

### PUT /api/settings/jira

Replaces all three settings at once. All fields are required.

**Request Body:**

```json
{"baseUrl": "https://your-company.atlassian.net/browse", "chipAlignment": "right", "tagMode": "all"}
```

`baseUrl` is trimmed and, when not empty, a trailing `/` is added (`.../browse` is saved as `.../browse/`). The response has the same shape as `GET` and returns the saved (normalised) values.

**Validation** (checked in this order; the first failure returns HTTP 400 with `{"success": false, "error": "Bad request", "message": "..."}`):

| Condition                                  | `message`                                          |
| ------------------------------------------ | -------------------------------------------------- |
| `baseUrl` is not a string                  | `baseUrl must be a string`                         |
| `chipAlignment` not `left`/`right`/`below` | `chipAlignment must be 'left', 'right' or 'below'` |
| `tagMode` not `tickets`/`all`              | `tagMode must be 'tickets' or 'all'`               |
| non-empty `baseUrl` is not an http(s) URL  | `baseUrl must be empty or a valid http(s) URL`     |

## Jira Integration

All `/api/jira/*` endpoints require a JWT, same rules as `/api/settings/*` above. Read-only enrichment of ticket-key tags (type, status, summary, assignee), independent of the `baseUrl` used by `/api/settings/jira` chip links. Configured entirely via server env (`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` — see [CONFIGURATION.md](CONFIGURATION.md#jira-integration-optional)); there is no endpoint to set these from the UI.

### GET /api/jira/status

Connection status, for the Settings badge and manual refresh button.

**Response:**

```json
{
    "success": true,
    "data": {
        "enabled": true,
        "lastSyncAt": "2026-09-24T10:00:00.000Z",
        "lastSyncOk": false,
        "lastSyncError": "authentication (401)"
    },
    "timestamp": "2026-09-24T10:05:00.000Z"
}
```

| Field           | Meaning                                                                                                                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`       | `true` only when `JIRA_BASE_URL`/`JIRA_EMAIL`/`JIRA_API_TOKEN` are all set on the server.                                                                                                                                                                       |
| `lastSyncAt`    | ISO timestamp of the most recent successful ticket cache write, or `null` if nothing has synced yet (never synced, or synced but zero ticket-key tags exist anywhere).                                                                                          |
| `lastSyncOk`    | Outcome of the most recent sync attempt (background interval or manual refresh) — can be `false` even when `lastSyncAt` is set, from an earlier successful sync followed by a failing one. `null` = no attempt has run yet.                                     |
| `lastSyncError` | Short, human reason for the last attempt's failure (e.g. `"authentication (401)"`, `"rate limited (429)"`, `"Jira unavailable (503)"`, `"network error"`), or `null` when the last attempt succeeded or none has run. Never the raw response body or the token. |

### GET /api/jira/tickets?keys=ABC-1,ABC-2

Cached info for the given ticket keys (comma-separated, de-duplicated). Never calls Jira directly — always serves from the SQLite cache written by the background sync / manual refresh.

**Response:**

```json
{
    "success": true,
    "data": [
        {
            "key": "ABC-1",
            "issueType": "Bug",
            "statusName": "To Do",
            "statusCategory": "new",
            "summary": "Was able to add the same item twice",
            "assignee": "Jane Doe",
            "fetchedAt": "2026-09-24T10:00:00.000Z"
        }
    ],
    "timestamp": "2026-09-24T10:05:00.000Z"
}
```

- `statusCategory` is one of `new` (not started), `indeterminate` (in progress), `done` — Jira's own status-category key, stable across workflow customization.
- A requested key with no cache entry (integration disabled, never synced, or the last sync couldn't resolve it — 401/403/429/network error/deleted ticket) is **omitted** from the array, not returned as an error or a null entry. The frontend renders the plain ticket-key chip for any key missing from the response.
- Missing/empty `keys` returns `{"success": true, "data": []}`, not a 400 — this endpoint is always safe to call, integration enabled or not.
- More than 200 keys in one request returns `400 Bad request` (`{"message": "Too many keys: <n> (max 200)"}`) rather than silently truncating.

### POST /api/jira/refresh

Triggers an immediate sync (same logic as the 30-minute background job): discovers every ticket-key tag currently on any test, re-fetches type/status/summary/assignee from Jira in batches of 50, upserts the cache.

**Response:**

```json
{
    "success": true,
    "data": {
        "checked": 42,
        "updated": 40,
        "failed": 2,
        "lastSyncAt": "2026-09-24T10:05:00.000Z"
    },
    "timestamp": "2026-09-24T10:05:00.000Z"
}
```

`failed` counts keys whose batch request errored (Jira auth/rate-limit/network failure) — logged server-side, never thrown to the client. `400 Bad request` when the integration isn't configured (`{"message": "Jira integration is not configured (JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN)"}`).

## CI Pipelines

Named pipelines (`develop`, `production`) are ordered lists of project tabs (Settings > Project Tabs). Auth: `POST /api/pipeline/run` needs a JWT when `ENABLE_AUTH=true` (401 without one) and is open when auth is off; `POST /api/pipeline/stop` always needs a JWT (403 when auth is off); the `GET` status endpoints need a JWT when `ENABLE_AUTH=true`.

### POST /api/pipeline/run

Starts a pipeline; the steps run in the background, one tab after another. It can also stop a running CI run (see **Replace**), so it needs the JWT (`Authorization: Bearer <token>`) when `ENABLE_AUTH=true`: 401 without or with a bad token. With auth off it stays open — unlike `/api/settings/*` and `/api/pipeline/stop`, which answer 403 then — so local runs and the trigger script work without a login. `scripts/trigger-test-run.js` logs in and sends the Bearer whenever its `.env` has `ENABLE_AUTH=true`, and exits 4 (`auth_failed`) on a 401.

**Request Body:**

```json
{"pipeline": "develop", "maxWorkers": 2, "source": "script", "notify": true}
```

| Field        | Notes                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `pipeline`   | `develop` or `production`; missing → `develop`, unknown → 400                                                      |
| `maxWorkers` | optional; a tab's own `workers` override wins                                                                      |
| `source`     | `script` = CI caller: subject to the auto-run pause and eligible for queueing                                      |
| `notify`     | `true` = post the result to Slack when the pipeline ends (needs `CI_SLACK_WEBHOOK_URL`) and queue instead of a 409 |

**Responses:**

| Status | Body                                                                     | When                                                                                                    |
| ------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 200    | `{"success": true, "data": <pipeline state>}`                            | started                                                                                                 |
| 202    | `{"success": true, "data": {"status": "queued", "pipeline": "develop"}}` | `source: "script"` + `notify: true` while busy; not started yet (also when it replaces a running run)   |
| 401    | auth middleware message                                                  | `ENABLE_AUTH=true` and no / invalid JWT                                                                 |
| 400    | `PIPELINE_EMPTY` / unknown pipeline                                      | no tab assigned to the pipeline (also checked at request time before queueing)                          |
| 409    | `TESTS_ALREADY_RUNNING` (`currentRunId`, `startedAt`)                    | busy and the request is not script+notify (`--wait` callers keep polling)                               |
| 409    | `CI_RUN_QUEUED`                                                          | a manual (non-`script`) start while a CI request waits in the queue; also `run-all`, `run-group`, rerun |
| 423    | `CI_AUTORUN_PAUSED` (`resumeAt`)                                         | `source: "script"` while auto-run is paused                                                             |

**Busy** = a live Playwright child process (the server's own runId → process map, not the progress tracker), a pipeline running (including the gap between its steps), a run still starting (discovery before spawn), or a stop still cleaning up.

**Replace:** a `source: "script"` + `notify: true` request for pipeline X while a CI run of X is active — a pipeline X that is running or still starting, itself started with `source: "script"` + `notify: true` — stops that run (reason `replaced`: kill, delete everything it wrote, pipeline `cancelled`; see `POST /api/pipeline/stop`) and puts the new request into X's slot; the answer is the usual 202 `queued` and it starts on the normal drain (a queued production request still goes first). Slack for the stopped run: `⏹️ Cancelled by a newer deploy — a new run has started`. Not replaced, queued as before: a run without `notify` (`--wait`), a manually started pipeline or run, another pipeline name. A stop already in progress (Stop button, watchdog, an earlier replace) is not repeated or re-announced — the request just fills or replaces the slot, so a burst of requests causes one stop and the newest wins. A paused auto-run or an empty pipeline refuses the request (423 / 400) before anything is stopped.

**Queue:** one in-memory slot per pipeline name, the newest request replaces the queued one; lost on server restart. The queue drains when a non-pipeline run's process closes, when a pipeline finishes, when the last start claim is released without a process (a failed start), and after `POST /api/tests/force-reset` (never between steps, never on the reporter's `process-end`), production slot first, then develop. At drain the pause and the pipeline's tabs are checked again; a request that can no longer start is dropped and, as it always has `notify`, posts `⏸️ Auto-run is paused — tests were not started` or `❌ Did not start (pipeline_empty)`.

**Pipeline state:**

```json
{
    "pipelineRunId": "6f1c…",
    "pipeline": "develop",
    "status": "running",
    "startedAt": "2026-10-19T10:00:00.000Z",
    "source": "script",
    "notify": true,
    "steps": [
        {
            "project": "API_Tests",
            "displayName": "API Tests",
            "stopOnFailure": true,
            "status": "running",
            "runId": "…",
            "passed": 0,
            "failed": 0
        }
    ]
}
```

`status`: `running` | `completed` | `stopped_early` | `paused` | `cancelled`. `cancelled`: stopped (see `POST /api/pipeline/stop`); every step is `skipped` and its results are deleted. `paused`: CI auto-run was paused while the pipeline ran; the running step finished, the remaining steps are `skipped` (none `failed`), finished steps keep their results. Step `status`: `queued` | `running` | `success` | `failed` | `skipped`. A step whose process closed while its run row is still `running` (the reporter's `onEnd` never landed) is `failed` and stops the pipeline (`stopped_early`).

**Result Slack message** (only when `notify: true`; payload `{"text": …}`): an 80-dash separator, `🧪 Automated tests · Development|Production`, a title, a `🔗` line, separator.

| Outcome                          | Title                                                    | Link `<PUBLIC_DASHBOARD_URL>…`                                                                                    |
| -------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| all steps passed                 | `✅ Test run passed`                                     | `/tests?project=<slug>` for a one-step pipeline, else `/tests`                                                    |
| completed, some tests failed     | `⚠️ N test(s) failed in <tab names, comma separated>`    | the failing tab's slug when exactly one tab failed, else the pipeline link                                        |
| stopped early on a blocking step | `⛔ Stopped at <tab> — remaining steps were skipped`     | the failed step's slug (no failed step → the pipeline link)                                                       |
| running longer than the timeout  | `⏱️ Timed out — dashboard did not report completion`     | pipeline link; no result message follows; the pipeline is then stopped (reason `timeout`) and its results deleted |
| dashboard restarted mid-run      | `⚠️ Test run was interrupted — the dashboard restarted`  | pipeline link                                                                                                     |
| auto-run paused mid-pipeline     | `⏸️ Paused — remaining steps were skipped`               | pipeline link                                                                                                     |
| stopped with the Stop button     | `⏹️ Stopped manually — no result for this run`           | pipeline link                                                                                                     |
| replaced by a newer deploy       | `⏹️ Cancelled by a newer deploy — a new run has started` | pipeline link (reason `replaced`, see **Replace**)                                                                |

Tab names are display names, URLs use the project slug. A failed webhook POST is logged and never reaches the pipeline.

### POST /api/pipeline/stop

Stops everything active (a CI pipeline, a Run All, a group run, a rerun) and removes what it wrote: **a stopped run counts as never run**. JWT required (`authMiddleware` + `requireJWT`, like `/api/settings/*`; with `ENABLE_AUTH` off it answers 403).

**Request Body:** `{"reason": "manual"}` — the only value accepted over HTTP (omitted = `manual`; anything else → 400). `timeout` (watchdog), `restart` and `replaced` are internal callers of `PipelineExecutionService.stop()`.

**Response (200), sent once the cleanup is done** (up to ~25 s for a Playwright that ignores SIGINT; the UI shows "Stopping..." meanwhile):

```json
{
    "success": true,
    "data": {"stopped": true, "reason": "manual", "pipelineRunId": "6f1c…", "runIds": ["…"]}
}
```

`stopped: false` (`runIds: []`) when nothing was running. A second stop while one runs joins it. If the delete step fails the pipeline still ends `cancelled`, the dashboard is freed, the error is logged (`STOP CLEANUP FAILED`) and the call answers 500; the leftover rows must be deleted by hand. A run-all / run-group / rerun request that finds a stop requested while it was still preparing answers 409 `RUN_CANCELLED` and never spawns.

**Order:** set the cancel flag for every run of the stop (reporter `process-start`, `test-start`, `POST /api/tests` and their attachments for those runIds are acknowledged and ignored) → SIGINT to the run's process group (SIGKILL after 20 s) → wait for the process to close + 1 s for late reporter posts → delete the attachment files, `test_results` rows (FK cascade removes attachment rows) and `test_runs` rows → delete the discovery `pending` rows (`run_id IS NULL`, same project) written by the run's own discovery — its auto-discovery, or the UI's discovery request in the 30 s before it; a run with no such discovery deletes none — for tests that have an older real result → pipeline ends `cancelled`, then the Slack line (reason `manual` / `replaced`, only with `notify`), then the queue drains (production first). `test_notes` are not touched. Works with no child yet (discovery, between steps): the next spawn simply never happens. A pipeline stop deletes the results of **every** step, finished ones included.

**Process groups:** Playwright is spawned `detached` (own group; `npx` sits between the server and Playwright). Chromium launched by Playwright runs in its own group but is wired over a pipe and exits with Playwright, also after SIGKILL of the group. The server shutdown (`SIGTERM`/`SIGINT`) SIGINTs every group and SIGKILLs the survivors after 2.5 s (inside pm2 `kill_timeout` 5 s). The in-flight markers (`ci_inflight_pipeline` for a pipeline, `inflight_run` for a manual run) hold the groups and runIds: at startup, before the server listens, groups still alive are SIGKILLed (only when a member's command line mentions Playwright and it started no later than the marker's last write, so a reused group id of an unrelated run is left alone) and the marker's runs are deleted (nothing else; old `running` rows are history). A restart posts `⚠️ Test run was interrupted — the dashboard restarted` as before.

### GET /api/pipeline/status/current

```json
{"success": true, "data": <pipeline state or null>, "queue": [{"pipeline": "production", "maxWorkers": 2, "queuedAt": "2026-10-19T10:01:00.000Z"}], "stopping": false}
```

`queue` is in drain order; `stopping` (boolean) is true while a stop cleans up. 404 only when no pipeline ran yet, nothing is queued and no stop is running. While a slot is filled or a pipeline runs, the UI disables every run button (WebSocket `pipeline:queue-changed`; it re-reads this endpoint on each WebSocket reconnect).

### GET /api/pipeline/status/:pipelineRunId

The pipeline state; the last 10 finished pipelines stay readable, so a `--wait` caller still gets its result when a queued pipeline started right after it. 404 otherwise.

## Process Tracking

### POST /api/tests/process-start

Register a new test process as started.

**Request Body:**

```json
{
    "processId": "proc_123456",
    "type": "test-execution",
    "startTime": "2024-09-25T12:00:00.000Z"
}
```

### POST /api/tests/test-start

**✨ New in v1.0.1** - Notify that an individual test has started execution.

Used for real-time progress tracking. See [Progress Tracking](features/PROGRESS_TRACKING.md) for details.

**Request Body:**

```json
{
    "runId": "run-abc-123",
    "testId": "test-hash-456",
    "name": "should validate user login",
    "filePath": "tests/auth.spec.ts"
}
```

**Response:**

```json
{
    "status": "success",
    "data": {
        "testId": "test-hash-456"
    },
    "message": "Test start notification received"
}
```

**Side Effects:**

- Adds test to `activeProcessesTracker.runningTests`
- Broadcasts `test:progress` WebSocket event
- Updates frontend FloatingProgressPanel

**Related:**

- WebSocket event: `test:progress`
- Reporter method: `onTestBegin()`
- Frontend component: `FloatingProgressPanel`

### POST /api/tests/process-end

Mark a test process as completed.

**Request Body:**

```json
{
    "processId": "proc_123456",
    "endTime": "2024-09-25T12:05:00.000Z",
    "status": "completed"
}
```

### POST /api/tests/force-reset

Emergency endpoint to clear all active processes. Also lets a queued CI request start if the cleared entries were what kept the dashboard busy.

**Response:**

```json
{
    "status": "success",
    "data": {
        "message": "All processes force-reset",
        "cleared": 3
    }
}
```

## WebSocket Events

Connect to WebSocket at: `ws://localhost:3001/ws` (development) or `wss://api-dashboard.shvydak.com/ws` (production)

### Connection Events

#### connection:status

Sent immediately upon WebSocket connection to sync current state.

```json
{
    "type": "connection:status",
    "data": {
        "activeProcesses": ["proc_123456"],
        "connectedAt": "2024-09-25T12:00:00.000Z"
    }
}
```

### Process Events

#### process:started

Broadcast when a new test process begins.

```json
{
    "type": "process:started",
    "data": {
        "processId": "proc_123456",
        "type": "test-execution",
        "startTime": "2024-09-25T12:00:00.000Z"
    }
}
```

#### process:ended

Broadcast when a test process completes.

```json
{
    "type": "process:ended",
    "data": {
        "processId": "proc_123456",
        "endTime": "2024-09-25T12:05:00.000Z",
        "status": "completed"
    }
}
```

### Pipeline Events

`pipeline:started` (`pipelineRunId`, `steps`), `pipeline:step-started` (`pipelineRunId`, `project`, `runId`), `pipeline:step-completed` (`pipelineRunId`, `step`), `pipeline:completed` (`pipelineRunId`, `status`, `steps`), `pipeline:queue-changed` (`queue`: the full list of queued CI requests, as in `GET /api/pipeline/status/current`). `pipeline:completed` carries `status: "cancelled"` after a stop.

### Discovery Events

`discovery:completed` (`total`, `saved`, `project?`, `timestamp`) — a Discover finished; clients re-read lists and counts. `jira:synced` (`timestamp`) — the background Jira sync that follows an `incremental` Discover finished; clients refetch ticket info. A stopped run's discovery keeps its catalog writes (they describe the code, not the run).

### Stop Events

`run:stopping` (`reason`) — a stop started cleaning up; the Stop button shows "Stopping...". `run:cancelled` (`runIds`, `reason`, `pipelineRunId?`) — the runs' data is deleted: clients reset their run state and refetch, every test shows its previous result. A stopped run sends no `run:completed`.

### Delete Events

`tests:deleted` (`scope`: `test` | `execution` | `project` | `all` | `cleanup`; `testId?`, `executionId?`, `project?`, `timestamp`) — sent after a successful `DELETE /api/tests/:testId`, `DELETE /api/tests/:testId/executions/:executionId`, `DELETE /api/tests/all` (also `?project=`) or a `POST /api/tests/cleanup` that touched rows. Every client re-reads its test lists, counts and open history; no `run:*` event is sent for deletes.

### Test Events

#### test:status

Real-time test status updates during execution.

```json
{
    "type": "test:status",
    "data": {
        "testId": "test-66jqtq",
        "status": "running",
        "timestamp": "2024-09-25T12:01:00.000Z"
    }
}
```

#### test:progress

**✨ Enhanced in v1.0.1** - Real-time test execution progress with currently running tests.

Broadcast when:

- A test starts execution (`POST /api/tests/test-start`)
- A test completes (`POST /api/tests`)

`data` also carries `phase`: `started` (test began) or `saved` (result stored). A `saved` event adds `result` (`id`, `testId`, `runId`, `name`, `filePath`, `status`, `duration`, `errorMessage?`, `timestamp`, `project`). The web UI patches that one row in the store and in the status-filtered lists (a row leaves a list whose status filter it no longer matches); tags and `notInCode` stay from the list. Status counts and tab badges refresh via the count queries only, at most once per 1.5 s (deferred while the tab is hidden). A result for a test missing from the list, or an event without `phase` (old server), falls back to a full list reload throttled to one per 10 s (skipped while the tab is hidden, one refresh when it becomes visible again).

See [Progress Tracking](features/PROGRESS_TRACKING.md) for implementation details.

```json
{
    "type": "test:progress",
    "data": {
        "processId": "run-abc-123",
        "type": "run-all",
        "totalTests": 14,
        "completedTests": 6,
        "passedTests": 5,
        "failedTests": 0,
        "skippedTests": 1,
        "runningTests": [
            {
                "testId": "test-hash-1",
                "name": "API - Add Order Item",
                "filePath": "api/api.test.ts",
                "startedAt": "2025-10-28T09:30:00Z"
            },
            {
                "testId": "test-hash-2",
                "name": "API - Create User",
                "filePath": "api/api.test.ts",
                "startedAt": "2025-10-28T09:30:01Z"
            }
        ],
        "startTime": 1698489000000,
        "estimatedEndTime": 1698489007000,
        "phase": "saved",
        "result": {
            "id": "uuid",
            "testId": "test-hash-1",
            "runId": "run-abc-123",
            "name": "API - Add Order Item",
            "filePath": "api/api.test.ts",
            "status": "passed",
            "duration": 1200,
            "timestamp": "2025-10-28T09:30:05Z",
            "project": "API"
        }
    }
}
```

#### test:completed

Individual test completion notification.

```json
{
    "type": "test:completed",
    "data": {
        "testId": "test-66jqtq",
        "status": "passed",
        "duration": 1500,
        "timestamp": "2024-09-25T12:01:30.000Z"
    }
}
```

### Legacy Events (Deprecated but Supported)

#### run:started

Legacy test run start event.

```json
{
    "type": "run:started",
    "data": {
        "runId": "run_789",
        "startTime": "2024-09-25T12:00:00.000Z"
    }
}
```

#### run:completed

Legacy test run completion event.

```json
{
    "type": "run:completed",
    "data": {
        "runId": "run_789",
        "endTime": "2024-09-25T12:05:00.000Z",
        "status": "completed"
    }
}
```

## Error Responses

All API endpoints return consistent error format:

```json
{
    "status": "error",
    "error": {
        "message": "Test not found",
        "code": "TEST_NOT_FOUND",
        "details": {}
    }
}
```

Common HTTP status codes:

- `200` - Success
- `400` - Bad Request
- `404` - Not Found
- `500` - Internal Server Error

## Authentication

The dashboard supports JWT-based authentication for secure access control. Authentication can be enabled/disabled via environment configuration.

### POST /api/auth/login

Authenticate user with email and password.

**Request Body:**

```json
{
    "email": "user@example.com",
    "password": "your-password"
}
```

**Response (200 - Success):**

```json
{
    "status": "success",
    "data": {
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "user": {
            "email": "user@example.com"
        },
        "expiresIn": "30d"
    }
}
```

**Response (401 - Unauthorized):**

```json
{
    "status": "error",
    "error": {
        "message": "Authentication failed",
        "code": "UNAUTHORIZED"
    }
}
```

**Response (400 - Bad Request):**

```json
{
    "status": "error",
    "error": {
        "message": "Email and password are required",
        "code": "BAD_REQUEST"
    }
}
```

### POST /api/auth/logout

Logout current user and invalidate token.

**Headers:**

```
Authorization: Bearer {jwt-token}
```

**Response (200 - Success):**

```json
{
    "status": "success",
    "data": {
        "message": "Logout successful"
    }
}
```

**Response (500 - Server Error):**

```json
{
    "status": "error",
    "error": {
        "message": "Logout service error",
        "code": "SERVER_ERROR"
    }
}
```

### GET /api/auth/verify

Verify JWT token validity.

**Headers:**

```
Authorization: Bearer {jwt-token}
```

**Response (200 - Valid Token):**

```json
{
    "status": "success",
    "data": {
        "valid": true,
        "user": {
            "email": "user@example.com"
        }
    }
}
```

**Response (401 - Invalid Token):**

```json
{
    "status": "error",
    "error": {
        "message": "Invalid token",
        "code": "UNAUTHORIZED"
    }
}
```

**Response (401 - No Authorization Header):**

```json
{
    "status": "error",
    "error": {
        "message": "No authorization header provided",
        "code": "UNAUTHORIZED"
    }
}
```

### GET /api/auth/me

Get current authenticated user information.

**Headers:**

```
Authorization: Bearer {jwt-token}
```

**Response (200 - Success):**

```json
{
    "status": "success",
    "data": {
        "user": {
            "email": "user@example.com"
        }
    }
}
```

**Response (401 - Unauthorized):**

```json
{
    "status": "error",
    "error": {
        "message": "User information not available",
        "code": "UNAUTHORIZED"
    }
}
```

**Notes:**

- This endpoint requires valid JWT token in Authorization header
- User info is extracted from the token by auth middleware
- Use this endpoint to verify user session and get current user details

### GET /api/auth/config

Get authentication configuration for the frontend.

**Response (200 - Success):**

```json
{
    "status": "success",
    "data": {
        "authEnabled": true,
        "requiresAuth": true
    }
}
```

**Notes:**

- Returns whether authentication is enabled for the dashboard
- Frontend uses this to determine if login page should be shown
- No sensitive configuration details are exposed
- Does not require authentication to access

### Authentication Flow

**1. Initial Setup:**

```
Frontend → GET /api/auth/config
         ← authEnabled: true/false
```

**2. User Login:**

```
Frontend → POST /api/auth/login (email, password)
         ← {token, user, expiresIn}
```

**3. Store Token:**

```
Frontend stores token in localStorage or sessionStorage
```

**4. Authenticated Requests:**

```
Frontend → Any API request with header:
           Authorization: Bearer {token}
```

**5. Token Verification:**

```
Frontend → GET /api/auth/verify (periodic check)
         ← {valid: true, user}
```

**6. Logout:**

```
Frontend → POST /api/auth/logout
         ← {message: "Logout successful"}
Frontend clears stored token
```

### JWT Token Details

- **Algorithm:** HS256 (HMAC with SHA-256)
- **Expiration:** 30 days (default, approximately 1 month)
- **Storage:** Frontend stores in localStorage with key `_auth`
- **Header Format:** `Authorization: Bearer {token}`
- **Token Structure:**
    ```json
    {
        "email": "user@example.com",
        "iat": 1698489000,
        "exp": 1698575400
    }
    ```

### Protected Endpoints

When authentication is enabled, all API endpoints (except `/api/auth/*` and `/api/health`) require valid JWT token:

- All `/api/tests/*` endpoints
- All `/api/runs/*` endpoints
- WebSocket connections (token passed as query parameter)

### WebSocket Authentication

WebSocket connections require JWT token in URL:

```
ws://localhost:3001/ws?token={jwt-token}
```

See [Authentication Implementation](features/AUTHENTICATION_IMPLEMENTATION.md) for detailed setup and configuration.

## Rate Limiting

No rate limiting is currently implemented. All endpoints accept unlimited requests.

## Related Documentation

- [Architecture Overview](./ARCHITECTURE.md)
- [Development Guidelines](./DEVELOPMENT.md)
- [Configuration Details](./CONFIGURATION.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Attachment Management System](./features/PER_RUN_ATTACHMENTS.md)
- [Historical Test Tracking](./features/HISTORICAL_TEST_TRACKING.md)
