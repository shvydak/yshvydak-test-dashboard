# Architecture Documentation

## Overview

YShvydak Test Dashboard follows a clean **Layered Architecture** pattern with clear separation of concerns across all components.

## Monorepo Structure

```
packages/
├── core/      # Shared TypeScript types & interfaces
├── reporter/  # @yshvydak/playwright-reporter npm package
├── server/    # Express API + SQLite + WebSocket server (LAYERED ARCHITECTURE)
└── web/       # React + Vite dashboard UI
```

## Server Layered Architecture

```
packages/server/src/
├── app.ts, server.ts                    # Application setup and startup
├── config/                              # Environment config and constants
├── types/                               # TypeScript interfaces for all layers
├── utils/                               # Helpers (ResponseHelper, Logger, FileUtil)
├── middleware/                          # Service injection, CORS, error handling
├── controllers/                         # HTTP request handlers (thin layer)
├── services/                           # Business logic (TestService, PlaywrightService)
├── repositories/                       # Data access layer (TestRepository, etc.)
├── routes/                             # Route definitions with dependency injection
├── database/                           # DatabaseManager and schema
├── websocket/                          # WebSocket server management
└── storage/                            # File attachment management
```

## Layered Architecture Pattern

The server follows a clean **Layered Architecture** with clear separation of concerns:

- **Controllers** (`*.controller.ts`) - HTTP request/response handling only
- **Services** (`*.service.ts`) - Business logic and orchestration
- **Repositories** (`*.repository.ts`) - Data access and database operations
- **Middleware** - Cross-cutting concerns (authentication, logging, dependency injection)

## Key Components

### Service Layer

- `TestService` - Test discovery, execution, and rerun logic, test execution history management
- `PlaywrightService` - Playwright integration and process spawning, automated test discovery via `npx playwright test --list`
- `WebSocketService` - Real-time event broadcasting
- `AttachmentService` - Permanent attachment storage with automatic file copying from Playwright's temporary directory
- `ActiveProcessesTracker` - Real-time tracking of running test processes in memory

### Repository Layer

- `TestRepository` - Test result CRUD operations, historical execution queries with filtering
- `RunRepository` - Test run lifecycle management
- `AttachmentRepository` - Attachment metadata persistence and URL management

### Storage Layer

- `AttachmentManager` - File operations for permanent attachment storage (copy, delete, generate URLs)

### Dependency Injection

- `ServiceContainer` - Manages all service instances
- `injectServices` middleware - Provides services to request objects

## API Compatibility

- **100% backward compatible** with existing `yshvydakReporter.ts`
- All endpoints (`/api/tests`, `/api/runs`) maintain identical request/response formats
- WebSocket events preserved for real-time updates
- Database schema supports both old and new status values

## Architecture Refinement (September 2024)

The server has been refactored to remove unused components from the pre-Layered Architecture migration:

- **Removed**: Empty attachment routes (`/api/attachments`) - attachments handled via `/api/tests/:id/attachments`
- **Removed**: Debug endpoints (`POST /api/tests/test-save`) - not used by any client
- **Cleaned**: Service injection middleware - removed legacy properties, pure Layered Architecture
- **Maintained**: 100% compatibility with reporter and web client - all active endpoints preserved

## Dynamic Playwright Reporter Architecture

The dashboard uses a **dynamic reporter injection** architecture that provides clean separation between test projects and dashboard integration:

### How It Works

1. **No Config Changes**: Test projects keep their standard `playwright.config.ts` unchanged
2. **Dynamic Injection**: Dashboard adds reporter via command line when running tests: `--reporter=@yshvydak/playwright-reporter`
3. **Environment Detection**: Reporter activates only when `DASHBOARD_API_URL` is set
4. **Fallback Support**: Supports both npm package and local file fallback

### Reporter Package (@yshvydak/playwright-reporter)

- **Location**: `packages/reporter/` - Standalone npm package
- **Exports**: CJS/ESM builds with TypeScript declarations
- **Features**:
    - Enhanced error reporting with code context and line highlighting
    - Stable test ID generation using file path + title hash
    - **RunId Synchronization**: Reporter reads RUN_ID from environment (passed by dashboard via Playwright service)
    - Real-time API communication with dashboard server
    - Built-in diagnostics and health checks
    - Silent mode for programmatic usage

### Integration Modes

- **Dynamic Mode** (Recommended): Dashboard injects reporter automatically
- **Legacy Mode**: Manual reporter configuration in `playwright.config.ts`
- **Simple Integration**: Reporter resolved from test project's `node_modules/playwright-dashboard-reporter`

### Diagnostics & Health Checks

