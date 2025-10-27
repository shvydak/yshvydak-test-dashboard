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

Execute a group of tests by file or pattern.

**Request Body:**

```json
{
    "pattern": "tests/api/*.spec.ts",
    "files": ["tests/api/actions.spec.ts"]
}
```

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

Test execution progress updates.

```json
{
    "type": "test:progress",
    "data": {
        "completed": 45,
        "total": 80,
        "percentage": 56.25
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

Currently, the API does not require authentication. All endpoints are publicly accessible within the configured network.

## Rate Limiting

No rate limiting is currently implemented. All endpoints accept unlimited requests.

## Related Documentation

- [Architecture Overview](./ARCHITECTURE.md)
- [Development Guidelines](./DEVELOPMENT.md)
- [Configuration Details](./CONFIGURATION.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Attachment Management System](./features/PER_RUN_ATTACHMENTS.md)
- [Historical Test Tracking](./features/HISTORICAL_TEST_TRACKING.md)
