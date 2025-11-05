# Real-Time Test Progress Tracking

**Status:** ✅ Implemented (October 2025)
**Version:** 1.0.1+
**Related Features:** WebSocket Communication, Reporter Integration

---

## Overview

The Progress Tracking feature provides **real-time visibility** into test execution, displaying:

- Which tests are currently running
- Overall progress statistics (passed/failed/skipped/pending)
- Time estimates (elapsed and remaining)
- Progress percentage

This feature enables developers to monitor long-running test suites without waiting for completion.

---

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Test Execution Lifecycle                      │
└─────────────────────────────────────────────────────────────────┘

1. TEST STARTS
   Playwright → Reporter.onTestBegin()
   ↓
   POST /api/tests/test-start {runId, testId, name, filePath}
   ↓
   activeProcessesTracker.startTest()
   ↓
   WebSocket → broadcast test:progress
   ↓
   Frontend → FloatingProgressPanel (shows "Currently Running")

2. TEST ENDS
   Playwright → Reporter.onTestEnd()
   ↓
   POST /api/tests {full test result with status, duration, errors}
   ↓
   activeProcessesTracker.updateProgress()
   ↓
   WebSocket → broadcast test:progress
   ↓
   Frontend → FloatingProgressPanel (updates statistics)
```

### Component Architecture

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Reporter   │─────→│     API      │─────→│   Service    │
│ (onTestBegin)│      │ /test-start  │      │  startTest() │
└──────────────┘      └──────────────┘      └──────────────┘
                                                     ↓
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Frontend   │←─────│  WebSocket   │←─────│   Progress   │
│FloatingPanel │      │test:progress │      │    State     │
└──────────────┘      └──────────────┘      └──────────────┘
```

---

## Implementation Details

### 1. Backend: Progress Tracking Service

**Location:** `packages/server/src/services/activeProcesses.service.ts`

#### Key Methods

##### `startTest(runId, testInfo)`

Tracks when a test begins execution.

```typescript
startTest(
  runId: string,
  testInfo: {
    testId: string
    name: string
    filePath: string
  }
): TestProgress | null
```

**Behavior:**

- Adds test to `runningTests` array
- Records start timestamp
- Returns updated progress state
- Handles duplicate test IDs (safety check)

**Example:**

```typescript
const progress = activeProcessesTracker.startTest('run-123', {
  testId: 'abc-def',
  name: 'should validate user login',
  filePath: 'tests/auth.spec.ts'
})

// Result:
{
  processId: 'run-123',
  totalTests: 10,
  completedTests: 3,
  runningTests: [
    {
      testId: 'abc-def',
      name: 'should validate user login',
      filePath: 'tests/auth.spec.ts',
      startedAt: '2025-10-28T12:00:00Z'
    }
  ]
}
```

##### `updateProgress(runId, testResult)`

Updates progress when a test completes.

```typescript
updateProgress(
  runId: string,
  testResult: {
    testId: string
    name: string
    filePath: string
    status: 'passed' | 'failed' | 'skipped' | 'pending'
  }
): TestProgress | null
```

**Behavior:**

- Removes test from `runningTests` array
- Increments `completedTests` counter
- Updates status counters (passed/failed/skipped)
- Calculates estimated end time
- Returns updated progress state

**Time Estimation Algorithm:**

```typescript
if (completedTests > 0 && totalTests > 0) {
    const elapsedTime = Date.now() - startTime
    const avgTimePerTest = elapsedTime / completedTests
    const remainingTests = totalTests - completedTests
    estimatedEndTime = Date.now() + avgTimePerTest * remainingTests
}
```

---

### 2. API Endpoints

#### POST `/api/tests/test-start`

**Purpose:** Notify server that a test has started execution

**Request Body:**

```typescript
{
    runId: string // Process execution ID
    testId: string // Stable test identifier (hash)
    name: string // Test title
    filePath: string // Relative path to test file
}
```

**Response:**

```typescript
{
  success: true,
  data: { testId: string },
  message: "Test start notification received"
}
```

