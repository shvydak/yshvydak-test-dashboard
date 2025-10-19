# CLAUDE.md - Quick Reference for AI Development

## 🔥 CRITICAL CONTEXT (Read This First in New Chats)

### 1️⃣ Repository Pattern - NEVER Bypass
**Controller → Service → Repository → Database**
- ❌ NEVER: Controller calls DatabaseManager directly
- ✅ ALWAYS: Use full chain for all data operations
- Location: `packages/server/src/controllers/` → `services/` → `repositories/`

### 2️⃣ Reporter Integration - npm package with dev workflow
**Production:** Dashboard uses `playwright-dashboard-reporter` from test project's node_modules
**Development:** Uses `npm link` for local reporter development
- NO local file copies, NO manual config changes
- CLI injection: `--reporter=playwright-dashboard-reporter`
- Location: `packages/reporter/` (source), test project's `node_modules/` or symlink (usage)

### 3️⃣ Test ID Generation - IDENTICAL algorithm
- Discovery and Reporter use SAME hash function
- Ensures historical tracking works correctly
- Location: `packages/reporter/src/index.ts` + `packages/server/src/services/playwright.service.ts`

### 4️⃣ INSERT-only Strategy - NEVER UPDATE test results
- Each execution creates NEW database row with unique ID
- `testId` stays same, `id` changes → execution history
- Location: `packages/server/src/database/database.manager.ts` - `saveTestResult()`

### 5️⃣ Attachment Storage - Permanent, not temporary
- Files copied from Playwright's temp dir to permanent storage
- Each execution gets isolated directory with unique filenames
- Survives Playwright's cleanup cycles
- Location: `packages/server/src/storage/attachmentManager.ts`

---

## 🎯 Project Overview

**YShvydak Test Dashboard** - Full-stack Playwright testing dashboard with rerun capabilities
**Version:** 1.0.1 (October 2025)
**Type:** Monorepo (Turborepo) with 4 packages: core, reporter, server, web

## 📂 Architecture Quick Reference

### Backend: Layered Architecture
```
Controller → Service → Repository → Database
```
- **Controllers** (`*.controller.ts`) - HTTP request/response handling
- **Services** (`*.service.ts`) - Business logic and orchestration
- **Repositories** (`*.repository.ts`) - Data access and SQLite operations
- **NEVER bypass repository layer** - always use the full chain

### Frontend: Feature-Based Architecture + Atomic Design
```
features/{feature}/
├── components/        # Feature-specific components (max 200 lines each)
├── hooks/            # Custom hooks
├── store/            # Zustand state management
├── types/            # TypeScript interfaces
├── utils/            # Helper functions
└── constants/        # Enums and constants
```
- **Path aliases**: `@features/*`, `@shared/*`, `@config/*`
- **Shared components**: `@shared/components/atoms/` (Button), `@shared/components/molecules/` (Card)
- **Component size rule**: Maximum 200 lines per file

## 🗺️ Concept Relationships

### Test Execution Flow
```
User clicks "Run All" → PlaywrightService.runAllTests()
             ↓
CLI injection: npx playwright test --reporter=playwright-dashboard-reporter
             ↓
Reporter generates:
  - testId (stable hash from file + title)
  - execution id (UUID, unique per run)
             ↓
POST /api/tests → TestController → TestService
             ↓
TestRepository.saveTestResult() → ALWAYS INSERT (never UPDATE)
  - id: execution id (unique)
  - testId: stable identifier (same for all runs of this test)
             ↓
AttachmentService.processAttachments() → AttachmentManager
  - Copies files from Playwright temp dir
  - Permanent storage: {OUTPUT_DIR}/attachments/{executionId}/
  - Unique filenames: {type}-{timestamp}-{random}.{ext}
             ↓
WebSocket broadcast → Frontend updates in real-time
  - Event: run:completed, dashboard:refresh
             ↓
User views test → TestDetailModal
  - ExecutionSidebar shows all executions (history)
  - Latest execution selected by default
  - Can switch between executions
  - Each execution has independent attachments
```

### Key Dependencies
- **Historical Tracking** ← depends on → **Test ID Generation** (stable hash)
- **Attachment Storage** ← depends on → **INSERT-only Strategy** (unique execution IDs)
- **Rerun from Modal** ← depends on → **WebSocket + Historical Tracking**
- **Dashboard Redesign** ← depends on → **Historical Tracking + Flaky Detection**
- **Flaky Test Detection** ← depends on → **Test ID Grouping** (multiple executions of same testId)

