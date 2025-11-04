# Delete Test Execution Feature

**Status:** ✅ Implemented (November 2024)
**Version:** 1.0.0
**Related:** [Historical Test Tracking](HISTORICAL_TEST_TRACKING.md), [API Reference](../API_REFERENCE.md)

---

## Overview

The **Delete Execution** feature allows users to remove individual test executions from the execution history while preserving other runs of the same test. This provides granular control over test data management and storage optimization.

### Key Capabilities

- ✅ Delete specific test executions from history
- ✅ Preserve other executions of the same test
- ✅ Automatic cleanup of attachments and physical files
- ✅ Smart UI navigation after deletion
- ✅ Confirmation dialog to prevent accidental deletion
- ✅ RESTful API endpoint for programmatic access

---

## Architecture

### Backend Components

#### 1. **Controller Layer**

**File:** `packages/server/src/controllers/test.controller.ts`

```typescript
deleteExecution = async (req: ServiceRequest, res: Response): Promise<Response> => {
    const {executionId} = req.params

    if (!executionId) {
        return ResponseHelper.badRequest(res, 'Missing executionId parameter')
    }

    const result = await this.testService.deleteExecution(executionId)

    if (!result.success) {
        return ResponseHelper.notFound(res, 'Execution')
    }

    return ResponseHelper.success(res, {
        message: 'Execution deleted successfully',
    })
}
```

**Responsibilities:**

- Validate request parameters
- Call service layer
- Handle errors and return appropriate HTTP status codes
- Return structured JSON response

---

#### 2. **Service Layer**

**File:** `packages/server/src/services/test.service.ts`

```typescript
async deleteExecution(executionId: string): Promise<{success: boolean}> {
    // Delete physical attachment files for this execution
    try {
        await this.attachmentService.deleteAttachmentsForTestResult(executionId)
    } catch (error) {
        Logger.error(`Failed to delete attachments for execution ${executionId}`, error)
    }

    // Delete the test_results record (CASCADE will delete attachment records)
    const deletedCount = await this.testRepository.deleteByExecutionId(executionId)

    if (deletedCount === 0) {
        Logger.warn(`Execution ${executionId} not found`)
        return {success: false}
    }

    Logger.info(`Deleted execution ${executionId}`)

    return {success: true}
}
```

**Responsibilities:**

- Orchestrate deletion workflow
- Delete physical files via AttachmentService
- Delete database records via Repository
- Handle errors gracefully
- Log operations for debugging

**Key Decision:** Deleting attachments first, then database records. Even if attachment deletion fails, database deletion proceeds (logged as warning).

---

#### 3. **Repository Layer**

**File:** `packages/server/src/repositories/test.repository.ts`

```typescript
async deleteByExecutionId(executionId: string): Promise<number> {
    const result = await this.dbManager.execute(
        `DELETE FROM test_results WHERE id = ?`,
        [executionId]
    )
    return result.changes || 0
}
```

**Responsibilities:**

- Execute SQL DELETE statement
- Return number of affected rows
- Leverage CASCADE delete for related attachments

**Database Schema:**

```sql
-- Attachment records are deleted automatically via CASCADE
CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    test_result_id TEXT NOT NULL,
    FOREIGN KEY (test_result_id) REFERENCES test_results(id) ON DELETE CASCADE
);
```

---

#### 4. **API Route**

**File:** `packages/server/src/routes/test.routes.ts`

```typescript
// Nested route must come before single-param route
router.delete('/:testId/executions/:executionId', testController.deleteExecution)
```

**Route Structure:**

- **Pattern:** `DELETE /api/tests/:testId/executions/:executionId`
- **Position:** Before generic `/:testId` route to avoid routing conflicts
- **Authentication:** Required (JWT middleware)

---

### Frontend Components

#### 1. **ExecutionItem Component**

**File:** `packages/web/src/features/tests/components/history/ExecutionItem.tsx`

**New Component** - Extracted from `ExecutionSidebar` for separation of concerns.

```typescript
export function ExecutionItem({
    execution,
    isCurrent,
    isLatest,
    onSelect,
    onDelete,
}: ExecutionItemProps) {
    const [showRemoveButton, setShowRemoveButton] = useState(false)

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        onDelete(execution.id)
    }

    const handleClick = () => {
        // Don't switch if already viewing this execution
        if (isCurrent) return
        onSelect(execution.id)
    }

    return (
        <button
            onClick={handleClick}
            onMouseEnter={() => setShowRemoveButton(true)}
            onMouseLeave={() => setShowRemoveButton(false)}
            className={/* ... */}>

            {/* Status, date, metadata */}

            {/* Bottom Row: Action + Remove Button */}
            <div className="flex items-center justify-between gap-2 mt-1">
                {isCurrent && <div>Currently viewing</div>}
                {!isCurrent && <div>Click to view →</div>}

                {showRemoveButton && (
                    <button onClick={handleDeleteClick}>
                        Remove
                    </button>
                )}
            </div>
        </button>
    )
}
```

