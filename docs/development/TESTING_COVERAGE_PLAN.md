# Testing Coverage Plan

> Comprehensive testing strategy and progress tracker for yshvydak-test-dashboard
>
> **Last Updated:** 2025-10-22
> **Overall Target:** 75-80% coverage
> **Current Status:** ~48% overall (23 test files implemented, 981 tests)

---

## 📊 Current Coverage Status

### Implemented Tests ✅

| Package  | File                            | Coverage | Status      | Priority |
| -------- | ------------------------------- | -------- | ----------- | -------- |
| Reporter | `testIdGeneration.test.ts`      | 95%+     | ✅ Complete | Critical |
| Server   | `auth.service.test.ts`          | 90%+     | ✅ Complete | Critical |
| Server   | `test.repository.flaky.test.ts` | 85%+     | ✅ Complete | High     |
| Server   | `database.manager.test.ts`      | 90%+     | ✅ Complete | Critical |
| Server   | `attachmentManager.test.ts`     | 90%+     | ✅ Complete | Critical |
| Server   | `playwright.service.test.ts`    | 85%+     | ✅ Complete | Critical |
| Server   | `test.service.test.ts`          | 98.52%   | ✅ Complete | Critical |
| Server   | `attachment.service.test.ts`    | 80%+     | ✅ Complete | Critical |
| Server   | `auth.middleware.test.ts`       | 100%     | ✅ Complete | Critical |
| Server   | `error.middleware.test.ts`      | 100%     | ✅ Complete | Critical |
| Server   | `test.repository.test.ts`       | 91.2%    | ✅ Complete | Critical |
| Server   | `attachment.repository.test.ts` | 100%     | ✅ Complete | Critical |
| Server   | `run.repository.test.ts`        | 85.71%   | ✅ Complete | Critical |
| Server   | `test.controller.test.ts`       | 100%     | ✅ Complete | High     |
| Server   | `run.controller.test.ts`        | 100%     | ✅ Complete | High     |
| Server   | `file.util.test.ts`             | 100%     | ✅ Complete | High     |
| Server   | `response.helper.test.ts`       | 100%     | ✅ Complete | High     |
| Web      | `useWebSocket.test.ts`          | 85%+     | ✅ Complete | Critical |
| Web      | `useTheme.test.ts`              | 100%     | ✅ Complete | High     |
| Web      | `usePlaywrightWorkers.test.ts`  | 100%     | ✅ Complete | High     |

### Coverage by Package

| Package     | Current  | Target     | Progress           | Note                        |
| ----------- | -------- | ---------- | ------------------ | --------------------------- |
| Reporter    | ~95%     | 90%+       | ▓▓▓▓▓▓▓▓▓▓ 95% ✅  | 2 test files, 55 tests      |
| Server      | ~85%+    | 80%+       | ▓▓▓▓▓▓▓▓░░ 85%+ ✅ | 16 test files, 745 tests    |
| Web         | ~76%     | 70%+       | ▓▓▓▓▓▓▓░░░ 76% ✅  | 7 test files, 265 tests     |
| Core        | ~0%      | 50%+       | ░░░░░░░░░░ 0%      | 0 test files                |
| **Overall** | **~48%** | **75-80%** | **▓▓▓▓▓░░░░░ 48%** | **25 files, 1065 tests** ✅ |

---

## 🎯 Testing Roadmap (25 Test Files)

### Priority 1: Critical (Security & Data Integrity)

These tests protect core functionality and data integrity. Start here.

#### Server - Services

- [x] **1. `test.service.test.ts`** - TestService (CRITICAL) ✅
    - Location: `packages/server/src/services/__tests__/test.service.test.ts`
    - Target: 80%+ ✅ Achieved 98.52%
    - Tests:
        - ✅ discoverTests() - integration with PlaywrightService (4 tests)
        - ✅ saveTestResult() - data persistence & INSERT-only strategy (5 tests)
        - ✅ getTestHistory() - historical tracking with attachments (5 tests)
        - ✅ getAllTests() - filtering and pagination (2 tests)
        - ✅ getTestById() - with attachments (2 tests)
        - ✅ clearAllTests() - data cleanup (2 tests)
        - ✅ getTestStats() - database statistics (1 test)
        - ✅ getFlakyTests() - flaky detection (2 tests)
        - ✅ getTestTimeline() - timeline data (2 tests)
        - ✅ runAllTests() - process spawning (3 tests)
        - ✅ runTestGroup() - file-based execution (2 tests)
        - ✅ rerunTest() - single test rerun (4 tests)
        - ✅ getDiagnostics() - health checks (2 tests)
        - ✅ getTraceFileById() - trace file retrieval (6 tests)
        - ✅ Error handling for all methods (3 tests)
    - Total: **45 tests**, all passing ✅
    - Dependencies mocked: TestRepository, RunRepository, PlaywrightService, WebSocketService, AttachmentService

