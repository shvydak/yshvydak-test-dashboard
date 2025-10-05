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

**📋 For detailed architecture:** See [@docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Essential Development Commands

**Root Level Commands (Turborepo):**

- `npm run build` - Build all packages
- `npm run dev` - Run all packages in development mode
- `npm run type-check` - TypeScript checking across all packages
- `npm run lint` - Lint all packages

**📋 For detailed development commands:** See [@docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

## Architecture Principles

### Backend: Layered Architecture

The server follows **Layered Architecture** with clear separation of concerns:

- **Controllers** (`*.controller.ts`) - HTTP request/response handling only
- **Services** (`*.service.ts`) - Business logic and orchestration
- **Repositories** (`*.repository.ts`) - Data access and database operations
- **Middleware** - Cross-cutting concerns (DI, CORS, error handling)

### Frontend: Feature-Based Architecture

The web package follows **Feature-Based Architecture** with **Atomic Design**:

- **Features** (`features/{feature}/`) - Self-contained modules (authentication, dashboard, tests)
- **Colocation** - Components, hooks, store, types, utils all within feature directory
- **Shared Components** - Atoms (`Button`, `StatusIcon`) and Molecules (`Card`, `ActionButton`)
- **Path Aliases** - Clean imports: `@features/*`, `@shared/*`, `@config/*`
- **Component Size** - Maximum 200 lines per file, split large components into sub-components
- **Store Organization** - Zustand stores inside features: `features/{feature}/store/`

**📋 For complete frontend architecture:** See [@docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#frontend-feature-based-architecture)

## Technology Stack

**Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + Zustand + React Query + Feature-Based Architecture + Atomic Design
**Backend:** Express.js + TypeScript + SQLite + WebSocket + Layered Architecture + DI
**Development:** Turborepo + TypeScript 5 + ESLint

## Critical Development Rules

### 🚨 ALWAYS Check External Reporter for Code Analysis & Development

**When doing ANY code analysis, development, or debugging - ALWAYS examine the external reporter:**

- Path: `/Users/y.shvydak/QA/probuild-qa/e2e/testUtils/yshvydakReporter.ts`
- This is the **critical component** that provides ALL data from test execution
- The reporter is part of this project despite being in external test repository
- Understanding reporter implementation is essential for all development tasks
- Always analyze reporter code when working with test data, APIs, or dashboard features

### 📚 ALWAYS Use Context7-MCP for Documentation

**MANDATORY for any dependencies or technology research:**

- Adding/changing dependencies → Use Context7-MCP to check latest documentation
- Need best practices → Use Context7-MCP for current standards
- Technology questions → Use Context7-MCP for authoritative information

### ✅ ALWAYS Follow Best Practices

**Every solution must follow modern best practices and approaches:**

- Consult latest documentation and standards
- Use established patterns and conventions
- Follow security and performance best practices

### 🔐 Authentication & Security Guidelines

**Authentication system is production-ready and secure:**

- JWT-based user authentication with localStorage storage
- Simplified local network integration for reporters
- Environment-based credential management (never hardcode credentials)
- Production-ready code optimization completed (debug logs removed)
- See [@docs/features/AUTHENTICATION_IMPLEMENTATION.md](docs/features/AUTHENTICATION_IMPLEMENTATION.md) for details

### 🏗️ Architecture Guidelines

#### Backend (Server)

**New API endpoint:** Controller → Service → Repository
**New business logic:** Add to relevant Service class
**New database operations:** Extend Repository classes
**Controllers:** Thin layer - delegate to Services
**Services:** Business logic and orchestrate Repository calls
**Repositories:** Database operations only

#### Frontend (Web)

**New feature:** Create in `features/{feature-name}/` with subdirectories (components, hooks, store, types, utils, constants)
**New component:** Keep under 200 lines; split large components into sub-components with dedicated subdirectory
**Shared components:** Use `shared/components/atoms/` for basic elements, `shared/components/molecules/` for combinations
**State management:** Create Zustand store in `features/{feature}/store/`
**Path aliases:** Always use `@features/*`, `@shared/*`, `@config/*` for clean imports
**DRY principle:** Centralize utilities and constants - avoid code duplication

### 📎 Attachment Management Guidelines

**Permanent attachment storage implemented to solve Playwright's temporary file cleanup:**

- **ALWAYS use AttachmentService** for attachment operations, never manipulate files directly
- Attachments are automatically copied from Playwright's `test-results/` to permanent `attachments/` storage
- Each test result has isolated directory: `{OUTPUT_DIR}/attachments/{testResultId}/`
- Re-running tests automatically deletes old physical files before saving new ones
- Files served via `/attachments/` route with JWT authentication
- See [@docs/features/PER_RUN_ATTACHMENTS.md](docs/features/PER_RUN_ATTACHMENTS.md) for complete documentation

### 📜 Historical Test Tracking

**Complete test execution history with independent attachments per run:**

- Every test execution creates a new database record (INSERT strategy, not UPDATE)
- Full execution history accessible via History tab in test detail modal
- Each execution maintains independent attachments (videos, screenshots, traces)
- Users can compare different test runs and view historical trends
- Pending test results automatically filtered from history view
- See [@docs/features/HISTORICAL_TEST_TRACKING.md](docs/features/HISTORICAL_TEST_TRACKING.md) for complete documentation

## Current Active Reporter

**External Reporter Path:** `/Users/y.shvydak/QA/probuild-qa/e2e/testUtils/yshvydakReporter.ts`

## Configuration

**Core Environment Variables:**

- `PORT` - API server port (default: 3001)
- `NODE_ENV` - Environment mode
- `PLAYWRIGHT_PROJECT_DIR` - Path to test project (REQUIRED)
- `USE_NPM_REPORTER` - npm package vs local file (true/false)
- `BASE_URL` - Base URL for all services
- `VITE_BASE_URL` - Same as BASE_URL for web client

**Authentication Variables:**

- `ENABLE_AUTH` - Enable authentication (true/false)
- `ADMIN_EMAIL` - Admin user email
- `ADMIN_PASSWORD` - Admin user password
- `JWT_SECRET` - JWT signing secret (change in production)

**📋 For detailed configuration:** See [@docs/CONFIGURATION.md](docs/CONFIGURATION.md)

## Documentation References

**📋 Detailed Documentation:**

- [@docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Complete architecture details
- [@docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) - Development commands and guidelines
- [@docs/CONFIGURATION.md](docs/CONFIGURATION.md) - Environment configuration details
- [@docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - CloudTunnel and production deployment
- [@docs/API_REFERENCE.md](docs/API_REFERENCE.md) - Complete API endpoints and WebSocket events
- [@docs/TIMESTAMP_MANAGEMENT.md](docs/TIMESTAMP_MANAGEMENT.md) - Timestamp architecture implementation
- [@docs/TESTING_METHODOLOGY.md](docs/TESTING_METHODOLOGY.md) - Adaptive testing and debugging approach
- [@docs/features/AUTHENTICATION_IMPLEMENTATION.md](docs/features/AUTHENTICATION_IMPLEMENTATION.md) - Authentication system details
- [@docs/features/CODE_OPTIMIZATION.md](docs/features/CODE_OPTIMIZATION.md) - Production-ready code optimization
- [@docs/features/PER_RUN_ATTACHMENTS.md](docs/features/PER_RUN_ATTACHMENTS.md) - Permanent attachment storage system
- [@docs/features/HISTORICAL_TEST_TRACKING.md](docs/features/HISTORICAL_TEST_TRACKING.md) - Historical test execution tracking

## Quick API Reference

**Health & Discovery:** `GET /api/health`, `POST /api/tests/discovery`, `GET /api/tests/diagnostics`
**Test Management:** `GET /api/tests`, `POST /api/tests`, `DELETE /api/tests/all`
**Test Execution:** `POST /api/tests/run-all`, `POST /api/tests/:id/rerun`
**Test History:** `GET /api/tests/:id/history` - Get execution history for a test
**Process Tracking:** `POST /api/tests/process-start`, `POST /api/tests/process-end`

**WebSocket Events:** `connection:status`, `process:started`, `process:ended`, `test:status`

All endpoints return `ApiResponse<T>` format