## 🔑 Critical Concepts

### 1. Reporter Integration (MOST IMPORTANT)

**Dashboard uses npm package ONLY** - no local file copies:

```bash
# Test project setup
npm install --save-dev playwright-dashboard-reporter
```

**No `playwright.config.ts` changes needed!** Dashboard adds reporter via CLI:

```bash
# Dashboard runs:
npx playwright test --reporter=playwright-dashboard-reporter
```

**How it works:**
1. Dashboard spawns Playwright process with `--reporter` CLI flag
2. Dashboard passes environment: `DASHBOARD_API_URL`, `RUN_ID`, `NODE_ENV`
3. Reporter reads config from environment (not from `playwright.config.ts`)
4. Reporter sends results to Dashboard API
5. Dashboard stores in SQLite + broadcasts WebSocket updates

**Validation:** Dashboard checks `node_modules/playwright-dashboard-reporter` exists in test project

See: [@docs/REPORTER.md](docs/REPORTER.md)

### 2. Environment Configuration (5 Variables)

Only 5 core variables needed - all others auto-derived:

```bash
PORT=3001                                    # API server port
NODE_ENV=development                         # Environment mode
PLAYWRIGHT_PROJECT_DIR=/path/to/tests        # Test project path (REQUIRED)
BASE_URL=http://localhost:3001               # Base URL for services
VITE_BASE_URL=http://localhost:3001          # Base URL for web client
```

**Auto-derived variables:**
- `DASHBOARD_API_URL` = `BASE_URL`
- `VITE_API_BASE_URL` = `BASE_URL + '/api'`
- `VITE_WEBSOCKET_URL` = `ws://BASE_URL/ws`
- `OUTPUT_DIR` = `test-results`

See: [@docs/CONFIGURATION.md](docs/CONFIGURATION.md)

### 3. Test ID Generation (Critical for History)

Both discovery and reporter use **identical hash algorithm**:

```typescript
function generateStableTestId(filePath: string, title: string): string {
    const content = `${filePath}:${title}`
    let hash = 0
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash | 0
    }
    return `test-${Math.abs(hash).toString(36)}`
}
```

**Why important:** Ensures same test gets same ID across:
- Discovery (`PlaywrightService.discoverTests()`)
- Execution (reporter generates same ID)
- Historical tracking (multiple runs = same testId, different execution IDs)

### 4. Historical Test Tracking

**INSERT-only strategy** - never UPDATE test results:

```typescript
// ALWAYS create new record
async saveTestResult(testData: TestResultData): Promise<string> {
    const insertSql = `INSERT INTO test_results (...) VALUES (...)`
    await this.run(insertSql, [testData.id, ...])
    return testData.id
}
```

**Database structure:**
- `id` = unique execution ID (UUID from reporter)
- `testId` = stable identifier (hash-based, same for all runs)
- Multiple rows with same `testId` = execution history

See: [@docs/features/HISTORICAL_TEST_TRACKING.md](docs/features/HISTORICAL_TEST_TRACKING.md)

### 5. Attachment Storage

**Permanent storage** - files copied from Playwright's temp directory:

```
{OUTPUT_DIR}/attachments/{testResultId}/
├── video-{timestamp}-{random}.webm
├── screenshot-{timestamp}-{random}.png
└── trace-{timestamp}-{random}.zip
```

**Why:** Playwright cleans `test-results/` between runs, breaking old attachments

**Flow:** Reporter → AttachmentService → AttachmentManager → Permanent Storage

See: [@docs/features/PER_RUN_ATTACHMENTS.md](docs/features/PER_RUN_ATTACHMENTS.md)

## 🚀 Essential Commands

```bash
npm run dev              # Start all packages (server + web)
npm run build            # Build all packages
npm run type-check       # TypeScript validation across all packages
npm run lint             # ESLint checking
npm run lint:fix         # Auto-fix ESLint issues
npm run clear-data       # Interactive CLI to clear test data
```

**Individual packages:**
```bash
cd packages/server && npm run dev     # API server only
cd packages/web && npm run dev        # React app only
cd packages/reporter && npm run dev   # Reporter watch mode
```

## 🔧 Development Rules

### ✅ DO:
1. **Use Context7-MCP** for all dependency documentation lookup
2. **Follow existing patterns** - check similar files first
3. **Use layered architecture** for backend (Controller → Service → Repository)
4. **Keep components under 200 lines** - split large files
5. **Use path aliases** - `@features/*`, `@shared/*` for clean imports
6. **Centralize utilities** - avoid code duplication (DRY principle)

