# File Location Reference

Complete file structure with annotations for quick navigation. Use this guide to find components, utilities, and architectural elements quickly.

---

## Backend Structure (Layered Architecture)

```
packages/server/src/
├── app.ts                       # Express app setup, middleware, routes
├── server.ts                    # HTTP server startup, port binding
│
├── vitest.config.ts             # Vitest test configuration (Node environment)
├── vitest.setup.ts              # Test setup file (env vars, global mocks)
│
├── config/                      # Configuration management
│   ├── environment.config.ts    # Environment variables with auto-derivation
│   └── constants.ts             # Application constants
│
├── types/                       # TypeScript interfaces
│   ├── test.types.ts           # Test-related types
│   ├── attachment.types.ts     # Attachment types
│   └── api.types.ts            # API request/response types
│
├── utils/                       # Helper utilities
│   ├── ResponseHelper.ts       # Standardized API responses
│   ├── Logger.ts               # Centralized logging
│   └── FileUtil.ts             # File operations and MIME types
│
├── middleware/                  # Express middleware
│   ├── serviceInjection.ts     # Dependency injection into requests
│   ├── auth.middleware.ts      # JWT authentication
│   ├── cors.middleware.ts      # CORS configuration
│   └── errorHandler.ts         # Global error handling
│
├── controllers/                 # HTTP request handlers (thin layer)
│   ├── test.controller.ts      # Test endpoints
│   │   ├── POST /api/tests                    # Save test result
│   │   ├── GET /api/tests                     # Get all tests
│   │   ├── GET /api/tests/:id/history         # Get execution history
│   │   ├── GET /api/tests/:id/attachments     # Get test attachments
│   │   ├── GET /api/tests/flaky               # Get flaky tests
│   │   ├── GET /api/tests/timeline            # Get test timeline
│   │   ├── POST /api/tests/run-all            # Run all tests
│   │   ├── POST /api/tests/run-group          # Run test group
│   │   ├── POST /api/tests/:id/rerun          # Rerun specific test
│   │   ├── POST /api/tests/discovery          # Discover tests
│   │   └── DELETE /api/tests/all              # Clear all tests
│   ├── note.controller.ts      # Test notes endpoints (✨ v1.2.0)
│   │   ├── GET /api/tests/:testId/notes       # Get test note
│   │   ├── POST /api/tests/:testId/notes      # Save/update test note
│   │   └── DELETE /api/tests/:testId/notes    # Delete test note
│   ├── noteImage.controller.ts # Test note images endpoints (✨ v1.3.0)
│   │   ├── POST /api/tests/:testId/notes/images       # Upload image
│   │   ├── GET /api/tests/:testId/notes/images        # Get all images
│   │   └── DELETE /api/tests/:testId/notes/images/:imageId # Delete image
│   ├── run.controller.ts       # Test run lifecycle
│   ├── storage.controller.ts   # Storage statistics (✨ v1.0.4)
│   │   └── GET /api/storage/stats             # Get storage statistics
│   └── auth.controller.ts      # Authentication endpoints
│
├── services/                    # Business logic and orchestration
│   ├── test.service.ts         # Test management
│   │   ├── saveTestResult()            # Save test with validation
│   │   ├── getTestHistory()            # Get execution history with attachments
│   │   ├── getFlakyTests()             # Flaky test detection
│   │   ├── getTestTimeline()           # Daily aggregated stats
│   │   └── rerunTest()                 # Rerun specific test
│   │
│   ├── note.service.ts         # Test notes business logic (✨ v1.2.0)
│   │   ├── saveNote()                  # Save/update note with validation
│   │   │   └── Validation: trim, empty check, 1000 char max
│   │   ├── getNote()                   # Get note by testId
│   │   └── deleteNote()                # Delete note by testId (also deletes images)
│   │
│   ├── noteImage.service.ts    # Test note images business logic (✨ v1.3.0)
│   │   ├── uploadImage()               # Upload image with validation (max 5MB)
│   │   ├── getImages()                 # Get all images for test
│   │   ├── getImageById()              # Get single image by ID
│   │   ├── deleteImage()               # Delete image by ID
│   │   └── deleteImagesByTestId()      # Delete all images for test
│   │
│   ├── __tests__/              # Service layer tests (6 test files, part of 30 total test files, 1,279 tests)
│   ├── playwright.service.ts   # Playwright integration
│   │   ├── discoverTests()             # Scan for tests with --list
│   │   ├── runAllTests()               # Execute all tests
│   │   ├── runTestGroup()              # Execute test group
│   │   ├── generateStableTestId()      # Hash-based test ID (MUST match reporter)
│   │   └── spawnPlaywrightProcess()    # CLI injection with --reporter flag
│   ├── attachment.service.ts   # Attachment lifecycle management
│   │   ├── processAttachments()        # Copy files to permanent storage
│   │   ├── saveAttachmentsForTestResult() # Handle rerun cleanup
│   │   └── getAttachmentsByTestResult() # Load attachments with URLs
│   ├── storage.service.ts      # Storage statistics (✨ v1.0.4)
│   │   └── getStorageStats()           # Get storage stats with error handling
│   └── websocket.service.ts    # Real-time event broadcasting
│       ├── broadcast()                 # Send to all clients
│       └── broadcastToClient()         # Send to specific client
│
├── repositories/                # Data access layer (database operations only)
│   ├── test.repository.ts      # Test CRUD operations
│   │   ├── getTestResultsByTestId()    # Get execution history
│   │   ├── getFlakyTests()             # SQL: GROUP BY testId, calculate failure rate
│   │   └── getTestTimeline()           # SQL: DATE grouping for daily stats
│   │
│   ├── note.repository.ts      # Test notes CRUD (✨ v1.2.0)
│   │   ├── saveNote()                  # INSERT OR REPLACE note
│   │   ├── getNote()                   # SELECT note by testId
│   │   └── deleteNote()                # DELETE note by testId
│   │
│   ├── noteImage.repository.ts # Test note images CRUD (✨ v1.3.0)
│   │   ├── saveImage()                 # INSERT image metadata
│   │   ├── getImagesByTestId()         # SELECT all images for test
│   │   ├── getImageById()              # SELECT image by ID
│   │   ├── deleteImage()               # DELETE image by ID
│   │   └── deleteImagesByTestId()      # DELETE all images for test
│   │
│   ├── __tests__/              # Repository layer tests
│   │
│   ├── run.repository.ts       # Test run CRUD
│   ├── attachment.repository.ts # Attachment database operations
│   │   ├── saveAttachment()            # Insert attachment record
│   │   ├── getAttachmentsByTestResult() # Query by test result ID
│   │   └── getAttachmentsWithUrls()    # Include formatted URLs
│   │
│   └── storage.repository.ts   # Storage statistics (✨ v1.0.4)
│       ├── getStorageStats()           # Get database + attachment storage stats
│       └── getDatabaseStats()          # Calculate SQLite file size (includes WAL/SHM)
│
├── routes/                      # Route definitions
│   ├── test.routes.ts          # Test API routes with dependency injection
│   ├── note.routes.ts          # Test notes API routes (✨ v1.2.0)
│   ├── run.routes.ts           # Run API routes
│   ├── storage.routes.ts       # Storage statistics routes (✨ v1.0.4)
│   └── auth.routes.ts          # Authentication routes
│
├── database/                    # Database management
│   ├── database.manager.ts     # SQLite operations wrapper
│   │   └── saveTestResult()    # ⚠️ CRITICAL: ALWAYS INSERT, never UPDATE
│   └── schema.sql              # Database schema definition
│       ├── test_results table  # Multiple rows per testId = history
│       └── attachments table   # ON DELETE CASCADE cleanup
│
├── websocket/                   # WebSocket server
│   ├── websocket.manager.ts    # Connection management
│   └── handlers/               # WebSocket event handlers
│
└── storage/                     # File storage management
    ├── attachmentManager.ts    # Attachment file operations
    │   ├── copyPlaywrightAttachment()  # Copy to permanent storage
    │   ├── deleteTestAttachments()     # Clean up test files
    │   ├── generateFileName()          # {type}-{timestamp}-{random}.{ext}
    │   ├── ensureTestDirectory()       # Create {OUTPUT_DIR}/attachments/{testResultId}/
    │   └── generateUrl()               # Return /attachments/{testResultId}/{fileName}
    └── noteImageManager.ts     # Note image file operations (✨ v1.3.0)
        ├── saveImage()                 # Save image buffer to {OUTPUT_DIR}/note-images/{testId}/
        ├── deleteImage()               # Delete image file
        ├── deleteImagesByTestId()      # Delete all images for test
        └── generateUrl()               # Return /note-images/{testId}/{fileName}
```

