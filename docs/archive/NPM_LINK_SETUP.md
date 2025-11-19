# NPM Link Setup Guide

## Problem

Reporter is installed as a regular npm package instead of npm link, and code changes in the reporter are not applied in realtime.

## Diagnostics

### 1. Check Current State

```bash
# In the test project
cd /Users/y.shvydak/QA/probuild-qa
npm ls playwright-dashboard-reporter
```

**Correct output (npm link working):**

```
playwright-dashboard-reporter@1.0.3 extraneous -> ./../../Projects/yshvydak-test-dashboard/packages/reporter
```

**Incorrect output (installed as package):**

```
playwright-dashboard-reporter@1.0.3
```

### 2. Check Symlink

```bash
readlink /Users/y.shvydak/QA/probuild-qa/node_modules/playwright-dashboard-reporter
```

**Correct output:**

```
../../../Projects/yshvydak-test-dashboard/packages/reporter
```

**Incorrect output:**

```
# Empty output or error
```

## Solution

### Step 1: Remove npm package from test project

```bash
cd /Users/y.shvydak/QA/probuild-qa
npm uninstall playwright-dashboard-reporter
```

### Step 2: Create global npm link for reporter

```bash
cd /Users/y.shvydak/Projects/yshvydak-test-dashboard/packages/reporter
npm link
```

### Step 3: Link reporter to test project

```bash
cd /Users/y.shvydak/QA/probuild-qa
npm link playwright-dashboard-reporter
```

### Step 4: Verify link is created

```bash
readlink /Users/y.shvydak/QA/probuild-qa/node_modules/playwright-dashboard-reporter
# Should output: ../../../Projects/yshvydak-test-dashboard/packages/reporter
```

### Step 5: Start dev mode

```bash
cd /Users/y.shvydak/Projects/yshvydak-test-dashboard
npm run dev
```

This will start watch mode for the reporter, which automatically rebuilds code on changes.

## Verification

### Quick Test

1. Add a temporary marker to the reporter:

```typescript
// packages/reporter/src/index.ts:97
console.log(`🎭 YShvydak Dashboard Reporter initialized (Run ID: ${this.runId}) [TEST MARKER]`)
```

2. Watch mode will automatically rebuild (you'll see "Build success" in the terminal)

3. Run a single test:

```bash
cd /Users/y.shvydak/QA/probuild-qa
npx playwright test e2e/tests/authentication/login.test.ts --grep "Successful Login$" --reporter=playwright-dashboard-reporter
```

4. Check output - you should see `[TEST MARKER]`

5. Remove the marker and it will disappear on the next run

## Important Notes

### ⚠️ Two Projects

- **Dashboard project**: `/Users/y.shvydak/Projects/yshvydak-test-dashboard`
    - This is where the reporter is developed (`packages/reporter/`)

- **Test project**: `/Users/y.shvydak/QA/probuild-qa`
    - This is where Playwright tests run
    - Must have npm link to the reporter

### 🔄 Watch Mode

When running `npm run dev` in the dashboard project:

- Reporter runs in watch mode (`tsup --watch`)
- Automatically rebuilds on changes
- Changes are immediately available in the test project

### 📦 When It Can Break

npm link can break after:

- `npm install` in the test project
- `npm ci` in the test project
- Cleaning node_modules

**Solution:** Repeat steps 1-4

## Alternative: Check Without Running Tests

```bash
# Check the built file content
cat /Users/y.shvydak/QA/probuild-qa/node_modules/playwright-dashboard-reporter/dist/index.js | grep "YShvydak Dashboard Reporter"
```

This file should update when source code changes.

## Troubleshooting

### Issue: Changes Not Applied

1. Check that dev mode is running (`npm run dev`)
2. Check the symlink (see Diagnostics)
3. Ensure watch mode rebuilt the code (check terminal with `npm run dev`)
4. Recreate npm link (steps 1-4)

### Issue: "Module not found"

```bash
# Recreate npm link
cd /Users/y.shvydak/Projects/yshvydak-test-dashboard/packages/reporter
npm link

cd /Users/y.shvydak/QA/probuild-qa
npm link playwright-dashboard-reporter
```

### Issue: "FOREIGN KEY constraint failed"

This is not related to npm link - it's a dashboard database issue. Start the dashboard (`npm run dev`) before running tests.

---

**Last Updated:** 2025-11-19
**Author:** Yurii Shvydak
