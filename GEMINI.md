# Gemini Context: YShvydak Test Dashboard

This document provides instructional context for Gemini when working with the `yshvydak-test-dashboard` repository.

## 1. Project Overview

YShvydak Test Dashboard is a **full-stack Playwright testing dashboard** with one-click rerun capabilities. It provides real-time test monitoring, historical tracking, and a user-friendly web interface to manage and visualize Playwright test results.

The project is a **monorepo** managed with **Turborepo** and **npm workspaces**.

### Key Problems Solved:

- Replaces hard-to-navigate standard Playwright HTML reports.
- Enables instant reruns of failed tests without using the command line.
- Provides team-wide visibility into test status and history.

## 2. Architecture

### 2.1. Monorepo Structure

The project consists of four main packages located in the `packages/` directory:

```
packages/
├── core/      # Shared TypeScript types & interfaces for all packages.
├── reporter/  # The `@yshvydak/playwright-reporter` npm package that sends test data to the server.
├── server/    # The backend Express.js API, WebSocket server, and SQLite database.
└── web/       # The frontend React + Vite dashboard UI.
```

### 2.2. Backend: Layered Architecture

The `server` package follows a strict **Layered Architecture** to ensure separation of concerns:

- **Controllers (`*.controller.ts`):** Handle HTTP request and response cycles. They are "thin" and delegate all business logic to services.
- **Services (`*.service.ts`):** Contain the core business logic. They orchestrate calls between repositories and other services.
- **Repositories (`*.repository.ts`):** Responsible for all data access and database operations (CRUD on the SQLite database).
- **Middleware:** Handles cross-cutting concerns like dependency injection, CORS, and error handling.

### 2.3. Dynamic Reporter Injection

A key architectural feature is **dynamic reporter injection**. The dashboard can execute tests in a target Playwright project and inject the custom reporter (`@yshvydak/playwright-reporter`) via command-line arguments. This means the user's `playwright.config.ts` does not need to be modified.

## 3. Technology Stack

- **Monorepo:** Turborepo, npm workspaces
- **Backend:** Node.js, Express.js, TypeScript, SQLite (using `better-sqlite3`), WebSockets (`ws`)
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Zustand (for state management)
- **Development:** ESLint, Prettier, `tsx` for fast server reloads.

## 4. Building and Running

### 4.1. Root Commands

These commands should be run from the project root directory.

- `npm install`: Install all dependencies for all packages.
- `npm run build`: Build all packages in the monorepo.
- `npm run dev`: Run all packages in development mode (starts backend server and frontend dev server).
- `npm run type-check`: Run TypeScript compiler checks across the entire project.
- `npm run lint`: Lint all packages.

### 4.2. Individual Package Commands

You can also run commands within specific packages:

- `cd packages/server && npm run dev`: Start only the backend server with hot-reloading.
- `cd packages/web && npm run dev`: Start only the frontend Vite dev server.

## 5. Development Conventions

### 5.1. Adding a New API Endpoint

Follow the established layered architecture pattern:

1.  **Route:** Define the new route in `packages/server/src/routes/`.
2.  **Controller:** Add a new method in the appropriate controller in `packages/server/src/controllers/`.
3.  **Service:** Implement the business logic in a service method in `packages/server/src/services/`.
4.  **Repository:** If data access is needed, add a method to the corresponding repository in `packages/server/src/repositories/`.

### 5.2. Code Style

- Follow the existing code style, naming conventions, and file structure.
- Use the provided utilities (e.g., `logger.util.ts`, `response.helper.ts`).
- Maintain TypeScript strict mode and ensure all new code is strongly typed.
- Add comments only when necessary to explain _why_ a piece of logic is complex, not _what_ it does.

### 5.3. External Reporter Analysis

**CRITICAL:** When analyzing test data flow or debugging reporter-related issues, you **MUST** refer to the external reporter file located at `/Users/y.shvydak/QA/probuild-qa/e2e/testUtils/yshvydakReporter.ts`. This file is the source of all data sent to the dashboard during test execution and is essential for understanding the complete system.

## 6. Configuration

- The main configuration is handled via a `.env` file in the project root.
- The project uses a **simplified configuration model** where only a few core variables are needed. Other variables are derived automatically.

### Core `.env` Variables:

- `PORT`: The port for the backend API server (e.g., `3001`).
- `PLAYWRIGHT_PROJECT_DIR`: The absolute path to the target Playwright project whose tests will be managed.
- `BASE_URL`: The base URL for the API server (e.g., `http://localhost:3001`).
- `VITE_BASE_URL`: The base URL accessible to the web client (usually the same as `BASE_URL` in development).
- `VITE_PORT`: The port for the frontend Vite dev server (e.g., `3000`).

## 7. API & WebSocket Quick Reference

### Key API Endpoints

- `GET /api/health`: Health check for the server.
- `GET /api/tests/diagnostics`: Checks the integration status with the Playwright project.
- `POST /api/tests/discovery`: Scans the target project and discovers all available tests.
- `GET /api/tests`: Retrieves the latest test results.
- `POST /api/tests/run-all`: Starts a new test run for all discovered tests.
- `POST /api/tests/:id/rerun`: Reruns a single failed test.

### Key WebSocket Events

- `connection:status`: Sent on client connect to sync the state of active processes.
- `process:started` / `process:ended`: Broadcast when a test execution process starts or finishes.
- `test:status`: Real-time updates on the status of an individual test as it runs.