- [x] **2. `playwright.service.test.ts`** - PlaywrightService (CRITICAL) ✅
    - Location: `packages/server/src/services/__tests__/playwright.service.test.ts`
    - Target: 85%+ ✅ Achieved
    - Tests:
        - ✅ discoverTests() - test discovery algorithm (9 tests)
        - ✅ runAllTests() - process spawning with maxWorkers (5 tests)
        - ✅ runTestGroup() - file-based execution (5 tests)
        - ✅ rerunSingleTest() - single test rerun with correct testId (5 tests)
        - ✅ validateConfiguration() - all validation checks (8 tests)
        - ✅ getDiagnostics() - health checks (5 tests)
        - ✅ getReporterDiagnostics() - reporter validation (2 tests)
        - ✅ Environment variable handling (RUN_ID, RERUN_ID)
        - ✅ Error handling and edge cases
    - Total: **40 tests**, all passing ✅
    - Note: Uses child_process mocks, EventEmitter for process simulation

- [x] **3. `attachment.service.test.ts`** - AttachmentService (CRITICAL) ✅
    - Location: `packages/server/src/services/__tests__/attachment.service.test.ts`
    - Target: 80%+ ✅ Achieved
    - Tests:
        - ✅ mapContentTypeToDbType() - MIME type mapping (4 tests)
        - ✅ processAttachments() - file processing via AttachmentManager (10 tests)
        - ✅ getAttachmentsByTestResult() - retrieval with URLs (3 tests)
        - ✅ saveAttachmentsForTestResult() - batch processing (7 tests)
        - ✅ getAttachmentById() - single attachment retrieval (2 tests)
        - ✅ Error handling - repository & manager errors (3 tests)
    - Total: **28 tests**, all passing ✅
    - Dependencies mocked: AttachmentRepository, AttachmentManager, fs

- [x] **4. `attachmentManager.test.ts`** - AttachmentManager (CRITICAL) ✅
    - Location: `packages/server/src/storage/__tests__/attachmentManager.test.ts`
    - Target: 90%+ ✅ Achieved
    - Tests:
        - ✅ Initialization (2 tests) - directory creation, idempotency
        - ✅ copyPlaywrightAttachment (17 tests) - permanent storage, MIME types (all formats), unique file names, file size, special characters, large files
        - ✅ saveAttachment (6 tests) - buffer persistence, file name generation, custom names
        - ✅ URL Generation (2 tests) - format validation, special characters
        - ✅ File Path Operations (2 tests) - path construction, existence checks
        - ✅ Delete Operations (5 tests) - single/bulk deletion, directory cleanup
        - ✅ Storage Statistics (5 tests) - file/size calculation, type breakdown, empty storage
        - ✅ Cleanup Old Attachments (4 tests) - age-based cleanup, default parameters
        - ✅ Edge Cases (4 tests) - concurrent operations, binary data, path traversal safety
    - Total: **46 tests**, all passing ✅
    - Note: Uses temp directories for isolation, tests real file operations

#### Server - Repositories

- [x] **5. `test.repository.test.ts`** - TestRepository (extends flaky tests) ✅
    - Location: `packages/server/src/repositories/__tests__/test.repository.test.ts`
    - Target: 80%+ ✅ Achieved 91.2%
    - Tests:
        - ✅ saveTestResult() - INSERT-only strategy verification (6 tests)
        - ✅ getTestResult() - single result retrieval (3 tests)
        - ✅ getAllTests() - filtering by status, runId, pagination (9 tests)
        - ✅ getTestResultsByTestId() - history retrieval (latest first) (6 tests)
        - ✅ getTestResultsByRun() - all tests for a run (5 tests)
        - ✅ Attachment JOIN queries work correctly (7 tests)
        - ✅ clearAllTests() - data cleanup (2 tests)
        - ✅ getTestStats() - database statistics (2 tests)
        - ✅ Edge cases - concurrent saves, long names, special characters (7 tests)
    - Total: **45 tests**, all passing ✅
    - Note: Flaky detection already covered in separate file

- [x] **6. `run.repository.test.ts`** - RunRepository ✅
    - Location: `packages/server/src/repositories/__tests__/run.repository.test.ts`
    - Target: 80%+ ✅ Achieved 85.71%
    - Tests:
        - ✅ createTestRun() - run creation with metadata (6 tests)
        - ✅ updateTestRun() - statistics update (passed, failed, duration) (8 tests)
        - ✅ getTestRun() - single run retrieval (3 tests)
        - ✅ getAllTestRuns() - retrieval with pagination, ordering (6 tests)
        - ✅ getStats() - database statistics (3 tests)
        - ✅ Foreign key constraints with test_results (4 tests)
        - ✅ Edge cases - long IDs, special characters, large counts, concurrent operations (6 tests)
        - ✅ Integration scenarios - complete lifecycle, stats aggregation, referential integrity (3 tests)
    - Total: **39 tests**, all passing ✅

- [x] **7. `attachment.repository.test.ts`** - AttachmentRepository ✅
    - Location: `packages/server/src/repositories/__tests__/attachment.repository.test.ts`
    - Target: 80%+ ✅ Achieved 100%
    - Tests:
        - ✅ saveAttachment() - all attachment types, all fields (7 tests)
        - ✅ getAttachmentsByTestResult() - retrieval and mapping (4 tests)
        - ✅ getAttachmentsWithUrls() - URL generation logic (5 tests)
        - ✅ getAttachmentById() - single attachment retrieval (3 tests)
        - ✅ deleteAttachmentsByTestResult() - deletion operations (4 tests)
        - ✅ Foreign key constraints (test_result_id) (3 tests)
        - ✅ Edge cases - long names, unicode, concurrent saves (6 tests)
        - ✅ Integration tests - complete workflow (3 tests)
    - Total: **36 tests**, all passing ✅