- **API Endpoint**: `GET /api/tests/diagnostics` - Complete integration status
- **Validation**: Automatic detection of configuration issues
- **Health Checks**: Reporter connectivity and API availability
- **Error Reporting**: Detailed integration troubleshooting information

## Real-time Process Tracking Architecture

The dashboard implements a **WebSocket-based process tracking** system that ensures UI state correctly reflects actual running processes, eliminating "stuck button" issues after page reloads.

### How It Works

1. **Process Registration**: When tests start, the reporter notifies the server via `POST /api/tests/process-start`
2. **Memory Tracking**: Server maintains active processes in `ActiveProcessesTracker` (in-memory store)
3. **RunId Synchronization**: Dashboard generates runId and passes it to reporter via RUN_ID environment variable
4. **WebSocket Synchronization**: On connection, server sends `connection:status` with current active processes
5. **Process Cleanup**: When tests complete, reporter notifies via `POST /api/tests/process-end`
6. **Automatic Failsafe**: Old processes (>30 minutes) are automatically cleaned up

### Key Benefits

- **Reliable State**: UI buttons reflect actual process state, not database records
- **Page Reload Safe**: State correctly restores after manual page refresh
- **Fault Tolerant**: Automatic cleanup of orphaned processes
- **Real-time Updates**: WebSocket events keep all connected clients synchronized

### Emergency Controls

- **Force Reset API**: `POST /api/tests/force-reset` - Emergency clear all processes
- **Debug Buttons**: UI provides manual reset options when processes appear stuck

## Test Display Consistency Architecture

The dashboard ensures **accurate test count display** throughout the testing lifecycle, preventing discrepancies between discovered and displayed tests.

### How It Works

1. **Stable Test ID Generation**: Both discovery service and reporter use identical algorithms for generating test IDs based on file path + title hash
2. **Optimized SQL Queries**: Repository uses Window Functions and proper grouping to handle test execution history without losing tests
3. **Frontend Limit Parameters**: API calls include explicit `limit=200` to ensure all tests are fetched from backend
4. **Database History Management**: Accumulated test execution records are properly handled to show latest results for each unique test

### Key Benefits

- **Consistent Counts**: Discovery of 80 tests = Display of 80 tests throughout the lifecycle
- **History Preservation**: Test execution history maintained without affecting current test display
- **Performance Optimized**: Efficient SQL queries handle large test suites and execution history
- **Reliable Updates**: Real-time test status updates maintain accuracy during execution

## Attachment Storage Architecture

The dashboard implements a **permanent attachment storage system** that solves the critical problem of Playwright cleaning its temporary `test-results/` directory between test executions.

### The Problem

Playwright stores test artifacts (videos, screenshots, traces) in a temporary `test-results/` directory and automatically cleans this directory when running new tests. This causes a critical bug: after running Test A then Test B, Test A's attachments become inaccessible (404 errors, failed downloads).

### The Solution

The dashboard implements **automatic file copying to permanent storage**:

1. **Interception**: When reporter sends attachment paths, AttachmentService copies files to permanent storage
2. **Isolated Storage**: Each test result gets unique directory: `{OUTPUT_DIR}/attachments/{testResultId}/`
3. **Unique Naming**: Files get timestamp + random suffix to prevent collisions
4. **Clean Replacement**: Re-running a test deletes old physical files before saving new ones
5. **Database Tracking**: Store permanent file paths and URLs in database

### Architecture Flow

```
Reporter → AttachmentService → AttachmentManager → Permanent Storage
                             ↓
                       AttachmentRepository → Database
```

### Key Components

- **AttachmentService**: Orchestrates file copying workflow, coordinates Manager and Repository
- **AttachmentManager**: Handles file operations (copy, delete, generate URLs)
- **AttachmentRepository**: Database operations for attachment metadata
- **Express Static Serving**: Serves files from `/attachments/` with JWT authentication

### Storage Structure

```
{OUTPUT_DIR}/attachments/
├── {testResultId-1}/
│   ├── video-{timestamp}-{random}.webm
│   ├── screenshot-{timestamp}-{random}.png
│   └── trace-{timestamp}-{random}.zip
├── {testResultId-2}/
│   └── video-{timestamp}-{random}.webm
└── {testResultId-3}/
    └── trace-{timestamp}-{random}.zip
```

### Key Benefits

- **Persistent Storage**: Attachments survive Playwright's cleanup cycles
- **Test Isolation**: Each test result has independent file storage
- **Clean Reruns**: Old attachments automatically replaced on test rerun
- **Backward Compatible**: Legacy paths supported alongside new permanent storage

**For detailed documentation**: See [Attachment Management System](./features/PER_RUN_ATTACHMENTS.md)

## Historical Test Tracking Architecture

The dashboard implements a **complete execution history system** that preserves all test runs with independent attachments, enabling users to track test behavior over time.

### The Problem

