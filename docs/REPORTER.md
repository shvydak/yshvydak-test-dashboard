# Reporter Documentation

## Overview

The YShvydak Test Dashboard uses **[`playwright-dashboard-reporter`](https://www.npmjs.com/package/playwright-dashboard-reporter)** - a professional npm package that sends Playwright test results to the Dashboard in real-time.

📦 **npm Package**: [`playwright-dashboard-reporter@1.0.0`](https://www.npmjs.com/package/playwright-dashboard-reporter)
🏗️ **Source Code**: [`packages/reporter/src/index.ts`](../packages/reporter/src/index.ts)

---

## For Users: Production Usage

### Installation

```bash
npm install --save-dev playwright-dashboard-reporter
```

### Configuration

Add reporter to your `playwright.config.ts`:

```typescript
// playwright.config.ts
import {defineConfig} from '@playwright/test'

export default defineConfig({
    reporter: [
        [
            'playwright-dashboard-reporter',
            {
                apiBaseUrl: process.env.DASHBOARD_API_URL || 'http://localhost:3001',
            },
        ],
        ['html'], // Keep your existing reporters
    ],
})
```

### Environment Variables

```bash
# .env
DASHBOARD_API_URL=http://localhost:3001
```

### Usage

```bash
npx playwright test
```

Results will appear in Dashboard automatically! 🎉

---

## For Dashboard Developers: Local Development

### Setup npm link (One-time)

```bash
# 1. Create global symlink in Dashboard project
cd ~/Projects/yshvydak-test-dashboard/packages/reporter
npm run build  # Build once
npm link       # Create global symlink

# 2. Install npm package in test project
cd /Users/y.shvydak/QA/probuild-qa
npm install --save-dev playwright-dashboard-reporter

# 3. Link to local reporter
npm link playwright-dashboard-reporter

# 4. Verify symlink
ls -la node_modules/playwright-dashboard-reporter
# Should show: -> ../../../Projects/yshvydak-test-dashboard/packages/reporter
```

### Development Workflow

```bash
# Terminal 1 - Dashboard server
cd ~/Projects/yshvydak-test-dashboard
npm run dev

# Terminal 2 - Reporter watch mode (auto-rebuild on changes)
cd ~/Projects/yshvydak-test-dashboard/packages/reporter
npm run dev

# Terminal 3 - Test execution
cd /Users/y.shvydak/QA/probuild-qa
npx playwright test
```

### Reporter Integration

The Dashboard uses `playwright-dashboard-reporter` from your test project's `node_modules`:

- **Development**: Set up `npm link` once for local reporter development with instant updates
- **Production**: Use regular `npm install` - the package works out of the box

No additional Dashboard configuration needed - reporter is resolved from test project's `node_modules`.

---

## Reporter Locations

### Primary Source (Development)

**Path**: `packages/reporter/src/index.ts`

This is the **single source of truth** for reporter code.

### npm Package (Production)

**Package**: `playwright-dashboard-reporter@1.0.0`
**Registry**: https://www.npmjs.com/package/playwright-dashboard-reporter

Published package used by all users and production deployments.

---

## Publishing New Version

### Manual Publishing

```bash
cd ~/Projects/yshvydak-test-dashboard/packages/reporter

# 1. Update version (patch/minor/major)
npm version patch  # 1.0.0 → 1.0.1
# npm version minor  # 1.0.0 → 1.1.0
# npm version major  # 1.0.0 → 2.0.0

# 2. Publish to npm
npm publish --access public

# 3. Verify publication
npm view playwright-dashboard-reporter
```

### Update Test Project

```bash
cd /Users/y.shvydak/QA/probuild-qa
npm update playwright-dashboard-reporter
```

---

## Configuration Options

### Reporter Options

```typescript
interface ReporterOptions {
    apiBaseUrl?: string // Dashboard API URL (default: http://localhost:3001)
    silent?: boolean // Suppress console output (default: false)
    timeout?: number // API request timeout in ms (default: 30000)
}
```

### Environment Variables

| Variable                    | Description            | Default                 |
| --------------------------- | ---------------------- | ----------------------- |
| `DASHBOARD_API_URL`         | Dashboard API endpoint | `http://localhost:3001` |
| `YSHVYDAK_REPORTER_SILENT`  | Silent mode            | `false`                 |
| `YSHVYDAK_REPORTER_TIMEOUT` | Request timeout (ms)   | `30000`                 |

---

## Architecture

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

### Key Features

- ✅ **Stable Test ID Generation** - Hash-based IDs using file path + test title
- ✅ **Real-time Updates** - WebSocket integration for live monitoring
- ✅ **Attachment Management** - Automatic video/screenshot/trace copying
- ✅ **Error Context** - Enhanced error reporting with code snippets
- ✅ **Health Checks** - Built-in diagnostics and connectivity validation
- ✅ **Silent Mode** - Programmatic usage without console output

---

## Troubleshooting

### Reporter Not Sending Data

**Symptom**: Tests run but no data appears in Dashboard

**Solutions**:

1. Verify Dashboard server is running:
    ```bash
    curl http://localhost:3001/api/health
    ```
2. Check `DASHBOARD_API_URL` environment variable:
    ```bash
    echo $DASHBOARD_API_URL
    ```
3. Run diagnostics:
    ```bash
    curl http://localhost:3001/api/tests/diagnostics
    ```

### Connection Timeout

**Symptom**: Reporter shows timeout errors

**Solution**: Increase timeout in reporter configuration:

```typescript
reporter: [
    [
        'playwright-dashboard-reporter',
        {
            timeout: 60000, // 60 seconds
        },
    ],
]
```

### npm link Not Working / Unlink

**Symptom**: Changes to reporter not reflected in test project

**Solutions**:

1. Verify symlink exists:
    ```bash
    ls -la /Users/y.shvydak/QA/probuild-qa/node_modules/playwright-dashboard-reporter
    ```
2. Rebuild reporter:
    ```bash
    cd ~/Projects/yshvydak-test-dashboard/packages/reporter
    npm run build
    ```
3. Re-link:
    ```bash
    npm link
    cd /Users/y.shvydak/QA/probuild-qa
    npm link playwright-dashboard-reporter
    ```

**Development → Production**

1. cd /Users/y.shvydak/QA/probuild-qa
2. npm unlink playwright-dashboard-reporter # Remove symlink
3. npm install

---

## Related Documentation

- [Reporter README](../packages/reporter/README.md) - npm package documentation
- [Architecture](./ARCHITECTURE.md) - System architecture
- [API Reference](./API_REFERENCE.md) - API endpoints
- [Development Guidelines](./DEVELOPMENT.md) - Development workflow

```

```