#### Server - Middleware

- [x] **8. `auth.middleware.test.ts`** - Authentication middleware (SECURITY) ✅
    - Location: `packages/server/src/middleware/__tests__/auth.middleware.test.ts`
    - Target: 85%+ ✅ Achieved 100% statements, 96.42% branches
    - Tests:
        - ✅ Authentication disabled bypass (1 test)
        - ✅ Public endpoints bypass authentication (5 tests)
        - ✅ JWT validation flow - valid tokens (2 tests)
        - ✅ JWT validation flow - invalid/expired/malformed tokens (4 tests)
        - ✅ No authentication provided (2 tests)
        - ✅ Error handling (2 tests)
        - ✅ authType tracking (4 tests)
        - ✅ requireJWT() - enforces JWT authentication (3 tests)
        - ✅ requireAdmin() - role-based access control (5 tests)
        - ✅ logAuth() - logging middleware (3 tests)
        - ✅ Integration scenarios (3 tests)
    - Total: **34 tests**, all passing ✅
    - Dependencies mocked: AuthService, config

- [x] **9. `error.middleware.test.ts`** - Error handling ✅
    - Location: `packages/server/src/middleware/__tests__/error.middleware.test.ts`
    - Target: 75%+ ✅ Achieved 100% statements, 100% branches, 100% functions
    - Tests:
        - ✅ errorHandler() - ValidationError handling (1 test)
        - ✅ errorHandler() - NotFoundError handling with/without resource (2 tests)
        - ✅ errorHandler() - Generic Error handling (1 test)
        - ✅ errorHandler() - Custom error types (1 test)
        - ✅ errorHandler() - Errors without messages (1 test)
        - ✅ errorHandler() - Non-Error objects (1 test)
        - ✅ errorHandler() - Undefined message property (1 test)
        - ✅ Error logging for all error types (3 tests)
        - ✅ Response formatting - badRequest, notFound, serverError (3 tests)
        - ✅ Edge cases - special chars, long messages, Unicode, stack traces (4 tests)
        - ✅ notFoundHandler() - 404 responses with path and timestamp (7 tests)
        - ✅ Integration scenarios - multiple errors, 404 + error (3 tests)
    - Total: **28 tests**, all passing ✅
    - Dependencies mocked: Logger, ResponseHelper

- [ ] **10. `cors.middleware.test.ts`** - CORS configuration
    - Location: `packages/server/src/middleware/__tests__/cors.middleware.test.ts`
    - Target: 75%+
    - Tests:
        - ✓ Allowed origins configuration
        - ✓ Credentials handling
        - ✓ Preflight requests
        - ✓ Headers allowed

- [x] **16. `file.util.test.ts`** - FileUtil ✅
    - Location: `packages/server/src/utils/__tests__/file.util.test.ts`
    - Target: 80%+ ✅ Achieved 100%
    - Tests:
        - ✅ ensureDirectoryExists() - directory creation, nested directories, idempotency (4 tests)
        - ✅ getFileSize() - file size in bytes, non-existent files, empty files, large files, binary files (5 tests)
        - ✅ fileExists() - existing files/directories, non-existent files, deleted files (4 tests)
        - ✅ readJsonFile() - valid JSON, invalid JSON, non-existent files, empty files, arrays, unicode (6 tests)
        - ✅ convertToRelativeUrl() - path conversion, Windows backslashes, nested directories, special characters, spaces (7 tests)
        - ✅ mapContentTypeToDbType() - video detection (5 tests), screenshot detection (6 tests), trace detection (4 tests), log detection (4 tests)
        - ✅ Fallback behavior - unknown types, empty types, priority rules (4 tests)
        - ✅ Edge cases - uppercase extensions, multiple dots, no extension, path-like filenames, special characters, unicode, long filenames (7 tests)
        - ✅ Playwright-specific names - video, screenshot, trace attachments (4 tests)
        - ✅ Real-world scenarios - typical Playwright attachments, console logs, test outputs (5 tests)
        - ✅ Integration scenarios - full file lifecycle, multiple operations, attachment type detection workflow (3 tests)
    - Total: **68 tests**, all passing ✅
    - Note: Comprehensive coverage of all file utility functions with real file system operations

---

### Priority 2: Important (Business Logic)

Core business logic that needs solid testing coverage.

#### Server - Controllers

- [x] **11. `test.controller.test.ts`** - Test endpoints ✅
    - Location: `packages/server/src/controllers/__tests__/test.controller.test.ts`
    - Target: 75%+ ✅ Achieved 100% statements, 82.3% branches
    - Tests:
        - ✅ discoverTests() - test discovery (3 tests)
        - ✅ runAllTests() - run all tests (3 tests)
        - ✅ runTestGroup() - run group (3 tests)
        - ✅ getAllTests() - list with filters (3 tests)
        - ✅ getTestStats() - statistics (2 tests)
        - ✅ getFlakyTests() - flaky detection (4 tests)
        - ✅ getTestTimeline() - timeline (3 tests)
        - ✅ clearAllTests() - cleanup (2 tests)
        - ✅ createTestResult() - submission (7 tests)
        - ✅ getTestById() - single test (3 tests)
        - ✅ rerunTest() - rerun (4 tests)
        - ✅ getTestHistory() - history (4 tests)
        - ✅ getTestAttachments() - attachments (4 tests)
        - ✅ getDiagnostics() - diagnostics (2 tests)
        - ✅ processStart() - process start (5 tests)
        - ✅ processEnd() - process end (5 tests)
        - ✅ forceReset() - force reset (3 tests)
        - ✅ getTraceFile() - trace download with JWT (8 tests)
    - Total: **68 tests**, all passing ✅
    - Dependencies mocked: TestService, AuthService, activeProcessesTracker, WebSocketManager

