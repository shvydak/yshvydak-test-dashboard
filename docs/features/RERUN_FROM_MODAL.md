# Rerun Test from Modal Window

## Overview

The YShvydak Test Dashboard implements a **rerun test from modal window** feature that allows users to quickly rerun a test directly from the TestDetailModal without navigating away. The feature provides real-time updates via WebSocket integration and automatically displays the latest execution results.

### Core Principle

**Users can rerun tests directly from the test detail modal and immediately see updated results with automatic switching to the latest execution.**

The system ensures that:

- Run button is placed in ExecutionSidebar header next to "EXECUTION HISTORY"
- Button shows loading state during test execution
- All other test actions are disabled while any test is running
- Modal automatically updates with new execution data via WebSocket
- Latest execution is automatically selected after rerun completes
- ExecutionSidebar shows new execution as "LATEST"
- Modal remains open during rerun (user can close/reopen without losing state)

## Architecture

The rerun-from-modal feature follows the project's **Feature-Based Architecture** with clean separation of concerns and reuse of existing components.

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│  TestDetailModal (Modal Container)                          │
│  - WebSocket connection for real-time updates               │
│  - Rerun handler using existing testsStore.rerunTest()      │
│  - Auto-refetch history on completion                       │
│  - Auto-switch to latest execution                          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ├──────────────────┬─────────────────────────┐
                 ▼                  ▼                         ▼
┌──────────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│ ExecutionSidebar     │  │ useTestExecution │  │ testsStore           │
│                      │  │ History Hook     │  │                      │
│ - Run button         │  │                  │  │ - rerunTest()        │
│ - ActionButton UI    │  │ - refetch()      │  │ - runningTests Set   │
│ - Loading state      │  │ - executions[]   │  │ - WebSocket events   │
└──────────────────────┘  └──────────────────┘  └──────────────────────┘
                 │                  │                         │
                 └──────────────────┴─────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────┐
│  WebSocket Real-time Updates                                │
│  - run:completed event with isRerun flag                    │
│  - dashboard:refresh event                                  │
│  - Automatic UI synchronization                             │
└─────────────────────────────────────────────────────────────┘
```

### Frontend Components

#### TestDetailModal

**Location**: `packages/web/src/features/tests/components/testDetail/TestDetailModal.tsx`

**Key Responsibilities**:

- Manage WebSocket connection for modal-specific updates
- Handle rerun completion events
- Trigger history refetch on completion
- Auto-switch to latest execution

**Key Implementation**:

```typescript
// WebSocket URL with JWT authentication
const webSocketUrl = useMemo(() => {
    if (!isOpen) return null
    return getWebSocketUrl()
}, [isOpen])

// Handle rerun completion
const handleRunCompleted = useCallback(
    (data: any) => {
        if (
            data.isRerun &&
            (data.testId === test?.testId || data.originalTestId === currentExecution?.id)
        ) {
            refetchHistory()
            selectExecution(null) // Switch to latest
        }
    },
    [test?.testId, currentExecution?.id, refetchHistory, selectExecution]
)

// Connect WebSocket
useWebSocket(webSocketUrl, {
    onRunCompleted: handleRunCompleted,
})

// Rerun handler
const handleRerun = async (testId: string) => {
    await rerunTest(testId)
}

// Show latest execution when selectedExecutionId is null
const currentExecution = selectedExecutionId
    ? executions.find((e) => e.id === selectedExecutionId) || test
    : executions.length > 0
      ? executions[0]
      : test
```

#### ExecutionSidebar

**Location**: `packages/web/src/features/tests/components/history/ExecutionSidebar.tsx`

**Key Responsibilities**:

- Display Run button in header
- Show loading state during execution
- Disable button when any test is running
- Display execution history list

**Key Implementation**:

```typescript
export interface ExecutionSidebarProps {
    executions: TestResult[]
    currentExecutionId: string
    onSelectExecution: (executionId: string) => void
    testId: string // Execution result ID for rerun
    onRerun: (testId: string) => void
    loading?: boolean
    error?: string
}

