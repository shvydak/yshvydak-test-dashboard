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

**Response:**

```json
{
    "status": "success",
    "data": {
        "message": "Tests execution started",
        "processId": "proc_123456"
    }
}
```

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

Get execution history for a specific test.

**Response:**

```json
{
    "status": "success",
    "data": [
        {
            "timestamp": "2025-09-24 13:44:50",
            "status": "passed",
            "duration": 1500
        }
    ]
}
```

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