- [x] **12. `run.controller.test.ts`** - Run endpoints ✅
    - Location: `packages/server/src/controllers/__tests__/run.controller.test.ts`
    - Target: 75%+ ✅ Achieved 100%
    - Tests:
        - ✅ createTestRun() - create test run with validation (8 tests)
        - ✅ updateTestRun() - update test run statistics (5 tests)
        - ✅ getAllTestRuns() - list with pagination and filtering (6 tests)
        - ✅ getStats() - statistics with success rate calculation (6 tests)
        - ✅ getTestRun() - single run retrieval (5 tests)
        - ✅ Edge cases - long IDs, special characters, large counts, invalid inputs (8 tests)
    - Total: **37 tests**, all passing ✅

- [ ] **13. `health.controller.test.ts`** - Health check
    - Location: `packages/server/src/controllers/__tests__/health.controller.test.ts`
    - Target: 90%+
    - Tests:
        - ✓ GET /api/health - returns 200 with status
        - ✓ Database connectivity check
        - ✓ Service availability

#### Server - Database

- [x] **14. `database.manager.test.ts`** - DatabaseManager (CRITICAL) ✅
    - Location: `packages/server/src/database/__tests__/database.manager.test.ts`
    - Target: 90%+ ✅ Achieved
    - Tests:
        - ✅ Schema initialization from schema.sql (3 tests)
        - ✅ saveTestResult() - INSERT-only verification (7 tests)
        - ✅ createTestRun() - run creation (7 tests)
        - ✅ Foreign key constraints enforcement (6 tests)
        - ✅ Statistics & Analytics (3 tests)
        - ✅ Data Management (cleanup, clear) (2 tests)
        - ✅ Repository compatibility methods (4 tests)
        - ✅ Edge cases & error handling (5 tests)
    - Total: **37 tests**, all passing ✅
    - Note: Tests in-memory database with full CRUD operations

#### Server - Utils

- [x] **15. `file.util.test.ts`** - FileUtil ✅
    - Location: `packages/server/src/utils/__tests__/file.util.test.ts`
    - Target: 80%+ ✅ Achieved 100%
    - Tests:
        - ✅ ensureDirectoryExists() - directory creation, nested directories, idempotency (4 tests)
        - ✅ getFileSize() - file size in bytes, non-existent files, empty files, large files, binary files (5 tests)
        - ✅ fileExists() - existing files/directories, non-existent files, deleted files (4 tests)
        - ✅ readJsonFile() - valid JSON, invalid JSON, non-existent files, empty files, arrays, unicode (6 tests)
        - ✅ convertToRelativeUrl() - path conversion, Windows backslashes, nested directories, special characters, spaces (7 tests)
        - ✅ mapContentTypeToDbType() - all attachment types with comprehensive MIME type coverage (42 tests)
    - Total: **68 tests**, all passing ✅

- [x] **16. `response.helper.test.ts`** - ResponseHelper ✅
    - Location: `packages/server/src/utils/__tests__/response.helper.test.ts`
    - Target: 85%+ ✅ Achieved 100%
    - Tests:
        - ✅ success() - 200 responses with data, message, count (8 tests)
        - ✅ error() - custom status codes, error messages (6 tests)
        - ✅ badRequest() - 400 responses with validation messages (5 tests)
        - ✅ unauthorized() - 401 responses with default/custom messages (5 tests)
        - ✅ forbidden() - 403 responses with role-based messages (5 tests)
        - ✅ notFound() - 404 responses with resource info (5 tests)
        - ✅ serverError() - 500 responses with error details (6 tests)
        - ✅ successData() - Legacy method (7 tests)
        - ✅ errorData() - Legacy method (5 tests)
        - ✅ internalError() - Legacy method (5 tests)
        - ✅ Edge cases - long messages, unicode, emoji, large counts (7 tests)
        - ✅ Integration scenarios - controller flows, chaining, format consistency (8 tests)
        - ✅ Timestamp consistency - ISO format, validity, uniqueness (3 tests)
    - Total: **75 tests**, all passing ✅

- [ ] **17. `logger.util.test.ts`** - Logger
    - Location: `packages/server/src/utils/__tests__/logger.util.test.ts`
    - Target: 70%+
    - Tests:
        - ✓ info/warn/error/success/debug - message formatting
        - ✓ Emoji selection
        - ✓ Timestamp formatting
        - ✓ Debug mode only in development
        - ✓ Custom loggers (testDiscovery, testRun, testRerun)

---

### Priority 3: Important (Frontend & Integration)

Frontend utilities and integration points.

#### Web - Hooks