// Check running state
const {runningTests, getIsAnyTestRunning} = useTestsStore()
const isRunning = runningTests.has(testId)
const isAnyTestRunning = getIsAnyTestRunning()

// Run button
<ActionButton
    size="sm"
    variant="primary"
    isRunning={isRunning}
    runningText="Running..."
    icon="▶️"
    disabled={isAnyTestRunning}
    onClick={() => onRerun(testId)}>
    Run
</ActionButton>
```

#### useTestExecutionHistory Hook

**Location**: `packages/web/src/features/tests/hooks/useTestExecutionHistory.ts`

**Key Enhancement**: Added `refetch()` function for manual refresh

```typescript
export interface UseTestExecutionHistoryReturn {
    executions: TestResult[]
    loading: boolean
    error: string | null
    refetch: () => void // NEW
}

// RefreshTrigger pattern for manual refetch
const [refreshTrigger, setRefreshTrigger] = useState(0)

const refetch = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1)
}, [])

// Trigger fetch when refreshTrigger changes
useEffect(() => {
    // ... fetch logic
}, [testId, refreshTrigger])
```

### Shared Utilities

#### getWebSocketUrl()

**Location**: `packages/web/src/features/authentication/utils/webSocketUrl.ts`

**Purpose**: Centralized utility for generating WebSocket URLs with JWT authentication

```typescript
export function getWebSocketUrl(includeAuth: boolean = true): string | null {
    if (!includeAuth) {
        return config.websocket.url
    }

    const token = getAuthToken()

    if (!token) {
        return null
    }

    return `${config.websocket.url}?token=${encodeURIComponent(token)}`
}
```

**Benefits**:

- DRY principle - single source of truth for WebSocket URL logic
- Used in both `App.tsx` and `TestDetailModal.tsx`
- Automatic JWT token extraction and encoding
- Clean fallback handling

## User Flow

### Happy Path: Rerun Test from Modal

1. **User opens test detail modal**
    - Modal displays current/latest execution
    - ExecutionSidebar shows Run button (enabled)
    - WebSocket connection established

2. **User clicks Run button**
    - Button shows loading state ("Running...")
    - All test action buttons disabled across dashboard
    - API call: `POST /api/tests/{executionId}/rerun`
    - Test execution starts in background

3. **Test executes**
    - Modal remains open (user can close/reopen)
    - Button continues showing "Running..." state
    - User can view current execution while test runs

4. **Test completes**
    - WebSocket event: `run:completed` with `isRerun: true`
    - Modal callback: `handleRunCompleted()` triggered
    - History refetched: `refetchHistory()` called
    - Auto-switch: `selectExecution(null)` switches to latest
    - Button returns to normal state

5. **Modal updates automatically**
    - New execution appears in ExecutionSidebar as "LATEST"
    - Modal content shows new execution data
    - New attachments displayed (videos, screenshots, traces)
    - Previous executions remain in history

### Edge Cases Handled

#### Case 1: User Closes Modal During Execution

**Scenario**: User clicks Run, then closes modal while test is running

**Behavior**:

- Test continues running in background
- Run button state persists in testsStore
- Reopening modal shows correct "Running..." state
- After completion, history updates normally when modal reopened

#### Case 2: Multiple Executions in History

**Scenario**: Test has been run multiple times

**Behavior**:

- ExecutionSidebar shows all executions (newest first)
- Latest execution marked with "LATEST" badge
- Currently viewed execution marked with "✓ Currently viewing"
- User can switch between any execution
- Run button always reruns the test (not specific execution)

#### Case 3: WebSocket Disconnection

**Scenario**: WebSocket connection drops during rerun

**Behavior**:

- Button remains in loading state
- WebSocket automatically attempts reconnection (exponential backoff)
- On reconnection, receives `connection:status` event
- Modal can manually refetch history if needed

## Technical Implementation Details

### WebSocket Event Flow

When a test is rerun from modal, the following events are broadcast:

1. **`run:completed`** event:

```json
{
    "type": "run:completed",
    "data": {
        "runId": "c3699b22-cbec-4f26-a7cb-8524927b7072",
        "exitCode": 0,
        "testId": "test-xv3dl2", // Stable test identifier
        "testName": "Change Action status",
        "originalTestId": "1b2a658d-d563-4d2d-8f4f-ff8d7d5e151a", // Execution result ID
        "isRerun": true,
        "type": "rerun"
    }
}
```

2. **`dashboard:refresh`** event (via `broadcastDashboardRefresh`):

```json
{
    "type": "dashboard:refresh",
    "data": {
        "testId": "test-xv3dl2",
        "runId": "c3699b22-cbec-4f26-a7cb-8524927b7072",
        "status": "completed",
        "isRerun": true
    }
}
```

### Event Matching Logic

Modal checks if the event matches current test using EITHER:

- `data.testId` (stable test identifier) - matches `test.testId`
- `data.originalTestId` (execution result ID) - matches `currentExecution.id`

This ensures the modal updates correctly regardless of which execution is being viewed.

### State Management

**Zustand Store** (`testsStore.ts`):

- `runningTests: Set<string>` - Tracks currently running tests
- `rerunTest(testId: string)` - Existing method reused for rerun
- `setTestRunning(testId: string, isRunning: boolean)` - Update running state

**Component State**:

- `selectedExecutionId: string | null` - Tracks selected execution in modal
- `null` = latest execution, `string` = specific historical execution

### API Integration

**Endpoint**: `POST /api/tests/:id/rerun`

- `:id` = execution result ID (UUID), not stable testId
- Returns: `{runId, rerunId, status, message}`
- Server broadcasts WebSocket events on completion

## Benefits

### For Users

✅ **Quick Rerun**: One-click rerun without leaving modal
✅ **Real-time Updates**: See results immediately when test completes
✅ **Automatic Switching**: Modal auto-displays latest execution
✅ **History Preserved**: All executions saved and accessible
✅ **Smooth UX**: Loading states, disabled buttons, no confusion

### For Development

✅ **DRY Principle**: Reuses existing components and utilities
✅ **Clean Architecture**: Follows Feature-Based Architecture pattern
✅ **Minimal Code**: Only ~60 lines of new code (after refactoring)
✅ **No Duplication**: Shared WebSocket URL utility
✅ **Type Safe**: Full TypeScript support

## Best Practices Applied

### 1. Component Reuse

- Used existing `ActionButton` component (same as TestRow)
- Used existing `testsStore.rerunTest()` method
- Used existing `useWebSocket` hook pattern

### 2. DRY Principle

- Created shared `getWebSocketUrl()` utility
- Eliminated 45+ lines of duplicated JWT token extraction code
- Single source of truth for WebSocket connection logic

### 3. Production-Ready Code

- No debug logging in production code
- Clean error handling
- Proper TypeScript types
- Follows existing code style

### 4. User Experience

- Clear loading states
- Disabled buttons prevent confusion
- Automatic updates reduce manual actions
- History preservation for debugging

## Related Documentation

- [Architecture Overview](../ARCHITECTURE.md) - Feature-Based Architecture details
- [Historical Test Tracking](./HISTORICAL_TEST_TRACKING.md) - Execution history system
- [Attachment Management](./PER_RUN_ATTACHMENTS.md) - Permanent attachment storage
- [Authentication Implementation](./AUTHENTICATION_IMPLEMENTATION.md) - JWT-based WebSocket auth
- [Development Guidelines](../DEVELOPMENT.md) - Development best practices
- [API Reference](../API_REFERENCE.md) - Complete API endpoints documentation

## Future Enhancements

Potential improvements for this feature:

1. **Keyboard Shortcut**: Add keyboard shortcut (e.g., `Ctrl+R`) to rerun from modal
2. **Progress Indicator**: Show test execution progress percentage
3. **Cancel Button**: Add ability to cancel running test
4. **Rerun with Options**: Allow rerun with different browser/configuration
5. **Batch Rerun**: Select multiple executions to compare or rerun