### ❌ DON'T:
1. **Never bypass repository layer** - always use full chain
2. **Never hardcode credentials** - use environment variables
3. **Never add comments** unless explicitly asked
4. **Never duplicate code** - create shared utilities
5. **Never modify reporter integration method** - it's npm package only

## ⚠️ Common Anti-Patterns to Avoid

### Backend Anti-Patterns

#### ❌ Bypassing Repository Layer
```typescript
// WRONG - Direct database access from controller
async someController(req: ServiceRequest, res: Response) {
    await this.dbManager.run("UPDATE test_results SET...")  // ❌ Skips service/repository
}

// CORRECT - Use full chain
async someController(req: ServiceRequest, res: Response) {
    await this.testService.updateTest(...)  // ✅ Service handles business logic
}
```

#### ❌ UPDATE-ing Test Results
```typescript
// WRONG - Destroys execution history
async saveTestResult(testData: TestResultData) {
    if (existingResult) {
        UPDATE test_results SET status = ? WHERE testId = ?  // ❌ Loses history
    }
}

// CORRECT - Always INSERT new records
async saveTestResult(testData: TestResultData) {
    const insertSql = `INSERT INTO test_results (id, testId, ...) VALUES (?, ?, ...)`
    await this.run(insertSql, [testData.id, ...])  // ✅ Preserves history
    return testData.id
}
```

#### ❌ Different Test ID Algorithms
```typescript
// WRONG - Reporter uses different hash than discovery
generateTestId(filePath: string, title: string) {
    return `test-${Math.random()}`  // ❌ Different ID every time
}

// CORRECT - Stable, consistent hash
generateStableTestId(filePath: string, title: string) {
    const content = `${filePath}:${title}`
    let hash = 0
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash | 0
    }
    return `test-${Math.abs(hash).toString(36)}`  // ✅ Same ID for same test
}
```

### Frontend Anti-Patterns

#### ❌ Hardcoding Credentials
```typescript
// WRONG - Credentials in code
const LoginPage = () => {
    const [email, setEmail] = useState('admin@admin.com')  // ❌ Production leak
    const [password, setPassword] = useState('qwe123')     // ❌ Security risk
}

// CORRECT - Empty defaults, user input only
const LoginPage = () => {
    const [email, setEmail] = useState('')  // ✅ User provides credentials
    const [password, setPassword] = useState('')
}
```

#### ❌ Duplicating Utility Logic
```typescript
// WRONG - Duplicated WebSocket URL logic (45 lines in TestDetailModal)
const TestDetailModal = () => {
    const authData = localStorage.getItem('_auth')
    const parsed = JSON.parse(authData)
    const token = parsed?.auth?.token || parsed?.token
    const url = `${config.websocket.url}?token=${encodeURIComponent(token)}`
}

// CORRECT - Shared utility (DRY principle)
import {getWebSocketUrl} from '@/features/authentication/utils/webSocketUrl'

const TestDetailModal = () => {
    const url = getWebSocketUrl(true)  // ✅ Single source of truth
}
```

#### ❌ Components Over 200 Lines
```typescript
// WRONG - Monolithic 577-line component
export function TestDetailModal() {
    // ... 577 lines of mixed concerns
}

// CORRECT - Split into focused components
export function TestDetailModal() {  // 95 lines - orchestrator
    return (
        <>
            <TestDetailHeader />      // 42 lines
            <TestDetailTabs />        // 47 lines
            <TestOverviewTab />       // 162 lines
            <ExecutionSidebar />      // Always-visible history
        </>
    )
}
```

#### ❌ Premature WebSocket Connection
```typescript
// WRONG - Connects before auth token available
const webSocketUrl = useMemo(() => getWebSocketUrl(true), [])  // ❌ Runs once, may be too early

// CORRECT - Wait for authentication to complete
const [webSocketUrl, setWebSocketUrl] = useState<string | null>(null)

useEffect(() => {
    if (isAuthenticated && !isLoading) {
        const url = getWebSocketUrl(true)  // ✅ Only after auth ready
        setWebSocketUrl(url)
    }
}, [isAuthenticated, isLoading])
```

## 📂 File Location Quick Reference