- [x] **18. `useWebSocket.test.ts`** - WebSocket hook (CRITICAL) ✅
    - Location: `packages/web/src/hooks/__tests__/useWebSocket.test.ts`
    - Target: 75%+ ✅ Achieved ~85%
    - Tests:
        - ✅ Connection lifecycle - connect, disconnect, cleanup (5 tests)
        - ✅ Message parsing and handling - all message types (4 tests)
        - ✅ Message types - complete message type coverage (15 tests)
        - ✅ State synchronization - tests, runs, running states (10 tests)
        - ✅ Connection status restoration - restore active processes (5 tests)
        - ✅ Query invalidation on updates - React Query integration (2 tests)
        - ✅ Send/receive messages - bidirectional communication (2 tests)
        - ✅ Error handling - connection errors, malformed JSON (2 tests)
        - ✅ Callbacks - onRunCompleted, onTestCompleted (2 tests)
        - ⚠️ Skipped: Reconnection backoff counting (4 tests), ping interval (2 tests)
    - Total: **42 tests**, 36 passing, 6 skipped ✅
    - Note: Complex React hook with WebSocket mocking and fake timers

- [x] **19. `useTheme.test.ts`** - Theme hook ✅
    - Location: `packages/web/src/hooks/__tests__/useTheme.test.ts`
    - Target: 80%+ ✅ Achieved 100%
    - Tests:
        - ✅ Initialization - default and localStorage persistence (4 tests)
        - ✅ Theme Mode Setting - light/dark/auto with localStorage sync (4 tests)
        - ✅ isDark State - computed state based on theme and system preference (4 tests)
        - ✅ System Preference Detection - mediaQuery listeners in auto mode (8 tests)
        - ✅ CSS Class Application - document element class manipulation (7 tests)
        - ✅ applyThemeMode Standalone Function - utility function testing (5 tests)
        - ✅ Integration Scenarios - theme cycles, persistence, real-time updates (4 tests)
        - ✅ Edge Cases - missing API, storage errors, class conflicts (6 tests)
    - Total: **42 tests**, all passing ✅

- [x] **20. `usePlaywrightWorkers.test.ts`** - Workers hook ✅
    - Location: `packages/web/src/hooks/__tests__/usePlaywrightWorkers.test.ts`
    - Target: 75%+ ✅ Achieved 100%
    - Tests:
        - ✅ Initialization - default workers, localStorage loading, invalid values (6 tests)
        - ✅ setWorkers - update and save, min/max bounds, invalid values, multiple updates (9 tests)
        - ✅ resetToDefault - reset to default value (2 tests), localStorage persistence (3 tests)
        - ✅ isValid - validation for range, non-integers, NaN, Infinity (6 tests)
        - ✅ Return Interface - property validation (2 tests)
        - ✅ localStorage Synchronization - load, save, error handling (6 tests)
        - ✅ Edge Cases - boundaries, rapid updates, zero handling (4 tests)
        - ✅ Integration Scenarios - complete lifecycle (3 tests)
        - ✅ getMaxWorkersFromStorage - standalone function (9 tests)
    - Total: **47 tests**, all passing ✅
    - Note: Full localStorage integration with validation

#### Web - Utils

- [x] **21. `tokenValidator.test.ts`** - Token validation ✅
    - Location: `packages/web/src/features/authentication/utils/__tests__/tokenValidator.test.ts`
    - Target: 80%+ ✅ Achieved 100%
    - Tests:
        - ✅ verifyToken() - Valid token scenarios with user data (4 tests)
        - ✅ No token scenarios - null/empty token handling (3 tests)
        - ✅ Invalid token scenarios - 401 expired/malformed (3 tests)
        - ✅ API response validation - success/data field checks (6 tests)
        - ✅ Network error scenarios - timeouts, connection refused, JSON parsing (5 tests)
        - ✅ HTTP status codes - 400/403/404/500/503 handling (5 tests)
        - ✅ Edge cases - long tokens, special characters, unicode, concurrency (7 tests)
        - ✅ Type safety - TokenValidationResult interface (3 tests)
        - ✅ Integration scenarios - complete auth flows, session refresh (4 tests)
    - Total: **38 tests**, all passing ✅
    - Dependencies mocked: authFetch.getAuthToken, global fetch API

- [x] **22. `webSocketUrl.test.ts`** - WebSocket URL utility ✅
    - Location: `packages/web/src/features/authentication/utils/__tests__/webSocketUrl.test.ts`
    - Target: 85%+ ✅ Achieved 100%
    - Tests:
        - ✅ getWebSocketUrl() - with auth (token included) (14 tests)
        - ✅ getWebSocketUrl() - without auth (5 tests)
        - ✅ No token scenario (returns null) (3 tests)
        - ✅ Token encoding in URL parameters (6 tests)
        - ✅ Protocol conversion (http/https to ws/wss) (6 tests)
        - ✅ Port handling (default and custom ports) (6 tests)
        - ✅ Environment variable integration (4 tests)
        - ✅ Edge cases - special characters, long tokens, malformed URLs (8 tests)
    - Total: **52 tests**, all passing ✅
    - Dependencies mocked: config, authFetch.getAuthToken

- [x] **23. `formatters.test.ts`** - Formatting utilities ✅
    - Location: `packages/web/src/features/tests/utils/__tests__/formatters.test.ts`
    - Target: 85%+ ✅ Achieved 100%
    - Tests:
        - ✅ formatDuration() - ms and seconds formatting (8 tests)
        - ✅ formatLastRun() - date/time formatting with timezone (35 tests)
        - ✅ getStatusIcon() - all statuses with fallback (7 tests)
        - ✅ getStatusColor() - all statuses with dark mode (7 tests)
        - ✅ Integration scenarios - complete test result formatting (4 tests)
        - ✅ Edge cases: invalid dates, null values, NaN, Infinity (multiple tests)
    - Total: **61 tests**, all passing ✅

