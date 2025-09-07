# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YShvydak Test Dashboard is a full-stack Playwright testing dashboard with rerun capabilities. It's a **monorepo** built with **Turborepo** that provides real-time test monitoring, one-click reruns, and comprehensive test reporting.

### Architecture

**Top-level structure:**

```
packages/
├── core/      # Shared TypeScript types & interfaces
├── reporter/  # @yshvydak/playwright-reporter npm package
├── server/    # Express API + SQLite + WebSocket server (LAYERED ARCHITECTURE)
└── web/       # React + Vite dashboard UI
```

**Server Layered Architecture:**

```
packages/server/src/
├── app.ts, server.ts                    # Application setup and startup
├── config/                              # Environment config and constants
├── types/                               # TypeScript interfaces for all layers
├── utils/                               # Helpers (ResponseHelper, Logger, FileUtil)
├── middleware/                          # Service injection, CORS, error handling
├── controllers/                         # HTTP request handlers (thin layer)
├── services/                           # Business logic (TestService, PlaywrightService)
├── repositories/                       # Data access layer (TestRepository, etc.)
├── routes/                             # Route definitions with dependency injection
├── database/                           # DatabaseManager and schema
├── websocket/                          # WebSocket server management
└── storage/                            # File attachment management
```

## Development Commands

### Root Level Commands (using Turborepo)

-    `npm run build` - Build all packages
-    `npm run dev` - Run all packages in development mode
-    `npm run type-check` - TypeScript checking across all packages
-    `npm run lint` - Lint all packages
-    `npm run clean` - Clean build artifacts and turbo cache
-    `npm run clear-data` - Interactive CLI to clear all test data

### Individual Package Development

**Core Package (types):**

```bash
cd packages/core
npm run build        # Build TypeScript types
npm run dev          # Watch mode
```

**Reporter Package (@yshvydak/playwright-reporter):**

```bash
cd packages/reporter
npm run build        # Build CJS/ESM bundles with TypeScript declarations
npm run dev          # Build and watch for changes
npm run type-check   # TypeScript validation
```

**Server Package (API):**

```bash
cd packages/server
npm run dev          # Start with auto-reload (uses tsx watch)
npm run build        # Build for production
npm run type-check   # TypeScript validation
npm run test         # Run Jest tests
```

**Web Package (React app):**

```bash
cd packages/web
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run type-check   # TypeScript validation
npm run lint         # ESLint checking
```

## Server Architecture Details

### Layered Architecture Pattern

The server follows a clean **Layered Architecture** with clear separation of concerns:

-    **Controllers** (`*.controller.ts`) - HTTP request/response handling only
-    **Services** (`*.service.ts`) - Business logic and orchestration
-    **Repositories** (`*.repository.ts`) - Data access and database operations
-    **Middleware** - Cross-cutting concerns (authentication, logging, dependency injection)

### Key Components

**Service Layer:**

-    `TestService` - Test discovery, execution, and rerun logic
-    `PlaywrightService` - Playwright integration and process spawning, automated test discovery via `npx playwright test --list`
-    `WebSocketService` - Real-time event broadcasting
-    `AttachmentService` - File handling and processing

**Repository Layer:**

-    `TestRepository` - Test result CRUD operations
-    `RunRepository` - Test run lifecycle management
-    `AttachmentRepository` - File metadata persistence

**Dependency Injection:**

-    `ServiceContainer` - Manages all service instances
-    `injectServices` middleware - Provides services to request objects

### API Compatibility

-    **100% backward compatible** with existing `yshvydakReporter.ts`
-    All endpoints (`/api/tests`, `/api/runs`) maintain identical request/response formats
-    WebSocket events preserved for real-time updates
-    Database schema supports both old and new status values

### Dynamic Playwright Reporter Architecture

The dashboard uses a **dynamic reporter injection** architecture that provides clean separation between test projects and dashboard integration:

#### How It Works

1. **No Config Changes**: Test projects keep their standard `playwright.config.ts` unchanged
2. **Dynamic Injection**: Dashboard adds reporter via command line when running tests: `--reporter=@yshvydak/playwright-reporter`
3. **Environment Detection**: Reporter activates only when `DASHBOARD_API_URL` is set
4. **Fallback Support**: Supports both npm package and local file fallback

#### Reporter Package (@yshvydak/playwright-reporter)

-    **Location**: `packages/reporter/` - Standalone npm package
-    **Exports**: CJS/ESM builds with TypeScript declarations
-    **Features**:
     -    Enhanced error reporting with code context and line highlighting
     -    Stable test ID generation using file path + title hash
     -    Real-time API communication with dashboard server
     -    Built-in diagnostics and health checks
     -    Silent mode for programmatic usage

#### Integration Modes

