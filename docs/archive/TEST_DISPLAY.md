## Test Display Consistency

### Problem: Test Count Discrepancy

**Issue:** Dashboard shows different test counts at different stages - discovery finds 80 tests, but after execution only 50-54 tests are displayed.

**How It Works (in simple words):**

1. **When tests are discovered:**
    - The server runs `npx playwright test --list --reporter=json`
    - It processes both top-level specs (`suite.specs[]`) and nested specs (`suite.suites[].specs[]`)
    - Each test gets a stable ID generated from file path + test title
    - All discovered tests are saved to database: _"Found 80 tests total"_

2. **When tests are executed:**
    - The Playwright reporter generates the same stable IDs during execution
    - Test results are saved with the same testId as discovery
    - Database accumulates test execution history (multiple runs = multiple records)

3. **When dashboard displays tests:**
    - Frontend fetches test results from API: _"Show me the latest results for each test"_
    - SQL query groups results by testId and picks the most recent
    - **Key fix**: Added `limit=200` parameter to prevent result truncation

**Root Cause Analysis:**

- **Discovery Gap**: Original code only processed nested test specs, missing top-level ones
- **SQL Query Issues**: Complex queries with database history caused inconsistent grouping
- **Frontend Limits**: API calls without explicit limits were truncating results

**Technical Solutions:**

- **Test Discovery Fix:** Modified `PlaywrightService.discoverTests()` to handle both:

    ```typescript
    // Process top-level specs
    for (const spec of suite.specs || []) { ... }

    // Process nested specs
    for (const subSuite of suite.suites || []) {
        for (const spec of subSuite.specs || []) { ... }
    }
    ```

- **SQL Optimization:** Improved test results query with proper grouping:

    ```sql
    SELECT DISTINCT tr.* FROM test_results tr
    WHERE tr.id IN (
        SELECT MAX(id) as latest_id
        FROM test_results
        GROUP BY test_id
        HAVING latest_id IS NOT NULL
    )
    ```

- **Frontend Parameter Fix:** Added explicit limit to API calls:
    ```typescript
    const response = await fetch(`${API_BASE_URL}/tests?limit=200`)
    ```

**Smart Features:**

- **Stable Test IDs:** Same hash algorithm in both discovery and reporter ensures consistency
- **Database History:** All test executions are preserved, but UI shows only latest results
- **API Flexibility:** Configurable limits prevent performance issues with large test suites

**For Users:** Test counts remain consistent throughout discovery → execution → display cycle. Shows "All (80)" reliably regardless of how tests are run.

**For Developers:** Core logic lives in `PlaywrightService.discoverTests()`, `TestRepository.getAllTests()`, and `testsStore.fetchTests()`. Test ID generation uses identical algorithms in both discovery and reporter phases.