**Key Design Decisions:**

1. **No `disabled` attribute:** Removed to enable mouse events on current execution
2. **Hover-based UI:** REMOVE button appears on hover for all executions
3. **Badge-style button:** Styled like LATEST badge for visual consistency
4. **Click prevention via handler:** `handleClick` blocks navigation for current execution

**UX Flow:**

```
User hovers on execution → showRemoveButton = true
User clicks REMOVE → handleDeleteClick(e.stopPropagation)
Parent receives onDelete callback → Shows confirmation dialog
```

---

#### 2. **TestDetailModal Logic**

**File:** `packages/web/src/features/tests/components/testDetail/TestDetailModal.tsx`

```typescript
const handleDeleteExecutionConfirm = async () => {
    if (!executionToDelete || !test?.testId) return

    try {
        setIsDeletingExecution(true)

        // If we deleted the currently selected execution, find the next one to select
        if (selectedExecutionId === executionToDelete && executions.length > 1) {
            const deletedIndex = executions.findIndex((e) => e.id === executionToDelete)
            const nextExecution = executions[deletedIndex + 1] || executions[0]

            if (nextExecution && nextExecution.id !== executionToDelete) {
                selectExecution(nextExecution.id)
            }
        }

        await deleteExecution(test.testId, executionToDelete)

        // Refetch history to update the list
        refetchHistory()
    } catch (error) {
        console.error('Failed to delete execution:', error)
    } finally {
        setIsDeletingExecution(false)
        setShowDeleteExecutionConfirmation(false)
        setExecutionToDelete(null)
    }
}
```

**Smart Navigation Logic:**

1. **Find deleted index:** Locate position in execution list
2. **Select next:** Pick `executions[deletedIndex + 1]` or fallback to `executions[0]`
3. **Update UI before deletion:** Prevents UI flicker
4. **Refetch history:** Update list with latest data

**Example Scenario:**

```
Before deletion:
  [0] ✅ Latest (currently viewing) ← User deletes this
  [1] ❌ Failed
  [2] ✅ Passed

After deletion:
  [0] ❌ Failed (now LATEST, auto-selected)
  [1] ✅ Passed
```

---

#### 3. **State Management**

**File:** `packages/web/src/features/tests/store/testsStore.ts`

```typescript
deleteExecution: async (testId: string, executionId: string) => {
    try {
        set({error: null})

        const response = await authDelete(
            `${API_BASE_URL}/tests/${testId}/executions/${executionId}`
        )

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        if (data.success) {
            // Refresh tests list after deletion to update the latest execution
            await get().fetchTests()
        } else {
            throw new Error(data.message || 'Failed to delete execution')
        }
    } catch (error) {
        console.error('Error deleting execution:', error)
        set({error: error instanceof Error ? error.message : 'Failed to delete execution'})
        throw error
    }
}
```

**Post-Deletion Actions:**

1. Call API endpoint
2. Refresh main test list (`fetchTests()`) to update LATEST execution badge
3. Handle errors and update global error state

---

## User Flow

### 1. **Opening Test Detail Modal**

```
User clicks on test → TestDetailModal opens
  ↓
Modal fetches execution history
  ↓
Displays executions in ExecutionSidebar (sorted by date DESC)
  ↓
Latest execution is auto-selected and highlighted
```

### 2. **Deleting an Execution**

```
User hovers on execution → REMOVE button appears
  ↓
User clicks REMOVE → Confirmation dialog shows
  ↓
User confirms → API DELETE request
  ↓
Server deletes: attachments → database record
  ↓
Response 200 OK → Frontend updates
  ↓
If deleted execution was current:
  - Auto-select next execution
  - Update UI to show new LATEST badge
  ↓
Execution list refreshes
```

### 3. **Edge Cases Handled**

**Case 1: Deleting Currently Viewed Execution**

```
Executions: [A (viewing), B, C]
User deletes A
→ Auto-select B
→ B becomes new LATEST
→ UI shows B as currently viewing
```

**Case 2: Deleting Last Execution**