Traditional test dashboards overwrite previous test results, losing valuable historical data. Users cannot compare current failures with past runs or track test stability trends.

### The Solution

The dashboard uses an **INSERT-only strategy** for test results:

1. **Always Create New Records**: Every test execution creates a new database record (no UPDATE operations)
2. **Independent Attachments**: Each execution maintains its own videos, screenshots, and traces
3. **Always-Visible Sidebar**: ExecutionSidebar provides instant access to history without tab switching
4. **Smart Filtering**: Pending results automatically excluded from history view
5. **Execution Switching**: Users can switch between different test runs with one click from sidebar

### Architecture Flow

```
Test Execution → Reporter → DatabaseManager.saveTestResult() → Always INSERT
                                                              ↓
                                                        New test_results row
                                                              ↓
                                            TestRepository.getTestResultsByTestId()
                                                              ↓
                                                    Returns all executions
                                                              ↓
                                            Frontend ExecutionSidebar (always visible)
```

### Key Components

#### Backend

- **DatabaseManager.saveTestResult()**: Modified to always INSERT instead of UPDATE
- **TestRepository.getTestResultsByTestId()**: Queries all executions for a testId with pending filter
- **TestService.getTestHistory()**: Loads execution history with attachments
- **TestController.getTestHistory()**: API endpoint supporting both testId and result ID

#### Frontend

- **ExecutionSidebar**: Always-visible sidebar panel with execution history (320px width, right side)
- **useTestExecutionHistory**: Hook for fetching execution history
- **testsStore.selectedExecutionId**: Zustand state for tracking selected execution

### Key Benefits

- **Complete History**: Never lose test execution data
- **Attachment Isolation**: Each run has independent artifacts
- **Trend Analysis**: Compare multiple executions to identify patterns
- **User Experience**: Progressive disclosure - history available on demand

**For detailed documentation**: See [Historical Test Tracking](./features/HISTORICAL_TEST_TRACKING.md)

## Frontend Feature-Based Architecture

The web package (`packages/web/`) follows a **Feature-Based Architecture** combined with **Atomic Design** principles for maximum modularity and maintainability.

### Architecture Structure

```
packages/web/src/
├── features/                       # Feature-based modules
│   ├── authentication/             # Authentication feature
│   │   ├── components/             # Login, auth forms
│   │   └── utils/                  # authFetch, JWT handling
│   ├── dashboard/                  # Dashboard feature
│   │   ├── components/
│   │   │   ├── settings/           # Settings modal (theme, actions)
│   │   │   ├── Dashboard.tsx       # Main dashboard view
│   │   │   ├── DashboardStats.tsx  # Statistics display
│   │   │   └── SystemInfo.tsx      # System information
│   │   └── hooks/                  # useDashboardStats, useDashboardActions
│   └── tests/                      # Tests feature (main feature)
│       ├── components/
│       │   ├── testDetail/         # TestDetailModal sub-components
│       │   ├── history/            # ExecutionSidebar (always-visible history panel)
│       │   ├── TestsList.tsx       # Main tests list
│       │   ├── TestsListFilters.tsx # Filters with "Run All Tests" button
│       │   ├── TestsTableView.tsx
│       │   └── ...
│       ├── hooks/                  # useTestAttachments, useTestFilters, useTestGroups, useTestExecutionHistory
│       ├── store/                  # testsStore.ts (Zustand)
│       ├── types/                  # attachment.types.ts
│       ├── utils/                  # formatters, attachmentHelpers
│       └── constants/              # TEST_STATUS_ICONS, FILTER_OPTIONS
├── shared/                         # Shared components (Atomic Design)
│   └── components/
│       ├── atoms/                  # Button, StatusIcon, LoadingSpinner
│       └── molecules/              # Card, ActionButton, StatusBadge, ModalBackdrop
├── config/                         # Environment configuration
├── hooks/                          # Global hooks (useWebSocket, useTheme)
├── App.tsx                         # Main app component
└── main.tsx                        # Application entry point
```

### Key Principles

#### 1. Feature-Based Organization

- **Colocation**: All code related to a feature lives within its directory
- **Independence**: Features are self-contained with their own components, hooks, store, types, utils
- **Scalability**: Easy to add new features without affecting existing code

#### 2. Atomic Design Pattern

- **Atoms**: Basic building blocks (Button, StatusIcon, LoadingSpinner)
- **Molecules**: Simple component combinations (Card, ActionButton, StatusBadge, ModalBackdrop)
- **Organisms**: Complex components composed of molecules and atoms (TestsList, Dashboard)

#### 3. Path Aliases

Clean imports using TypeScript path aliases:

```typescript
import {useTestsStore} from '@features/tests/store/testsStore'
import {Button, Card} from '@shared/components'
import {config} from '@config/environment.config'
```

