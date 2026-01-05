# Reporter Documentation

## Overview

The YShvydak Test Dashboard uses **[`playwright-dashboard-reporter`](https://www.npmjs.com/package/playwright-dashboard-reporter)** - a professional npm package that sends Playwright test results to the Dashboard in real-time.

📦 **npm Package**: [`playwright-dashboard-reporter@1.0.1`](https://www.npmjs.com/package/playwright-dashboard-reporter)
🏗️ **Source Code**: [`packages/reporter/src/index.ts`](../packages/reporter/src/index.ts)

---

## For Users: Installation & Usage

### Installation

```bash
# In your Playwright test project
npm install --save-dev playwright-dashboard-reporter
```

### Configuration

**No changes to `playwright.config.ts` needed!** The Dashboard automatically adds the reporter when running tests.

Your `playwright.config.ts` can stay unchanged:

```typescript
// playwright.config.ts - NO CHANGES NEEDED
import {defineConfig} from '@playwright/test'

export default defineConfig({
    reporter: [
        ['html'], // Your existing reporters work as usual
        ['list'],
    ],
})
```

### Usage

The Dashboard handles everything automatically:

1. **Test Discovery**: Dashboard scans your project with `npx playwright test --list`
2. **Test Execution**: Dashboard runs tests with `npx playwright test --reporter=playwright-dashboard-reporter`
3. **Results**: Appear in Dashboard automatically via WebSocket

**Note:** The dashboard works with any Playwright project structure. File paths are handled by Playwright based on your `testDir` configuration - whether you use `tests/`, `e2e/tests/`, or any custom directory structure.

**From command line (manual runs):**

```bash
# Regular test execution (uses your config reporters)
npx playwright test

# With dashboard reporter (if you want manual integration)
npx playwright test --reporter=playwright-dashboard-reporter
```

---

## How It Works

### Dynamic Reporter Injection

The Dashboard uses **CLI-based reporter injection** - your test project configuration remains clean:

```
Dashboard Action: "Run All Tests"
  ↓
Dashboard spawns: npx playwright test --reporter=playwright-dashboard-reporter
  ↓
Dashboard passes environment: DASHBOARD_API_URL=http://localhost:3001
  ↓
Reporter reads config from environment and sends results to Dashboard
  ↓
Dashboard stores results and broadcasts WebSocket updates
  ↓
UI updates in real-time
```

### Reporter Resolution

The Dashboard looks for the reporter in this order:

1. **Test project's `node_modules/playwright-dashboard-reporter`** (standard installation)
2. If not found, shows validation error with installation instructions

### Key Features

- ✅ **Stable Test ID Generation** - Hash-based IDs using file path + test title
- ✅ **RunId Synchronization** - Dashboard passes RUN_ID to reporter via environment variables
- ✅ **Real-time Updates** - WebSocket integration for live monitoring
- ✅ **Attachment Management** - Automatic video/screenshot/trace copying
- ✅ **Per-test Console Output (Node stdout/stderr)** - Captures `console.log/error/warn` from tests and stores it in test result metadata for display in the Dashboard
- ✅ **Error Context** - Enhanced error reporting with code snippets
- ✅ **Health Checks** - Built-in diagnostics and connectivity validation
- ✅ **Silent Mode** - Programmatic usage without console output

---

## Configuration Options

### Environment Variables (Set by Dashboard)

When Dashboard runs tests, it automatically sets:

| Variable            | Description            | Default                 | Set By    |
| ------------------- | ---------------------- | ----------------------- | --------- |
| `DASHBOARD_API_URL` | Dashboard API endpoint | `http://localhost:3001` | Dashboard |
| `RUN_ID`            | Unique run identifier  | Auto-generated UUID     | Dashboard |
| `NODE_ENV`          | Environment mode       | From Dashboard config   | Dashboard |

### Reporter Options (Advanced)

If you need to manually configure the reporter in `playwright.config.ts`:

```typescript
interface ReporterOptions {
    apiBaseUrl?: string // Dashboard API URL (default: http://localhost:3001)
    silent?: boolean // Suppress console output (default: false)
    timeout?: number // API request timeout in ms (default: 30000)
}
```

**Note:** This is rarely needed since Dashboard handles configuration automatically.

---

## Troubleshooting

### Reporter Not Sending Data

**Symptom**: Tests run but no data appears in Dashboard

**Solutions**:

1. Verify reporter is installed in test project:

    ```bash
    cd /path/to/your/test/project
    npm list playwright-dashboard-reporter
    ```

2. Verify Dashboard server is running:

    ```bash
    curl http://localhost:3001/api/health
    ```

3. Check Dashboard configuration in `.env`:

    ```bash
    PLAYWRIGHT_PROJECT_DIR=/path/to/your/test/project
    PORT=3001
    ```

4. Run diagnostics from Dashboard:
    ```bash
    curl http://localhost:3001/api/tests/diagnostics
    ```

### Package Not Found

**Symptom**: Dashboard shows "Reporter npm package not found" error

**Solution**: Install reporter in your test project:

```bash
cd /path/to/your/test/project
npm install --save-dev playwright-dashboard-reporter
```

### Connection Timeout

**Symptom**: Reporter shows timeout errors

**Solution**: Increase timeout if your Dashboard is on slower network:

```typescript
// playwright.config.ts (only if manually configuring)
reporter: [
    [
        'playwright-dashboard-reporter',
        {
            timeout: 60000, // 60 seconds
        },
    ],
]
```

---

## For Dashboard Developers

### Development Workflow

If you're developing the Dashboard and modifying the reporter package:

```bash
# 1. Start Dashboard
cd ~/Projects/yshvydak-test-dashboard
npm run dev

# 2. Work on reporter (in separate terminal)
cd ~/Projects/yshvydak-test-dashboard/packages/reporter
npm run dev  # Watch mode - auto-rebuild on changes

# 3. Publish changes
npm run build
npm version patch  # 1.0.1 → 1.0.2
npm publish --access public

# 4. Update in test project
cd /path/to/test/project
npm update playwright-dashboard-reporter
```

### Publishing New Version

```bash
cd ~/Projects/yshvydak-test-dashboard/packages/reporter

# Update version (patch/minor/major)
npm version patch  # 1.0.1 → 1.0.2
# npm version minor  # 1.0.1 → 1.1.0
# npm version major  # 1.0.1 → 2.0.0

# Publish to npm
npm publish --access public

# Verify publication
npm view playwright-dashboard-reporter
```

---

## Architecture Details

### Reporter Flow

```
Playwright Test Execution
  ↓
Reporter captures test results + attachments
  ↓
POST /api/tests → Dashboard API
  ↓
Dashboard stores results in SQLite
  ↓
WebSocket broadcasts updates to UI
  ↓
Dashboard displays test results in real-time
```

### Test ID Generation

Reporter uses stable hash-based IDs to ensure same test always gets same ID:

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

This ensures:

- Same test has same ID across discovery and execution
- Historical tracking works correctly
- Reruns update correct test records

### Environment Synchronization

Dashboard passes critical information to reporter via environment variables:

```typescript
// Dashboard spawns Playwright with:
const env = {
    ...process.env,
    DASHBOARD_API_URL: config.api.baseUrl,
    RUN_ID: uuidv4(),
    NODE_ENV: config.server.environment,
}

spawn('npx', ['playwright', 'test', '--reporter=playwright-dashboard-reporter'], {
    cwd: config.playwright.projectDir,
    env,
})
```

---

## Related Documentation

- [Architecture](./ARCHITECTURE.md) - System architecture details
- [API Reference](./API_REFERENCE.md) - Complete API endpoints
- [Development Guidelines](./DEVELOPMENT.md) - Development workflow
- [Configuration](./CONFIGURATION.md) - Environment setup

---

**Last Updated:** October 2025
