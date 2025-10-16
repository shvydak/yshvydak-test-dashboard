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

### 1. Set Environment Variable

```bash
# .env
DASHBOARD_API_URL=http://localhost:3001
```

### 2. Start Dashboard Server

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

Results will appear in your Dashboard automatically! 🎉

## Configuration Options

```typescript
interface ReporterOptions {
    apiBaseUrl?: string // Dashboard API URL (default: http://localhost:3001)
    silent?: boolean // Suppress console output (default: false)
    timeout?: number // API request timeout in ms (default: 30000)
}
```

## Environment Variables

The reporter supports the following environment variables:

````bash
# Required: Dashboard API endpoint
DASHBOARD_API_URL=http://localhost:3001

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

## API Compatibility

This reporter is compatible with:

- Dashboard API version: **1.x and above**
- Playwright version: **1.40.0 and above**
- Node.js version: **18.0.0 and above**

## Development

For Dashboard developers working on the reporter package:

```bash
cd packages/reporter
npm run build      # Build distribution
npm run dev        # Watch mode (auto-rebuild)
npm run type-check # TypeScript validation
```

## Support

- 📚 [Documentation](https://github.com/shvydak/yshvydak-test-dashboard/tree/main/docs)
- 🐛 [Report Issues](https://github.com/shvydak/yshvydak-test-dashboard/issues)
- 💬 [Discussions](https://github.com/shvydak/yshvydak-test-dashboard/discussions)

## License

MIT © YShvydak

---

**Made with ❤️ for the Playwright community**
````