-    **Dynamic Mode** (Recommended): Dashboard injects reporter automatically
-    **Legacy Mode**: Manual reporter configuration in `playwright.config.ts`
-    **Environment Control**: `USE_NPM_REPORTER=true` switches to npm package

#### Diagnostics & Health Checks

-    **API Endpoint**: `GET /api/tests/diagnostics` - Complete integration status
-    **Validation**: Automatic detection of configuration issues
-    **Health Checks**: Reporter connectivity and API availability
-    **Error Reporting**: Detailed integration troubleshooting information

## Technology Stack

**Frontend:**

-    React 18 + TypeScript
-    Vite 5 for development
-    Tailwind CSS for styling
-    Zustand for state management
-    React Query for data fetching

**Backend (Layered Architecture):**

-    Express.js + TypeScript with clean separation of concerns
-    SQLite 3 for persistence with DatabaseManager abstraction
-    WebSocket (ws) for real-time updates via WebSocketService
-    Dependency Injection container for service management
-    Repository pattern for data access
-    Service layer for business logic
-    Multer for file uploads via AttachmentService
-    CORS enabled for development

**Development:**

-    Turborepo for monorepo management
-    TypeScript 5 across all packages with strict typing
-    ESLint for code quality
-    Centralized logging with Logger utility
-    Environment-based configuration

## Development Guidelines

### Adding New Features

1. **New API endpoint**: Create method in appropriate Controller → Service → Repository
2. **New business logic**: Add to relevant Service class
3. **New database operations**: Extend Repository classes
4. **New utilities**: Add to `utils/` directory

### Working with Services

-    Controllers should be thin - delegate to Services
-    Services contain business logic and orchestrate Repository calls
-    Repositories handle only database operations
-    Use dependency injection for testing and modularity

### Code Quality Standards

-    **Best Practices Reference**: When editing any code, consult Context7 MCP documentation for current best practices and standards for the relevant technology, framework, or language being used.
-    **Code comments** Use English when writing comments, if needed.

### Documentation Updates

-    **IMPORTANT**: Claude Code is authorized to update this CLAUDE.md and README.md file when making significant changes to:
     -    Architecture or system components
     -    API endpoints or functionality
     -    Configuration requirements
     -    Development workflows or commands
-    Updates should be concise and maintain the existing structure and style

### Configuration Management

-    Environment variables in `config/environment.config.ts`
-    Constants in `config/constants.ts`
-    Type definitions in appropriate `types/*.types.ts`

## Configuration Notes

### Centralized Environment Configuration

All project configuration is managed through environment variables in the `.env` file:

**Server Configuration:**
-    `PORT` - API server port (default: 3001)
-    `NODE_ENV` - Environment mode (development/production)

**Test Integration:**
-    `PLAYWRIGHT_PROJECT_DIR` - Path to your Playwright project directory
-    `USE_NPM_REPORTER` - Use npm package vs local reporter file (true/false)
-    `DASHBOARD_API_URL` - API endpoint for reporter integration

**Storage:**
-    `OUTPUT_DIR` - Test results and database storage directory

**Web Application (Vite prefixed):**
-    `VITE_API_BASE_URL` - Frontend API endpoint
-    `VITE_WEBSOCKET_URL` - WebSocket connection URL  
-    `VITE_SERVER_URL` - Server base URL for file serving

### Technical Details
-    **Requirements**: Node.js 18+ and npm 10+ required
-    **Database**: SQLite with automatic schema initialization
-    **Test Discovery**: Fully automated - no manual file generation required. Uses `npx playwright test --list --reporter=json` internally
-    **Configuration Access**: Server uses centralized `config` object, web uses `import.meta.env` with Vite prefix

## Testing Integration

### For Existing Playwright Projects:

1. Install `@yshvydak/core` package
2. Copy the reporter file to project's test utilities
3. Add reporter to `playwright.config.ts`
4. Set `DASHBOARD_API_URL` environment variable if needed
5. Start dashboard server before running tests

### API Testing:

-    Health check: `GET /api/health`
-    Test results: `POST /api/tests` (compatible with yshvydakReporter.ts)
-    Test runs: `POST /api/runs`, `GET /api/runs`, `PUT /api/runs/:id`, `GET /api/runs/:id`
-    Dashboard stats: `GET /api/runs/stats`, `GET /api/tests/stats`
-    Test management: `GET /api/tests`, `POST /api/tests/discovery`, `DELETE /api/tests/all`
-    Test execution: `POST /api/tests/test-save`, `POST /api/tests/run-all`, `POST /api/tests/run-group`
-    Test operations: `POST /api/tests/:id/rerun`, `GET /api/tests/:id/history`, `GET /api/tests/:id/attachments`
-    Diagnostics: `GET /api/tests/diagnostics`
-    All endpoints return consistent `ApiResponse<T>` format
