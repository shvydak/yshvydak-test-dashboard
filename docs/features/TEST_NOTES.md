# Test Notes Feature

**Status:** ✅ Implemented (December 2024)
**Version:** 1.3.0 (Updated with filter support and image support)

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
- **Image Support** ✨ (v1.3.0): Embed images directly in notes
    - Drag & drop images into the note editor
    - Paste images from clipboard (e.g., screenshots)
    - Images display as clickable thumbnails inline with text
    - Click thumbnail to view full-size image in lightbox modal
    - Maximum file size: 5MB per image
    - Supported formats: PNG, JPEG, GIF, WebP, and other image formats
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
- Click note area to edit (no separate Edit button needed)
- Confirmation dialog before deletion
- Loading states during save/delete operations
- Visual feedback for drag & drop image uploads
- Error handling with user-friendly messages

### 6. **Filter by Notes**

- Dedicated "Noted" filter in test list
- Shows only tests that have notes attached
- Count badge displays number of noted tests
- Works seamlessly with search functionality
- Helps quickly identify documented tests and issues

## User Interface

### Test Row (Table View)

- Shows truncated note (50 chars) with 💬 icon
- Clickable links work directly from the preview
- Displays below test name when note exists

### Test Detail Modal

- Full note editor in the Overview tab
- Positioned next to "Attachments" heading
- Edit mode with textarea and character counter
- Drag & drop or paste images directly into textarea
- View mode with clickable links and image thumbnails
- Click image thumbnail to view full size in lightbox
- Clean empty state when no note exists

### Filter View (Test List)

- "Noted" filter button in FilterButtonGroup
- Shows count of tests with notes (e.g., "Noted (5)")
- Filters tests to show only those with non-empty notes
- Combines with search query for refined filtering
- Visual indicator matches other status filters (All, Passed, Failed, etc.)

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

