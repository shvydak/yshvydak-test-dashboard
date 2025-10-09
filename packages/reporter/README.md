# playwright-dashboard-reporter

Official Playwright reporter for [YShvydak Test Dashboard](https://github.com/shvydak/yshvydak-test-dashboard) - a full-stack testing dashboard with real-time monitoring, one-click reruns, and comprehensive test reporting.

## Features

- 🔄 Real-time test execution monitoring via WebSocket
- 📊 Comprehensive test result tracking with execution history
- 📎 Automatic attachment management (videos, screenshots, traces)
- 🔍 Enhanced error reporting with code context and line highlighting
- 🎯 Stable test ID generation for reliable test tracking
- 🏗️ Built-in diagnostics and health checks
- 🚀 Zero configuration - works out of the box

## Installation

```bash
npm install --save-dev playwright-dashboard-reporter
```

## Quick Start

### 1. Add Reporter to Playwright Config

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['playwright-dashboard-reporter', {
      apiBaseUrl: process.env.DASHBOARD_API_URL || 'http://localhost:3001'
    }],
    ['html'] // Keep your existing reporters
  ]
});
```

### 2. Set Environment Variable

```bash
# .env
DASHBOARD_API_URL=http://localhost:3001
```

### 3. Start Dashboard Server

```bash
# Clone dashboard repository
git clone https://github.com/shvydak/yshvydak-test-dashboard.git
cd yshvydak-test-dashboard

# Install and start
npm install
npm run dev
```

The dashboard will be available at:
- 🌐 Web UI: http://localhost:3000
- 🔌 API: http://localhost:3001

### 4. Run Your Tests

```bash
npx playwright test
```

Results will appear in your Dashboard automatically! 🎉

## Configuration Options

```typescript
interface ReporterOptions {
  apiBaseUrl?: string;      // Dashboard API URL (default: http://localhost:3001)
  silent?: boolean;         // Suppress console output (default: false)
  timeout?: number;         // API request timeout in ms (default: 30000)
}
```

### Example with Custom Options

```typescript
// playwright.config.ts
export default defineConfig({
  reporter: [
    ['playwright-dashboard-reporter', {
      apiBaseUrl: 'https://dashboard.mycompany.com',
      silent: true,
      timeout: 60000
    }]
  ]
});
```

## Environment Variables

The reporter supports the following environment variables:

```bash
# Required: Dashboard API endpoint
DASHBOARD_API_URL=http://localhost:3001

# Optional: Silent mode (suppresses console output)
YSHVYDAK_REPORTER_SILENT=true

# Optional: Custom timeout in milliseconds
YSHVYDAK_REPORTER_TIMEOUT=60000
```

## Usage Scenarios

### Production Deployment

```bash
# Set production Dashboard URL
export DASHBOARD_API_URL=https://dashboard.mycompany.com

# Run tests
npx playwright test
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Run Playwright Tests
  env:
    DASHBOARD_API_URL: ${{ secrets.DASHBOARD_URL }}
  run: npx playwright test
```

### Multiple Projects

The reporter works seamlessly across multiple Playwright projects:

```bash
# Project 1
cd /path/to/project1
npm install --save-dev playwright-dashboard-reporter
npx playwright test

# Project 2
cd /path/to/project2
npm install --save-dev playwright-dashboard-reporter
npx playwright test

# All results appear in the same Dashboard!
```

## Dashboard Features

When using this reporter, you get access to:

- ✅ **Real-time Test Monitoring** - Watch tests execute live
- 🔄 **One-Click Reruns** - Rerun failed tests instantly
- 📈 **Flaky Test Detection** - Identify unstable tests automatically
- 📊 **Timeline Visualization** - View execution trends over time
- 🎥 **Attachment Viewer** - Watch videos, view screenshots, analyze traces
- 📜 **Execution History** - Track all test runs with complete data
- 🔍 **Test Discovery** - Automatically detect all available tests
- 🎯 **Detailed Reporting** - Enhanced error messages with code context

## Troubleshooting

### Reporter Not Sending Data

**Symptom:** Tests run but no data appears in Dashboard

**Solution:**
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

**Symptom:** Reporter shows timeout errors

**Solution:** Increase timeout in reporter configuration:

```typescript
reporter: [
  ['playwright-dashboard-reporter', {
    timeout: 60000 // 60 seconds
  }]
]
```

### Silent Mode Not Working

**Symptom:** Reporter still outputs to console

**Solution:** Set environment variable explicitly:

```bash
export YSHVYDAK_REPORTER_SILENT=true
npx playwright test
```

## API Compatibility

This reporter is compatible with:
- Dashboard API version: **1.x and above**
- Playwright version: **1.40.0 and above**
- Node.js version: **18.0.0 and above**

## Development

### Local Development Setup

If you're developing the Dashboard and want to test reporter changes:

```bash
# 1. Link reporter locally
cd /path/to/yshvydak-test-dashboard/packages/reporter
npm link

# 2. Use linked reporter in test project
cd /path/to/your-test-project
npm link playwright-dashboard-reporter

# 3. Watch for changes (auto-rebuild)
cd /path/to/yshvydak-test-dashboard/packages/reporter
npm run dev
```

### Building from Source

```bash
cd packages/reporter
npm run build      # Build distribution
npm run type-check # TypeScript validation
```

## Support

- 📚 [Documentation](https://github.com/shvydak/yshvydak-test-dashboard/tree/main/docs)
- 🐛 [Report Issues](https://github.com/shvydak/yshvydak-test-dashboard/issues)
- 💬 [Discussions](https://github.com/shvydak/yshvydak-test-dashboard/discussions)

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/shvydak/yshvydak-test-dashboard/blob/main/CONTRIBUTING.md) for guidelines.

## License

MIT © YShvydak

---

**Made with ❤️ for the Playwright community**
