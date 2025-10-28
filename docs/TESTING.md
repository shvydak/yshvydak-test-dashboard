# Testing Guide (Vitest)

This project uses Vitest 3.2 for all testing across the monorepo. Vitest is fast, TypeScript-first, and integrates well with Vite (web) and Node (server/reporter).

## Quick Commands

```bash
# Run all tests across packages
npm test

# Watch mode (auto-rerun on changes)
npm run test:watch

# Interactive UI (best for vibe coding)
npm run test:ui

# Coverage report (HTML at coverage/index.html)
npm run test:coverage
```

Per-package focus (workspace):

```bash
# Server (Node environment)
npm test --workspace=@yshvydak/test-dashboard-server

# Web (jsdom + React Testing Library)
npm test --workspace=@yshvydak/web

# Reporter (critical ID generation logic)
npm test --workspace=playwright-dashboard-reporter
```

## Configuration Structure

- Root config: `vitest.config.ts` (runs all packages via `test.projects`)
- Shared settings: Defined in root config (globals, coverage provider, timeouts)
- Package configs (inherit from root and add overrides):
    - `packages/server/vitest.config.ts` (environment: node, setup: `vitest.setup.ts`)
    - `packages/web/vitest.config.ts` (environment: jsdom, setup: `vitest.setup.ts`)
    - `packages/reporter/vitest.config.ts` (environment: node)

**Note:** Migrated from deprecated `vitest.workspace.ts` to `test.projects` in Vitest 3.x

## Test Locations & Naming

- Colocation pattern: tests live near the code they cover.
- Directories: `packages/{server,web,reporter}/src/**/__tests__/`
- File names:
    - `*.test.ts` – unit/integration (TS)
    - `*.test.tsx` – React component tests

## Test Types & Distribution

| Type            | Focus                          | Tools               | Coverage Target |
| --------------- | ------------------------------ | ------------------- | --------------- |
| **Unit**        | Pure logic, isolated functions | Vitest              | 70-75%          |
| **Integration** | HTTP API, middleware, database | Supertest + Vitest  | 15-20%          |
| **E2E**         | UI flows, browser interactions | Playwright (future) | 10%             |

## Coverage Targets

- Reporter: 90%+ (focus: test ID generation — CRITICAL)
- Server Unit Tests: 70%+ (services, repositories, utilities)
- **Server Integration Tests: 80%+ (API endpoints, middleware, database)**
- Web: 70%+ (hooks, utilities, components)
- Overall target: **80–85%** (improved from 75-80%)

**Current Status (October 2025):**

- **Total Tests: 1,473 passed** ✅
- Unit Tests: ~1,400 tests (repositories, services, controllers, utilities)
- **Integration Tests: 71 tests** (6 critical API endpoints)
- Coverage: ~82% overall

HTML coverage report is written to `coverage/index.html` at the repo root when running `npm run test:coverage`.

## API Integration Testing (Supertest)

Integration tests verify full HTTP request/response cycles including middleware chain, authentication, database operations, and file handling.

### Why Supertest?

✅ **Best for Express + TypeScript:**

- Zero configuration with Express apps
- Full HTTP stack testing (request → response)
- TypeScript support out of the box
- Industry standard (8M+ weekly downloads)
- Alternative to manual fetch/axios mocking

✅ **Perfect for our architecture:**

- Tests full middleware chain (CORS → Auth → Services → Repositories → Database)
- Verifies response formats (ResponseHelper)
- Tests authentication (JWT)
- Database integration (SQLite transactions)

### Critical Integration Tests (6 endpoints, 71 tests)

All integration tests verify the complete middleware chain:
**CORS → JSON parsing → Auth → Controller → Service → Repository → Database → Response**

