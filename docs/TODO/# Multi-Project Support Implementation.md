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

## User Acceptance Criteria

### UAC-1: Initial Setup and Configuration

**Given** a fresh installation of the dashboard

**When** I start the server without `projects.json`

**Then** the server should fail with a clear error message: "projects.json not found. Please create it in workspace root."

**Given** I create `projects.json` with valid project configurations

**When** I start the server

**Then** the server should start successfully and load all projects

### UAC-2: Login and Project Selection (Single Project)

**Given** `projects.json` contains only one project

**When** I successfully log in

**Then** the system should auto-select that project and redirect me directly to the dashboard

**And** I should see tests from that project immediately

### UAC-3: Login and Project Selection (Multiple Projects)

**Given** `projects.json` contains multiple projects (e.g., "probuild-qa", "funzy-qa")

**When** I successfully log in

**Then** I should see a ProjectSelector page with beautiful dynamic cards

**And** each card should display the project ID as its title

**When** I click on a project card

**Then** the system should save my selection to localStorage

**And** redirect me to the dashboard showing that project's data

### UAC-4: Dashboard - Project Isolation

**Given** I am logged in and have selected "probuild-qa"

**When** I view the dashboard

**Then** I should see only tests, runs, and statistics for "probuild-qa"

**And** no data from other projects should be visible

**When** I click "Discover Tests"

**Then** the system should discover tests only from the "probuild-qa" directory

**And** save them with `projectId: "probuild-qa"`

**When** I click "Run All Tests"

**Then** the system should run only tests from "probuild-qa"

**And** show real-time updates via WebSocket for this project only

### UAC-5: Project Switching via Settings

**Given** I am on the dashboard with project "probuild-qa" selected

**When** I open SettingsModal (gear icon)

**Then** I should see a "SettingsProjectSection" showing current project

**When** I view available projects in that section

**Then** I should see beautiful dynamic cards for all projects from `projects.json`

**And** the currently selected project should be visually highlighted

**When** I click on a different project card (e.g., "funzy-qa")

**Then** the system should save the new selection to localStorage

**And** reload the page automatically

**And** after reload, I should see the dashboard for "funzy-qa"

### UAC-6: Multi-Tab Isolation

**Given** I have two browser tabs open

**When** Tab 1 is showing "probuild-qa" and Tab 2 is showing "funzy-qa"

**Then** each tab should independently show data for its selected project

**When** I run tests in "probuild-qa" (Tab 1)

**Then** Tab 1 should receive real-time WebSocket updates

**And** Tab 2 ("funzy-qa") should NOT receive those updates

**And** both test runs can proceed simultaneously without conflicts

### UAC-7: Test Execution and History

**Given** I have selected project "probuild-qa"

**When** I run a test that generates attachments (video, screenshot, trace)

**Then** attachments should be stored in `{OUTPUT_DIR}/attachments/probuild-qa/{testResultId}/`

**And** attachments should be accessible only for that project

**When** I view test execution history

**Then** I should see only historical executions for "probuild-qa" tests

**And** history from other projects should not be visible

### UAC-8: WebSocket Real-Time Updates

**Given** I am viewing dashboard for "probuild-qa"

**When** the WebSocket connection is established

**Then** the connection URL should include `?token=JWT&projectId=probuild-qa`

**When** a test completes in "probuild-qa"

**Then** I should receive real-time updates for test status, progress, and completion

**And** the dashboard should refresh automatically with new data

**When** tests run in a different project ("funzy-qa")

**Then** I should NOT receive those WebSocket events in my "probuild-qa" tab

### UAC-9: Project Configuration Validation

**Given** `projects.json` contains a project with invalid path

**When** I try to select that project in ProjectSelector

**Then** I should see a validation error on the project card

**And** I should not be able to proceed with that selection

**Given** I have a project selected that gets removed from `projects.json`

**When** I reload the dashboard

**Then** I should see an error message: "Selected project no longer available"

**And** be redirected to the ProjectSelector page

### UAC-10: Reporter Integration

**Given** I am running Playwright tests from CLI with dashboard reporter

**When** the dashboard spawns the test process

**Then** the reporter should receive `PROJECT_ID` environment variable with correct project ID

**When** tests execute and complete

**Then** test results should be sent to API with `projectId` field in request body

**And** all results should be correctly associated with the project in the database

### UAC-11: API Consistency

**Given** I am making API requests for "probuild-qa"

**When** I call GET endpoints (e.g., `/api/tests`)

**Then** `projectId` should be passed as query parameter: `/api/tests?projectId=probuild-qa`

**When** I call POST endpoints (e.g., `/api/tests/discovery`)

**Then** `projectId` should be passed in request body: `{projectId: "probuild-qa"}`

**And** all responses should contain only data for the specified project

### UAC-12: Settings Modal Project Section UI

**Given** I open SettingsModal

**When** I scroll to the Project section

**Then** I should see:

- Section title: "Project Selection"
- Current project displayed prominently
- Grid of beautiful dynamic cards for all available projects
- Each card shows project ID as title
- Currently selected project card is highlighted/active
- Cards are clickable and have hover effects
- Smooth animations when switching projects

### UAC-13: Error Handling

**Given** the backend cannot read `projects.json`

**When** I try to access any page

**Then** I should see a clear error message about configuration issue

**Given** a project path doesn't exist or lacks `playwright.config.ts`

**When** I try to run tests for that project

**Then** I should see a validation error with specific details

**Given** WebSocket connection fails

**When** I am on the dashboard

**Then** the UI should show connection status and gracefully degrade (no real-time updates)

**And** I should still be able to use the dashboard with manual refresh

---

**Last Updated:** October 2025
