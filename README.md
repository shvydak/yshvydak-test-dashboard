# YShvydak Test Dashboard

> 🎭 **Modern, full-stack dashboard for Playwright tests with one-click rerun capabilities**

A comprehensive testing dashboard that transforms your Playwright test experience with real-time monitoring, instant reruns, and beautiful reporting. Built for teams who value efficiency and visibility in their testing workflows.

> **📦 npm Package Available**: [`playwright-dashboard-reporter`](https://www.npmjs.com/package/playwright-dashboard-reporter) - Professional npm package for seamless integration.

![Dashboard Screenshot](https://via.placeholder.com/800x400/2563eb/ffffff?text=YShvydak+Test+Dashboard)

## ✨ Why This Dashboard?

### The Problem

- **No Quick Reruns**: Failed tests require manual command-line reruns
- **Team Visibility**: Hard to share test status with stakeholders
- **Historical Context**: No easy way to track test trends over time

### The Solution

- **🚀 One-Click Reruns**: Instantly rerun any failed test directly from the web UI
- **📊 Real-Time Monitoring**: Watch tests execute live with WebSocket updates
- **📈 Historical Tracking**: See test trends, failure patterns, and performance over time
- **👥 Team Friendly**: Beautiful web interface anyone can understand
- **🎯 Zero Configuration**: Works with existing Playwright projects out-of-the-box

## 🎪 Key Features

### 🔄 **Smart Test Reruns**

- Rerun individual tests or entire test files
- Maintain test context and configuration
- Real-time feedback on rerun progress

### 📊 **Comprehensive Dashboard**

- Live test execution monitoring
- Interactive test results with filtering
- Complete execution history with independent attachments per run
- Attachment viewing (screenshots, videos, traces) with persistent storage
- **Settings modal** with centralized configuration (theme, admin actions)
- **Theme system** with Auto/Light/Dark modes and localStorage persistence

### ⚡ **Simple Reporter Integration**

- **Works with npm package**: Install `playwright-dashboard-reporter` in your test project
- **Zero configuration**: No changes to `playwright.config.ts` needed
- **Automatic injection**: Dashboard adds reporter via CLI flag when running tests
- **Clean separation**: Your existing reporters continue to work unchanged

### 🔍 **Advanced Diagnostics**

- Built-in health checks and configuration validation
- Integration troubleshooting with detailed error reporting
- API endpoint for programmatic monitoring

### 🔐 **Secure Authentication**

- JWT-based user authentication with secure login
- Simplified local network integration for reporters
- Protected access to test results and attachments
- Production-ready security implementation

### 🔒 **Reliable State Management**

- **Process tracking**: Real-time monitoring of active test processes
- **Page-reload safe**: UI state correctly restores after browser refresh
- **Auto-recovery**: Automatic cleanup of stuck/orphaned processes
- **Persistent attachments**: Test artifacts stored permanently, surviving Playwright's cleanup cycles

### 📜 **Complete Execution History**

- **Never lose test data**: Every test execution creates a new record (no overwrites)
- **Independent artifacts**: Each run maintains its own videos, screenshots, and traces
- **Compare runs**: View and analyze multiple executions side-by-side
- **History tab**: Dedicated UI for browsing past test executions
- **Smart filtering**: Pending results automatically excluded from history
- **Trend analysis**: Track test stability and performance over time

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm 10+
- Existing Playwright project

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

### 2. Install Reporter in Your Test Project

```bash
# Navigate to your Playwright project
cd /path/to/your/playwright/project

# Install the reporter
npm install --save-dev playwright-dashboard-reporter
```

**Important:** No changes to `playwright.config.ts` are needed. The Dashboard automatically adds the reporter when running tests via CLI flag `--reporter=playwright-dashboard-reporter`.

Your `playwright.config.ts` remains unchanged and can keep existing reporters:

```typescript
// playwright.config.ts - NO CHANGES NEEDED
import {defineConfig} from '@playwright/test'

export default defineConfig({
    reporter: [
        ['html'], // Your existing reporters continue to work
        ['list'],
    ],
})
```

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

# Authentication Configuration
ENABLE_AUTH=true
ADMIN_EMAIL=admin@admin.com
ADMIN_PASSWORD=qwe123
JWT_SECRET=dev-jwt-secret-change-in-production-12345
```

**Note:** All other variables are automatically derived from these core settings. For production deployment, use strong passwords and secure JWT secrets. See [Authentication Documentation](docs/features/AUTHENTICATION_IMPLEMENTATION.md) for detailed security setup.

### 4. Start the Dashboard

```bash
# Start the dashboard (reads configuration from .env automatically)
npm run dev
```

The dashboard will be available at:

- **Web UI**: http://localhost:3000 (or your VITE_PORT value)
- **API**: http://localhost:3001 (or your PORT value)

### 5. Login and Discover Tests

1. **Open the dashboard** in your browser
2. **Login** with your admin credentials (admin@admin.com / qwe123 for development)
3. **Click "Discover Tests"** to scan your project
4. **Run tests** directly from the UI or rerun failed ones
5. **Monitor results** in real-time!

## 📖 Usage Guide

### Running Tests

#### From Dashboard (Recommended)

- **Discover Tests**: Scans your Playwright project for all available tests
- **Run All**: Execute all tests with live monitoring
- **Run by File**: Run specific test files
- **Rerun Failed**: One-click rerun of any failed test

#### From Command Line

Your existing test commands work unchanged:

```bash
npx playwright test  # Uses standard reporters
```

When the dashboard runs tests, it automatically adds the custom reporter:

```bash
npx playwright test --reporter=playwright-dashboard-reporter
```

### Monitoring and Results

- **Live Updates**: Real-time test status via WebSocket
- **Rich Results**: Enhanced error messages with code context
- **Attachments**: View screenshots, videos, and traces inline
- **Execution History**: View all past test runs with independent artifacts for each execution
- **Filtering**: Find tests by status, file, or timeframe

### Troubleshooting

#### Health Check

Visit `/api/tests/diagnostics` for integration status:

```bash
curl http://localhost:3001/api/tests/diagnostics
```

#### Common Issues

1. **Tests not appearing**: Check `PLAYWRIGHT_PROJECT_DIR` environment variable
2. **Reporter not working**:
    - Verify `playwright-dashboard-reporter` is installed: `npm list playwright-dashboard-reporter`
    - Check Dashboard is running and `PLAYWRIGHT_PROJECT_DIR` points to correct test project
    - Dashboard passes `DASHBOARD_API_URL` to reporter automatically via environment
3. **Connection issues**: Ensure dashboard is running on correct port
4. **Package not found errors**: Run `npm install --save-dev playwright-dashboard-reporter` in your test project
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

1. **npm Package**: Dashboard uses `playwright-dashboard-reporter` from your test project's `node_modules`
2. **Test Discovery**: Dashboard scans your project with `playwright test --list`
3. **Dynamic Injection**: When running tests, adds `--reporter=playwright-dashboard-reporter` CLI flag
4. **Clean Separation**: Your `playwright.config.ts` stays unchanged
5. **Automatic Mode**: Reporter reads configuration from Dashboard environment variables

### Architecture Improvements

The dashboard follows clean **Layered Architecture** principles with recent refinements:

- **Pure Service Injection**: Streamlined dependency injection without legacy components
- **Optimized Routes**: Removed unused endpoints, focused on active functionality
- **100% Compatibility**: All existing integrations continue to work seamlessly

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

- `npm run build` - Build all packages
- `npm run dev` - Development mode for all packages
- `npm run type-check` - TypeScript validation
- `npm run lint` - Code linting
- `npm run clean` - Clean build artifacts
- `npm run clear-data` - Interactive data cleanup

## 🧪 Testing (Vitest)

- Run all packages: `npm test`
- Watch mode: `npm run test:watch`
- Interactive UI: `npm run test:ui`
- Coverage: `npm run test:coverage` (open `coverage/index.html`)

Per-package:

- Server: `npm test --workspace=@yshvydak/test-dashboard-server`
- Web: `npm test --workspace=@yshvydak/web`
- Reporter: `npm test --workspace=playwright-dashboard-reporter`

More details: [TESTING.md](docs/TESTING.md)

### Environment Variables

The dashboard uses a **simplified .env configuration** with automatic derivation of most values:

```bash
# Core Configuration (5 variables + auth)
PORT=3001                                    # API server port
NODE_ENV=development                         # Environment mode
PLAYWRIGHT_PROJECT_DIR=/path/to/your/tests   # Test project location
BASE_URL=http://localhost:3001               # Base URL for all services
VITE_BASE_URL=http://localhost:3001          # Base URL accessible to web client
VITE_PORT=3000                               # Web dev server port (optional)

# Authentication Configuration
ENABLE_AUTH=true                             # Enable authentication
ADMIN_EMAIL=admin@admin.com                  # Admin user email
ADMIN_PASSWORD=qwe123                        # Admin user password
JWT_SECRET=dev-jwt-secret-change-in-production-12345    # JWT signing key

# All other variables are derived automatically:
# - DASHBOARD_API_URL = BASE_URL (for API integration)
# - VITE_API_BASE_URL = BASE_URL/api (for web API calls)
# - VITE_WEBSOCKET_URL = ws://BASE_URL/ws (for WebSocket)
# - OUTPUT_DIR = test-results (default storage)

# Advanced users can still override any derived variable
```

**Port Management:**

- **API Server**: Uses `PORT` (default: 3001)
- **Web Dev Server**: Uses `VITE_PORT` if set, otherwise `PORT + 1000`, fallback: 4001
- **Production**: Both services can run on same port with different paths

## 📊 Technology Stack

### Frontend

- **React 18** + TypeScript
- **Vite** for fast development
- **Tailwind CSS** for styling
- **Zustand** for state management
- **React Query** for data fetching

### Backend

- **Express.js** + TypeScript
- **SQLite** for data persistence
- **WebSocket** for real-time updates
- **Layered Architecture** with dependency injection

### DevOps

- **Turborepo** for monorepo management
- **TypeScript 5** with strict mode
- **ESLint** for code quality

## 🛣️ Roadmap

### Phase 1: npm Package Integration ✅

- Published `playwright-dashboard-reporter` to npm registry
- One-command installation: `npm install --save-dev playwright-dashboard-reporter`
- Automatic mode switching based on `NODE_ENV`
- npm link support for local development
- Full dashboard functionality

### Phase 2: Enterprise Features (Future) 🔮

- Multiple project management
- Role-based access control
- Advanced analytics and reporting
- CI/CD integration templates
- Team collaboration features

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

- Follow existing code patterns and TypeScript strict mode
- Add tests for new features
- Update documentation for public API changes
- Ensure all checks pass before submitting PR

## 📚 Documentation

Comprehensive documentation for users, developers, and contributors:

### Quick Start

- **[Quick Start Guide](docs/QUICKSTART.md)** - Get running in 5 minutes
- **[CLAUDE.md](CLAUDE.md)** - AI development quick reference with critical context

### For Developers

- **[Architecture](docs/ARCHITECTURE.md)** - Complete system design and patterns
- **[Development Guide](docs/DEVELOPMENT.md)** - Best practices and workflow
- **[API Reference](docs/API_REFERENCE.md)** - REST + WebSocket endpoints

### Documentation Hub

- **[docs/README.md](docs/README.md)** - Complete documentation navigation with role-based guidance

**Documentation Quality**: 9.5/10 - Optimized for AI-assisted development (vibe coding)

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Playwright](https://playwright.dev/) - the amazing testing framework
- Inspired by the need for better test visibility and team collaboration
- Thanks to all contributors who help improve the testing experience

---

<div align="center">
  <strong>Happy Testing! 🎭</strong><br>
  Made with ❤️ by <a href="mailto:y.shvydak@gmail.com">Yurii Shvydak</a>
</div>
