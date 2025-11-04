# API Reference

## Overview

All API endpoints return consistent `ApiResponse<T>` format with proper error handling and status codes.

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

Complete integration status and configuration validation.

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
            "name": "API - Change Action Status",
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

### POST /api/tests

Save test results from Playwright reporter.

**Request Body:**

```json
{
    "testId": "test-66jqtq",
    "name": "API - Change Action Status",
    "status": "passed",
    "file": "tests/api/actions.spec.ts",
    "duration": 1500,
    "error": null,
    "attachments": []
}
```

### POST /api/tests/discovery

Discover all available tests in the Playwright project.

**Response:**

```json
{
    "status": "success",
    "data": {
        "discovered": 80,
        "files": 15,
        "message": "Tests discovered successfully"
    }
}
```

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

## Test Execution

### POST /api/tests/run-all

Execute all tests in the project.

**Request Body (Optional):**

```json
{
    "maxWorkers": 4
}
```

**Query Parameters:**

- `maxWorkers` (optional) - Maximum number of parallel workers

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

- This endpoint prevents duplicate test runs. If tests are already running, it returns HTTP 409.
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

- `filePath` (required) - Path to the test file (e.g., `"tests/api/actions.spec.ts"` or `"e2e/tests/auth.spec.ts"`)
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

## Test Information

### GET /api/tests/:id/history

Get complete execution history for a specific test.

**Description**: Retrieves all historical executions of a test, including independent attachments for each run. Pending test results are automatically filtered out.

**Path Parameters:**

- `id` - Test ID (testId) or test result ID (supports both for backward compatibility)

**Query Parameters:**

- `limit` - Maximum number of historical executions to return (default: 50)

**Response:**

```json
{
    "status": "success",
    "data": [
        {
            "id": "af679466-96f7-4a00-ad72-c02adc779fd8",
            "testId": "test-66jqtq",
            "runId": "run_123",
            "name": "API - Change Action Status",
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
            "name": "API - Change Action Status",
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
            "name": "Change Action status",
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

Emergency endpoint to clear all active processes.

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
                "name": "API - Link Budget Item",
                "filePath": "e2e/tests/api/api.test.ts",
                "startedAt": "2025-10-28T09:30:00Z"
            },
            {
                "testId": "test-hash-2",
                "name": "API - Create Contract",
                "filePath": "e2e/tests/api/api.test.ts",
                "startedAt": "2025-10-28T09:30:01Z"
            }
        ],
        "startTime": 1698489000000,
        "estimatedEndTime": 1698489007000
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
        "expiresIn": "24h"
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
- **Expiration:** 24 hours (default)
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