---

## Frontend Structure (Feature-Based Architecture)

```
packages/web/src/
├── main.tsx                     # Application entry point
├── App.tsx                      # Main app component, routing, auth check
│   ├── Authentication flow      # Check token, periodic validation
│   ├── WebSocket setup         # getWebSocketUrl() after auth ready
│   └── Route protection        # LoginPage vs. AuthenticatedApp
│
├── vitest.config.ts             # Vitest test configuration (jsdom environment)
├── vitest.setup.ts              # React Testing Library setup
│
├── config/                      # Configuration
│   └── environment.config.ts   # Import.meta.env with Vite prefix
│
├── features/                    # Feature-based modules
│   │
│   ├── tests/                  # Main test management feature
│   │   ├── components/
│   │   │   ├── TestsList.tsx              # Main test list container
│   │   │   ├── TestsListFilters.tsx       # Filters + "Run All Tests" button
│   │   │   ├── TestsGroupedView.tsx       # Grouped view by file path
│   │   │   ├── TestRow.tsx                # Individual test row with rerun
│   │   │   ├── TestGroupHeader.tsx        # Collapsible group header
│   │   │   │
│   │   │   ├── testDetail/               # Test detail modal sub-components
│   │   │   │   ├── TestDetailModal.tsx   # Modal orchestrator (95 lines)
│   │   │   │   │   ├── WebSocket integration for rerun
│   │   │   │   │   ├── useTestExecutionHistory hook
│   │   │   │   │   └── Auto-switch to latest execution
│   │   │   │   ├── TestDetailHeader.tsx  # Modal header (42 lines)
│   │   │   │   ├── TestDetailTabs.tsx    # Tab navigation (47 lines)
│   │   │   │   ├── TestOverviewTab.tsx   # Overview + attachments (162 lines)
│   │   │   │   ├── TestStepsTab.tsx      # Test steps display (49 lines)
│   │   │   │   ├── TestNoteEditor.tsx    # Test notes editor (✨ v1.2.0, updated v1.3.0)
│   │   │   │       ├── Add/Edit/Delete note functionality
│   │   │   │       ├── Character counter (1000 max)
│   │   │   │       ├── Loading states and error handling
│   │   │   │       ├── Drag & drop image support (✨ v1.3.0)
│   │   │   │       ├── Paste image from clipboard (✨ v1.3.0)
│   │   │   │       └── Integrated with TestOverviewTab
│   │   │   │   ├── NoteContentRenderer.tsx # Render note with images (✨ v1.3.0)
│   │   │   │       ├── Parse [IMAGE:image-id] markers
│   │   │   │       ├── Render text and image thumbnails
│   │   │   │       └── Lightbox integration
│   │   │   │   ├── NoteImageThumbnail.tsx # Image thumbnail component (✨ v1.3.0)
│   │   │   │       └── Clickable thumbnail with loading states
│   │   │   │   └── NoteImageLightbox.tsx  # Full-size image modal (✨ v1.3.0)
│   │   │   │       ├── Modal overlay with blur
│   │   │   │       ├── Keyboard navigation (ESC to close)
│   │   │   │       └── Click outside to close
│   │   │   │
│   │   │   └── history/                  # Execution history components
│   │   │       ├── ExecutionSidebar.tsx  # Always-visible history panel
│   │   │       │   ├── Run button in header
│   │   │       │   ├── Execution list with status badges
│   │   │       │   └── Maps executions to ExecutionItem components
│   │   │       │
│   │   │       └── ExecutionItem.tsx     # Individual execution item (✨ v1.0.0)
│   │   │           ├── Separated from ExecutionSidebar for modularity
│   │   │           ├── Status badge + LATEST indicator
│   │   │           ├── Date, duration, attachment count
│   │   │           ├── Hover-based REMOVE button (all executions)
│   │   │           ├── Click to switch execution (disabled for current)
│   │   │           └── onDelete callback for execution deletion
│   │   │
│   │   ├── hooks/                        # Custom hooks for tests feature
│   │   │   ├── useTestAttachments.ts     # Fetch attachments for test
│   │   │   ├── useTestExecutionHistory.ts # Fetch execution history
│   │   │   │   └── refetch() for manual refresh
│   │   │   ├── useTestFilters.ts         # Filter state management
│   │   │   ├── useTestGroups.ts          # Group tests by file
│   │   │   ├── useTestSort.ts            # Sort tests
│   │   │   └── useNoteImages.ts          # Fetch note images (✨ v1.3.0)
│   │   │       └── React Query integration with caching
│   │   │
│   │   ├── store/                        # Zustand state management
│   │   │   └── testsStore.ts            # Tests state + actions
│   │   │       ├── tests: TestResult[]
│   │   │       ├── runningTests: Set<string>
│   │   │       ├── selectedExecutionId: string | null
│   │   │       ├── fetchTests()
│   │   │       ├── rerunTest()           # Rerun with WebSocket updates
│   │   │       ├── deleteTest()          # Delete all executions of a test
│   │   │       ├── deleteExecution()     # Delete single execution (✨ v1.0.0)
│   │   │       ├── selectExecution()     # Switch history view
│   │   │       └── getIsAnyTestRunning()
│   │   │
│   │   ├── types/                        # TypeScript types
│   │   │   └── attachment.types.ts
│   │   │       ├── Attachment
│   │   │       ├── AttachmentWithBlobURL
│   │   │       └── TabKey
│   │   │
│   │   ├── utils/                        # Helper functions
│   │   │   ├── formatters.ts            # formatDuration, formatDate, formatBytes (✨ v1.0.4), getStatusIcon
│   │   │   ├── attachmentHelpers.ts     # getAttachmentIcon, openTraceViewer
│   │   │   ├── linkify.util.ts          # URL detection and text truncation (✨ v1.2.0)
│   │   │   │   ├── parseLinksInText()    # Parse text and identify URLs
│   │   │   │   ├── containsLinks()       # Check if text contains URLs
│   │   │   │   └── truncateText()        # Truncate with word boundaries
│   │   │   └── noteContent.util.ts      # Note content parsing (✨ v1.3.0)
│   │   │       ├── parseNoteContent()    # Parse text and [IMAGE:image-id] markers
│   │   │       ├── insertImageMarker()   # Insert image marker at cursor position
│   │   │       ├── extractImageIds()     # Extract all image IDs from content
│   │   │       └── removeImageMarker()   # Remove image marker from content
│   │   │
│   │   └── constants/                    # Constants and enums
│   │       ├── TEST_STATUS_ICONS
│   │       ├── TEST_STATUS_COLORS
│   │       └── FILTER_OPTIONS
│   │
│   ├── dashboard/                       # Dashboard analytics feature
│   │   ├── components/
│   │   │   ├── Dashboard.tsx            # Main dashboard view
│   │   │   │   ├── DashboardStats (4 cards)
│   │   │   │   ├── Flaky Tests Panel (left)
│   │   │   │   ├── Timeline Chart (right, Recharts)
│   │   │   │   └── WebSocket integration for live updates
│   │   │   ├── DashboardStats.tsx       # Statistics cards
│   │   │   ├── StatsCard.tsx            # Individual stat card
│   │   │   ├── SystemInfo.tsx           # System information
│   │   │   │
│   │   │   └── settings/                # Settings modal
│   │   │       ├── SettingsModal.tsx           # Main modal container
│   │   │       ├── SettingsSection.tsx         # Reusable section wrapper
│   │   │       ├── SettingsThemeSection.tsx    # Auto/Light/Dark theme selector
│   │   │       ├── SettingsTestExecutionSection.tsx # Max workers config
│   │   │       ├── SettingsDataRetentionSection.tsx # Data cleanup controls (✨ v1.4.0)
│   │   │       ├── SettingsStorageSection.tsx  # Storage statistics display (✨ v1.0.4)
│   │   │       │   ├── Collapsible storage info
│   │   │       │   ├── Database size + record counts
│   │   │       │   ├── Attachments breakdown by type
│   │   │       │   ├── Total storage + average per test
│   │   │       │   └── Refresh button for manual update
│   │   │       └── SettingsActionsSection.tsx  # Admin actions (discover, clear, health)
│   │   │
│   │   └── hooks/                       # Dashboard-specific hooks
│   │       ├── useDashboardStats.ts     # Fetch dashboard statistics
│   │       ├── useDashboardActions.ts   # Clear data, discover tests
│   │       ├── useFlakyTests.ts         # Flaky test detection
│   │       │   ├── localStorage persistence (days, threshold)
│   │       │   ├── updateDays(), updateThreshold()
│   │       │   └── React Query integration
│   │       ├── useTestTimeline.ts       # Daily test execution stats
│   │       └── useStorageStats.ts       # Storage statistics (✨ v1.0.4)
│   │           ├── React Query with 30s stale time
│   │           ├── GET /api/storage/stats
│   │           └── Manual refetch support
│   │
│   └── authentication/                  # Authentication feature
│       ├── components/
│       │   └── LoginPage.tsx           # Login form
│       │       └── applyThemeMode() on mount for dark mode support
│       │
│       ├── utils/
│       │   ├── authFetch.ts            # Authenticated fetch wrapper
│       │   │   ├── Automatic JWT inclusion
│       │   │   ├── 401 handling → global logout
│       │   │   └── createProtectedFileURL() for attachments
│       │   ├── __tests__/              # Authentication utility tests (2 test files, 84 tests)
│       │   ├── webSocketUrl.ts         # WebSocket URL utility (DRY)
│       │   │   └── getWebSocketUrl(includeAuth)  # Single source of truth
│       │   └── tokenValidator.ts       # Token validation
│       │       └── verifyToken() via /api/auth/verify
│       │
│       └── context/
│           ├── AuthContext.tsx         # Global logout function
│           └── __tests__/              # Auth context tests
│
├── hooks/                               # Global hooks
│   ├── useWebSocket.ts                 # WebSocket connection management
│   ├── useTheme.ts                     # Theme management
│   │   ├── ThemeMode: 'auto' | 'light' | 'dark'
│   │   ├── applyThemeMode() utility (exported for LoginPage)
│   │   ├── localStorage persistence
│   │   └── System theme detection (prefers-color-scheme)
│   └── usePlaywrightWorkers.ts         # Playwright workers configuration
│       ├── localStorage persistence
│       ├── setWorkers(count), resetToDefault()
│       └── Validation (1-16 range)
│
└── shared/                              # Shared components (Atomic Design)
    └── components/
        ├── atoms/                       # Basic building blocks
        │   ├── Button.tsx              # Primary button component
        │   ├── StatusIcon.tsx          # Test status icon
        │   ├── LoadingSpinner.tsx      # Loading indicator
        │   └── LinkifiedText.tsx       # URL linkification component (✨ v1.2.0)
        │       ├── Auto-detects URLs (https://, http://, www.)
        │       ├── Renders clickable links with target="_blank"
        │       ├── Supports custom className and linkClassName
        │       └── Used in TestRow and TestNoteEditor
        │
        └── molecules/                   # Simple combinations
            ├── Card.tsx                # Card container
            ├── ActionButton.tsx        # Button with loading state
            ├── StatusBadge.tsx         # Status badge with color
            └── ModalBackdrop.tsx       # Reusable modal backdrop with blur
```