CREATE TABLE IF NOT EXISTS note_images (
    id TEXT PRIMARY KEY,
    test_id TEXT NOT NULL REFERENCES test_notes(test_id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    mime_type TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_note_images_test_id ON note_images(test_id);
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

**Image Endpoints** ✨ (v1.3.0):

```
POST /api/tests/:testId/notes/images
Content-Type: multipart/form-data
Body: FormData with 'image' field
Response: { success: true, data: NoteImage }

GET /api/tests/:testId/notes/images
Response: { success: true, data: NoteImage[] }

DELETE /api/tests/:testId/notes/images/:imageId
Response: { success: true, data: { message: "Image deleted successfully" } }
```

See [API Reference](../../API_REFERENCE.md#test-note-images) for detailed endpoint documentation.

### Architecture Pattern

Follows the project's Repository Pattern:

```
Controller → Service → Repository → Database
```

**Backend:**

- `note.controller.ts` - Request handling and validation
- `note.service.ts` - Business logic and validation
- `note.repository.ts` - Database operations
- `noteImage.controller.ts` ✨ (v1.3.0) - Image upload/retrieval/deletion
- `noteImage.service.ts` ✨ (v1.3.0) - Image business logic and validation
- `noteImage.repository.ts` ✨ (v1.3.0) - Image metadata database operations
- `noteImageManager.ts` ✨ (v1.3.0) - Image file storage operations

**Frontend:**

- `TestNoteEditor.tsx` - Main editor component with drag & drop/paste support
- `NoteContentRenderer.tsx` ✨ (v1.3.0) - Renders note with text and images
- `NoteImageThumbnail.tsx` ✨ (v1.3.0) - Image thumbnail component
- `NoteImageLightbox.tsx` ✨ (v1.3.0) - Full-size image modal
- `LinkifiedText.tsx` - URL linkification component
- `linkify.util.ts` - URL parsing and text truncation
- `noteContent.util.ts` ✨ (v1.3.0) - Note content parsing with image markers
- `note.service.ts` - API integration
- `noteImage.service.ts` ✨ (v1.3.0) - Image API integration
- `useNoteImages.ts` ✨ (v1.3.0) - React Query hook for images
- `useTestFilters.ts` - Filtering logic including "Noted" filter
- `constants.ts` - Filter options including "noted" key

### Type Definitions

**TypeScript Interfaces:**

```typescript
export interface TestNote {
    testId: string
    content: string
    createdAt: string
    updatedAt: string
}

export interface NoteImage {
    id: string
    testId: string
    fileName: string
    fileSize: number
    mimeType: string
    url: string
    createdAt: string
}

export interface TestResult {
    // ... other fields
    note?: TestNote
}
```

**Note Content Format:**

Images are embedded in note content using markers:

- Format: `[IMAGE:image-id]`
- Example: `"Check this screenshot: [IMAGE:img-abc123] for details"`
- Markers are parsed and replaced with image thumbnails in the UI

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

### Adding Images ✨ (v1.3.0)

**Method 1: Drag & Drop**

1. Open test detail modal and click on note area to edit
2. Drag an image file from your computer into the textarea
3. Image uploads automatically and appears as a thumbnail
4. Image marker `[IMAGE:image-id]` is inserted at cursor position

**Method 2: Paste from Clipboard**

1. Open test detail modal and click on note area to edit
2. Take a screenshot or copy an image to clipboard
3. Paste (Ctrl+V / Cmd+V) into the textarea
4. Image uploads automatically and appears as a thumbnail

**Viewing Images:**

- Images display as small clickable thumbnails inline with text
- Click any thumbnail to open full-size image in lightbox modal
- Press ESC or click outside to close lightbox
- Images are stored permanently and persist across test runs

**Example note with image:**

```
This test is flaky due to timing issues.
Screenshot: [IMAGE:img-abc123]
Known bug: https://github.com/example/repo/issues/123
```

### Filtering Tests with Notes

1. Click "Noted" filter button in test list header
2. View only tests that have notes attached
3. Count badge shows total number of noted tests (e.g., "Noted (5)")
4. Combine with search to find specific noted tests

**Use cases:**

- Quickly review all documented test issues
- Find tests with tracking links
- Review flaky tests with notes
- Audit test documentation coverage
- Identify tests requiring attention

**Example workflow:**

1. Click "Noted" filter → Shows 12 tests with notes
2. Search for "flaky" → Narrows to 3 flaky tests with documentation
3. Click test → Review note and attached bug tracking link
4. Take action based on documented issue

### Editing a Note

1. Click on the note area (no separate Edit button needed)
2. Modify content in textarea
3. Add images by dragging, dropping, or pasting
4. Click "Save" to confirm or "Cancel" to revert

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

- ✅ `useTestFilters.test.ts` - 19+ tests
    - Filter by noted status
    - Count tests with notes
    - Combine with search functionality
    - Edge cases (empty notes, no notes)

**Total:** 209+ unit tests

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
8. **Image Editing**: Crop, resize, or annotate images

## Migration Notes

### From No Notes to v1.2.0

1. Database migration runs automatically on first startup
2. Schema update adds `test_notes` table
3. No impact on existing test data
4. Backwards compatible with old data

### v1.3.0 - Filter Enhancement & Image Support

1. Database migration adds `note_images` table (automatic on startup)
2. New "Noted" filter automatically available in UI
3. Image support added (drag & drop, paste from clipboard)
4. Filter logic implemented client-side
5. Backwards compatible with v1.2.0

### API Changes

**v1.2.0:**

- New endpoints: `/api/tests/:testId/notes`
- No breaking changes to existing endpoints
- TestResult interface extended (optional `note` field)

**v1.3.0:**

- New endpoints: `/api/tests/:testId/notes/images` (POST, GET, DELETE)
- Static file serving: `/note-images` (JWT protected)
- NoteImage interface added to core types
- No breaking changes to existing endpoints

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

### Image Not Uploading

1. Check file size (max 5MB)
2. Verify file is a valid image format
3. Check browser console for errors
4. Ensure network connection is stable

### Image Not Displaying

1. Verify image was uploaded successfully
2. Check if image marker `[IMAGE:image-id]` is in note content
3. Refresh note data
4. Check browser console for image loading errors

## Resources

- **Implementation**: [@/features/tests/components/testDetail/TestNoteEditor.tsx](../../packages/web/src/features/tests/components/testDetail/TestNoteEditor.tsx)
- **Image Components**: [@/features/tests/components/testDetail/NoteContentRenderer.tsx](../../packages/web/src/features/tests/components/testDetail/NoteContentRenderer.tsx)
- **Filter Logic**: [@/features/tests/hooks/useTestFilters.ts](../../packages/web/src/features/tests/hooks/useTestFilters.ts)
- **Image Hook**: [@/features/tests/hooks/useNoteImages.ts](../../packages/web/src/features/tests/hooks/useNoteImages.ts)
- **API Controllers**:
    - [@/controllers/note.controller.ts](../../packages/server/src/controllers/note.controller.ts)
    - [@/controllers/noteImage.controller.ts](../../packages/server/src/controllers/noteImage.controller.ts)
- **Database Schema**: [@/database/schema.sql](../../packages/server/src/database/schema.sql)
- **Tests**: See `__tests__` directories in respective packages

---

**Last Updated:** January 15, 2025 (v1.3.0 - Added filter support and image support)
**Maintained by:** Yurii Shvydak