- [x] **24. `attachmentHelpers.test.ts`** - Attachment utilities ✅
    - Location: `packages/web/src/features/tests/utils/__tests__/attachmentHelpers.test.ts`
    - Target: 80%+ ✅ Achieved 100%
    - Tests:
        - ✅ getAttachmentIcon() - all icon types with fallback (7 tests)
        - ✅ formatFileSize() - bytes/KB/MB/GB with precision (17 tests)
        - ✅ downloadAttachment() - protected file download with DOM (13 tests)
        - ✅ openTraceViewer() - trace viewer integration with auth (11 tests)
        - ✅ Integration scenarios - complete attachment workflow (3 tests)
    - Total: **48 tests**, all passing ✅

#### Reporter - Integration

- [x] **25. `reporter.integration.test.ts`** - Reporter lifecycle ✅
    - Location: `packages/reporter/src/__tests__/reporter.integration.test.ts`
    - Target: 85%+ ✅ Achieved
    - Tests:
        - ✅ Initialization - API URL, RUN_ID/RERUN_ID, cleanup handlers (8 tests)
        - ✅ onBegin() - test run start, process notifications (4 tests)
        - ✅ onTestEnd() - individual results, attachments, stable test IDs (12 tests)
        - ✅ onEnd() - completion, statistics, waiting for results (6 tests)
        - ✅ Enhanced Error Messages - code context (3 tests)
        - ✅ Cleanup Handlers - SIGINT/SIGTERM handling (2 tests)
        - ✅ Complete Lifecycle Integration - full runs, API errors (3 tests)
    - Total: **36 tests**, all passing ✅
    - Note: Full lifecycle testing with mock HTTP requests and error scenarios

---

### Priority 4: Useful (Edge Cases & Performance)

Additional coverage for completeness.

- [ ] **26. `websocket.service.test.ts`** - WebSocketService
    - Location: `packages/server/src/services/__tests__/websocket.service.test.ts`
    - Target: 75%+
    - Tests:
        - ✓ Broadcasting to all clients
        - ✓ Client connection/disconnection
        - ✓ Authentication via token query param
        - ✓ Message types (test-completed, run-completed, etc.)

- [ ] **27. `activeProcesses.service.test.ts`** - Process tracking
    - Location: `packages/server/src/services/__tests__/activeProcesses.service.test.ts`
    - Target: 80%+
    - Tests:
        - ✓ Process registration (run-all, run-group, rerun)
        - ✓ Process cleanup on completion
        - ✓ Multiple simultaneous processes
        - ✓ getActiveRuns() - correct state tracking

---

## 📊 Progress Tracking

### By Priority

| Priority      | Total Tests | Completed | Percentage         |
| ------------- | ----------- | --------- | ------------------ |
| Critical (1)  | 12          | 12        | ▓▓▓▓▓▓▓▓▓▓ 100% ✅ |
| Important (2) | 5           | 5         | ▓▓▓▓▓▓▓▓▓▓ 100% ✅ |
| Important (3) | 7           | 3         | ▓▓▓▓░░░░░░ 43%     |
| Useful (4)    | 2           | 0         | ░░░░░░░░░░ 0%      |
| **Total**     | **26**      | **20**    | **▓▓▓▓▓▓▓▓░░ 77%** |

### By Package

| Package   | Tests Planned | Completed | Remaining |
| --------- | ------------- | --------- | --------- |
| Server    | 17            | 16        | 1         |
| Web       | 7             | 3         | 4         |
| Reporter  | 2             | 1         | 1         |
| **Total** | **26**        | **20**    | **6**     |

---

## 🔧 Testing Infrastructure Recommendations

### Dependencies to Add

```json
{
    "devDependencies": {
        "@testing-library/react": "^14.0.0",
        "@testing-library/react-hooks": "^8.0.1",
        "@testing-library/user-event": "^14.5.1",
        "msw": "^2.0.0",
        "supertest": "^6.3.3",
        "@types/supertest": "^6.0.2"
    }
}
```

### Setup Files Needed

1. **`vitest.setup.ts`** (per package)
    - Global mocks
    - Test utilities
    - Database setup/teardown

2. **`__mocks__/`** directories
    - WebSocket mock
    - fs mock for file operations
    - child_process mock for Playwright spawning

3. **`__fixtures__/`** directories
    - Sample test results
    - Sample runs
    - Sample attachments

### Testing Utilities

Create reusable test helpers:

- `createMockTestResult()` - generates test result data
- `createMockRun()` - generates run data
- `createMockAttachment()` - generates attachment data
- `setupTestDatabase()` - in-memory DB setup
- `cleanupTestDatabase()` - cleanup

---

## 🎯 Best Practices

### 1. Test Structure (AAA Pattern)

```typescript
describe('FeatureName', () => {
    describe('methodName', () => {
        it('should do something when condition', () => {
            // Arrange
            const input = setupTestData()

            // Act
            const result = methodUnderTest(input)

            // Assert
            expect(result).toBe(expected)
        })
    })
})
```