---

## Reporter Package

```
packages/reporter/
├── src/
│   ├── index.ts                        # Main reporter implementation
│   │   ├── generateStableTestId()      # ⚠️ MUST match PlaywrightService
│   │   ├── onTestBegin()               # Test start event
│   │   ├── onTestEnd()                 # Test completion
│   │   ├── processAttachments()        # Extract attachment metadata
│   │   ├── sendTestResult()            # POST to dashboard API
│   │   └── Environment config:
│   │       ├── DASHBOARD_API_URL (from dashboard)
│   │       ├── RUN_ID (from dashboard)
│   │       └── NODE_ENV (from dashboard)
│   │
│   └── __tests__/                      # Reporter tests (2 test files, 55 tests - CRITICAL)
│
├── vitest.config.ts                    # Vitest test configuration
├── package.json                        # npm package configuration
│   ├── name: "playwright-dashboard-reporter"
│   ├── version: "1.0.1"
│   └── exports: CJS + ESM
│
└── README.md                           # Reporter documentation
```

---

## Core Package (Shared Types)

```
packages/core/
├── src/
│   ├── types/
│   │   ├── test.types.ts              # Test result types
│   │   ├── attachment.types.ts        # Attachment types
│   │   └── run.types.ts               # Test run types
│   └── index.ts                        # Export all types
│
└── vitest.config.ts                    # Vitest test configuration
```

