# Concept Map and System Flows

Visual diagrams and detailed explanations of how different parts of the system work together.

---

## Test Execution Flow (Complete Lifecycle)

### Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ USER ACTION: Clicks "Run All Tests" in Dashboard                   │
└───────────────────────────┬─────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ FRONTEND: TestsListFilters.tsx                                     │
│   - Button click → testsStore.runAllTests()                        │
│   - POST /api/tests/run-all with {maxWorkers: 2}                   │
└───────────────────────────┬─────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ BACKEND: TestController.runAllTests()                              │
│   - Extract maxWorkers from request body                           │
│   - Delegate to PlaywrightService                                  │
└───────────────────────────┬─────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ BACKEND: PlaywrightService.runAllTests()                           │
│   - Generate runId (UUID)                                          │
│   - Build CLI command:                                             │
│     npx playwright test                                            │
│       --reporter=playwright-dashboard-reporter                     │
│       --workers=2                                                  │
│   - Set environment variables:                                     │
│     DASHBOARD_API_URL=http://localhost:3001                        │
│     RUN_ID=c3699b22-cbec-4f26-a7cb-8524927b7072                    │
│     NODE_ENV=development                                           │
│   - Spawn child process in test project directory                 │
└───────────────────────────┬─────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ PLAYWRIGHT: Test execution starts                                  │
│   - Reads --reporter flag from CLI                                │
│   - Loads playwright-dashboard-reporter from node_modules          │
│   - Reporter reads environment: DASHBOARD_API_URL, RUN_ID          │
└───────────────────────────┬─────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ REPORTER: packages/reporter/src/index.ts                           │
│   - onTestBegin(): Start tracking test                            │
│   - onTestEnd(): Process test result                              │
│       1. Generate unique execution ID: uuidv4()                    │
│          Result: "fd7fdb1e-b573-4dd3-9809-7a46f923b690"           │
│       2. Generate stable testId: generateStableTestId()           │
│          Input: "tests/api/actions.spec.ts", "Change Action"      │
│          Algorithm: hash = (hash << 5) - hash + char              │
│          Result: "test-66jqtq" (SAME for all runs of this test)  │
│       3. Process attachments:                                      │
│          - Extract paths from Playwright temp dir                 │
│          - Send metadata to dashboard                             │
│       4. Build result object:                                      │
│          {                                                         │
│            id: "fd7fdb1e...",        // Unique per execution      │
│            testId: "test-66jqtq",    // Stable identifier         │
│            runId: "c3699b22...",                                   │
│            name: "Change Action Status",                           │
│            status: "passed",                                       │
│            duration: 7900,                                         │
│            attachments: [...]                                      │
│          }                                                         │
│       5. Send to dashboard:                                        │
│          POST /api/tests                                           │
└───────────────────────────┬─────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ BACKEND: TestController.saveTestResult()                           │
│   - Validate request body                                          │
│   - Delegate to TestService                                        │
└───────────────────────────┬─────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ BACKEND: TestService.saveTestResult()                              │
│   - Business logic validation                                      │
│   - Delegate to TestRepository                                     │
│   - If attachments present:                                        │
│     → Call AttachmentService.saveAttachmentsForTestResult()        │
└───────────────────────────┬─────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ BACKEND: TestRepository.saveTestResult()                           │
│   - Delegate to DatabaseManager                                    │
└───────────────────────────┬─────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ BACKEND: DatabaseManager.saveTestResult()                          │
│   ⚠️ CRITICAL: ALWAYS INSERT, NEVER UPDATE                         │
│                                                                     │
│   const insertSql = `                                              │
│     INSERT INTO test_results                                       │
│     (id, run_id, test_id, name, status, duration, ...)            │
│     VALUES (?, ?, ?, ?, ?, ?, ...)                                │
│   `                                                                 │
│                                                                     │
│   await this.run(insertSql, [                                      │
│     testData.id,        // "fd7fdb1e..." (unique execution ID)    │
│     testData.runId,     // "c3699b22..." (groups this run)        │
│     testData.testId,    // "test-66jqtq" (stable identifier)      │
│     testData.name,                                                 │
│     testData.status,                                               │
│     testData.duration,                                             │
│     ...                                                            │
│   ])                                                               │
│                                                                     │
│   Database now has:                                                │
│   id            | testId       | status | duration | created_at   │
│   fd7fdb1e...   | test-66jqtq  | passed | 7900     | 2025-10-09   │
│                                                                     │
│   If test is rerun, NEW row is created:                           │
│   aa8fdb1e...   | test-66jqtq  | passed | 8000     | 2025-10-09   │
│                                                                     │
│   → Execution history preserved!                                   │
└───────────────────────────┬─────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ BACKEND: AttachmentService.processAttachments()                    │
│   For each attachment from reporter:                               │
│     1. Verify source file exists in Playwright temp dir           │
│     2. Determine attachment type (video/screenshot/trace/log)     │
│     3. Call AttachmentManager.copyPlaywrightAttachment()          │
│     4. Build attachment data object                               │
│     5. Save to database via AttachmentRepository                  │
└───────────────────────────┬─────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ BACKEND: AttachmentManager.copyPlaywrightAttachment()              │
│   Source: /path/to/test-results/test-abc-123/video.webm           │
│                                                                     │
│   1. Create permanent directory:                                   │
│      {OUTPUT_DIR}/attachments/fd7fdb1e-b573-4dd3-9809-7a46f923b690/│
│                                                                     │
│   2. Generate unique filename:                                     │
│      video-1759177234271-k4bhye.webm                               │
│      Format: {type}-{timestamp}-{random}.{ext}                     │
│                                                                     │
│   3. Copy file:                                                    │
│      await fs.promises.copyFile(                                   │
│        sourceFilePath,                                             │
│        targetFilePath                                              │
│      )                                                             │
│                                                                     │
│   4. Get file stats and MIME type                                 │
│                                                                     │
│   5. Generate URL:                                                 │
│      /attachments/fd7fdb1e.../video-1759177234271-k4bhye.webm     │
│                                                                     │
│   6. Return metadata object                                        │
└───────────────────────────┬─────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ BACKEND: AttachmentRepository.saveAttachment()                     │
│   INSERT INTO attachments (                                        │
│     id, test_result_id, type, file_name, file_path,               │
│     file_size, mime_type, url                                      │
│   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)                                │
│                                                                     │
│   Database attachment record:                                      │
│   {                                                                 │
│     id: "att_123",                                                 │
│     testResultId: "fd7fdb1e...",                                   │
│     type: "video",                                                 │
│     fileName: "video-1759177234271-k4bhye.webm",                   │
│     filePath: "/abs/path/to/attachments/fd7fdb1e.../video...",    │
│     fileSize: 3670016,                                             │
│     mimeType: "video/webm",                                        │
│     url: "/attachments/fd7fdb1e.../video-1759177234271-k4bhye.webm"│
│   }                                                                 │
└───────────────────────────┬─────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ BACKEND: WebSocketService.broadcast()                              │
│   Event: "run:completed"                                           │
│   Data: {                                                          │
│     runId: "c3699b22...",                                          │
│     testId: "test-66jqtq",                                         │
│     testName: "Change Action Status",                              │
│     status: "passed",                                              │
│     isRerun: false                                                 │
│   }                                                                 │
│                                                                     │
│   Event: "dashboard:refresh"                                       │
│   Data: { action: "test-completed" }                               │
└───────────────────────────┬─────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ FRONTEND: App.tsx useWebSocket()                                   │
│   - Receives WebSocket event                                       │
│   - Invalidates React Query cache                                 │
│   - Triggers testsStore.fetchTests()                               │
└───────────────────────────┬─────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│ FRONTEND: TestsList.tsx                                            │
│   - Re-renders with updated test results                          │
│   - Shows latest execution status                                 │
│   - Attachments available for viewing                             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Dependencies and Relationships

