# Timestamp Management & Data Consistency

## Overview

The YShvydak Test Dashboard implements **proper timestamp tracking** to ensure accurate test execution history and UI updates. This document describes the architecture and implementation details of timestamp management.

## Problem Statement

**Original Issue:** After clearing data and discovering tests, the "Last Run" field showed discovery timestamps instead of "N/A". Additionally, timestamps were not updating when tests were re-executed.

## Architecture

### Database Layer

**Schema Design:**
```sql
CREATE TABLE test_results (
    id TEXT PRIMARY KEY,
    -- ... other fields ...
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- ... other fields ...
);

-- Automatic timestamp updates
CREATE TRIGGER update_test_results_timestamp 
    AFTER UPDATE ON test_results
BEGIN
    UPDATE test_results SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

**Key Features:**
- `created_at` - When the test record was first created (discovery or first execution)
- `updated_at` - When the test was last executed (auto-updated by trigger)
- SQLite triggers ensure `updated_at` is automatically maintained

### Repository Layer

**Data Mapping:**
```typescript
private mapRowToTestResult(row: TestResultRow): TestResult {
    return {
        // ... other fields ...
        timestamp: row.created_at,    // Legacy compatibility
        createdAt: row.created_at,    // Explicit creation time
        updatedAt: row.updated_at,    // Explicit update time
        // ... other fields ...
    }
}
```

**Key Features:**
- Converts `snake_case` database fields to `camelCase` API responses
- Provides multiple timestamp fields for different use cases
- Maintains backward compatibility with existing `timestamp` field

### API Layer

**Controller-Service-Repository Pattern:**
- All `/api/tests` endpoints use unified architecture
- No direct SQL in controllers - all data access through repositories
- Consistent response format with proper timestamp mapping

### Frontend Layer

**Display Logic:**
```typescript
function formatLastRun(test: any): string {
    // For pending tests (discovered but never run), show N/A
    if (test.status === 'pending') {
        return 'N/A'
    }
    
    // For executed tests, use updatedAt (most recent), then fallbacks
    const dateValue = test.updatedAt || test.updated_at || 
                     test.createdAt || test.created_at || test.timestamp

    if (!dateValue) {
        return 'N/A'
    }
    
    return new Date(dateValue).toLocaleString()
}
```

**Key Features:**
- Different display logic for pending vs executed tests
- Prioritizes `updatedAt` for "Last Run" display
- Graceful fallbacks for backward compatibility

## Implementation Timeline

### September 2024 - Architecture Migration

**Major Changes:**
1. **Removed Legacy Code**: Eliminated duplicate API files (`api/tests.ts`, `api/runs.ts`, `api/attachments.ts`)
2. **Unified Architecture**: All endpoints now use Controller-Service-Repository pattern
3. **Enhanced Data Types**: Added `createdAt` and `updatedAt` fields to `TestResultData` interface
4. **Clean Codebase**: Removed debug files, duplicate DatabaseManager, and temporary logging

**Technical Improvements:**
- Single source of truth for timestamp handling
- Consistent data mapping across all API endpoints
- Proper separation of concerns in layered architecture
- Eliminated code duplication and maintenance overhead

## Testing & Validation

**Timestamp Flow Verification:**
1. **Discovery**: Tests get `created_at` timestamp, `status = 'pending'`
2. **Execution**: Tests get updated `updated_at` timestamp, `status = 'passed/failed/skipped'`
3. **Display**: UI shows "N/A" for pending, execution time for completed tests

**API Response Validation:**
```json
{
  "testId": "test-66jqtq",
  "name": "API - Change Action Status",
  "status": "passed",
  "timestamp": "2025-09-24 13:41:11",    // Legacy field (created_at)
  "createdAt": "2025-09-24 13:41:11",   // Discovery time
  "updatedAt": "2025-09-24 13:44:50"    // Last execution time
}
```

## Best Practices

### For Developers

1. **Use Repository Layer**: Never bypass repository for database access
2. **Respect Data Types**: Use proper TypeScript interfaces for all data
3. **Maintain Consistency**: Follow existing patterns for new timestamp fields
4. **Test Edge Cases**: Verify behavior for pending, executed, and re-executed tests

### For Users

- **"Last Run"** shows actual test execution time, not discovery time
- **Pending tests** display "N/A" or "Not run" appropriately  
- **Re-executed tests** show updated timestamps immediately
- **Page refreshes** maintain accurate timestamp display

## Troubleshooting

**Common Issues:**
- **Null timestamps**: Check repository mapping and API response structure
- **Stale timestamps**: Verify database triggers are working
- **Display inconsistencies**: Check frontend display logic and fallback priorities

**Debug Steps:**
1. Verify database schema has `created_at` and `updated_at` fields
2. Check repository mapping returns `createdAt` and `updatedAt` 
3. Confirm API responses include all timestamp fields
4. Test frontend display logic with different test states

## Related Documentation

- [Test Display Consistency](./TEST_DISPLAY.md) - Overall test consistency architecture
- [CLAUDE.md](../CLAUDE.md) - Main project documentation
- Server repository layer: `packages/server/src/repositories/test.repository.ts`
- Frontend display logic: `packages/web/src/components/TestsList.tsx`
