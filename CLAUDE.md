# CLAUDE.md - Quick Reference for AI Development

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
