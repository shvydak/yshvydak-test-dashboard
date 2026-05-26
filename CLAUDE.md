# CLAUDE.md - Quick Reference for AI Development

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

### 7️⃣ app_settings Table - Server-Side Key-Value Config

Shared config stored in SQLite (survives restarts, visible to all users):

- Pattern: `SettingsRepository` + UPSERT `ON CONFLICT(key) DO UPDATE`
- Existing keys: `global_playwright_project`, `disk_warning_threshold_percent`, `disk_critical_threshold_percent`
- Default values: handled in repository getter when row absent (e.g. 20%/5% for disk thresholds)
- 📂 `packages/server/src/repositories/settings.repository.ts`

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

## 🤖 Specialized Agents

Use these agents for post-development checks:

- **`validation-agent`** — format, type-check, lint, tests, build. Run after any code changes.
- **`coverage-agent`** — test coverage vs targets (Reporter 90%, Server 80%, Web 70%).
- **`documentation-agent`** — detects docs needing updates after API/feature changes.
- **`architecture-review-agent`** — Repository Pattern, dead code, duplicated logic.
- **`external-code-review-agent`** — review & fix code written by other AI assistants.

All agents are in `.claude/agents/` and use `disable-model-invocation: true` (manual-only).

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
- Disk space thresholds? → `server/src/repositories/settings.repository.ts`
- Disk warning banner? → `web/src/features/dashboard/components/DiskSpaceWarningBanner.tsx`
- Disk warning hook? → `web/src/features/dashboard/hooks/useDiskSpaceWarning.ts`
- Search input (with ⌘K hint)? → `web/src/shared/components/molecules/SearchInput.tsx` (props: `showShortcutHint`, `onClear`, `resultCount`)
- Search URL persistence? → `TestsList.tsx` — `?q=` param, same pattern as `?filter=`

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

### ❌ Misaligned settings form rows

```tsx
// WRONG - different label lengths push inputs to different horizontal positions
<div className="flex items-center justify-between gap-3">
  <span>Delete runs older than</span>
  <div className="flex items-center gap-2"><input/>...</div>
</div>

// RIGHT - grid keeps inputs/buttons in the same column regardless of label width
<div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2">
  <span>Delete runs older than</span>
  <input className={compactInputClass} />
  <span className="w-14 text-right text-xs">days</span>
  <Button size="sm">Delete</Button>
  ...
</div>
```

### Search is a feature set

When implementing search, always propose the full set together: ESC (clear/blur) + X button + result count + URL persistence (`?q=`). `SearchInput` supports all of these via props: `onClear`, `resultCount`, `showShortcutHint`. Without them, search UX is incomplete.

### ❌ Programmatic focus without forwardRef

`Input` and `SearchInput` are wrapped with `forwardRef` — ref is forwarded down to `<input>`. If programmatic focus is needed on any input component, verify the entire chain (`atom → molecule → feature`) uses `forwardRef`, otherwise `ref.current` will be `null`.

### URL param as a one-shot cross-page signal

For "navigate + side effect" (e.g. go to `/tests` and focus the search input) — add `?signal=1` to the URL, handle it in `useEffect`, and immediately remove it via `setSearchParams(params, {replace: true})`. Cleaner than global state or custom DOM events.

```tsx
// In App.tsx: navigate(`/tests?focusSearch=1`)
// In TestsList.tsx:
useEffect(() => {
    if (searchParams.get('focusSearch') === '1') {
        searchInputRef.current?.focus()
        const params = new URLSearchParams(searchParams)
        params.delete('focusSearch')
        setSearchParams(params, {replace: true})
    }
}, [searchParams, setSearchParams])
```

### ❌ Service-layer N+1 over JOIN repositories

Repository methods like `getTestResultsByTestId` already JOIN attachments + notes. Don't loop the result and call `getAttachmentsByTestResult(execution.id)` per row — that turns 1 query into N+1.

### ❌ Changing behavior without checking all dependents

Before committing any change to a value, constant, default, or behavior:

1. **Grep for all usages** of the old value across source files — other components may duplicate the same logic independently
2. **Grep tests** for assertions on the old value — tests that don't set state explicitly will rely on the old behavior and fail silently until the pre-push hook catches them
3. **Search for parallel implementations** — if a hook/utility has a standalone fallback, pages that don't use that hook (e.g. pre-auth pages) likely have their own copy

Rule: if you change X, ask "where else is X assumed to be true?" before pushing.

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
**Status:** 70 test files, 2,034 tests passing

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

**Complete Development Checklist:**

1. `npm run format` - Format all files with Prettier
2. `npm run type-check` - Verify TypeScript
3. `npm run lint:fix` - Fix linting issues
4. `npm test` - Run all tests (update affected tests if needed)
5. `npm run build` - Ensure build succeeds

**Run via:** `@validation-agent`
**Manual fallback:** Run commands above directly

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

**For detailed examples:** See [docs/ai/](docs/ai/)
**Last Updated:** May 2026 | **Maintained by:** Yurii Shvydak