---

## Quick Find Examples

### "Where is testId generated?"

**Reporter:**

```
packages/reporter/src/index.ts
  → generateStableTestId(filePath, title)
```

**Discovery:**

```
packages/server/src/services/playwright.service.ts
  → generateStableTestId(filePath, title)
```

⚠️ **CRITICAL:** Both must use identical algorithm!

---

### "Where is WebSocket URL constructed?"

**Centralized utility (DRY):**

```
packages/web/src/features/authentication/utils/webSocketUrl.ts
  → getWebSocketUrl(includeAuth: boolean)
```

**Usage:**

- `App.tsx` - Global WebSocket connection
- `TestDetailModal.tsx` - Modal-specific connection
- `Dashboard.tsx` - Dashboard live updates

---

### "Where is theme applied?"

**Theme management:**

```
packages/web/src/hooks/useTheme.ts
  → useTheme() hook
  → applyThemeMode() utility (exported for LoginPage)
  → ThemeMode: 'auto' | 'light' | 'dark'
```

**Usage:**

- `App.tsx` - Read theme from hook
- `Header.tsx` - Read isDark state
- `LoginPage.tsx` - Apply theme before auth (uses applyThemeMode utility)
- `SettingsThemeSection.tsx` - Theme selector

---

### "Where is the rerun button?"

