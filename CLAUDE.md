# CLAUDE.md - Quick Reference for AI Development

## 🔥 CRITICAL CONTEXT (30 seconds to read)

### 1️⃣ Repository Pattern - NEVER Bypass

**Controller → Service → Repository → Database**

- ❌ NEVER: Direct DatabaseManager calls
- ✅ ALWAYS: Full chain for all operations
- 📂 Location: `packages/server/src/{controllers,services,repositories}/`

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

- 🔍 Researches existing implementation (parallel Explore agents)
- 📋 Presents plan + asks only critical questions
- 💻 Develops following Repository Pattern + best practices
- 🧪 Runs validation (format/type-check/lint/test/build)
- 📊 Checks test coverage
- 📝 Checks documentation updates (DOCUMENTATION_UPDATE_RULES.md)

**Examples:**

```
@vibe add bulk test rerun
@vibe fix attachments bug
@vibe refactor WebSocket logic
```

**Full guide:** [docs/ai/VIBE_CODING.md](docs/ai/VIBE_CODING.md)

---

## 📂 Quick File Finder

**Need to:**

- Generate testId? → `packages/reporter/src/index.ts`
- WebSocket URL? → `web/src/features/authentication/utils/webSocketUrl.ts`
- Apply theme? → `web/src/hooks/useTheme.ts`
- Rerun button? → `web/src/features/tests/components/history/ExecutionSidebar.tsx`
- Copy attachments? → `server/src/storage/attachmentManager.ts`
- Flaky detection? → `server/src/repositories/test.repository.ts`
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

**More examples:** [docs/ai/ANTI_PATTERNS.md](docs/ai/ANTI_PATTERNS.md)

---

## 🎯 Architecture Quick Ref

**Backend:** Controller → Service → Repository → Database
**Frontend:** Feature-Based (`features/{name}/`) + Atomic Design
**Reporter:** npm package, CLI injection, environment config
**Database:** INSERT-only, testId grouping, execution history
**Attachments:** Permanent storage, unique filenames, isolated dirs

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

**Complete Development Checklist** (MANDATORY after ANY code changes):

1. ✨ `npm run format` - Format all files with Prettier
2. 🔍 `npm run type-check` - Verify TypeScript
3. 🎨 `npm run lint:fix` - Fix linting issues
4. ✅ `npm test` - Run all tests (update affected tests if needed)
5. 📦 `npm run build` - Ensure build succeeds

**IMPORTANT**: Never skip this checklist during vibe coding sessions!

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

| Issue               | Solution                                               |
| ------------------- | ------------------------------------------------------ |
| Reporter not found  | `npm install --save-dev playwright-dashboard-reporter` |
| WebSocket fails     | Check JWT token in URL params                          |
| Tests not appearing | Verify `PLAYWRIGHT_PROJECT_DIR` in `.env`              |
| Attachments 404     | Check permanent storage permissions                    |

---

**Total:** ~150 lines | **Read time:** 2-3 minutes
**For detailed examples:** See [docs/ai/](docs/ai/)
**Last Updated:** October 2025 | **Maintained by:** Yurii Shvydak
