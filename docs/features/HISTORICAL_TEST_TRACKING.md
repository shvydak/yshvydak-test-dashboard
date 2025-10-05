# Historical Test Tracking

## Overview

The YShvydak Test Dashboard implements a **comprehensive test execution history tracking system** that preserves all test runs and their associated data (attachments, results, metadata) across multiple executions. This feature enables users to view, compare, and analyze historical test runs without losing data when tests are rerun.

### Core Principle

**Each test execution creates an independent database record with isolated attachments, allowing complete historical tracking of test results over time.**

The system ensures that:

- Running Test A multiple times creates separate execution records
- Each execution maintains its own attachments and results
- Users can view the latest execution by default
- Users can browse complete execution history and switch between different runs
- All historical data is preserved for future analytics and reporting

## Problem Statement

### The Original Issue

Before implementing historical tracking, the dashboard exhibited a critical limitation:

**Scenario:**

1. Run Test A → Attachments and results saved
2. Run Test A again (rerun) → **Previous attachments and results overwritten**
3. User cannot see what happened in the first run

**Root Cause:**

The `DatabaseManager.saveTestResult()` method was updating existing test results by `testId` instead of creating new execution records:

```typescript
// OLD LOGIC (Problematic)
if (existingResult) {
    UPDATE test_results SET ... WHERE test_id = ?
} else {
    INSERT INTO test_results ...
}
```

This approach made it impossible to track test execution history.

### The Solution

Implement **independent execution tracking** with persistent history:

1. **Always INSERT New Records**: Each test execution creates a new database record with unique ID
2. **Preserve Attachments**: Each execution maintains independent attachments in isolated storage
3. **History UI**: Users can view execution history and switch between different runs
4. **Filter Pending Results**: Discovery creates pending results that should not appear in history
5. **Latest by Default**: Show most recent execution by default while preserving access to history

## Architecture

The historical test tracking feature spans both backend and frontend layers, following the project's established architecture patterns.

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│  Playwright Reporter (External)                             │
│  - Generates unique execution ID (UUID) for each test run   │
│  - Sends test results + attachments to API                  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  API Controller (test.controller.ts)                        │
│  - POST /api/tests - Save new test execution               │
│  - GET /api/tests/:id/history - Get execution history      │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Service Layer (test.service.ts)                            │
│  - saveTestResult(): Delegates to repository + attachments │
│  - getTestHistory(): Retrieves executions with attachments │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ├──────────────────┬─────────────────────────┐
                 ▼                  ▼                         ▼