### 1. Historical Tracking ← Test ID Generation

**Dependency:**
```
Historical Tracking REQUIRES stable testId across all executions
```

**Why:**
- Multiple executions of same test must have same `testId`
- Different `id` (execution ID) per run
- Database query: `SELECT * FROM test_results WHERE test_id = ? ORDER BY created_at DESC`

**Diagram:**
```
Test Run 1:
  id: "abc-123"
  testId: "test-66jqtq"  ←─┐
  created_at: 10:00         │
                            │ Same testId = Execution History
Test Run 2:               │
  id: "xyz-456"             │
  testId: "test-66jqtq"  ←─┘
  created_at: 11:00
```

**Implementation:**
- `generateStableTestId()` in reporter
- `generateStableTestId()` in PlaywrightService
- ⚠️ **MUST BE IDENTICAL**

---

### 2. Attachment Storage ← INSERT-only Strategy

**Dependency:**
```
Permanent Attachment Storage REQUIRES unique execution IDs
```

**Why:**
- Each execution ID gets own directory
- Multiple executions = multiple attachment sets
- No file collision between runs

**Diagram:**
```
attachments/
├── abc-123-def/              ← Execution 1 (id: abc-123)
│   ├── video-...-abc.webm
│   └── trace-...-xyz.zip
├── xyz-456-uvw/              ← Execution 2 (id: xyz-456)
│   ├── video-...-def.webm    (different file!)
│   └── trace-...-pqr.zip
└── mno-789-pqr/              ← Execution 3 (id: mno-789)
    └── screenshot-...-ghi.png

If we used UPDATE:
  - Only one execution record exists
  - Only one attachment directory
  - Rerun overwrites previous attachments
  - History lost!
```

---

### 3. Rerun from Modal ← WebSocket + Historical Tracking

**Dependency:**
```
Rerun Feature REQUIRES both WebSocket events AND historical tracking
```

**Why:**
- WebSocket: Real-time updates when rerun completes
- Historical tracking: View previous executions
- Combined: Auto-switch to latest execution after rerun