**Location:**

```
packages/web/src/features/tests/components/history/ExecutionSidebar.tsx
  → Line ~30: ActionButton with "Run" text
  → Calls: onRerun(testId)
```

**Flow:**

```
ExecutionSidebar → onRerun prop → TestDetailModal → testsStore.rerunTest()
  → POST /api/tests/:id/rerun → WebSocket event → Auto-update UI
```

---

### "Where are attachments copied?"

**Storage manager:**

```
packages/server/src/storage/attachmentManager.ts
  → copyPlaywrightAttachment(sourceFilePath, testResultId, type)
```

**Service orchestration:**

```
packages/server/src/services/attachment.service.ts
  → processAttachments(attachments, testResultId)
  → saveAttachmentsForTestResult(testResultId, attachments)
```

**Flow:**

```
Reporter sends temp path → AttachmentService → AttachmentManager
  → Copy to: {OUTPUT_DIR}/attachments/{testResultId}/{fileName}
  → Generate URL: /attachments/{testResultId}/{fileName}
```

---

### "Where is flaky test detection?"

**SQL query:**

```
packages/server/src/repositories/test.repository.ts
  → getFlakyTests(days, thresholdPercent)
  → SQL: GROUP BY test_id, calculate failure rate
```

**Frontend:**

```
packages/web/src/features/dashboard/hooks/useFlakyTests.ts
  → React Query integration
  → localStorage persistence (days, threshold)
```

