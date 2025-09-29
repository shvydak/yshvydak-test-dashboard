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

## Layered Architecture Principles

The server follows **Layered Architecture** with clear separation of concerns:
- **Controllers** (`*.controller.ts`) - HTTP request/response handling only
- **Services** (`*.service.ts`) - Business logic and orchestration
- **Repositories** (`*.repository.ts`) - Data access and database operations
- **Middleware** - Cross-cutting concerns (DI, CORS, error handling)

## Technology Stack

**Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + Zustand + React Query
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

**New API endpoint:** Controller → Service → Repository
**New business logic:** Add to relevant Service class
**New database operations:** Extend Repository classes
**Controllers:** Thin layer - delegate to Services
**Services:** Business logic and orchestrate Repository calls
**Repositories:** Database operations only

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

## Quick API Reference

**Health & Discovery:** `GET /api/health`, `POST /api/tests/discovery`, `GET /api/tests/diagnostics`
**Test Management:** `GET /api/tests`, `POST /api/tests`, `DELETE /api/tests/all`
**Test Execution:** `POST /api/tests/run-all`, `POST /api/tests/:id/rerun`
**Process Tracking:** `POST /api/tests/process-start`, `POST /api/tests/process-end`

**WebSocket Events:** `connection:status`, `process:started`, `process:ended`, `test:status`

All endpoints return `ApiResponse<T>` format