| Endpoint                     | Tests | File                                   |
| ---------------------------- | ----- | -------------------------------------- |
| `POST /api/tests`            | 15    | `createTestResult.integration.test.ts` |
| `POST /api/tests/discovery`  | 10    | `discover.integration.test.ts`         |
| `POST /api/tests/run-all`    | 14    | `runAllTests.integration.test.ts`      |
| `GET /api/tests/:id/history` | 11    | `testHistory.integration.test.ts`      |
| `DELETE /api/tests/:testId`  | 10    | `deleteTest.integration.test.ts`       |
| `POST /api/tests/:id/rerun`  | 11    | `rerunTest.integration.test.ts`        |

### Integration Test Structure

```typescript
import {describe, it, expect, beforeAll, afterAll, beforeEach} from 'vitest'
import request from 'supertest'
import {setupTestServer, teardownTestServer, cleanDatabase} from '../helpers/testServer'
import {fixtures} from '../helpers/fixtures'
import type {TestServerInstance} from '../helpers/testServer'

describe('POST /api/tests - Create Test Result (Integration)', () => {
    let server: TestServerInstance

    beforeAll(async () => {
        // Setup Express app with full middleware stack
        server = await setupTestServer()
    })

    afterAll(async () => {
        await teardownTestServer(server)
    })

    beforeEach(async () => {
        // Clean database between tests for isolation
        await cleanDatabase(server.testRepository)
    })

    it('should save test result through full middleware chain', async () => {
        const response = await request(server.app)
            .post('/api/tests')
            .set('Authorization', `Bearer ${server.authToken}`)
            .send(fixtures.validTestResult)
            .expect(200)

        // Verify response structure
        expect(response.body).toMatchObject({
            status: 'success',
            data: {id: fixtures.validTestResult.id},
        })

        // Verify database persistence
        const savedTests = await getAllTestResults(server.testRepository.dbManager)
        expect(savedTests.length).toBe(1)
        expect(savedTests[0].test_id).toBe(fixtures.validTestResult.testId)
    })
})
```

### What Integration Tests Verify

✅ **Full HTTP Stack**:

- Request → CORS middleware → JSON parsing → Auth middleware → Controller → Service → Repository → Database → Response

✅ **Middleware Chain**:

- CORS headers
- JSON body parsing
- JWT authentication
- Error handling (400, 401, 404, 500)

✅ **Database Operations**:

- INSERT statements
- Foreign key constraints
- CASCADE deletions
- Transaction safety

✅ **Business Logic**:

- INSERT-only strategy (no UPDATE for test results)
- Historical tracking (multiple executions per testId)
- Attachment isolation per execution

✅ **Error Scenarios**:

- Missing required fields (400)
- Invalid authentication (401)
- Conflict detection (409 for run-all)
- Server errors (500)

### Helper Files

**[testServer.ts](../packages/server/src/__tests__/integration/helpers/testServer.ts)**: Setup Express app with full middleware
**[fixtures.ts](../packages/server/src/__tests__/integration/helpers/fixtures.ts)**: Mock test data (valid, invalid, edge cases)
**[database.ts](../packages/server/src/__tests__/integration/helpers/database.ts)**: Database seed and query helpers

### Database Isolation (Best Practice) ✅

**Problem:** Parallel integration test execution can cause conflicts when using a shared database.

**Solution:** Each test file gets its own **temporary isolated database**:

1. **Automatic:** `setupTestServer()` creates unique temp directory (`.test-<random>/`)
2. **Cleanup:** `teardownTestServer()` removes temp database and restores env
3. **Fast:** In-memory or temporary files (no network overhead)
4. **No pollution:** Each test starts with clean state

**Configuration:**

```typescript
// packages/server/vitest.config.ts
{
    pool: 'forks',                    // Use process forks for isolation
    poolOptions: {
        forks: {
            singleFork: true,         // Run all tests in single fork
        },
    },
    sequence: {
        concurrent: false,            // Sequential test file execution
    },
}
```

**Why this matters:**

- ✅ Tests never interfere with each other
- ✅ No shared database state between test files
- ✅ Automatic cleanup prevents disk space issues
- ✅ Environment variable conflicts resolved
- ⚠️ Trade-off: Slower than parallel execution, but ensures correctness

See `packages/server/src/__tests__/integration/helpers/testServer.ts` for implementation.