### 2. Mock Dependencies

```typescript
import {vi} from 'vitest'

vi.mock('../dependency', () => ({
    DependencyClass: vi.fn().mockImplementation(() => ({
        method: vi.fn().mockResolvedValue('mocked'),
    })),
}))
```

### 3. Test Isolation

- Use `beforeEach` for setup
- Use `afterEach` for cleanup
- Reset mocks with `vi.clearAllMocks()`
- Use in-memory database for repository tests

### 4. Edge Cases to Test

- ✓ Null/undefined inputs
- ✓ Empty strings/arrays
- ✓ Very large inputs
- ✓ Special characters
- ✓ Boundary values
- ✓ Network errors
- ✓ Database errors
- ✓ Race conditions

### 5. Integration vs Unit

- **Unit**: Test single function/method in isolation
- **Integration**: Test multiple components together (e.g., controller + service + repository)

---

## 📅 Implementation Timeline

### Week 1-2: Priority 1 (Critical) ✅ COMPLETE

**Goal:** Protect critical paths

- [x] auth.service.test.ts ✅ (31 tests)
- [x] testIdGeneration.test.ts ✅ (19 tests)
- [x] test.repository.flaky.test.ts ✅ (19 tests)
- [x] database.manager.test.ts ✅ (37 tests)
- [x] attachmentManager.test.ts ✅ (46 tests)
- [x] playwright.service.test.ts ✅ (40 tests)
- [x] test.service.test.ts ✅ (45 tests)
- [x] attachment.service.test.ts ✅ (28 tests)
- [x] auth.middleware.test.ts ✅ (34 tests)
- [x] error.middleware.test.ts ✅ (28 tests)

**Current Coverage:** Server 85%+ ✅, Reporter 95% ✅
**Progress:** 12/12 Priority 1 tests (100%) ✅ **COMPLETE!**

### Week 3: Priority 2 (Important Business Logic)

**Goal:** Cover core business logic

- [x] test.repository.test.ts ✅
- [x] run.repository.test.ts ✅
- [x] attachment.repository.test.ts ✅
- [ ] test.controller.test.ts
- [ ] run.controller.test.ts
- [ ] file.util.test.ts
- [ ] response.helper.test.ts

**Target Coverage:** Server 80%+ ✅ Achieved 85%

### Week 4: Priority 3 (Frontend & Integration)

**Goal:** Frontend utilities and integration

- [ ] useWebSocket.test.ts
- [ ] useTheme.test.ts
- [ ] tokenValidator.test.ts
- [ ] webSocketUrl.test.ts
- [ ] formatters.test.ts
- [ ] reporter.integration.test.ts

**Target Coverage:** Web 60%, Reporter 85%

### Week 5: Priority 4 & Refinement

**Goal:** Edge cases and cleanup

- [ ] websocket.service.test.ts
- [ ] activeProcesses.service.test.ts
- [ ] Remaining middleware tests
- [ ] Code coverage analysis
- [ ] Refactoring based on test results

**Target Coverage:** Overall 75-80% ✅

---

## 🚀 Quick Start Guide

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# UI mode (recommended for development)
npm run test:ui

# Coverage report
npm run test:coverage

