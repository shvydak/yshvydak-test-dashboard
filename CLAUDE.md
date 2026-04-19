# CLAUDE.md - Quick Reference for AI Development

> **Note:** This is the Claude Code-optimized version of project documentation. For Gemini, see [GEMINI.md](GEMINI.md).
> Both files contain identical technical content but may have AI-specific formatting.

## 🔥 CRITICAL CONTEXT (30 seconds to read)

### 1️⃣ Repository Pattern - NEVER Bypass

**Controller → Service → Repository → Database**

- ❌ NEVER: Direct DatabaseManager calls
- ✅ ALWAYS: Full chain for all operations
- 📂 Location: `packages/server/src/{controllers,services,repositories}/`
- 💾 Engine: **SQLite** (`sqlite3` + WAL). Not MongoDB. Schema: `packages/server/src/database/schema.sql`

### 2️⃣ Reporter Integration - npm package + npm link

**Production:** `playwright-dashboard-reporter` from node_modules
**Development:** `npm link` for live changes

- NO config changes to `playwright.config.ts`
- CLI injection: `--reporter=playwright-dashboard-reporter`

### 3️⃣ Test ID Generation - IDENTICAL algorithm

- Discovery & Reporter use SAME hash function
- Ensures historical tracking works
- 📂 `packages/reporter/src/index.ts` + `playwright.service.ts`

### 4️⃣ INSERT-only Strategy - NEVER UPDATE

- Each execution = NEW database row (unique ID)
- `testId` same, `id` changes → history
- 📂 `database.manager.ts` - `saveTestResult()`

### 5️⃣ Attachment Storage - Permanent

- Files copied from Playwright temp → permanent storage
- Survives Playwright's cleanup cycles
- 📂 `packages/server/src/storage/attachmentManager.ts`

### 6️⃣ Context7-MCP Integration - MANDATORY for Dependencies

**ALWAYS check before dependency changes:**

- Adding package? → Check Context7-MCP first
- Updating package? → Check Context7-MCP first
- Changing config? → Check Context7-MCP first

**Why:** Latest docs, breaking changes, best practices
**Priority:** P0 (Critical) - blocks development until checked
📂 Rule: `docs/ai/DOCUMENTATION_UPDATE_RULES.md`

---

## 🗺️ Concept Flow (30 seconds)

```
User clicks "Run All"
  ↓ PlaywrightService
  ↓ CLI: --reporter=playwright-dashboard-reporter
  ↓ Reporter: testId (hash) + execution id (UUID)
  ↓ POST /api/tests → Controller → Service → Repository
  ↓ INSERT (never UPDATE)
  ↓ AttachmentService → Permanent storage
  ↓ WebSocket → Frontend updates
  ↓ TestDetailModal → ExecutionSidebar (history)
```

**Key Dependencies:**

- Historical Tracking ← Test ID Generation
- Attachment Storage ← INSERT-only Strategy
- Rerun from Modal ← WebSocket + History
- Dashboard Redesign ← History + Flaky Detection

---

## 🤖 Vibe Coding Agent

For rapid feature development with automated workflow, use the custom agent:

```
@vibe <feature description>
```

**The agent automatically:**

- 🔍 **Research:** Parallel Explore agents gather context
- 📋 **Planning:** Presents plan + asks only critical questions
- 💻 **Development:** Implements following Repository Pattern + best practices
- 🧪 **Test Gap Detection:** Proactively identifies missing tests
- 🤖 **Smart Validation:** Recommends & runs specialized agents:
    - `validation-agent`: format, type-check, lint, test, build (parallel)
    - `coverage-agent`: test coverage analysis vs targets
    - `documentation-agent`: doc updates + Context7-MCP checks
- 🏗️ **Architecture Review:** Detects dead code, duplicates, pattern violations

**Examples:**

```
@vibe add bulk test rerun
@vibe fix attachments bug
@vibe refactor WebSocket logic
```