**Side Effects:**

- Updates `activeProcessesTracker` state
- Broadcasts `test:progress` WebSocket event

**Error Handling:**

```typescript
// Missing required fields
400 Bad Request
{
  success: false,
  error: "Missing required fields: runId, testId, name, filePath"
}

// Process not found
200 OK (graceful degradation - logs warning)
```

---

### 3. Reporter Integration

**Location:** `packages/reporter/src/index.ts`

#### `onTestBegin(test: TestCase)`

Called by Playwright when each test starts.

```typescript
onTestBegin(test: TestCase) {
  const testId = this.generateStableTestId(test)
  const filePath = path.relative(process.cwd(), test.location.file)

  // Notify dashboard
  this.notifyTestStart({
    testId,
    name: test.title,
    filePath,
  })

  console.log(`▶️  Starting: ${test.title}`)
}
```

#### `notifyTestStart(data)`

Sends test start notification to server.

```typescript
private async notifyTestStart(data: {
  testId: string
  name: string
  filePath: string
}) {
  try {
    await fetch(`${this.apiBaseUrl}/api/tests/test-start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: this.runId,
        ...data,
      }),
    })
  } catch (error) {
    // Silent fail - don't interrupt test execution
    console.warn(`⚠️  Test start notification failed: ${error}`)
  }
}
```

**Design Decision:** Silent failure ensures test execution continues even if dashboard is unavailable.

---

### 4. WebSocket Events

#### Event: `test:progress`

**Broadcast Trigger:**

- When a test starts (`POST /api/tests/test-start`)
- When a test completes (`POST /api/tests`)

**Payload:**

```typescript
{
  type: 'test:progress',
  data: {
    processId: string
    type: 'run-all' | 'run-group' | 'rerun'
    totalTests: number
    completedTests: number
    passedTests: number
    failedTests: number
    skippedTests: number
    runningTests: Array<{
      testId: string
      name: string
      filePath: string
      startedAt: string
    }>
    startTime: number
    estimatedEndTime?: number
  },
  timestamp: string
}
```

**Frontend Handler:**

```typescript
// packages/web/src/hooks/useWebSocket.ts
case 'test:progress':
  if (message.data) {
    updateProgress(message.data)
  }
  break
```

---

### 5. Frontend: UI Components

#### FloatingProgressPanel

**Location:** `packages/web/src/features/tests/components/progress/FloatingProgressPanel.tsx`

**Features:**

- ✅ Real-time progress updates
- ✅ Minimize/maximize functionality
- ✅ Auto-hide after completion (5 seconds)
- ✅ Time estimates (elapsed/remaining)
- ✅ Currently running tests list (up to 3 visible)

**Component Structure:**

```tsx
<FloatingProgressPanel>
  <Header>
    🧪 Running Tests [minimize] [close]
  </Header>

  <ProgressBar percentage={57%} />
  <Stats>8 of 14 tests</Stats>

  <StatusGrid>
    ✅ Passed: 5    ❌ Failed: 0
    ⏭️ Skipped: 1   ⏸️ Pending: 8
  </StatusGrid>

  <CurrentlyRunning>
    🔄 API - Link Budget Item
       api/api.test.ts
    🔄 API - Create Contract
       api/api.test.ts
  </CurrentlyRunning>

  <TimeEstimates>
    ⏱️ Elapsed: 3s    Est. remaining: ~4s
  </TimeEstimates>
</FloatingProgressPanel>
```

**State Management:**

```typescript
// Zustand store
interface TestsState {
    activeProgress: TestProgress | null
    updateProgress: (progress: TestProgress) => void
    clearProgress: () => void
}
```

**Auto-Hide Logic:**

```typescript
useEffect(() => {
    if (
        activeProgress &&
        activeProgress.completedTests === activeProgress.totalTests &&
        activeProgress.totalTests > 0
    ) {
        const timer = setTimeout(() => {
            clearProgress()
        }, 5000)
        return () => clearTimeout(timer)
    }
}, [activeProgress, clearProgress])
```

---

## Data Types

### Core Types

**Location:** `packages/core/src/types/index.ts`

```typescript
export interface TestProgress {
    processId: string
    type: 'run-all' | 'run-group' | 'rerun'
    totalTests: number
    completedTests: number
    passedTests: number
    failedTests: number
    skippedTests: number
    runningTests: RunningTestInfo[]
    startTime: number
    estimatedEndTime?: number
}

