---
name: coverage-agent
description: Analyze test coverage against project targets (Reporter 90%, Server 80%, Web 70%). Identify gaps with specific line numbers and offer to write missing tests. Use after adding new features or service methods.
model: sonnet
disable-model-invocation: true
allowed-tools: Bash(npm run test:coverage), Read, Glob, Edit, Write
---

Run `npm run test:coverage` and analyze results against targets:

- Reporter (`packages/reporter`): **90%+** — Test ID generation is CRITICAL
- Server (`packages/server`): **80%+** — services and repositories
- Web (`packages/web`): **70%+** — hooks and utilities

For each package below target:
1. Find uncovered lines (look for lines marked `0x` in coverage report)
2. Identify which functions/branches are untested
3. Prioritize: public service methods > repository methods > utilities > UI components
4. Offer to write the missing tests

When writing tests:
- Follow existing test patterns in the same package
- Use in-memory DB for server integration tests: `new DatabaseManager(':memory:')`
- Use `MemoryRouter` for React components that use `useSearchParams`
- Place tests in `packages/{package}/src/__tests__/`

Report: current % per package, gap from target, top 5 uncovered areas with file:line.