### Backend (Layered Architecture)
```
packages/server/src/
├── controllers/              # HTTP request handlers
│   └── test.controller.ts    ← POST /api/tests, GET /api/tests/:id/history
├── services/                 # Business logic
│   ├── test.service.ts       ← Test discovery, execution, history
│   ├── playwright.service.ts ← Spawns Playwright processes with CLI flags
│   └── attachment.service.ts ← Orchestrates file copying workflow
├── repositories/             # Data access
│   ├── test.repository.ts    ← getFlakyTests(), getTestTimeline()
│   └── attachment.repository.ts
├── storage/                  # File operations
│   └── attachmentManager.ts  ← copyPlaywrightAttachment(), deleteTestAttachments()
└── database/
    └── database.manager.ts   ← saveTestResult() - ALWAYS INSERT
```

### Frontend (Feature-Based)
```
packages/web/src/
├── features/
│   ├── tests/
│   │   ├── components/
│   │   │   ├── testDetail/
│   │   │   │   └── TestDetailModal.tsx  ← WebSocket integration for rerun
│   │   │   ├── history/
│   │   │   │   └── ExecutionSidebar.tsx ← Always-visible history panel
│   │   │   └── TestsListFilters.tsx     ← "Run All Tests" button location
│   │   ├── hooks/
│   │   │   ├── useTestExecutionHistory.ts ← refetch() for manual refresh
│   │   │   └── useTestAttachments.ts
│   │   ├── store/
│   │   │   └── testsStore.ts  ← runningTests Set, rerunTest() method
│   │   └── utils/
│   │       └── attachmentHelpers.ts
│   ├── dashboard/
│   │   ├── components/
│   │   │   ├── Dashboard.tsx        ← Flaky tests + Timeline chart
│   │   │   └── settings/
│   │   │       ├── SettingsModal.tsx
│   │   │       └── SettingsThemeSection.tsx  ← Auto/Light/Dark theme
│   │   └── hooks/
│   │       ├── useFlakyTests.ts  ← localStorage persistence
│   │       └── useTestTimeline.ts
│   └── authentication/
│       ├── utils/
│       │   ├── authFetch.ts      ← Automatic JWT inclusion
│       │   ├── webSocketUrl.ts   ← getWebSocketUrl() utility (DRY)
│       │   └── tokenValidator.ts ← verifyToken() for expiry handling
│       └── context/
│           └── AuthContext.tsx   ← Global logout function
├── hooks/
│   ├── useTheme.ts              ← Theme management with applyThemeMode() utility
│   └── usePlaywrightWorkers.ts  ← Max workers configuration
└── shared/
    └── components/
        ├── atoms/          ← Button, StatusIcon
        └── molecules/      ← Card, ActionButton, ModalBackdrop
```

### Reporter Package
```
packages/reporter/src/
└── index.ts  ← generateStableTestId() - MUST match PlaywrightService
```

### Quick Find Examples
- **"Where is testId generated?"** → `packages/reporter/src/index.ts` + `packages/server/src/services/playwright.service.ts`
- **"Where is WebSocket URL constructed?"** → `packages/web/src/features/authentication/utils/webSocketUrl.ts`
- **"Where is theme applied?"** → `packages/web/src/hooks/useTheme.ts` (applyThemeMode utility)
- **"Where is rerun button?"** → `packages/web/src/features/tests/components/history/ExecutionSidebar.tsx`
- **"Where are attachments copied?"** → `packages/server/src/storage/attachmentManager.ts`
- **"Where is flaky test detection?"** → `packages/server/src/repositories/test.repository.ts` - `getFlakyTests()`

## 📖 Documentation Map