export interface RunningTestInfo {
    testId: string
    name: string
    filePath: string
    startedAt: string
    currentStep?: string // Reserved for future step tracking
    stepProgress?: {
        // Reserved for future step tracking
        current: number
        total: number
    }
}

export interface TestProgressUpdate extends WebSocketMessage {
    type: 'test:progress'
    data: TestProgress
}
```

---

## User Experience

### Visual Feedback

#### During Execution

```
┌─────────────────────────────────────┐
│ 🧪 Running Tests              − ✕   │
├─────────────────────────────────────┤
│ ████████████░░░░░░░░░░░░░░░░ 43%   │
│ 6 of 14 tests                  43%  │
│                                     │
│ ✅ Passed: 5        ❌ Failed: 0    │
│ ⏭️ Skipped: 1       ⏸️ Pending: 8   │
│                                     │
│ Currently Running:                  │
│ ┌─────────────────────────────────┐ │
│ │🔄 API - Link Budget Item        │ │
│ │  api/api.test.ts                │ │
│ │🔄 API - Create Contract         │ │
│ │  api/api.test.ts                │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ⏱️ Elapsed: 3s   Est. remaining: ~4s│
└─────────────────────────────────────┘
```

#### Minimized

```
┌──────────────────────────┐
│ 🔄 6/14 tests  43%       │
└──────────────────────────┘
```

---

## Performance Considerations

### API Load

**Per test execution:**

- 1 request to `/api/tests/test-start` (minimal payload: ~100 bytes)
- 1 request to `/api/tests` (full result: ~1-5 KB depending on attachments)
- 2 WebSocket broadcasts per test

**For 100 tests:**

- 200 API requests total
- ~0.5 MB total data transfer
- Negligible server load (in-memory operations)

### Memory Usage

**Server:**

- `activeProcessesTracker` stores running tests in memory
- Average: 200 bytes per running test
- Max (100 parallel tests): ~20 KB

**Client:**

- `activeProgress` state: ~2-5 KB
- No significant memory impact

### Network Optimization

**Why not consolidate into one endpoint?**

❌ **Option A: Single endpoint (on test end only)**

```typescript
// Would only see results AFTER test completes
onTestEnd() → POST /api/tests
// UI shows: "Passed: 5, Failed: 0, Pending: 9"
// Missing: Which tests are running RIGHT NOW?
```

✅ **Option B: Two endpoints (current implementation)**

```typescript
// Real-time visibility
onTestBegin() → POST /test-start → UI: "Running: Test A"
onTestEnd()   → POST /api/tests  → UI: "Test A passed"
```

**Trade-off:** 2x API calls for real-time UX is acceptable for test dashboards where visibility is critical.

---

## Testing

### Backend Tests

**Location:** `packages/server/src/services/__tests__/activeProcesses.service.test.ts`

**Coverage:**

```typescript
describe('Progress Tracking', () => {
    describe('startTest', () => {
        it('should add test to runningTests array')
        it('should handle multiple running tests')
        it('should not duplicate test if already running')
        it('should return null for non-existent process')
    })

    describe('updateProgress', () => {
        it('should update progress and increment completed tests')
        it('should track passed tests correctly')
        it('should calculate estimated end time')
        it('should remove test from runningTests when completed')
    })
})
```

**Location:** `packages/server/src/controllers/__tests__/test.controller.test.ts`

```typescript
describe('testStart', () => {
    it('should handle test start notification')
    it('should return bad request when missing required fields')
    it('should handle test start without WebSocket manager')
    it('should handle errors during test start')
})
```

### Frontend Tests

**Location:** `packages/web/src/features/tests/components/progress/__tests__/FloatingProgressPanel.test.tsx`

**Coverage:** 27 tests

- Conditional rendering
- Progress statistics display
- Running tests list
- Minimize/maximize functionality
- Auto-hide after completion
- Time display formatting

**Location:** `packages/web/src/shared/components/atoms/__tests__/ProgressBar.test.tsx`

**Coverage:** 22 tests

- Rendering with different percentages
- Variant styles (primary/success/danger)
- Height variations
- Label display
- Boundary handling (0-100%)
- Accessibility (ARIA attributes)

---

## Troubleshooting

### Progress Not Displaying

**Symptom:** FloatingProgressPanel doesn't appear during test execution

**Causes:**

1. Reporter not calling `onTestBegin()`
2. API endpoint `/test-start` failing
3. WebSocket connection issues
4. Frontend not subscribed to `test:progress` events

**Debugging:**

```bash
# 1. Check reporter logs
npm run dev
# Look for: "▶️  Starting: test name"

