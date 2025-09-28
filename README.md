# YShvydak Test Dashboard

> 🎭 **Modern, full-stack dashboard for Playwright tests with one-click rerun capabilities**

A comprehensive testing dashboard that transforms your Playwright test experience with real-time monitoring, instant reruns, and beautiful reporting. Built for teams who value efficiency and visibility in their testing workflows.

> **📋 Current Status**: File-based integration (simple setup). npm package distribution coming in Phase 2 - see [Roadmap](#🛣️-roadmap).

![Dashboard Screenshot](https://via.placeholder.com/800x400/2563eb/ffffff?text=YShvydak+Test+Dashboard)

## ✨ Why This Dashboard?

### The Problem

-   **No Quick Reruns**: Failed tests require manual command-line reruns
-   **Team Visibility**: Hard to share test status with stakeholders
-   **Historical Context**: No easy way to track test trends over time

### The Solution

-   **🚀 One-Click Reruns**: Instantly rerun any failed test directly from the web UI
-   **📊 Real-Time Monitoring**: Watch tests execute live with WebSocket updates
-   **📈 Historical Tracking**: See test trends, failure patterns, and performance over time
-   **👥 Team Friendly**: Beautiful web interface anyone can understand
-   **🎯 Zero Configuration**: Works with existing Playwright projects out-of-the-box

## 🎪 Key Features

### 🔄 **Smart Test Reruns**

-   Rerun individual tests or entire test files
-   Maintain test context and configuration
-   Real-time feedback on rerun progress

### 📊 **Comprehensive Dashboard**

-   Live test execution monitoring
-   Interactive test results with filtering
-   Test history and trend analysis
-   Attachment viewing (screenshots, videos, traces)

### ⚡ **Dynamic Reporter Integration**

-   **No config changes needed** in your test projects
-   Dashboard automatically injects reporter when running tests
-   Supports both npm package and local file modes

### 🔍 **Advanced Diagnostics**

-   Built-in health checks and configuration validation
-   Integration troubleshooting with detailed error reporting
-   API endpoint for programmatic monitoring

### 🔐 **Secure Authentication**

-   JWT-based user authentication with secure login
-   API key authentication for reporter integration
-   Protected access to test results and attachments
-   Production-ready security implementation

### 🔒 **Reliable State Management**

-   **Process tracking**: Real-time monitoring of active test processes
-   **Page-reload safe**: UI state correctly restores after browser refresh
-   **Auto-recovery**: Automatic cleanup of stuck/orphaned processes

## 🚀 Quick Start

### Prerequisites

-   Node.js 18+ and npm 10+
-   Existing Playwright project

### 1. Install and Setup

```bash
# Clone the dashboard
git clone https://github.com/yshvydak/yshvydak-test-dashboard.git
cd yshvydak-test-dashboard

# Install dependencies
npm install

# Build all packages
npm run build
```

### 2. Configure Your Test Project

#### Copy the Reporter File

First, copy the reporter to your test project:

```bash
# Copy reporter from dashboard to your test project
cp packages/reporter/src/index.ts /path/to/your/playwright/project/e2e/testUtils/yshvydakReporter.ts
```

#### Set Environment Variable

In your Playwright project, add:

```bash
# .env file in your Playwright project
DASHBOARD_API_URL=http://localhost:3001
```

**That's it!** No changes to `playwright.config.ts` needed - the dashboard will dynamically inject the reporter when running tests.

### 3. Configure Dashboard for Your Project

Create a `.env` file in the project root to configure the dashboard:

```bash
# Create .env file in project root
cp .env.template .env

# Edit .env and update the path to your test project:
PLAYWRIGHT_PROJECT_DIR=/path/to/your/playwright/project
PORT=3001
NODE_ENV=development
BASE_URL=http://localhost:3001
VITE_BASE_URL=http://localhost:3001
USE_NPM_REPORTER=false

# Authentication Configuration
ENABLE_AUTH=true
ADMIN_EMAIL=admin@admin.com
ADMIN_PASSWORD=qwe123
JWT_SECRET=dev-jwt-secret-change-in-production-12345
REPORTER_API_KEY=dev-reporter-key-12345
```

**Note:** All other variables are automatically derived from these core settings. For production deployment, use strong passwords and secure JWT secrets. See [Authentication Documentation](docs/features/AUTHENTICATION_IMPLEMENTATION.md) for detailed security setup.

### 4. Start the Dashboard

```bash
# Start the dashboard (reads configuration from .env automatically)
npm run dev
```

The dashboard will be available at:

-   **Web UI**: http://localhost:3000 (or your VITE_PORT value)
-   **API**: http://localhost:3001 (or your PORT value)

### 5. Login and Discover Tests

1. **Open the dashboard** in your browser
2. **Login** with your admin credentials (admin@admin.com / qwe123 for development)
3. **Click "Discover Tests"** to scan your project
4. **Run tests** directly from the UI or rerun failed ones
5. **Monitor results** in real-time!

## 📖 Usage Guide

### Running Tests

#### From Dashboard (Recommended)

-   **Discover Tests**: Scans your Playwright project for all available tests
-   **Run All**: Execute all tests with live monitoring
-   **Run by File**: Run specific test files
-   **Rerun Failed**: One-click rerun of any failed test

#### From Command Line

Your existing test commands work unchanged:

```bash
npx playwright test  # Uses standard reporters
```

When the dashboard runs tests, it automatically adds the custom reporter:

```bash
npx playwright test --reporter=./e2e/testUtils/yshvydakReporter.ts
```

### Monitoring and Results

-   **Live Updates**: Real-time test status via WebSocket
-   **Rich Results**: Enhanced error messages with code context
-   **Attachments**: View screenshots, videos, and traces inline
-   **History**: Track test performance and failure patterns
-   **Filtering**: Find tests by status, file, or timeframe

### Troubleshooting

#### Health Check

Visit `/api/tests/diagnostics` for integration status:

```bash
curl http://localhost:3001/api/tests/diagnostics
```

#### Common Issues

1. **Tests not appearing**: Check `PLAYWRIGHT_PROJECT_DIR` environment variable
2. **Reporter not working**:
    - Verify `DASHBOARD_API_URL` in test project
    - Ensure reporter file is copied to `e2e/testUtils/yshvydakReporter.ts`
3. **Connection issues**: Ensure dashboard is running on correct port
4. **File not found errors**: Verify reporter file path matches dashboard configuration
5. **Test count inconsistency**: If test discovery shows different counts than after test execution:
    - Discovery finds fewer tests: Check if all test files are being scanned properly
    - Fewer tests after execution: Usually resolved by API limit parameters (dashboard uses `limit=200`)
    - See [Test Display Architecture](docs/TEST_DISPLAY.md) for technical details

## 🏗️ Architecture

### Monorepo Structure

```
packages/
├── core/      # Shared TypeScript types
├── reporter/  # Playwright reporter source code
├── server/    # Express API + SQLite + WebSocket
└── web/       # React + Vite dashboard UI
```

### Dynamic Reporter Integration

The dashboard uses **dynamic reporter injection** - no changes needed to your `playwright.config.ts`:

1. **File Copy**: Reporter file copied to your test project once during setup
2. **Test Discovery**: Dashboard scans your project with `playwright test --list`
3. **Dynamic Injection**: When running tests, adds `--reporter=./e2e/testUtils/yshvydakReporter.ts`
4. **Environment Detection**: Reporter activates when `DASHBOARD_API_URL` is set
5. **Clean Separation**: Your `playwright.config.ts` stays unchanged

### Architecture Improvements

The dashboard follows clean **Layered Architecture** principles with recent refinements:

-   **Pure Service Injection**: Streamlined dependency injection without legacy components
-   **Optimized Routes**: Removed unused endpoints, focused on active functionality
-   **100% Compatibility**: All existing integrations continue to work seamlessly

## 🛠️ Development

### Local Development

```bash
# Install dependencies
npm install

# Start all packages in development mode
npm run dev

# Individual package development
cd packages/server && npm run dev  # API server
cd packages/web && npm run dev     # React app
cd packages/reporter && npm run dev # Reporter package
```

### Available Scripts

-   `npm run build` - Build all packages
-   `npm run dev` - Development mode for all packages
-   `npm run type-check` - TypeScript validation
-   `npm run lint` - Code linting
-   `npm run clean` - Clean build artifacts
-   `npm run clear-data` - Interactive data cleanup

### Environment Variables

The dashboard uses a **simplified .env configuration** with automatic derivation of most values:

```bash
# Core Configuration (6 variables + auth)
PORT=3001                                    # API server port
NODE_ENV=development                         # Environment mode
PLAYWRIGHT_PROJECT_DIR=/path/to/your/tests   # Test project location
USE_NPM_REPORTER=false                       # Use npm package vs local file
BASE_URL=http://localhost:3001               # Base URL for all services
VITE_BASE_URL=http://localhost:3001          # Base URL accessible to web client
VITE_PORT=3000                               # Web dev server port (optional)

# Authentication Configuration
ENABLE_AUTH=true                             # Enable authentication
ADMIN_EMAIL=admin@admin.com                  # Admin user email
ADMIN_PASSWORD=qwe123                        # Admin user password
JWT_SECRET=dev-jwt-secret-change-in-production-12345    # JWT signing key
REPORTER_API_KEY=dev-reporter-key-12345      # API key for reporter

# All other variables are derived automatically:
# - DASHBOARD_API_URL = BASE_URL (for API integration)
# - VITE_API_BASE_URL = BASE_URL/api (for web API calls)
# - VITE_WEBSOCKET_URL = ws://BASE_URL/ws (for WebSocket)
# - OUTPUT_DIR = test-results (default storage)

# Advanced users can still override any derived variable
```

**Port Management:**

-   **API Server**: Uses `PORT` (default: 3001)
-   **Web Dev Server**: Uses `VITE_PORT` if set, otherwise `PORT + 1000`, fallback: 4001
-   **Production**: Both services can run on same port with different paths

## 📊 Technology Stack

### Frontend

-   **React 18** + TypeScript
-   **Vite** for fast development
-   **Tailwind CSS** for styling
-   **Zustand** for state management
-   **React Query** for data fetching

### Backend

-   **Express.js** + TypeScript
-   **SQLite** for data persistence
-   **WebSocket** for real-time updates
-   **Layered Architecture** with dependency injection

### DevOps

-   **Turborepo** for monorepo management
-   **TypeScript 5** with strict mode
-   **ESLint** for code quality

## 🛣️ Roadmap

### Phase 1: Current (File-based Integration) ✅

-   Manual file copy setup
-   Dynamic reporter injection
-   Full dashboard functionality

### Phase 2: npm Package (Planned) 🚧

-   Publish `@yshvydak/playwright-reporter` to npm registry
-   One-command installation: `npm install @yshvydak/playwright-reporter`
-   Automatic version updates and centralized management
-   Environment toggle: `USE_NPM_REPORTER=true`

### Phase 3: Enterprise Features (Future) 🔮

-   Multiple project management
-   Role-based access control
-   Advanced analytics and reporting
-   CI/CD integration templates

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** and add tests
4. **Run tests**: `npm run type-check && npm run lint`
5. **Commit your changes**: `git commit -m 'Add amazing feature'`
6. **Push to branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Development Guidelines

-   Follow existing code patterns and TypeScript strict mode
-   Add tests for new features
-   Update documentation for public API changes
-   Ensure all checks pass before submitting PR

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

-   Built with [Playwright](https://playwright.dev/) - the amazing testing framework
-   Inspired by the need for better test visibility and team collaboration
-   Thanks to all contributors who help improve the testing experience

---

<div align="center">
  <strong>Happy Testing! 🎭</strong><br>
  Made with ❤️ by <a href="mailto:y.shvydak@gmail.com">Yurii Shvydak</a>
</div>