### Integration Test Coverage Summary

**71 comprehensive integration tests** covering 6 critical API endpoints:

| Endpoint                     | Tests | Purpose                                   | Status |
| ---------------------------- | ----- | ----------------------------------------- | ------ |
| `POST /api/tests`            | 15    | Create test result (reporter integration) | ✅     |
| `POST /api/tests/discovery`  | 10    | Discover available tests                  | ✅     |
| `POST /api/tests/run-all`    | 14    | Run all tests with conflict detection     | ✅     |
| `GET /api/tests/:id/history` | 11    | Test execution history                    | ✅     |
| `DELETE /api/tests/:testId`  | 10    | Delete test and all executions            | ✅     |
| `POST /api/tests/:id/rerun`  | 11    | Rerun specific test                       | ✅     |

#### Phase 1: POST /api/tests (15 tests)

**Location:** `packages/server/src/__tests__/integration/tests/createTestResult.integration.test.ts`

Critical for reporter integration - verifies test results are correctly saved to database.

- ✅ **Success scenarios**: Full fields, minimal fields, failed tests with error details
- ✅ **Validation errors**: Missing id/testId/runId/name, empty object
- ✅ **Public endpoint**: Works without authentication (reporter integration)
- ✅ **INSERT-only strategy**: Creates new record for same testId (historical tracking)
- ✅ **Middleware chain**: Full HTTP stack verification

**Key features tested:**

- Foreign key constraints (test_results → test_runs)
- Default values (duration: 0, retryCount: 0, status: 'unknown')
- Error message/stack handling for failed tests
- INSERT-only strategy (no UPDATE) for historical tracking

#### Phase 2: POST /api/tests/discovery (10 tests)

**Location:** `packages/server/src/__tests__/integration/tests/discover.integration.test.ts`

Test discovery through Playwright CLI integration.

- ✅ **Success scenarios**: Discover and save tests, clear pending tests, preserve completed tests
- ✅ **Error handling**: Empty discovery, Playwright failures, database errors, malformed output
- ✅ **Test ID consistency**: Same hash for same test across discoveries
- ✅ **Public endpoint**: Works without authentication

**Key features tested:**

- Playwright `list` command integration
- Test ID generation consistency (critical for historical tracking)
- Clearing old pending tests while preserving completed
- Mocking Playwright service for isolation

#### Phase 3: POST /api/tests/run-all (14 tests)

**Location:** `packages/server/src/__tests__/integration/tests/runAllTests.integration.test.ts`

Run all tests with conflict detection and active process tracking.

- ✅ **Success scenarios**: Start run with/without maxWorkers, pass workers to Playwright
- ✅ **Conflict detection (409)**: Prevent concurrent runs, include estimated time remaining
- ✅ **Database integration**: Create test_runs with metadata (type: 'run-all')
- ✅ **WebSocket integration**: Broadcast run started event
- ✅ **Public endpoint**: Works without authentication

**Key features tested:**

- Active process tracking (prevent concurrent runs)
- test_runs record creation with metadata
- WebSocket broadcasts for real-time updates
- Conflict error with estimated time remaining

#### Phase 4a: GET /api/tests/:id/history (11 tests)

**Location:** `packages/server/src/__tests__/integration/tests/testHistory.integration.test.ts`

Retrieve test execution history for flaky detection and historical tracking.

- ✅ **Success scenarios**: Get by testId, by execution ID (backwards compatibility)
- ✅ **Query parameters**: Respect limit (default: 50), handle invalid limit
- ✅ **Filtering**: Exclude pending/skipped tests, order by created_at DESC
- ✅ **Empty results**: Return empty array for non-existent testId

**Key features tested:**

- Historical tracking (multiple executions per testId)
- Ordering (newest first)
- Status filtering (exclude pending/skipped)
- Backwards compatibility (execution ID lookup)

#### Phase 4b: DELETE /api/tests/:testId (10 tests)

**Location:** `packages/server/src/__tests__/integration/tests/deleteTest.integration.test.ts`