# 2. Check server logs
# Look for: "Started test [name] in process [runId]"

# 3. Check WebSocket connection
# Browser DevTools → Network → WS → test:progress events

# 4. Check frontend state
# React DevTools → Zustand → activeProgress
```

### Incorrect Test Counts

**Symptom:** Progress shows wrong number of tests

**Causes:**

1. Test discovery didn't run before execution
2. Dynamic test generation (test.each)
3. Skipped tests not counted correctly

**Solution:**

```typescript
// Ensure totalTests is set correctly in onBegin
onBegin(_config: FullConfig, suite: Suite) {
  this.notifyProcessStart({
    runId: this.runId,
    type: 'run-all',
    totalTests: suite.allTests().length  // ← Accurate count
  })
}
```

### Missing "Currently Running" Section

**Symptom:** Panel shows statistics but not running tests

**Causes:**

1. Reporter's `onTestBegin()` not calling `notifyTestStart()`
2. `activeProcessesTracker.startTest()` returning null
3. Tests executing too fast (< 100ms)

**Solution:**

```typescript
// Verify startTest is called
Logger.debug(`Started test ${testInfo.name} in process ${runId}`)

// Check runningTests array
const progress = activeProcessesTracker.getProgress(runId)
console.log('Running tests:', progress?.runningTests)
```

---

## Future Enhancements

### Potential Improvements

1. **Step-by-Step Progress**
    - Track individual Playwright steps (currently reserved)
    - Display: "Waiting for page to load (Step 3 of 5)"
    - Requires: Reporter sending step updates

2. **Parallel Test Workers**
    - Show which worker is executing which test
    - Display: "Worker 1: Test A | Worker 2: Test B"
    - Requires: Worker ID in reporter

3. **Historical Progress Comparison**
    - Compare current run speed vs previous runs
    - Display: "Running 20% faster than average"
    - Requires: Storing execution duration history

4. **Live Test Output**
    - Stream console.log from tests to dashboard
    - Display: Real-time logs in expandable section
    - Requires: WebSocket stdout streaming

5. **Progress Notifications**
    - Desktop notifications for long-running suites
    - Display: "Test suite 80% complete"
    - Requires: Browser Notification API

---

## Related Documentation

- [WebSocket Communication](../ARCHITECTURE.md#websocket-communication)
- [Reporter Integration](../REPORTER.md)
- [API Reference](../API_REFERENCE.md#test-execution-endpoints)
- [Testing Guide](../TESTING.md)

---

## Changelog

### v1.0.1 (October 2025)

- ✅ Initial implementation
- ✅ Real-time progress tracking
- ✅ FloatingProgressPanel component
- ✅ Time estimation algorithm
- ✅ Auto-hide after completion
- ✅ Comprehensive test coverage (66 tests)

### Optimization (October 2025)

- 🗑️ Removed unused `updateTestStep()` method
- ⚡ Reduced code by ~30 lines
- ✅ Maintained 100% functionality

---

**Last Updated:** October 28, 2025
**Maintained by:** Yurii Shvydak
