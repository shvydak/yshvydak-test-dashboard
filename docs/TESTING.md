# Testing Guide (Vitest)

This project uses Vitest 3.2 for all testing across the monorepo. Vitest is fast, TypeScript-first, and integrates well with Vite (web) and Node (server/reporter).

## Quick Commands

```bash
# Run all tests across packages
npm test

# Watch mode (auto-rerun on changes)
npm run test:watch

# Interactive UI (best for vibe coding)
npm run test:ui

# Coverage report (HTML at coverage/index.html)
npm run test:coverage
```

Per-package focus (workspace):

```bash
# Server (Node environment)
npm test --workspace=@yshvydak/test-dashboard-server

# Web (jsdom + React Testing Library)
npm test --workspace=@yshvydak/web

# Reporter (critical ID generation logic)
npm test --workspace=playwright-dashboard-reporter
```

## Configuration Structure

- Root config: `vitest.config.ts` (runs all packages via `test.projects`)
- Shared settings: Defined in root config (globals, coverage provider, timeouts)
- Package configs (inherit from root and add overrides):
    - `packages/server/vitest.config.ts` (environment: node, setup: `vitest.setup.ts`)
    - `packages/web/vitest.config.ts` (environment: jsdom, setup: `vitest.setup.ts`)
    - `packages/reporter/vitest.config.ts` (environment: node)

**Note:** Migrated from deprecated `vitest.workspace.ts` to `test.projects` in Vitest 3.x

## Test Locations & Naming

- Colocation pattern: tests live near the code they cover.
- Directories: `packages/{server,web,reporter}/src/**/__tests__/`
- File names:
    - `*.test.ts` – unit/integration (TS)
    - `*.test.tsx` – React component tests

## Coverage Targets

- Reporter: 90%+ (focus: test ID generation — CRITICAL)
- Server: 80%+ (services, repositories)
- Web: 70%+ (hooks, utilities)
- Overall target: 75–80%

HTML coverage report is written to `coverage/index.html` at the repo root when running `npm run test:coverage`.

## Vibe Coding Tips

- Use `npm run test:ui` for fast feedback and focused reruns.
- Narrow the scope with `--workspace` to iterate on a single package.
- Keep tests co-located with the code for quicker navigation and edits.

## Examples and References

- Reporter ID generation tests: `packages/reporter/src/__tests__/testIdGeneration.test.ts`
- Server auth tests: `packages/server/src/services/__tests__/auth.service.test.ts`
- Server flaky detection tests: `packages/server/src/repositories/__tests__/test.repository.flaky.test.ts`

If unsure where something lives, see `docs/ai/FILE_LOCATIONS.md`.