Delete test and all its executions with attachment cleanup.

- ✅ **Success scenarios**: Delete all executions, only specified testId, return deleted count
- ✅ **Validation**: Handle missing/empty testId
- ✅ **Attachments cleanup**: CASCADE delete attachment records
- ✅ **Isolation**: Only delete specified testId

**Key features tested:**

- CASCADE deletion (test_results → attachments)
- Physical attachment file cleanup
- Deletion count reporting
- Isolation between different testIds

#### Phase 4c: POST /api/tests/:id/rerun (11 tests)

**Location:** `packages/server/src/__tests__/integration/tests/rerunTest.integration.test.ts`

Rerun specific test from test detail modal.

- ✅ **Success scenarios**: Start rerun with/without maxWorkers, pass to Playwright
- ✅ **Error handling**: 404 for non-existent test, 500 on Playwright failure
- ✅ **Active processes**: Add to tracker, prevent concurrent reruns
- ✅ **Database integration**: Create test_runs with rerun metadata

**Key features tested:**

- Test lookup by execution ID
- Active process tracking (type: 'rerun')
- test_runs record with rerun metadata (originalTestId, filePath)
- Playwright service integration (rerunSingleTest)

### Running Integration Tests

```bash
# Run all integration tests
npm test -- packages/server/src/__tests__/integration/tests/

# Run specific test file
npm test -- packages/server/src/__tests__/integration/tests/createTestResult.integration.test.ts

# Watch mode
npm test -- packages/server/src/__tests__/integration/tests/ --watch

# With coverage
npm test -- packages/server/src/__tests__/integration/tests/ --coverage
```

**Expected Results:**

```
Test Files  6 passed (6)
Tests       71 passed (71)
Duration    ~800-1000ms
```

**Note:** Integration tests run sequentially (not parallel) to ensure database isolation. This makes them slower but ensures correctness.

## Vibe Coding Tips

- Use `npm run test:ui` for fast feedback and focused reruns.
- Narrow the scope with `--workspace` to iterate on a single package.
- Keep tests co-located with the code for quicker navigation and edits.
- **Integration tests**: Use `fixtures` for consistent test data across files.

## Testing Patterns

**Critical Examples:**

- **Unit Tests**:
    - Test ID generation: `packages/reporter/src/__tests__/testIdGeneration.test.ts` (CRITICAL - must match server)
    - Authentication: `packages/web/src/features/authentication/utils/__tests__/authFetch.test.ts` (JWT, 401 handling)
    - Flaky detection: `packages/server/src/repositories/__tests__/test.repository.flaky.test.ts` (SQL algorithm)

- **Integration Tests**:
    - API endpoints: `packages/server/src/__tests__/integration/tests/createTestResult.integration.test.ts` (full HTTP stack)
    - See all integration tests: `packages/server/src/__tests__/integration/tests/`

**Common Patterns:**

```typescript
// Mock storage (localStorage/sessionStorage)
beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
})

// Mock WebSocket manager
vi.spyOn(WebSocketServer, 'getWebSocketManager').mockReturnValue(mockWsManager)

// Time-based tests (cleanup/timeout)
vi.useFakeTimers()
vi.setSystemTime(new Date('2024-01-01T12:00:00Z'))
// ... test code
vi.useRealTimers()

// React Context with wrapper
const wrapper = ({children}: {children: React.ReactNode}) => (
    <AuthProvider onLogout={vi.fn()}>{children}</AuthProvider>
)
const {result} = renderHook(() => useAuth(), {wrapper})

// Type assertions for complex mocks
const mockResponse = {ok: true, status: 200} as unknown as Response

// DOM matchers
import '@testing-library/jest-dom/vitest'
expect(element).toBeInTheDocument()
```

**Quick reference:** See [CLAUDE.md](../CLAUDE.md)
**Full file structure:** See [docs/ai/FILE_LOCATIONS.md](ai/FILE_LOCATIONS.md)
**Use Context7-MCP** for latest Vitest documentation when needed