**Flow:**
```
User clicks "Run" in ExecutionSidebar
  ↓
POST /api/tests/:id/rerun
  ↓
Test executes (new execution ID created)
  ↓
WebSocket: run:completed event with isRerun=true
  ↓
TestDetailModal receives event
  ↓
Checks: data.testId === currentTest.testId
  ↓
Calls: refetchHistory() → GET /api/tests/:id/history
  ↓
Calls: selectExecution(null) → Switch to latest
  ↓
ExecutionSidebar shows new "LATEST" execution
  ↓
Modal displays new execution data
```

---

### 4. Dashboard Redesign ← Historical Tracking + Flaky Detection

**Dependency:**
```
Flaky Test Detection REQUIRES multiple executions grouped by testId
```

**SQL Query:**
```sql
SELECT
  tr.test_id as testId,
  COUNT(*) as totalRuns,
  SUM(CASE WHEN tr.status = 'failed' THEN 1 ELSE 0 END) as failedRuns,
  SUM(CASE WHEN tr.status = 'passed' THEN 1 ELSE 0 END) as passedRuns,
  CAST(failedRuns * 100.0 / totalRuns AS INTEGER) as flakyPercentage
FROM test_results tr
WHERE tr.created_at >= datetime('now', '-30 days')
  AND tr.status IN ('passed', 'failed')
GROUP BY tr.test_id        ← Groups multiple executions
HAVING totalRuns > 1
  AND flakyPercentage >= 10
  AND flakyPercentage < 100
```

**Example:**
```
testId: "test-66jqtq"
Executions:
  1. passed (10:00)
  2. failed (11:00)  ← Flaky!
  3. passed (12:00)
  4. passed (13:00)
  5. failed (14:00)  ← Flaky!

Flaky percentage: 2/5 = 40%
```

---

### 5. Flaky Test Detection ← Test ID Grouping

**Dependency:**
```
Flaky Detection REQUIRES consistent testId across multiple runs
```

**Why:**
- Groups executions: `GROUP BY test_id`
- Calculates failure rate per test (not per execution)
- Tracks history: `history: ['passed', 'failed', 'passed', ...]`

**Diagram:**
```
Without stable testId:
  Test Run 1: testId = "test-abc-123"  ← Different ID
  Test Run 2: testId = "test-xyz-456"  ← Can't group!
  Test Run 3: testId = "test-mno-789"
  → No flaky detection possible

With stable testId:
  Test Run 1: testId = "test-66jqtq"  ← Same ID
  Test Run 2: testId = "test-66jqtq"  ← Can group!
  Test Run 3: testId = "test-66jqtq"
  → GROUP BY test_id works
  → Flaky detection successful
```

---

## System Architecture Layers

### Backend: Layered Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ HTTP Request                                                │
│ POST /api/tests                                             │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ CONTROLLER LAYER (test.controller.ts)                      │
│ - HTTP request/response handling                           │
│ - Input validation                                         │
│ - Response formatting                                      │
│ - Error handling                                           │
│                                                             │
│ ❌ NO business logic                                       │
│ ❌ NO database operations                                  │
│ ❌ NO file operations                                      │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ SERVICE LAYER (test.service.ts, attachment.service.ts)     │
│ - Business logic                                           │
│ - Orchestration (coordinate multiple repositories)        │
│ - Transaction management                                   │
│ - External API calls                                       │
│                                                             │
│ ❌ NO direct database operations                           │
│ ❌ NO HTTP concerns                                        │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ REPOSITORY LAYER (test.repository.ts)                      │
│ - Data access ONLY                                         │
│ - SQL queries                                              │
│ - Data mapping                                             │
│                                                             │
│ ❌ NO business logic                                       │
│ ❌ NO HTTP concerns                                        │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ DATABASE LAYER (database.manager.ts)                       │
│ - Raw SQL execution                                        │
│ - Connection management                                    │
│ - Transaction primitives                                   │
└─────────────────────────────────────────────────────────────┘
```

---

### Frontend: Feature-Based Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ FEATURE MODULES (features/{name}/)                         │
│ - Self-contained feature implementations                   │
│ - Components, hooks, store, types, utils                   │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ SHARED COMPONENTS (shared/components/)                     │
│ - Atoms: Button, StatusIcon, LoadingSpinner               │
│ - Molecules: Card, ActionButton, ModalBackdrop            │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ GLOBAL HOOKS (hooks/)                                      │
│ - useWebSocket, useTheme, usePlaywrightWorkers            │
└─────────────────────────────────────────────────────────────┘
```

---

## Related Documentation

- [CLAUDE.md](../../CLAUDE.md) - Quick concept flow diagram
- [docs/ARCHITECTURE.md](../ARCHITECTURE.md) - Complete architecture details
- [docs/ai/FILE_LOCATIONS.md](FILE_LOCATIONS.md) - Where to find implementation
- [docs/ai/ANTI_PATTERNS.md](ANTI_PATTERNS.md) - What NOT to do

---

**Last Updated:** October 2025
**Maintained by:** Yurii Shvydak