**Display:**

```
packages/web/src/features/dashboard/components/Dashboard.tsx
  → Flaky Tests Panel (left side)
  → History dots showing pass/fail pattern
```

---

### "Where is the Run All Tests button?"

**Location:**

```
packages/web/src/features/tests/components/TestsListFilters.tsx
  → ActionButton with "Run All Tests" text
  → Left side, with Expand All/Collapse All buttons
```

**Why moved here:**

- Better context (see tests you're about to run)
- Proximity to results
- Dashboard focuses on overview/stats

---

### "Where is storage statistics calculated?"

**✨ New in v1.0.4**

**Backend (Repository Pattern):**

```
packages/server/src/repositories/storage.repository.ts
  → getStorageStats()           # Main method
  → getDatabaseStats()           # SQLite file size (includes WAL/SHM)
```

**Service layer:**

```
packages/server/src/services/storage.service.ts
  → getStorageStats()            # Business logic + error handling
```

**API endpoint:**

```
packages/server/src/controllers/storage.controller.ts
  → GET /api/storage/stats
```

**Frontend hook:**

```
packages/web/src/features/dashboard/hooks/useStorageStats.ts
  → useStorageStats()            # React Query with refetch
```

**Display:**

```
packages/web/src/features/dashboard/components/settings/SettingsStorageSection.tsx
  → Collapsible section in Settings Modal
  → Shows: Database size, Attachments breakdown, Total storage
  → Includes refresh button
```

**Utilities:**

```
packages/web/src/features/tests/utils/formatters.ts
  → formatBytes(bytes, decimals)  # Converts bytes to KB/MB/GB/TB
```

---

### "Where are test notes handled?"

**✨ New in v1.2.0**

**Backend (Repository Pattern):**

```
packages/server/src/controllers/note.controller.ts
  → getNote(), saveNote(), deleteNote()

packages/server/src/services/note.service.ts
  → Business logic + validation (trim, empty check, 1000 char max)

packages/server/src/services/noteImage.service.ts (✨ v1.3.0)
  → Image upload, retrieval, deletion with validation (max 5MB)

packages/server/src/repositories/note.repository.ts
  → Database operations (INSERT OR REPLACE, SELECT, DELETE)

packages/server/src/repositories/noteImage.repository.ts (✨ v1.3.0)
  → Image metadata CRUD operations

packages/server/src/storage/noteImageManager.ts (✨ v1.3.0)
  → Image file storage operations
```

**Frontend Components:**

```
packages/web/src/features/tests/components/testDetail/TestNoteEditor.tsx
  → Main editor component with Add/Edit/Delete
  → Drag & drop and paste image support (✨ v1.3.0)

packages/web/src/features/tests/components/testDetail/NoteContentRenderer.tsx (✨ v1.3.0)
  → Renders note content with text and image thumbnails

packages/web/src/features/tests/components/testDetail/NoteImageThumbnail.tsx (✨ v1.3.0)
  → Clickable image thumbnail component

packages/web/src/features/tests/components/testDetail/NoteImageLightbox.tsx (✨ v1.3.0)
  → Full-size image modal with keyboard navigation

packages/web/src/components/atoms/LinkifiedText.tsx
  → URL linkification component (auto-detects and renders clickable links)

packages/web/src/features/tests/components/TestRow.tsx
  → Displays truncated note preview (50 chars) with 💬 icon
```

**Frontend Services & Hooks:**

```
packages/web/src/services/noteImage.service.ts (✨ v1.3.0)
  → API client for image upload, get, delete

packages/web/src/features/tests/hooks/useNoteImages.ts (✨ v1.3.0)
  → React Query hook for fetching note images
```

**Utilities:**

```
packages/web/src/utils/linkify.util.ts
  → parseLinksInText()   # Parse text and identify URLs
  → truncateText()        # Truncate with word boundaries
  → containsLinks()       # Check if text contains URLs

packages/web/src/features/tests/utils/noteContent.util.ts (✨ v1.3.0)
  → parseNoteContent()    # Parse text and [IMAGE:image-id] markers
  → insertImageMarker()   # Insert image marker at cursor position
  → extractImageIds()     # Extract all image IDs from content
  → removeImageMarker()   # Remove image marker from content
```

**API Endpoints:**

```
GET    /api/tests/:testId/notes      # Get note
POST   /api/tests/:testId/notes      # Save/update note
DELETE /api/tests/:testId/notes      # Delete note
```

**Database:**

```
packages/server/src/database/schema.sql
  → test_notes table (testId, content, createdAt, updatedAt)
  → Automatic timestamp update trigger
```

**Documentation:**

```
docs/features/TEST_NOTES.md          # Complete feature documentation
docs/API_REFERENCE.md                # API endpoints documentation
```

---

### "Where is authentication validated?"

**Backend:**

```
packages/server/src/middleware/auth.middleware.ts
  → validateJWT(token)
  → GET /api/auth/verify endpoint
```

**Frontend:**

```
packages/web/src/App.tsx
  → Initial token verification on mount
  → Periodic validation every 5 minutes
  → Automatic logout on token expiry

packages/web/src/features/authentication/utils/authFetch.ts
  → Intercepts 401 responses
  → Triggers global logout on auth failure
```

---

## Architecture Patterns

### Backend: Controller → Service → Repository → Database

**Example: Rerun test**

```
1. test.controller.ts: rerunTest()
   ↓ Extract testId from request
2. test.service.ts: rerunTest(testId)
   ↓ Business logic: validate, prepare command
3. playwright.service.ts: spawnPlaywrightProcess()
   ↓ CLI injection: --reporter=playwright-dashboard-reporter
4. Reporter: generateStableTestId()
   ↓ POST /api/tests with new execution
5. test.repository.ts: saveTestResult()
   ↓ ALWAYS INSERT (never UPDATE)
6. database.manager.ts: run(insertSql)
   ↓ Execute SQL
```

### Frontend: Feature → Component → Hook → Store

**Example: View test history**

```
1. TestDetailModal.tsx (component)
   ↓ Uses hook for data
2. useTestExecutionHistory.ts (hook)
   ↓ Fetches from API
3. GET /api/tests/:id/history
   ↓ Returns execution array
4. testsStore.ts (store)
   ↓ selectedExecutionId state
5. ExecutionSidebar.tsx (component)
   ↓ Display history list
```

---

## Configuration Files

### Root Level

```
.
├── .env                        # Environment variables (gitignored)
├── .env.example                # Environment template
├── .env.production             # Production config template
├── package.json                # Workspace configuration
├── turbo.json                  # Turborepo configuration
├── tsconfig.json               # TypeScript base config
├── vitest.config.ts            # Vitest root config with test.projects (Vitest 3.x)
└── ../TESTING.md                  # Testing infrastructure documentation
```

### Backend Config

```
packages/server/
├── .env                        # Server environment (gitignored)
├── tsconfig.json               # Server TypeScript config
└── src/config/
    ├── environment.config.ts   # Environment management
    └── constants.ts            # Application constants
```

### Frontend Config

```
packages/web/
├── vite.config.ts              # Vite configuration with dotenv
├── tailwind.config.js          # Tailwind CSS config (darkMode: 'class')
├── tsconfig.json               # Web TypeScript config
└── src/config/
    └── environment.config.ts   # Import.meta.env wrapper
```

---

## Related Documentation

- [CLAUDE.md](../../CLAUDE.md) - Quick file finder (top 6 questions)
- [docs/ARCHITECTURE.md](../ARCHITECTURE.md) - Architecture patterns explained
- [docs/DEVELOPMENT.md](../DEVELOPMENT.md) - Development workflow
- [docs/ai/ANTI_PATTERNS.md](ANTI_PATTERNS.md) - Where NOT to put code

---

**Last Updated:** October 2025
**Maintained by:** Yurii Shvydak