### Quick Start
- **User Setup**: [@docs/QUICKSTART.md](docs/QUICKSTART.md) - 5-minute setup guide
- **Developer Setup**: [@docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

### Core Documentation
- **Architecture**: [@docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Complete system design
- **Reporter**: [@docs/REPORTER.md](docs/REPORTER.md) - npm package integration
- **Configuration**: [@docs/CONFIGURATION.md](docs/CONFIGURATION.md) - Environment setup
- **API Reference**: [@docs/API_REFERENCE.md](docs/API_REFERENCE.md) - REST + WebSocket endpoints

### Feature Documentation
- **Historical Tracking**: [@docs/features/HISTORICAL_TEST_TRACKING.md](docs/features/HISTORICAL_TEST_TRACKING.md)
- **Attachments**: [@docs/features/PER_RUN_ATTACHMENTS.md](docs/features/PER_RUN_ATTACHMENTS.md)
- **Dashboard Redesign**: [@docs/features/DASHBOARD_REDESIGN.md](docs/features/DASHBOARD_REDESIGN.md)
- **Settings**: [@docs/features/DASHBOARD_SETTINGS.md](docs/features/DASHBOARD_SETTINGS.md)
- **Rerun from Modal**: [@docs/features/RERUN_FROM_MODAL.md](docs/features/RERUN_FROM_MODAL.md)
- **Authentication**: [@docs/features/AUTHENTICATION_IMPLEMENTATION.md](docs/features/AUTHENTICATION_IMPLEMENTATION.md)

### Deployment
- **Production Deploy**: [@docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - CloudTunnel setup

## 📦 Version & Compatibility

**Current Version**: 1.0.1 (October 2025)

**Reporter Package**: `playwright-dashboard-reporter@1.0.1`
- npm registry: https://www.npmjs.com/package/playwright-dashboard-reporter
- Compatibility: Works with Playwright 1.40+
- Update command: `npm update playwright-dashboard-reporter`

**Development Workflow**:
- Local development: `npm link` in test project for live reporter changes
- Production: Install from npm registry
- Package location: `packages/reporter/` (source code)

**Breaking Changes History**:
- v1.0.0 → v1.0.1: None (backward compatible)
- v0.x → v1.0.0: Reporter moved to npm package (manual file copy removed)

**API Compatibility**:
- All existing reporter integrations continue to work
- WebSocket events unchanged
- Database schema backward compatible
- REST API endpoints maintain same request/response format

## 🐛 Common Issues & Quick Fixes

### Reporter not found
```bash
# Solution: Install in test project
cd /path/to/test/project
npm install --save-dev playwright-dashboard-reporter
```

### WebSocket connection fails
- **Cause**: JWT token missing or expired
- **Solution**: Check login, verify token in WebSocket URL params

### Tests not appearing
- **Cause**: Wrong `PLAYWRIGHT_PROJECT_DIR` path
- **Solution**: Verify path in `.env` points to correct test project

### Test count mismatch (discovery vs display)
- **Cause**: SQL query limits or nested test structure issues
- **Solution**: Dashboard uses `limit=200` - should handle most projects
- See: [@docs/features/TEST_DISPLAY.md](docs/features/TEST_DISPLAY.md)

### Attachments return 404
- **Cause**: Files not copied to permanent storage
- **Solution**: Check AttachmentService logs, verify `OUTPUT_DIR` permissions

## 📝 Recent Changes (October 2025)

### ✅ Completed:
- Removed local reporter file copy (now npm package ONLY)
- Simplified environment configuration (5 core variables)
- Dashboard redesign with flaky tests detection + timeline visualization
- Historical test tracking with execution sidebar
- Settings modal with theme management (Auto/Light/Dark)
- Rerun from modal with WebSocket real-time updates
- Authentication system with JWT + automatic logout on token expiry

### 🚧 Current Architecture:
- **Reporter**: npm package `playwright-dashboard-reporter@1.0.1`
- **Integration**: CLI flag `--reporter=playwright-dashboard-reporter`
- **No config changes**: `playwright.config.ts` stays unchanged
- **Validation**: Dashboard checks `node_modules/playwright-dashboard-reporter`

## 💡 Key Design Decisions

### Why npm package instead of file copy?
- **Cleaner**: No file copying to test projects
- **Versioning**: npm handles updates automatically
- **Standard**: Follows Playwright ecosystem patterns
- **Simpler**: One `npm install` command

### Why CLI flag instead of config modification?
- **Non-invasive**: Test project config stays pristine
- **Flexible**: Easy to toggle dashboard integration on/off
- **Clean**: No merge conflicts with team's config
- **Standard**: Uses Playwright's official `--reporter` flag

### Why INSERT-only for test results?
- **History**: Never lose execution data
- **Analysis**: Track trends and flakiness over time
- **Comparison**: View multiple runs side-by-side
- **Simplicity**: No complex UPDATE logic

## 🎓 Learning Resources

For deep understanding of specific areas:

- **New to project?** Start with [@docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Adding features?** Read [@docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- **Reporter issues?** Check [@docs/REPORTER.md](docs/REPORTER.md)
- **Deployment?** See [@docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

**For complete documentation navigation, see:** [@docs/README.md](docs/README.md)

**Last Updated:** October 2025 | **Maintained by:** Yurii Shvydak