┌──────────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│ TestRepository       │  │ AttachmentService│  │ DatabaseManager      │
│                      │  │                  │  │                      │
│ - Save execution     │  │ - Copy files     │  │ - Always INSERT      │
│ - Get by testId      │  │ - Load per exec  │  │ - No UPDATE on rerun │
│ - Filter pending     │  │                  │  │                      │
└──────────────────────┘  └──────────────────┘  └──────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Database (SQLite)                                          │
│  - test_results table: Multiple rows per testId            │
│  - attachments table: Isolated per execution               │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React)                                           │
│  - TestDetailModal: Switches between executions            │
│  - TestHistoryTab: Displays execution list                 │
│  - ExecutionCard: Individual execution display             │
│  - Zustand store: Manages selectedExecutionId              │
└─────────────────────────────────────────────────────────────┘
```

### Backend Architecture

#### DatabaseManager Changes

**Location**: `packages/server/src/database/database.manager.ts`

**Critical Change**: Always INSERT new execution records

```typescript
async saveTestResult(testData: TestResultData): Promise<string> {
    // ALWAYS create new record - never update existing by testId
    const insertSql = `
        INSERT INTO test_results
        (id, run_id, test_id, name, file_path, status, duration, ...)
        VALUES (?, ?, ?, ?, ?, ?, ?, ...)
    `
    await this.run(insertSql, [testData.id, ...])
    return testData.id
}
```

**Why This Works:**

- Reporter generates unique `id` (UUID) for each execution
- `testId` remains same (stable identifier for the logical test)
- Multiple rows with same `testId` = execution history

#### TestRepository - History Retrieval

**Location**: `packages/server/src/repositories/test.repository.ts`

```typescript
async getTestResultsByTestId(
    testId: string,
    limit = 50
): Promise<TestResult[]> {
    const rows = await this.queryAll<TestResultRow>(
        `SELECT tr.*,
                a.id as attachment_id, a.type as attachment_type, a.url as attachment_url
         FROM test_results tr
         LEFT JOIN attachments a ON tr.id = a.test_result_id
         WHERE tr.test_id = ? AND tr.status != 'pending'
         ORDER BY tr.created_at DESC
         LIMIT ?`,
        [testId, limit]
    )

    return this.mapRowsToTestResults(rows)
}
```

**Key Features:**

- Filters out `pending` results from test discovery
- Orders by `created_at DESC` to show latest first
- Includes attachments via LEFT JOIN
- Limits results to prevent performance issues

#### TestService - Attachment Loading

**Location**: `packages/server/src/services/test.service.ts`

```typescript
async getTestHistory(testId: string, limit: number = 50): Promise<TestResult[]> {
    const history = await this.testRepository.getTestResultsByTestId(testId, limit)

    // Load attachments for each execution
    for (const execution of history) {
        const attachments = await this.attachmentService.getAttachmentsByTestResult(
            execution.id
        )
        execution.attachments = attachments
    }

    return history
}
```

**Why Load Attachments Separately:**

- Attachment files are in permanent storage
- Each execution has isolated attachment directory
- Ensures correct attachment URLs are generated

#### TestController - API Endpoint

**Location**: `packages/server/src/controllers/test.controller.ts`

```typescript
getTestHistory = async (req: ServiceRequest, res: Response): Promise<void> => {
    try {
        const {id} = req.params
        const {limit = 50} = req.query

        // Try to find test by ID first (backwards compatibility)
        const test = await this.testService.getTestById(id)

        // If found by ID, use its testId; otherwise treat parameter as testId directly
        const testId = test ? test.testId : id

        const history = await this.testService.getTestHistory(
            testId,
            parseInt(limit as string) || 50
        )

        ResponseHelper.success(res, history, undefined, history.length)
    } catch (error) {
        Logger.error('Error fetching test history', error)
        ResponseHelper.error(res, error.message, 'Failed to fetch test history', 500)
    }
}
```

**Flexibility:**

- Accepts both `test result ID` and `testId`
- Backwards compatible with existing API usage
- Returns up to 50 executions by default

### Frontend Architecture

The frontend follows the project's **Feature-Based Architecture** with components organized under `features/tests/`:

#### Component Structure

```
packages/web/src/features/tests/
├── components/
│   └── history/                    # History feature components
│       ├── ExecutionCard.tsx       # Individual execution display
│       ├── ExecutionList.tsx       # List of all executions
│       ├── TestHistoryTab.tsx      # Main history tab
│       └── index.ts                # Barrel export
├── hooks/
│   └── useTestExecutionHistory.ts  # Hook to fetch execution history
└── store/
    └── testsStore.ts               # Added selectedExecutionId state
```

#### State Management (Zustand Store)

**Location**: `packages/web/src/features/tests/store/testsStore.ts`

```typescript
interface TestsState {
    // ... existing state
    selectedExecutionId: string | null

    // Actions
    selectExecution: (executionId: string | null) => void
}