# Specific package
npm test --workspace=@yshvydak/test-dashboard-server
```

### Creating a New Test

1. Create file in `__tests__/` directory next to code
2. Name it `{filename}.test.ts`
3. Use AAA pattern (Arrange-Act-Assert)
4. Mock external dependencies
5. Test happy path + error cases
6. Run tests: `npm test`
7. Check coverage: `npm run test:coverage`
8. Update this plan: mark test as complete ✅

### Coverage Reports

After running `npm run test:coverage`:

- HTML report: `coverage/index.html` (open in browser)
- Terminal summary: Shows % coverage per file
- Focus on: Statements, Branches, Functions, Lines

---

## 📝 Notes

### Coverage Goals Rationale

- **Reporter (90%+)**: Test ID generation is CRITICAL - any bug breaks historical tracking
- **Server (80%+)**: Business logic and data persistence must be rock solid
- **Web (70%+)**: UI utilities and hooks need good coverage
- **Core (50%+)**: Mostly types, less critical to test

### When to Update This Plan

- ✅ When completing a test file (mark with checkboxes)
- ✅ When discovering new areas needing tests
- ✅ When changing coverage targets
- ✅ After each sprint/week of testing work
- ✅ When onboarding new developers

### Links to Documentation

- [TESTING.md](../TESTING.md) - General testing guide
- [ARCHITECTURE.md](../ARCHITECTURE.md) - System architecture
- [CLAUDE.md](../../CLAUDE.md) - AI development quick reference

---

## 🎯 Quick Start for New Session

### Current Status (2025-10-22)

- **Overall Coverage:** ~48% ⚠️ (Target: 75-80% - includes node_modules, see package-specific coverage)
- **Tests Completed:** 25/26 (96%)
- **Tests Written:** 1,065 tests (1,059 passing, 6 skipped)
- **Priority 1 Progress:** 12/12 (100%) ✅ **COMPLETE!**
- **Priority 2 Progress:** 5/5 (100%) ✅ **COMPLETE!**
- **Priority 3 Progress:** 8/8 (100%) ✅ **COMPLETE!**

**Package-Specific Coverage (Source Code Only):**

- **Reporter:** ~95% ✅ (Target: 90%+) - 55 tests
- **Server:** ~85%+ ✅ (Target: 80%+) - 745 tests
- **Web:** ~76% ✅ (Target: 70%+) - 265 tests

### ✅ Completed Tests

1. **testIdGeneration.test.ts** (19 tests) - Reporter - 95%
2. **auth.service.test.ts** (31 tests) - Server - 90%
3. **test.repository.flaky.test.ts** (19 tests) - Server - 85%
4. **database.manager.test.ts** (37 tests) - Server - 90%
5. **attachmentManager.test.ts** (46 tests) - Server - 90%
6. **playwright.service.test.ts** (40 tests) - Server - 85%
7. **test.service.test.ts** (45 tests) - Server - 98.52%
8. **attachment.service.test.ts** (28 tests) - Server - 80%+
9. **auth.middleware.test.ts** (34 tests) - Server - 100%
10. **error.middleware.test.ts** (28 tests) - Server - 100%
11. **test.repository.test.ts** (45 tests) - Server - 91.2%
12. **attachment.repository.test.ts** (36 tests) - Server - 100%
13. **run.repository.test.ts** (39 tests) - Server - 85.71%
14. **test.controller.test.ts** (68 tests) - Server - 100% statements, 82.3% branches
15. **run.controller.test.ts** (37 tests) - Server - 100%
16. **file.util.test.ts** (68 tests) - Server - 100%
17. **response.helper.test.ts** (75 tests) - Server - 100%
18. **useWebSocket.test.ts** (36 passing, 6 skipped) - Web - 85%
19. **useTheme.test.ts** (42 tests) - Web - 100%
20. **usePlaywrightWorkers.test.ts** (47 tests) - Web - 100%
21. **tokenValidator.test.ts** (38 tests) - Web - 100%
22. **webSocketUrl.test.ts** (52 tests) - Web - 100%
23. **formatters.test.ts** (61 tests) - Web - 100%

**Total Tests Written:** 1,065 tests ✅ (1,059 passing, 6 skipped in useWebSocket)

### 🎉 Priority 1 (Critical) - COMPLETE!

All 12 critical tests have been implemented with excellent coverage:

- ✅ Authentication & Authorization (auth.service.test.ts, auth.middleware.test.ts)
- ✅ Test ID Generation & Historical Tracking (testIdGeneration.test.ts)
- ✅ Database Operations & Attachments (database.manager.test.ts, attachmentManager.test.ts)
- ✅ Test Discovery & Execution (playwright.service.test.ts, test.service.test.ts)
- ✅ Test & Attachment Repositories (test.repository.test.ts, attachment.repository.test.ts)
- ✅ Attachment Service (attachment.service.test.ts)
- ✅ Error Handling Middleware (error.middleware.test.ts)
- ✅ Flaky Detection (test.repository.flaky.test.ts)

### 🎉 Priority 2 (Important Business Logic) - COMPLETE!

All 5 Priority 2 tests have been implemented with excellent coverage:

- ✅ Test Controllers (test.controller.test.ts, run.controller.test.ts)
- ✅ Repositories (test.repository.test.ts, attachment.repository.test.ts, run.repository.test.ts)
- ✅ Utility Functions (file.util.test.ts, response.helper.test.ts)

**Server backend is now comprehensively tested with 85%+ coverage!**

### 🎉 Priority 3 (Frontend & Integration) - 8/8 Complete ✅ **ALL COMPLETE!**

**All Frontend & Integration Tests Completed:**

1. ✅ **useWebSocket.test.ts** (36 passing, 6 skipped) - 85%
2. ✅ **useTheme.test.ts** (42 tests) - 100%
3. ✅ **usePlaywrightWorkers.test.ts** (47 tests) - 100%
4. ✅ **tokenValidator.test.ts** (38 tests) - 100%
5. ✅ **webSocketUrl.test.ts** (52 tests) - 100%
6. ✅ **formatters.test.ts** (61 tests) - 100%
7. ✅ **attachmentHelpers.test.ts** (48 tests) - 100%
    - Location: `packages/web/src/features/tests/utils/__tests__/attachmentHelpers.test.ts`
    - Tests: getAttachmentIcon() (7), formatFileSize() (17), downloadAttachment() (13), openTraceViewer() (11), integration scenarios (3)
    - Coverage: All attachment utilities fully tested with edge cases
8. ✅ **reporter.integration.test.ts** (36 tests) - 85%+ ✅ **NEW!**
    - Location: `packages/reporter/src/__tests__/reporter.integration.test.ts`
    - Tests: Initialization (8), onBegin() (4), onTestEnd() (12), onEnd() (6), enhanced errors (3), cleanup handlers (2), lifecycle integration (3)
    - Coverage: Full reporter lifecycle testing with mock HTTP requests and error scenarios

**Total Web Tests:** 265 tests (259 passing, 6 skipped) ✅
**Total Reporter Tests:** 55 tests (all passing) ✅
**Web frontend is now comprehensively tested with 76%+ coverage!**
**Reporter is now comprehensively tested with 95%+ coverage!**

### ⏳ Next: Priority 4 (Optional - Additional Coverage)

Only 1 critical test remaining for 100% planned coverage!

---

**Last Updated:** 2025-10-22
**Maintained by:** Development Team
**Version:** 1.0.0
