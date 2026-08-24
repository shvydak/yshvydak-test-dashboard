---
paths:
    - 'packages/reporter/**'
---

# Reporter Rules

- **`generateStableTestId()` must stay byte-identical** to the copy in `packages/server/src/services/playwright.service.ts`. Historical tracking breaks the moment they diverge.
- **Changes here do not apply until `npm link` or publish.** Editing `packages/reporter/src/` alone changes nothing for a running dashboard — production loads `playwright-dashboard-reporter` from `node_modules`.
- Injection is via CLI (`--reporter=playwright-dashboard-reporter`); never edit the consumer's `playwright.config.ts`.
- Coverage target here is 90%+ — testId generation is the critical path.