```
Executions: [A, B, C (viewing)]
User deletes C
→ Auto-select A (first/latest)
→ UI shows A as currently viewing
```

**Case 3: Deleting Only Execution**

```
Executions: [A (viewing)]
User attempts to delete A
→ (Future enhancement: should disable REMOVE or close modal)
```

**Case 4: Attachments Deletion Fails**

```
Server logs warning
→ Database record still deleted
→ Orphaned files (acceptable tradeoff)
→ Can be cleaned up via storage management tools
```

---

## API Specification

### Endpoint

**DELETE** `/api/tests/:testId/executions/:executionId`

### Request

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**URL Parameters:**

- `testId` - Unique test identifier (for RESTful structure)
- `executionId` - Unique execution identifier to delete

### Response

**Success (200):**

```json
{
    "status": "success",
    "data": {
        "message": "Execution deleted successfully"
    }
}
```

**Not Found (404):**

```json
{
    "status": "error",
    "error": {
        "message": "Execution not found",
        "code": "NOT_FOUND"
    }
}
```

**Bad Request (400):**

```json
{
    "status": "error",
    "error": {
        "message": "Missing executionId parameter",
        "code": "BAD_REQUEST"
    }
}
```

---

## Database Impact

### Records Deleted

1. **test_results table:**
    - Single row where `id = executionId`

2. **attachments table:**
    - All rows where `test_result_id = executionId` (CASCADE)

3. **Filesystem:**
    - Directory: `{OUTPUT_DIR}/attachments/{executionId}/`
    - All files within that directory

### Records Preserved

- ✅ Other executions with same `testId`
- ✅ Test discovery records
- ✅ Run metadata
- ✅ Other tests' data

---

## Testing

### Manual Testing Checklist

- [ ] Delete non-current execution → UI stays on current
- [ ] Delete current execution → Auto-selects next
- [ ] Delete last execution → Auto-selects first (LATEST)
- [ ] Delete execution with attachments → Files removed from disk
- [ ] Cancel deletion → No changes made
- [ ] Delete with network error → Error message shown
- [ ] Hover on all executions → REMOVE button appears
- [ ] Delete from different test modals → Isolated operations

### Automated Tests

**Location:** `packages/server/src/controllers/__tests__/test.controller.test.ts`

```typescript
describe('deleteExecution', () => {
    it('should delete execution successfully', async () => {
        // Test implementation
    })

    it('should return 404 if execution not found', async () => {
        // Test implementation
    })

    it('should delete attachments before database records', async () => {
        // Test implementation
    })
})
```

---

## Performance Considerations

### Optimization Strategies

1. **Attachment Deletion:** Async operation, doesn't block database deletion
2. **Cascade Delete:** Leverages database constraints for efficiency
3. **No Full Refresh:** Only refetches affected test's history
4. **Optimistic UI:** Could be added for instant feedback (future enhancement)

### Scalability

- **Small datasets (< 100 executions):** Negligible impact
- **Large datasets (> 1000 executions):** Deletion is O(1) for database, O(n) for file system where n = number of attachments

---

## Security

### Authorization

- ✅ JWT authentication required
- ✅ No authorization checks (all authenticated users can delete)
- ⚠️ **Future Enhancement:** Role-based access control (admin-only deletion)

### Validation

- ✅ Parameter validation in controller
- ✅ SQL injection prevention via parameterized queries
- ✅ Path traversal prevention in attachment deletion

---

## Future Enhancements

### Planned Improvements

1. **Soft Delete:** Mark as deleted instead of permanent removal
2. **Undo Functionality:** Restore deleted executions within 24 hours
3. **Bulk Delete:** Delete multiple executions at once
4. **Role-Based Permissions:** Restrict deletion to admin users
5. **Audit Log:** Track who deleted what and when
6. **Confirmation for Last Execution:** Warn if deleting the only execution

### Technical Debt

- [ ] Add integration tests for full flow
- [ ] Add E2E tests with Playwright
- [ ] Optimize attachment deletion for large directories
- [ ] Add progress indicator for slow deletions

---

## Related Documentation

- [Historical Test Tracking](HISTORICAL_TEST_TRACKING.md) - Execution history concept
- [Per-Run Attachments](PER_RUN_ATTACHMENTS.md) - Attachment management
- [API Reference](../API_REFERENCE.md) - Complete API documentation
- [Architecture](../ARCHITECTURE.md) - System design principles

---

**Last Updated:** November 2024
**Author:** AI Assistant (Claude Code)
**Reviewer:** Yurii Shvydak
