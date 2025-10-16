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

## 📂 Quick File Finder

**Need to:**
- Generate testId? → `packages/reporter/src/index.ts`
- WebSocket URL? → `web/src/features/authentication/utils/webSocketUrl.ts`
- Apply theme? → `web/src/hooks/useTheme.ts`
- Rerun button? → `web/src/features/tests/components/history/ExecutionSidebar.tsx`
- Copy attachments? → `server/src/storage/attachmentManager.ts`
- Flaky detection? → `server/src/repositories/test.repository.ts`

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
```

**Package-specific:**
```bash
cd packages/server && npm run dev     # API only
cd packages/web && npm run dev        # React only
cd packages/reporter && npm run dev   # Reporter watch
```

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

**Current:** 1.0.1 (October 2025)
**Reporter:** `playwright-dashboard-reporter@1.0.1`
**Dev workflow:** `npm link` for local changes
**Breaking changes:** v0.x → v1.0.0 (npm package migration)

---

## 🐛 Quick Fixes

| Issue | Solution |
|-------|----------|
| Reporter not found | `npm install --save-dev playwright-dashboard-reporter` |
| WebSocket fails | Check JWT token in URL params |
| Tests not appearing | Verify `PLAYWRIGHT_PROJECT_DIR` in `.env` |
| Attachments 404 | Check permanent storage permissions |

---

**Total:** ~150 lines | **Read time:** 2-3 minutes
**For detailed examples:** See [docs/ai/](docs/ai/)
**Last Updated:** October 2025 | **Maintained by:** Yurii Shvydak