#### 4. Component Size Best Practice

- **Maximum 200 lines per file**: Large components split into smaller, focused components
- **Example**: TestDetailModal (577 lines) split into 8 modular components (40-100 lines each)

#### 5. DRY Principle (Don't Repeat Yourself)

- **Centralized utilities**: formatters, helpers in `features/tests/utils/`
- **Shared constants**: TEST_STATUS_ICONS, FILTER_OPTIONS in `features/tests/constants/`
- **No duplication**: Single source of truth for all utilities and constants

#### 6. Zustand Store Organization

- **Feature-level stores**: Each feature has its own store inside `features/{feature}/store/`
- **Example**: `features/tests/store/testsStore.ts` manages all tests state
- **Benefits**: Clear ownership, easier testing, better code organization

### Features Breakdown

#### Tests Feature (Main)

- **Components**: TestsList, TestDetailModal (8 sub-components with rerun functionality), TestsTableView, TestRow, TestGroupHeader, ExecutionSidebar (always-visible history panel with Run button)
- **Hooks**: useTestAttachments, useTestFilters, useTestGroups, useTestSort, useTestExecutionHistory (with refetch support)
- **Store**: testsStore.ts (Zustand) - tests state, actions, API calls, selectedExecutionId state, rerunTest method
- **Types**: attachment.types.ts - Attachment, AttachmentWithBlobURL, TabKey
- **Utils**: formatters (duration, dates, status), attachmentHelpers (icons, download, trace viewer)
- **Rerun Feature**: One-click rerun from modal with real-time WebSocket updates and automatic latest execution switching

#### Dashboard Feature

- **Components**: Dashboard, DashboardStats, SystemInfo, RecentTests, ErrorsOverview, Settings Modal (SettingsModal, SettingsThemeSection, SettingsActionsSection)
- **Hooks**: useDashboardStats, useDashboardActions, useTheme (theme management)
- **Settings Modal**: Centralized configuration interface with theme toggle (Auto/Light/Dark) and admin actions
- **Integration**: Uses tests store for data, displays summary and statistics
- **Theme System**: Manual theme control with localStorage persistence, supports Auto/Light/Dark modes

#### Authentication Feature

- **Components**: LoginPage
- **Utils**: authFetch (JWT-based API calls), getWebSocketUrl (WebSocket connection with JWT), authentication helpers
- **Security**: JWT token management, protected routes, localStorage-based auth, automatic WebSocket authentication

### Barrel Exports

Each feature exports its public API through `index.ts`:

```typescript
// features/tests/index.ts
export * from './components'
export * from './hooks'
export * from './utils'
export * from './store/testsStore'
export {FILTER_OPTIONS, TEST_STATUS_COLORS, TEST_STATUS_ICONS} from './constants'
export type {FilterKey} from './constants'
```

### Benefits of This Architecture

1. **Modularity**: Features are independent modules with clear boundaries
2. **Maintainability**: Easy to find and modify code - everything related to a feature is in one place
3. **Scalability**: Simple to add new features without impacting existing ones
4. **Testability**: Isolated features are easier to test
5. **Code Reuse**: Shared components in `shared/` used across all features
6. **Developer Experience**: Clean imports with path aliases, clear file structure

## Technology Stack

### Frontend

- React 18 + TypeScript
- Vite 5 for development
- Tailwind CSS for styling
- Zustand for state management
- React Query for data fetching
- **Architecture**: Feature-Based + Atomic Design

### Backend (Layered Architecture)

- Express.js + TypeScript with clean separation of concerns
- SQLite 3 for persistence with DatabaseManager abstraction
- WebSocket (ws) for real-time updates via WebSocketService
- Dependency Injection container for service management
- Repository pattern for data access
- Service layer for business logic
- Multer for file uploads via AttachmentService
- CORS enabled for development

### Development

- Turborepo for monorepo management
- TypeScript 5 across all packages with strict typing
- ESLint for code quality
- Centralized logging with Logger utility
- Environment-based configuration

## Related Documentation

- [Development Guidelines](./DEVELOPMENT.md)
- [Configuration Details](./CONFIGURATION.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [API Reference](./API_REFERENCE.md)
- [Timestamp Management](./archive/TIMESTAMP_MANAGEMENT.md)
- [Test Display Consistency](./archive/TEST_DISPLAY.md)
- [Attachment Management System](./features/PER_RUN_ATTACHMENTS.md)
- [Historical Test Tracking](./features/HISTORICAL_TEST_TRACKING.md)
- [Rerun from Modal Window](./features/RERUN_FROM_MODAL.md)
- [Dashboard Settings](./features/DASHBOARD_SETTINGS.md)

---

**Last Updated:** October 2025