**Full workflow guide:** [docs/ai/AGENT_WORKFLOW.md](docs/ai/AGENT_WORKFLOW.md)
**Agent definition:** `.claude/agents/vibe.md` (customizable)

---

## 📂 Quick File Finder

**Need to:**

- Generate testId? → `packages/reporter/src/index.ts`
- WebSocket URL? → `web/src/features/authentication/utils/webSocketUrl.ts`
- Apply theme? → `web/src/hooks/useTheme.ts`
- Rerun button? → `web/src/features/tests/components/history/ExecutionSidebar.tsx`
- Copy attachments? → `server/src/storage/attachmentManager.ts`
- Flaky detection? → `server/src/repositories/test.repository.ts`
- DB schema? → `server/src/database/schema.sql` (copied to `dist/database/` by `copy-files` script — rebuild after edits)
- **Test configurations?** → `vitest.config.ts`, `packages/{package}/vitest.config.ts`
- **Write tests?** → `packages/{package}/src/__tests__/`

**Full structure:** See [docs/ai/FILE_LOCATIONS.md](docs/ai/FILE_LOCATIONS.md)

---

## ⚠️ Top 3 Anti-Patterns

### ❌ Bypassing Repository

```typescript
// WRONG
await this.dbManager.run("UPDATE...")
// RIGHT
await this.testService.updateTest(...)
```

### ❌ UPDATE-ing Test Results

```typescript
// WRONG
UPDATE test_results SET status = ? WHERE testId = ?
// RIGHT
INSERT INTO test_results (id, testId, ...) VALUES (?, ?, ...)
```

### ❌ Duplicating Utilities

```typescript
// WRONG - 45 lines of WebSocket URL logic
const token = localStorage.getItem('_auth')...
// RIGHT
import {getWebSocketUrl} from '@/utils/webSocketUrl'
const url = getWebSocketUrl(true)
```

### ❌ Service-layer N+1 over JOIN repositories

Repository methods like `getTestResultsByTestId` already JOIN attachments + notes. Don't loop the result and call `getAttachmentsByTestResult(execution.id)` per row — that turns 1 query into N+1.

**More examples:** [docs/ai/ANTI_PATTERNS.md](docs/ai/ANTI_PATTERNS.md)

---

## 🎯 Architecture Quick Ref

**Backend:** Controller → Service → Repository → Database
**Frontend:** Feature-Based (`features/{name}/`) + Atomic Design
**Reporter:** npm package, CLI injection, environment config
**Database:** INSERT-only, testId grouping, execution history
**Attachments:** Permanent storage, unique filenames, isolated dirs

### SQLite conventions

- Tests use in-memory DB: `new DatabaseManager(':memory:')` + `await dbManager.initialize()`
- Prefer `ROW_NUMBER() OVER (PARTITION BY ...)` over correlated subqueries (SQLite ≥ 3.25, already used in `getIdsPrunedByCount`)
- Add a composite index when filter + sort target the same query (e.g. `(test_id, created_at DESC)` for history)
- History defaults: `DEFAULT_LIMITS.TEST_HISTORY = 200` (`server/src/config/constants.ts`); frontend hook always sends `?limit=200&byTestId=true`

**Deep dive:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## 🚀 Essential Commands

```bash
npm run dev              # All packages
npm run type-check       # TypeScript validation
npm run lint:fix         # Auto-fix issues
npm test                 # Run all tests
npm run test:watch       # Test watch mode
npm run test:coverage    # Coverage report
```

**Package-specific:**

```bash
cd packages/server && npm run dev     # API only
cd packages/web && npm run dev        # React only
cd packages/reporter && npm run dev   # Reporter watch
```

---

## 🧪 Testing

**Framework:** Vitest 3.2
**Status:** 30 test files, 1,274 tests passing

**Commands:**

- `npm test` - Run all tests
- `npm run test:watch` - Watch mode
- `npm run test:coverage` - Coverage report

