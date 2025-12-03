# Test Notes Feature

**Status:** ✅ Implemented (December 2024)
**Version:** 1.2.0

## Overview

The Test Notes feature allows users to add, edit, and delete notes for individual tests in the dashboard. Notes are stored at the test level (not per execution), making them persistent across multiple test runs. This feature is particularly useful for documenting:

- Flaky test status and known issues
- Bug tracking links
- Test maintenance notes
- Expected behavior documentation
- Links to related issues or pull requests

## Key Features

### 1. **Persistent Notes**

- Notes are stored at the test level using `testId`
- Persist across multiple test executions
- Independent of test run history

### 2. **Rich Text Support**

- **URL Auto-Detection**: Automatically detects and makes URLs clickable
- **Supported URL formats**:
    - HTTPS URLs: `https://example.com`
    - HTTP URLs: `http://example.com`
    - WWW URLs: `www.example.com` (auto-prefixed with https://)
- **Special Characters**: Full support for special characters and emojis
- **Multiline Support**: Preserves line breaks and formatting

### 3. **Character Limit**

- Maximum 1000 characters per note
- Real-time character counter
- Visual warning when approaching limit (< 100 chars remaining)

### 4. **Truncated Preview**

- Notes displayed in TestRow are truncated to 50 characters
- Truncation respects word boundaries
- Full note visible in test detail modal

### 5. **User-Friendly Interface**

- Add/Edit/Delete operations with clear UI
- Confirmation dialog before deletion
- Loading states during save/delete operations
- Error handling with user-friendly messages

## User Interface

### Test Row (Table View)

- Shows truncated note (50 chars) with 💬 icon
- Clickable links work directly from the preview
- Displays below test name when note exists

### Test Detail Modal

- Full note editor in the Overview tab
- Positioned next to "Attachments" heading
- Edit mode with textarea and character counter
- View mode with clickable links
- Clean empty state when no note exists

## Technical Architecture

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS test_notes (
    test_id TEXT PRIMARY KEY,
    content TEXT NOT NULL CHECK(length(content) <= 1000),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS update_test_notes_updated_at
    AFTER UPDATE ON test_notes
    FOR EACH ROW
BEGIN
    UPDATE test_notes SET updated_at = CURRENT_TIMESTAMP WHERE test_id = NEW.test_id;
END;
```

### API Endpoints

**Get Note:**

```
GET /api/tests/:testId/notes
Response: { success: true, data: TestNote | null }
```

**Save/Update Note:**

```
POST /api/tests/:testId/notes
Body: { content: string }
Response: { success: true, message: "Note saved successfully" }
```

**Delete Note:**

```
DELETE /api/tests/:testId/notes
Response: { success: true, message: "Note deleted successfully" }
```

### Architecture Pattern

Follows the project's Repository Pattern:

```
Controller → Service → Repository → Database
```

**Backend:**

- `note.controller.ts` - Request handling and validation
- `note.service.ts` - Business logic and validation
- `note.repository.ts` - Database operations

**Frontend:**

- `TestNoteEditor.tsx` - Main editor component
- `LinkifiedText.tsx` - URL linkification component
- `linkify.util.ts` - URL parsing and text truncation
- `note.service.ts` - API integration

### Type Definitions

**TypeScript Interface:**

```typescript
export interface TestNote {
    testId: string
    content: string
    createdAt: string
    updatedAt: string
}

export interface TestResult {
    // ... other fields
    note?: TestNote
}
```

## Usage Examples

### Adding a Note

1. Open test detail modal
2. Click "Add Note" button in Overview tab
3. Enter note text (max 1000 chars)
4. Click "Save"

**Example note:**

```
This test is flaky due to timing issues.
Known bug: https://github.com/example/repo/issues/123
Workaround: Increase timeout to 5s
```

### Including Links

Notes automatically detect and linkify URLs:

```
Bug report: https://jira.example.com/browse/BUG-456
Documentation: www.example.com/docs
API endpoint: http://api.example.com/v1/tests
```

All URLs open in a new tab with `rel="noopener noreferrer"` for security.

### Editing a Note

1. Click "Edit" button next to existing note
2. Modify content in textarea
3. Click "Save" to confirm or "Cancel" to revert

### Deleting a Note

1. Click "Delete" button next to existing note
2. Confirm deletion in dialog
3. Note is permanently removed

## Validation Rules

### Content Validation

1. **Required**: Content cannot be empty or whitespace-only
2. **Length**: Maximum 1000 characters
3. **Trimming**: Leading/trailing whitespace is automatically trimmed
4. **Preservation**: Internal whitespace and line breaks are preserved

### Input Sanitization

- **Controller Level**: Validates content is a non-empty string
- **Service Level**: Trims and validates length
- **Repository Level**: Database-level length constraint
- **Frontend**: maxLength attribute + client-side validation

## Error Handling

### User-Facing Errors

- `"Note content cannot be empty"` - When trying to save whitespace
- `"Note content exceeds maximum length of 1000 characters"` - Length violation
- `"Failed to save note"` - Network or server error
- `"Failed to delete note"` - Network or server error
- `"Failed to get note"` - Network or server error

### Recovery

- Form remains open on error
- User can retry or cancel
- Error messages displayed inline
- No data loss on error

## Testing

### Test Coverage

**Backend:**

- ✅ `note.repository.test.ts` - 35+ tests
    - CRUD operations
    - Validation (length, empty content)
    - Edge cases (special chars, URLs, newlines)
    - Timestamp management

- ✅ `note.service.test.ts` - 25+ tests
    - Business logic validation
    - Error propagation
    - Whitespace handling

- ✅ `note.controller.test.ts` - 20+ tests
    - HTTP request handling
    - Status codes (200, 201, 400, 500)
    - Request/response formatting

**Frontend:**

- ✅ `linkify.util.test.ts` - 40+ tests
    - URL detection (https, http, www)
    - Text truncation with word boundaries
    - Special characters and edge cases

- ✅ `LinkifiedText.test.tsx` - 30+ tests
    - Rendering plain text and links
    - Link attributes (href, target, rel)
    - CSS classes and styling
    - Click event handling

- ✅ `TestNoteEditor.test.tsx` - 40+ tests
    - Add/Edit/Delete workflows
    - Character counter
    - Validation and error states
    - Loading states

**Total:** 190+ unit tests

### Running Tests

```bash
# All tests
npm test

# Specific package
cd packages/server && npm test
cd packages/web && npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## UI/UX Guidelines

### Design Principles

1. **Non-intrusive**: Notes don't clutter the main test table
2. **Contextual**: Full editor only visible in detail modal
3. **Informative**: Truncated preview shows enough context
4. **Accessible**: Clear labels, buttons, and feedback
5. **Responsive**: Works across different screen sizes

### Visual Indicators

- 💬 Icon: Indicates note presence in table row
- Character counter: Shows remaining space
- Color coding: Red warning when < 100 chars remaining
- Loading states: "Saving..." feedback
- Clickable links: Primary color with hover underline

### Dark Mode Support

All components fully support dark mode:

- Text colors adjust automatically
- Link colors maintain visibility
- Background colors respect theme
- Consistent with dashboard theme

## Performance Considerations

### Database

- Indexed on `test_id` (PRIMARY KEY)
- Efficient LEFT JOIN in test queries
- Minimal overhead on test retrieval

### Frontend

- Lazy loading: Editor only in detail modal
- No re-renders on unrelated test updates
- Optimized React Query cache invalidation
- Lightweight link parsing algorithm

### Network

- Small payload size (text-only)
- Single API call per operation
- No polling or real-time sync needed

## Future Enhancements

Potential improvements (not currently implemented):

1. **Rich Text Editor**: Markdown support
2. **Mentions**: @user mentions in notes
3. **History**: Track note change history
4. **Templates**: Common note templates
5. **Search**: Search tests by note content
6. **Export**: Include notes in test reports
7. **Bulk Operations**: Add notes to multiple tests
8. **Attachments**: Link files to notes

## Migration Notes

### From No Notes to v1.2.0

1. Database migration runs automatically on first startup
2. Schema update adds `test_notes` table
3. No impact on existing test data
4. Backwards compatible with old data

### API Changes

- New endpoints: `/api/tests/:testId/notes`
- No breaking changes to existing endpoints
- TestResult interface extended (optional `note` field)

## Troubleshooting

### Note Not Saving

1. Check browser console for errors
2. Verify network connection
3. Ensure content is not empty
4. Check character limit (max 1000)

### Links Not Clickable

1. Verify URL format (https://, http://, www.)
2. Check for typos in URL
3. Ensure URL is not truncated mid-link

### Note Not Appearing in Table

1. Verify note was saved successfully
2. Refresh test data
3. Check if test was filtered out
4. Verify testId matches

## Resources

- **Implementation**: [@/features/tests/components/testDetail/TestNoteEditor.tsx](../../packages/web/src/features/tests/components/testDetail/TestNoteEditor.tsx)
- **API Controller**: [@/controllers/note.controller.ts](../../packages/server/src/controllers/note.controller.ts)
- **Database Schema**: [@/database/schema.sql](../../packages/server/src/database/schema.sql)
- **Tests**: See `__tests__` directories in respective packages

---

**Last Updated:** December 2024
**Maintained by:** Yurii Shvydak
