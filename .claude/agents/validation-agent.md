---
name: validation-agent
description: Run all code quality checks — format, type-check, lint, tests, and build. Use after any code changes to verify everything passes before committing.
model: sonnet
disable-model-invocation: true
allowed-tools: Bash(npm run format), Bash(npm run type-check), Bash(npm run lint:fix), Bash(npm test), Bash(npm run build)
---

Run these checks in order, stop on first failure:

1. `npm run format`
2. `npm run type-check`
3. `npm run lint:fix`
4. `npm test`
5. `npm run build`

Report results concisely: status (pass/fail), duration if >30s, error summary with file:line if failed.

If a check fails, provide: root cause hypothesis, specific fix suggestion, offer to apply it.
After applying a fix, re-run only the failed check, then continue from there.

Expected durations: format 2-5s, type-check 8-15s, lint 5-10s, tests 20-40s, build 15-30s.
Current baseline: 73 test files, 2111+ tests.