**Coverage Targets:**

- Reporter: 90%+ (Test ID generation - CRITICAL)
- Server: 80%+ (Services, repositories)
- Web: 70%+ (Hooks, utilities)

**Full guide:** [TESTING.md](docs/TESTING.md)

---

## 🔧 Development Rules

### ✅ DO:

**Use Context7-MCP** for all dependency documentation lookup

- ALWAYS check before adding/updating dependencies
- ALWAYS check before changing dependency configuration
- Get latest docs, breaking changes, migration guides

**Complete Development Checklist** (Automated via agents):

Vibe agent automatically runs these checks through specialized agents:

1. ✨ `npm run format` - Format all files with Prettier
2. 🔍 `npm run type-check` - Verify TypeScript
3. 🎨 `npm run lint:fix` - Fix linting issues
4. ✅ `npm test` - Run all tests (update affected tests if needed)
5. 📦 `npm run build` - Ensure build succeeds

**Run via:** `@validation-agent` (or automatically when using `@vibe`)
**Manual fallback:** If agents skipped, run commands manually

**IMPORTANT**: These checks are MANDATORY after ANY code changes!

### ❌ DON'T:

**Git Operations:**

- ❌ NEVER commit changes unless explicitly requested by the user

---

## 📖 Navigation (by role)

### First-Time Setup

- [QUICKSTART.md](docs/QUICKSTART.md) - 5 minutes
- [REPORTER.md](docs/REPORTER.md) - npm package setup
- [CONFIGURATION.md](docs/CONFIGURATION.md) - 5 core variables

### Development

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Complete system design
- [DEVELOPMENT.md](docs/DEVELOPMENT.md) - Best practices
- [API_REFERENCE.md](docs/API_REFERENCE.md) - Endpoints
- [TESTING.md](docs/TESTING.md) - Testing infrastructure & guide

### AI Deep Dive

- [docs/ai/AGENT_WORKFLOW.md](docs/ai/AGENT_WORKFLOW.md) - Agent-based workflow guide
- [docs/ai/ANTI_PATTERNS.md](docs/ai/ANTI_PATTERNS.md) - Code examples
- [docs/ai/FILE_LOCATIONS.md](docs/ai/FILE_LOCATIONS.md) - Full structure
- [docs/ai/CONCEPT_MAP.md](docs/ai/CONCEPT_MAP.md) - Detailed flows

### Features

- [HISTORICAL_TRACKING](docs/features/HISTORICAL_TEST_TRACKING.md)
- [ATTACHMENTS](docs/features/PER_RUN_ATTACHMENTS.md)
- [AUTHENTICATION](docs/features/AUTHENTICATION_IMPLEMENTATION.md)

---

## 📦 Version Info

**Dashboard:** 1.0.0 (October 2025)
**Reporter:** `playwright-dashboard-reporter@1.0.2`
**Dev workflow:** `npm link` for local changes
**Breaking changes:** v0.x → v1.0.0 (npm package migration)

---

## 🐛 Quick Fixes

| Issue                                    | Solution                                                                                                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reporter not found                       | `npm install --save-dev playwright-dashboard-reporter`                                                                                                                                        |
| WebSocket fails                          | Check JWT token in URL params                                                                                                                                                                 |
| Tests not appearing                      | Verify `PLAYWRIGHT_PROJECT_DIR` in `.env`                                                                                                                                                     |
| Attachments 404                          | Check permanent storage permissions                                                                                                                                                           |
| Attachment URLs differ between endpoints | JOIN-based mappers in `TestRepository` must apply the same URL rewrite as `AttachmentRepository.getAttachmentsWithUrls()` (`/attachments/...` passthrough, otherwise rebuild from `filePath`) |

---

**Total:** ~150 lines | **Read time:** 2-3 minutes
**For detailed examples:** See [docs/ai/](docs/ai/)
**Last Updated:** October 2025 | **Maintained by:** Yurii Shvydak
