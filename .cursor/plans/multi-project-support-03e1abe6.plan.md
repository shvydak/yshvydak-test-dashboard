<!-- 03e1abe6-db8f-4193-9850-7a54a62d413c 7a3d8c41-4c67-47fa-8170-40d219397698 -->

# Multi-Project Support Implementation

## Overview

Add complete multi-project support with project selection flow, JSON-based configuration, and per-project data isolation. Users select a project after login and can switch between projects in Settings.

## Architecture Changes

### 1. Database Schema Migration

**File:** `packages/server/src/database/schema.sql`

Add `project_id` column to tables:

- `test_runs`: Add `project_id TEXT NOT NULL DEFAULT 'default'`
- `test_results`: Add `project_id TEXT NOT NULL DEFAULT 'default'`
- Add index: `CREATE INDEX idx_test_runs_project_id ON test_runs(project_id)`
- Add index: `CREATE INDEX idx_test_results_project_id ON test_results(project_id)`

**Migration Strategy:**

- Create migration file: `packages/server/src/database/migrations/001_add_project_id.sql`
- Existing data gets `project_id = 'default'`
- DatabaseManager applies migrations on startup

### 2. Projects Configuration

**New File:** `projects.json` (root directory)

```json
{
    "probuild-qa": "/Users/y.shvydak/QA/probuild-qa",
    "funzy-qa": "/Users/y.shvydak/QA/funzy-qa"
}
```

**File:** `projects.json.example` - Template file for users

### 3. Backend Implementation

#### Configuration Layer

**File:** `packages/server/src/config/environment.config.ts`

- Add `projects` section with method to read `projects.json`
- Keep backward compatibility: if `PLAYWRIGHT_PROJECT_DIR` exists and no `projects.json`, use single project mode
- Add validation for projects configuration

#### API Endpoints

**New File:** `packages/server/src/controllers/project.controller.ts`

- `GET /api/projects` - List all available projects from `projects.json`
- `GET /api/projects/:projectId/validate` - Validate project directory exists and has Playwright config

**File:** `packages/server/src/routes/project.routes.ts` - New routes

#### Service Layer

**File:** `packages/server/src/services/playwright.service.ts`

- Modify `discoverTests(projectId: string)` to accept project parameter
- Modify `runAllTests(projectId: string, maxWorkers?: number)`
- Update all methods to use specific project directory from config

**File:** `packages/server/src/services/test.service.ts`

- Add `projectId` parameter to all test operations
- Update repository calls to include `project_id` filter

#### Repository Layer

**Files to modify:**

- `packages/server/src/repositories/test.repository.ts`
- `packages/server/src/repositories/run.repository.ts`

Add `project_id` to all INSERT queries and WHERE clauses for filtering.

### 4. Reporter Changes

**File:** `packages/reporter/src/index.ts`

- Read `PROJECT_ID` from environment variable (passed by dashboard)
- Include `projectId` in all API requests body (`/api/tests`, `/api/runs`)
- Fallback to `'default'` if not provided (backward compatibility)

### 5. Frontend Implementation

#### Project Selection Flow

**New Component:** `packages/web/src/features/projects/components/ProjectSelector.tsx`

- Modal shown after successful login (before redirecting to dashboard)
- Fetches available projects via `GET /api/projects`
- User selects project → saves to `localStorage.setItem('selectedProject', projectId)`
- Redirects to dashboard

**File:** `packages/web/src/features/authentication/components/LoginPage.tsx`

Modify login flow (lines 57-71):

```typescript
if (response.ok && data.success) {
    localStorage.setItem('_auth', JSON.stringify({...}))

    // Fetch projects and show selector
    window.location.href = '/select-project'
}
```

**New Route:** `/select-project` in `App.tsx`

#### Project Context

**New File:** `packages/web/src/features/projects/context/ProjectContext.tsx`

- Provides `selectedProject` from localStorage
- `setSelectedProject(projectId)` method
- Validates project selection on app load