// Implementation
export const useTestsStore = create<TestsState>()(
    devtools((set, get) => ({
        // ... existing state
        selectedExecutionId: null,

        selectExecution: (executionId: string | null) => {
            set({selectedExecutionId: executionId})
        },
    }))
)
```

**Why Zustand:**

- Centralized state for selected execution
- All tabs read same execution ID
- Simple API for switching executions

#### TestDetailModal Integration

**Location**: `packages/web/src/features/tests/components/testDetail/TestDetailModal.tsx`

```typescript
export function TestDetailModal({test, isOpen, onClose}: TestDetailModalProps) {
    const selectedExecutionId = useTestsStore((state) => state.selectedExecutionId)
    const selectExecution = useTestsStore((state) => state.selectExecution)

    const {executions} = useTestExecutionHistory(test?.testId || '')

    // Determine which execution to display
    const currentExecution = selectedExecutionId
        ? executions.find((e) => e.id === selectedExecutionId) || test
        : test // Default to latest

    // Load attachments for current execution only
    const {attachments, loading, error} = useTestAttachments(currentExecution?.id || null, isOpen)

    const handleSelectExecution = (executionId: string) => {
        selectExecution(executionId)
        setActiveTab('overview') // Switch to overview on execution change
    }

    const handleClose = () => {
        selectExecution(null) // Reset to latest on close
        setActiveTab('overview')
        onClose()
    }

    // Pass currentExecution to all tabs
}
```

**Key Features:**

- Default shows latest execution (`selectedExecutionId === null`)
- User can switch to any historical execution
- All tabs (Overview, Attachments, Steps, History) show selected execution data
- Reset to latest on modal close

#### ExecutionCard Component

**Location**: `packages/web/src/features/tests/components/history/ExecutionCard.tsx`

Displays individual execution with:

- Status badge (passed, failed, skipped, etc.)
- Date and time of execution
- Duration
- Attachments count
- "Latest" badge for most recent execution
- "Currently viewing" indicator for selected execution
- "Switch to this execution" button

#### useTestExecutionHistory Hook

**Location**: `packages/web/src/features/tests/hooks/useTestExecutionHistory.ts`

```typescript
export function useTestExecutionHistory(testId: string): UseTestExecutionHistoryReturn {
    const [executions, setExecutions] = useState<TestResult[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!testId) return

        const fetchHistory = async () => {
            setLoading(true)
            try {
                const response = await authGet(
                    `${config.api.serverUrl}/api/tests/${testId}/history?limit=50`
                )

                if (response.ok) {
                    const data = await response.json()
                    setExecutions(data.data || [])
                } else {
                    setError('Failed to load execution history')
                }
            } catch (err) {
                setError(err.message)
            } finally {
                setLoading(false)
            }
        }

        fetchHistory()
    }, [testId])

    return {executions, loading, error}
}
```

**Features:**

- Fetches up to 50 historical executions
- Uses authenticated API calls
- Handles loading and error states
- Refetches when testId changes

## UI/UX Design

### Chosen Solution: History Tab (Variant A)

After analyzing multiple approaches, **Variant A - History Tab** was chosen for its:

✅ **Progressive Disclosure**: History is accessible but not intrusive
✅ **Consistent Layout**: Matches existing tab structure
✅ **Clear Context**: User knows they're viewing history
✅ **Scalability**: Easy to add features like filtering, sorting, comparison

### User Flow

1. **User opens test detail modal**
    - Modal shows latest execution by default
    - Header displays: "Viewing execution: [Latest]"
    - All tabs show latest execution data

2. **User clicks on "History" tab**
    - Sees list of all executions (newest first)
    - Latest execution marked with "LATEST" badge
    - Currently viewed execution marked with "✓ Currently viewing"
    - Each execution shows: status, date/time, duration, attachments count

3. **User clicks "Switch to this execution" on historical run**
    - Modal header updates: "Viewing execution: [date/time]" + "← Back to latest" button
    - All tabs now show selected execution data
    - History tab updates "Currently viewing" indicator
    - Attachments tab shows attachments from selected execution only

4. **User clicks "← Back to latest"**
    - Modal returns to showing latest execution
    - Header shows: "Viewing execution: [Latest]"

### Visual Design

**Execution Card States:**

```
┌─────────────────────────────────────────────────────┐
│ LATEST  ✅ Passed                    11:22:13 05/10  │
│ Duration: 7.9s • Attachments: 2                     │
│                                                      │
│ ✓ Currently viewing                                 │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ ✅ Passed                             11:21:39 05/10 │
│ Duration: 8.0s • Attachments: 2                     │
│                                                      │
│ Switch to this execution →                          │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ ❌ Failed                             10:15:22 05/10 │
│ Duration: 5.3s • Attachments: 3                     │
│                                                      │
│ Switch to this execution →                          │
└─────────────────────────────────────────────────────┘
```

## API Reference

### GET /api/tests/:id/history

Retrieve execution history for a specific test.

**Parameters:**

- `:id` - Test result ID or testId (flexible)
- `limit` (query) - Maximum executions to return (default: 50, max: 50)

**Request:**

```http
GET /api/tests/test-66jqtq/history?limit=50
Authorization: Bearer {jwt-token}
```

**Response:**

```json
{
    "status": "success",
    "data": [
        {
            "id": "fd7fdb1e-b573-4dd3-9809-7a46f923b690",
            "testId": "test-66jqtq",
            "runId": "run-abc123",
            "name": "API - Change Action Status",
            "filePath": "tests/api/actions.spec.ts",
            "status": "passed",
            "duration": 7900,
            "errorMessage": null,
            "errorStack": null,
            "retryCount": 0,
            "metadata": {},
            "timestamp": "2025-10-05 11:22:13",
            "createdAt": "2025-10-05 11:22:13",
            "updatedAt": "2025-10-05 11:22:13",
            "attachments": [
                {
                    "id": "att_123",
                    "testResultId": "fd7fdb1e-b573-4dd3-9809-7a46f923b690",
                    "type": "video",
                    "fileName": "video-1759177234271-k4bhye.webm",
                    "url": "/attachments/fd7fdb1e.../video-1759177234271-k4bhye.webm"
                }
            ]
        },
        {
            "id": "aa8fdb1e-c894-4dd3-8754-6a46f923b691",
            "testId": "test-66jqtq",
            "status": "passed",
            "duration": 8000,
            "createdAt": "2025-10-05 11:21:39",
            "attachments": [...]
        }
    ],
    "count": 2
}
```

**Features:**

- Returns executions ordered by `created_at DESC` (newest first)
- Filters out `pending` results from test discovery
- Includes attachments for each execution
- Backwards compatible (accepts both result ID and testId)

## Database Schema

### test_results Table

```sql
CREATE TABLE IF NOT EXISTS test_results (
    id TEXT PRIMARY KEY,              -- Unique execution ID (UUID from reporter)
    run_id TEXT NOT NULL,             -- Run ID (groups tests in same run)
    test_id TEXT NOT NULL,            -- Stable test identifier (same across runs)
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    status TEXT CHECK(status IN ('passed', 'failed', 'skipped', 'timedOut', 'pending')) NOT NULL,
    duration INTEGER DEFAULT 0,
    error_message TEXT,
    error_stack TEXT,
    retry_count INTEGER DEFAULT 0,
    metadata TEXT,                    -- JSON metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_test_results_test_id ON test_results(test_id);
CREATE INDEX IF NOT EXISTS idx_test_results_run_id ON test_results(run_id);
CREATE INDEX IF NOT EXISTS idx_test_results_status ON test_results(status);
```

**Key Points:**

- `id`: Unique for each execution (UUID from reporter)
- `test_id`: Same for all executions of the same logical test
- Multiple rows with same `test_id` = execution history
- Index on `test_id` for fast history queries

### attachments Table

```sql
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    test_result_id TEXT NOT NULL REFERENCES test_results(id) ON DELETE CASCADE,
    type TEXT CHECK(type IN ('video', 'screenshot', 'trace', 'log')) NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    mime_type TEXT,
    url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attachments_test_result_id ON attachments(test_result_id);
```

**Key Points:**

- `test_result_id` references specific execution ID
- Each execution has independent attachments
- `ON DELETE CASCADE` cleans up attachments when execution is deleted

## Integration with Reporter

The reporter already generates unique execution IDs, so no changes were needed:

```typescript
// External reporter: /Users/y.shvydak/QA/probuild-qa/e2e/testUtils/yshvydakReporter.ts

onTestEnd(test: TestCase, result: TestResult) {
    const testResult: YShvydakTestResult = {
        id: uuidv4(),  // ✅ Unique execution ID - different every time
        testId: this.generateStableTestId(test),  // ✅ Same for all runs of this test
        runId: this.runId,
        name: test.title,
        status: this.mapStatus(result.status),
        duration: result.duration,
        attachments: this.processAttachments(result.attachments),
        // ...
    }

    this.sendTestResult(testResult)
}
```

**How It Works:**

1. Reporter generates unique `id` (UUID) for each test execution
2. Reporter generates stable `testId` (hash of file path + title)
3. Dashboard receives both IDs
4. `DatabaseManager.saveTestResult()` INSERTS new row with unique `id`
5. Multiple executions of same test = multiple rows with same `testId`

## Usage Examples

### Scenario 1: Running Same Test Multiple Times

**User Actions:**

1. Run "Change Action Status" test (first time)
2. Run "Change Action Status" test (second time)
3. Open test modal
4. Click "History" tab

**System Behavior:**

**Database After First Run:**

```sql
-- test_results table
id: "fd7fdb1e-b573-4dd3-9809-7a46f923b690"
testId: "test-66jqtq"
status: "passed"
duration: 7900
created_at: "2025-10-05 11:22:13"

-- attachments table
test_result_id: "fd7fdb1e-b573-4dd3-9809-7a46f923b690"
file: "video-1759177234271-k4bhye.webm"
```

**Database After Second Run:**

```sql
-- test_results table (TWO ROWS)
id: "fd7fdb1e-b573-4dd3-9809-7a46f923b690"  -- First execution
testId: "test-66jqtq"
created_at: "2025-10-05 11:22:13"

id: "aa8fdb1e-c894-4dd3-8754-6a46f923b691"  -- Second execution (NEW)
testId: "test-66jqtq"
created_at: "2025-10-05 11:21:39"

-- attachments table (INDEPENDENT SETS)
test_result_id: "fd7fdb1e-b573-4dd3-9809-7a46f923b690"  -- First run attachments
test_result_id: "aa8fdb1e-c894-4dd3-8754-6a46f923b691"  -- Second run attachments
```

**History Tab Shows:**

- Latest execution (11:22:13) - marked as "LATEST" + "Currently viewing"
- Previous execution (11:21:39) - "Switch to this execution" button

### Scenario 2: Switching Between Executions

**User Actions:**

1. Open test modal (shows latest execution by default)
2. Click "History" tab
3. Click "Switch to this execution" on older execution
4. View attachments from that execution
5. Click "← Back to latest"

**System Behavior:**

**Step 1 - Modal Opens:**

```
currentExecution = test (latest)
selectedExecutionId = null
attachments = from latest execution
```

**Step 3 - Switch to Older Execution:**

```
selectedExecutionId = "aa8fdb1e-c894-4dd3-8754-6a46f923b691"
currentExecution = executions.find(e => e.id === selectedExecutionId)
attachments = from older execution
Modal header: "Viewing execution: 11:21:39 05/10/2025"
```

**Step 5 - Back to Latest:**

```
selectedExecutionId = null
currentExecution = test (latest)
attachments = from latest execution
Modal header: "Viewing execution: [Latest]"
```

## Benefits

### For Users

✅ **Never Lose Data**: All test runs are preserved with independent attachments
✅ **Compare Runs**: See what changed between executions
✅ **Debug Failures**: Go back to see when test started failing
✅ **Track Flakiness**: Identify tests that pass/fail intermittently
✅ **Review History**: See execution trends over time

### For Future Development

✅ **Analytics Foundation**: Data structure ready for statistics and trends
✅ **Comparison Tools**: Easy to add side-by-side execution comparison
✅ **Performance Tracking**: Duration trends over time
✅ **Flakiness Detection**: Automated detection of unstable tests
✅ **Reporting**: Historical data for test reports and dashboards

## Technical Considerations

### Performance

**Query Optimization:**

- Indexed by `test_id` for fast history queries
- Limited to 50 executions per request
- Attachments loaded separately to avoid N+1 issues

**Storage Management:**

- Each execution creates new database row
- Attachments stored in isolated directories
- Consider implementing automatic cleanup of old executions

**Recommended Cleanup Strategy:**

```typescript
// Future enhancement: Cleanup old executions
async cleanupOldExecutions(testId: string, keepLast: number = 50) {
    // Keep last 50 executions per test
    // Delete older executions and their attachments
}
```

### Backward Compatibility

✅ **API Compatibility**: Endpoint accepts both result ID and testId
✅ **Database Schema**: No breaking changes to existing schema
✅ **Reporter Compatibility**: No reporter changes needed
✅ **Frontend**: Works with existing test data

### Future Enhancements

**Potential Features:**

1. **Execution Comparison**: Side-by-side view of two executions
2. **Filtering**: Filter history by status, date range, duration
3. **Statistics**: Pass rate, average duration, flakiness score
4. **Trends**: Visual charts showing execution trends over time
5. **Automated Cleanup**: Configurable retention policies
6. **Export**: Export execution history to CSV/JSON
7. **Annotations**: Add notes to specific executions

## Troubleshooting

### Issue: Pending Results in History

**Symptom**: History shows "Pending" executions with 0ms duration and N/A date

**Cause**: Test discovery creates pending results that shouldn't appear in history

**Solution**: Fixed in `TestRepository.getTestResultsByTestId()`:

```typescript
WHERE tr.test_id = ? AND tr.status != 'pending'
```

### Issue: Attachments from Wrong Execution

**Symptom**: Viewing historical execution shows attachments from latest run

**Cause**: Frontend loading attachments for wrong execution ID

**Solution**: Ensure `useTestAttachments` receives `currentExecution?.id`:

```typescript
const {attachments} = useTestAttachments(
    currentExecution?.id || null, // ✅ Correct
    isOpen
)
```

### Issue: History Shows Only One Execution

**Symptom**: Running test multiple times but history shows only latest

**Cause**: `DatabaseManager.saveTestResult()` was doing UPDATE instead of INSERT

**Solution**: Changed to always INSERT new records:

```typescript
async saveTestResult(testData: TestResultData): Promise<string> {
    const insertSql = `INSERT INTO test_results (...) VALUES (...)`
    await this.run(insertSql, [testData.id, ...])
    return testData.id
}
```

## Related Documentation

- [Architecture Overview](../ARCHITECTURE.md) - System architecture and design patterns
- [API Reference](../API_REFERENCE.md) - Complete API documentation
- [Attachment Management](./PER_RUN_ATTACHMENTS.md) - Permanent attachment storage system
- [Frontend Architecture](../ARCHITECTURE.md#frontend-feature-based-architecture) - Feature-based component organization
- [Development Guidelines](../DEVELOPMENT.md) - Development best practices
