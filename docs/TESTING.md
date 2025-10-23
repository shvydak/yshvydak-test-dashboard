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

## Coverage Targets

- Reporter: 90%+ (focus: test ID generation — CRITICAL)
- Server: 80%+ (services, repositories)
- Web: 70%+ (hooks, utilities)
- Overall target: 75–80%

HTML coverage report is written to `coverage/index.html` at the repo root when running `npm run test:coverage`.

## Vibe Coding Tips

- Use `npm run test:ui` for fast feedback and focused reruns.
- Narrow the scope with `--workspace` to iterate on a single package.
- Keep tests co-located with the code for quicker navigation and edits.

## Testing Patterns

**Critical Examples:**

- Test ID generation: `packages/reporter/src/__tests__/testIdGeneration.test.ts` (CRITICAL - must match server)
- Authentication: `packages/web/src/features/authentication/utils/__tests__/authFetch.test.ts` (JWT, 401 handling)
- Flaky detection: `packages/server/src/repositories/__tests__/test.repository.flaky.test.ts` (SQL algorithm)

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