**New Hook:** `packages/web/src/features/projects/hooks/useProject.ts`

```typescript
export function useProject() {
    const selectedProject = localStorage.getItem('selectedProject')

    const setProject = (projectId: string) => {
        localStorage.setItem('selectedProject', projectId)
        window.location.reload() // Reload to fetch new project data
    }

    return {selectedProject, setProject}
}
```

#### API Integration

**File:** `packages/web/src/features/tests/store/testsStore.ts`

- Modify all API calls to include `projectId` query parameter
- `GET /api/tests?projectId=${selectedProject}`
- `POST /api/tests/discovery` with `{projectId}` in body

**Files to modify with projectId parameter:**

- `packages/web/src/features/dashboard/hooks/useDashboardStats.ts`
- `packages/web/src/features/dashboard/hooks/useFlakyTests.ts`
- `packages/web/src/features/dashboard/hooks/useTestTimeline.ts`

#### Settings Integration

**File:** `packages/web/src/features/dashboard/components/settings/SettingsModal.tsx`

Add new section: `<SettingsProjectSection />`

**New Component:** `packages/web/src/features/dashboard/components/settings/SettingsProjectSection.tsx`

- Shows current project
- Dropdown to select different project
- "Switch Project" button → calls `setProject()` → reloads page

### 6. Type Definitions

**File:** `packages/core/src/types/index.ts`

Add `projectId` to interfaces:

```typescript
export interface TestRunData {
    projectId: string
    // ... existing fields
}

export interface TestResultData {
    projectId: string
    // ... existing fields
}
```

### 7. Testing Updates

Update existing tests to work with multi-project:

- `packages/server/src/__tests__/` - Add projectId to test data
- `packages/reporter/src/__tests__/` - Mock PROJECT_ID environment variable
- `packages/web/src/features/tests/__tests__/` - Mock useProject hook

### 8. Documentation

**File:** `docs/features/MULTI_PROJECT_SUPPORT.md` - Complete feature documentation

**Update Files:**

- `docs/CONFIGURATION.md` - Document `projects.json`
- `docs/QUICKSTART.md` - Add project selection step
- `README.md` - Update setup instructions
- `CLAUDE.md` - Add multi-project architecture notes

## Implementation Order

1. Database migration (schema + migration runner)
2. Backend configuration (projects.json reader)
3. Backend API (project controller + routes)
4. Backend services/repositories (add projectId parameters)
5. Reporter changes (send projectId)
6. Frontend project context/hook
7. Frontend ProjectSelector component
8. Frontend Settings integration
9. Update all API calls with projectId
10. Testing updates
11. Documentation

## Breaking Changes (No Backward Compatibility)

- `PLAYWRIGHT_PROJECT_DIR` environment variable removed completely
- `projects.json` is now REQUIRED in workspace root
- Database must be recreated (delete existing `test-results.db`)
- All types now require `projectId: string` (not optional)

## Configuration Rules

- `projects.json` must exist in workspace root
- If missing or empty: server fails to start with error message
- Project IDs must match pattern: `[a-z0-9-_]+` (lowercase, digits, dash, underscore)
- Project paths must be absolute and point to valid Playwright projects

## Edge Cases

- No project selected on dashboard load → redirect to `/select-project`
- Selected project no longer in `projects.json` → error message + redirect to selector
- Invalid project path → validation error shown in ProjectSelector UI
- WebSocket disconnects on project switch (new connection after page reload)

### To-dos

- [ ] Create database migration for project_id columns and indexes
- [ ] Implement projects.json configuration reader and validation
- [ ] Create project controller and routes for project management
- [ ] Update services and repositories to support projectId filtering
- [ ] Update reporter to send projectId in API requests
- [ ] Create project context, hook, and localStorage management
- [ ] Build ProjectSelector component and post-login flow
- [ ] Add project switching section to SettingsModal
- [ ] Update all frontend API calls to include projectId parameter
- [ ] Update test suites across all packages for multi-project support
- [ ] Create feature documentation and update existing docs
