# Dashboard Redesign: Flaky Tests Detection & Timeline Visualization

## Overview

The YShvydak Test Dashboard implements a **comprehensive Dashboard redesign** featuring flaky tests detection, test execution timeline visualization, and real-time WebSocket updates. This feature replaces the previous dashboard components (ErrorsOverview, RecentTests, SystemInfo) with a modern, data-driven analytics interface.

### Core Principle

**Users can monitor test stability, identify flaky tests, and visualize execution trends over time with configurable parameters and automatic real-time updates.**

The system ensures that:

- Flaky tests are detected using stable `testId` grouping across multiple runs
- Timeline shows daily aggregated test execution statistics
- Period and threshold settings are configurable and persisted in localStorage
- Dashboard updates automatically via WebSocket when tests complete
- All visualizations use Tailwind CSS colors for automatic dark mode support
- Storage metrics are removed per user requirements

## Problem Statement

### The Original Issue

Before the redesign, the dashboard displayed:

- Static components (ErrorsOverview, RecentTests, SystemInfo)
- Storage metrics (not needed per user requirements)
- No flaky test detection
- No historical execution trends
- Limited configurability

### The Solution

Implement **comprehensive dashboard analytics** with:

1. **Flaky Tests Detection**: Identify tests with intermittent failures using stable test IDs
2. **Timeline Visualization**: Display test execution trends over time using Recharts
3. **Configurable Controls**: User-adjustable period (7/14/30/60 days) and threshold (1-99%)
4. **localStorage Persistence**: Save user preferences across sessions
5. **Real-time Updates**: WebSocket integration for automatic data refresh
6. **Clean Architecture**: React Query for data fetching, proper error handling

## Architecture

The dashboard redesign follows the project's **Feature-Based Architecture** with clean separation between backend data services and frontend visualization components.

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│  Backend (Layered Architecture)                             │
│                                                             │
│  TestRepository                                             │
│  ├── getFlakyTests(days, thresholdPercent)                 │
│  │   SQL: GROUP BY test_id, calculate failure rate         │
│  │                                                          │
│  └── getTestTimeline(days)                                 │
│      SQL: Daily aggregation with DATE() grouping           │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  TestService                                                │
│  ├── getFlakyTests() → delegates to repository             │
│  └── getTestTimeline() → delegates to repository           │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  TestController                                             │
│  ├── GET /api/tests/flaky?days=30&threshold=10             │
│  └── GET /api/tests/timeline?days=30                       │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React Query + WebSocket)                         │
│                                                             │
│  useFlakyTests Hook                                         │
│  ├── React Query with [days, threshold] queryKey           │
│  ├── localStorage persistence for settings                 │
│  └── updateDays() / updateThreshold() methods              │
│                                                             │
│  useTestTimeline Hook                                       │
│  ├── React Query with [days] queryKey                      │
│  └── Daily aggregated data for chart                       │
│                                                             │
│  Dashboard Component                                        │
│  ├── DashboardStats (4 cards: Total/Passed/Failed/Rate)   │
│  ├── Flaky Tests Panel (configurable + history dots)       │
│  ├── Timeline Chart (Recharts with stacked areas)          │
│  └── WebSocket real-time updates                           │
└─────────────────────────────────────────────────────────────┘
```

## Backend Implementation

### Database Queries

#### Flaky Tests Detection

**Location**: `packages/server/src/repositories/test.repository.ts`

```typescript
async getFlakyTests(days: number = 30, thresholdPercent: number = 10): Promise<any[]> {
    const sql = `
        SELECT
            tr.test_id as testId,
            tr.name,
            tr.file_path as filePath,
            COUNT(*) as totalRuns,
            SUM(CASE WHEN tr.status = 'failed' THEN 1 ELSE 0 END) as failedRuns,
            SUM(CASE WHEN tr.status = 'passed' THEN 1 ELSE 0 END) as passedRuns,
            CAST(SUM(CASE WHEN tr.status = 'failed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS INTEGER) as flakyPercentage,
            GROUP_CONCAT(
                CASE
                    WHEN tr.status = 'passed' THEN 'passed'
                    WHEN tr.status = 'failed' THEN 'failed'
                    ELSE 'other'
                END
            ) as history,
            MAX(tr.updated_at) as lastRun
        FROM test_results tr
        WHERE tr.created_at >= datetime('now', '-' || ? || ' days')
            AND tr.status IN ('passed', 'failed')
        GROUP BY tr.test_id, tr.name, tr.file_path
        HAVING totalRuns > 1
            AND flakyPercentage >= ?
            AND flakyPercentage < 100
        ORDER BY flakyPercentage DESC, totalRuns DESC
        LIMIT 50
    `

    const rows = await this.queryAll<any>(sql, [days, thresholdPercent])

    return rows.map(row => ({
        ...row,
        history: row.history ? row.history.split(',') : []
    }))
}
```

**Key Features**:

- **Stable testId Grouping**: Groups by `test_id` (hash-based stable identifier)
- **Failure Rate Calculation**: `failedRuns / totalRuns * 100`
- **History Tracking**: `GROUP_CONCAT` creates comma-separated status history
- **Configurable Filtering**:
    - `days` parameter for time range
    - `thresholdPercent` for minimum failure rate
    - Excludes tests with 100% failure (always failing, not flaky)
    - Requires multiple runs (`totalRuns > 1`)

#### Test Timeline

**Location**: `packages/server/src/repositories/test.repository.ts`

```typescript
async getTestTimeline(days: number = 30): Promise<any[]> {
    const sql = `
        SELECT
            DATE(tr.created_at) as date,
            COUNT(*) as total,
            SUM(CASE WHEN tr.status = 'passed' THEN 1 ELSE 0 END) as passed,
            SUM(CASE WHEN tr.status = 'failed' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN tr.status = 'skipped' THEN 1 ELSE 0 END) as skipped
        FROM test_results tr
        WHERE tr.created_at >= datetime('now', '-' || ? || ' days')
            AND tr.status != 'pending'
        GROUP BY DATE(tr.created_at)
        ORDER BY date ASC
    `

    return this.queryAll<any>(sql, [days])
}
```

**Key Features**:

- **Daily Aggregation**: Groups by `DATE(created_at)`
- **Status Breakdown**: Separate counts for passed/failed/skipped
- **Excludes Pending**: Filters out discovery-generated pending tests
- **Chronological Order**: `ORDER BY date ASC` for timeline display

### Service Layer

**Location**: `packages/server/src/services/test.service.ts`

```typescript
async getFlakyTests(days: number = 30, thresholdPercent: number = 10): Promise<any[]> {
    return this.testRepository.getFlakyTests(days, thresholdPercent)
}

async getTestTimeline(days: number = 30): Promise<any[]> {
    return this.testRepository.getTestTimeline(days)
}
```

**Design Pattern**: Simple delegation to repository (follows Layered Architecture)

### Controller Layer

**Location**: `packages/server/src/controllers/test.controller.ts`

```typescript
getFlakyTests = async (req: ServiceRequest, res: Response): Promise<Response> => {
    try {
        const {days = 30, threshold = 10} = req.query

        const flakyTests = await this.testService.getFlakyTests(
            parseInt(days as string) || 30,
            parseInt(threshold as string) || 10
        )

        return ResponseHelper.success(res, flakyTests, undefined, flakyTests.length)
    } catch (error) {
        Logger.error('Error fetching flaky tests', error)
        return ResponseHelper.error(res, error.message, 'Failed to fetch flaky tests', 500)
    }
}

getTestTimeline = async (req: ServiceRequest, res: Response): Promise<Response> => {
    try {
        const {days = 30} = req.query

        const timeline = await this.testService.getTestTimeline(parseInt(days as string) || 30)

        return ResponseHelper.success(res, timeline, undefined, timeline.length)
    } catch (error) {
        Logger.error('Error fetching test timeline', error)
        return ResponseHelper.error(res, error.message, 'Failed to fetch timeline', 500)
    }
}
```

### Routes

**Location**: `packages/server/src/routes/test.routes.ts`

```typescript
router.get('/flaky', testController.getFlakyTests)
router.get('/timeline', testController.getTestTimeline)
```

## Frontend Implementation

### React Query Hooks

#### useFlakyTests Hook

**Location**: `packages/web/src/features/dashboard/hooks/useFlakyTests.ts`

```typescript
export interface FlakyTest {
    testId: string
    name: string
    filePath: string
    totalRuns: number
    failedRuns: number
    passedRuns: number
    flakyPercentage: number
    history: string[]
    lastRun: string
}

export interface UseFlakyTestsOptions {
    days?: number
    threshold?: number
}

export function useFlakyTests(options?: UseFlakyTestsOptions) {
    const [days, setDays] = useState(options?.days || 30)
    const [threshold, setThreshold] = useState(options?.threshold || 10)

    useEffect(() => {
        const savedDays = localStorage.getItem('dashboard_flaky_days')
        const savedThreshold = localStorage.getItem('dashboard_flaky_threshold')

        if (savedDays) setDays(parseInt(savedDays))
        if (savedThreshold) setThreshold(parseInt(savedThreshold))
    }, [])

    const query = useQuery({
        queryKey: ['flaky-tests', days, threshold],
        queryFn: () => fetchFlakyTests(days, threshold),
        refetchInterval: false,
        staleTime: 60000,
    })

    const updateDays = (newDays: number) => {
        setDays(newDays)
        localStorage.setItem('dashboard_flaky_days', newDays.toString())
    }

    const updateThreshold = (newThreshold: number) => {
        setThreshold(newThreshold)
        localStorage.setItem('dashboard_flaky_threshold', newThreshold.toString())
    }

    return {
        ...query,
        days,
        threshold,
        updateDays,
        updateThreshold,
    }
}
```

**Key Features**:

- **localStorage Persistence**: Settings saved with keys `dashboard_flaky_days` and `dashboard_flaky_threshold`
- **Default Values**: 30 days, 10% threshold
- **React Query Integration**: Automatic caching with 60s stale time
- **Update Methods**: `updateDays()` and `updateThreshold()` for UI controls

#### useTestTimeline Hook

**Location**: `packages/web/src/features/dashboard/hooks/useTestTimeline.ts`

```typescript
export interface TimelineDataPoint {
    date: string
    total: number
    passed: number
    failed: number
    skipped: number
}

export function useTestTimeline(days: number = 30) {
    return useQuery({
        queryKey: ['test-timeline', days],
        queryFn: () => fetchTestTimeline(days),
        refetchInterval: false,
        staleTime: 60000,
    })
}
```

**Key Features**:

- **Simple API**: Just pass `days` parameter
- **React Query Caching**: 60s stale time prevents excessive requests
- **Type Safety**: Full TypeScript support with `TimelineDataPoint` interface

### Dashboard Component

**Location**: `packages/web/src/features/dashboard/components/Dashboard.tsx`

#### Component Structure

```typescript
export default function Dashboard() {
    const {tests, fetchTests, lastUpdated} = useTestsStore()
    const queryClient = useQueryClient()

    const {isLoading: statsLoading, error: statsError} = useDashboardStats()
    const {
        data: flakyTests,
        isLoading: flakyLoading,
        days,
        threshold,
        updateDays,
        updateThreshold,
    } = useFlakyTests()
    const {data: timelineData, isLoading: timelineLoading} = useTestTimeline(30)

    // WebSocket integration
    const [webSocketUrl, setWebSocketUrl] = useState<string | null>(null)

    useEffect(() => {
        const url = getWebSocketUrl(true)
        setWebSocketUrl(url)
    }, [])

    const handleRunCompleted = useCallback(() => {
        queryClient.invalidateQueries({queryKey: ['flaky-tests']})
        queryClient.invalidateQueries({queryKey: ['test-timeline']})
        queryClient.invalidateQueries({queryKey: ['dashboard-stats']})
        fetchTests()
    }, [queryClient, fetchTests])

    useWebSocket(webSocketUrl, {
        onRunCompleted: handleRunCompleted,
    })

    // Component renders 3 main sections:
    // 1. DashboardStats (4 cards)
    // 2. Flaky Tests Panel (left)
    // 3. Timeline Chart (right)
}
```

#### WebSocket Integration

**Fixed Issue**: WebSocket URL calculation

**Problem**: Using `useMemo` caused WebSocket URL to be calculated once on mount before JWT token was available, resulting in persistent `null` URL.

**Solution**: Changed to `useState` + `useEffect` to allow URL to be set after token becomes available:

```typescript
// ❌ BEFORE (broken):
const webSocketUrl = useMemo(() => getWebSocketUrl(true), [])

// ✅ AFTER (fixed):
const [webSocketUrl, setWebSocketUrl] = useState<string | null>(null)

useEffect(() => {
    const url = getWebSocketUrl(true)
    setWebSocketUrl(url)
}, [])
```

**Real-time Updates**: When test run completes, WebSocket triggers:

1. Invalidate React Query caches for all dashboard data
2. Refetch tests from testsStore
3. UI automatically updates with fresh data

#### Flaky Tests Panel

**UI Features**:

- **Configurable Controls**:
    - Period dropdown (7/14/30/60 days)
    - Threshold input (1-99%)
- **Empty State**: 🎉 emoji with "No flaky tests detected!"
- **Flaky Test Cards**:
    - Test name and file path
    - Flaky percentage (orange color)
    - Failed/total runs ratio
    - **History Dots**: Last 15 runs displayed as ✅ (passed) or ❌ (failed)
- **Scrollable**: Max height with overflow-y-auto

**Example Card**:

```
┌──────────────────────────────────────────────────┐
│ API - Change Action Status                  25% │
│ tests/api/actions.spec.ts                  2/8  │
│ ✅❌✅✅❌✅✅✅                              │
└──────────────────────────────────────────────────┘
```

#### Timeline Chart

**Recharts Implementation**:

```typescript
<ResponsiveContainer width="100%" height={240}>
    <AreaChart data={timelineData} margin={{top: 10, right: 10, left: 0, bottom: 0}}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
        <XAxis
            dataKey="date"
            tick={{fontSize: 12}}
            className="fill-gray-600 dark:fill-gray-400"
            tickFormatter={(value) => {
                const date = new Date(value)
                return `${date.getMonth() + 1}/${date.getDate()}`
            }}
        />
        <YAxis tick={{fontSize: 12}} className="fill-gray-600 dark:fill-gray-400" />
        <Tooltip
            contentStyle={{
                backgroundColor: 'rgb(31 41 55)',
                border: 'none',
                borderRadius: '0.5rem',
                color: 'white',
            }}
            labelStyle={{color: 'rgb(156 163 175)'}}
        />
        <Area
            type="monotone"
            dataKey="passed"
            stackId="1"
            stroke="rgb(34 197 94)"
            fill="rgb(34 197 94)"
            fillOpacity={0.6}
            name="Passed"
        />
        <Area
            type="monotone"
            dataKey="failed"
            stackId="1"
            stroke="rgb(239 68 68)"
            fill="rgb(239 68 68)"
            fillOpacity={0.6}
            name="Failed"
        />
        <Area
            type="monotone"
            dataKey="skipped"
            stackId="1"
            stroke="rgb(156 163 175)"
            fill="rgb(156 163 175)"
            fillOpacity={0.6}
            name="Skipped"
        />
    </AreaChart>
</ResponsiveContainer>
```

**Key Features**:

- **Stacked Areas**: Shows cumulative test counts per day
- **Tailwind CSS Colors**: RGB values for automatic dark mode support
    - Passed: `rgb(34 197 94)` (green-500)
    - Failed: `rgb(239 68 68)` (red-500)
    - Skipped: `rgb(156 163 175)` (gray-400)
- **Responsive**: Adapts to container width
- **Custom Tooltip**: Dark background with proper contrast
- **Date Formatting**: Shows as `MM/DD` format

### DashboardStats Component

**Location**: `packages/web/src/features/dashboard/components/DashboardStats.tsx`

**Fallback Logic**:

```typescript
export function DashboardStats({tests, loading}: DashboardStatsProps) {
    const fallbackStats = {
        totalTests: tests.length,
        passedTests: tests.filter((t) => t.status === 'passed').length,
        failedTests: tests.filter((t) => t.status === 'failed').length,
        skippedTests: tests.filter((t) => t.status === 'skipped').length,
        successRate:
            tests.length > 0
                ? (tests.filter((t) => t.status === 'passed').length / tests.length) * 100
                : 0,
        totalRuns: 0,
        recentRuns: [],
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatsCard title="Total Tests" value={fallbackStats.totalTests} icon="📊" loading={loading} />
            <StatsCard
                title="Passed"
                value={fallbackStats.passedTests}
                icon="✅"
                className="text-success-600 dark:text-success-400"
                loading={loading}
            />
            <StatsCard
                title="Failed"
                value={fallbackStats.failedTests}
                icon="❌"
                className="text-danger-600 dark:text-danger-400"
                loading={loading}
            />
            <StatsCard
                title="Success Rate"
                value={`${Math.round(fallbackStats.successRate)}%`}
                icon="📈"
                className={
                    fallbackStats.successRate >= 80
                        ? 'text-success-600 dark:text-success-400'
                        : 'text-danger-600 dark:text-danger-400'
                }
                loading={loading}
            />
        </div>
    )
}
```

**Why Fallback**: Ensures stats always display correctly even if `useDashboardStats()` hook doesn't return data

## Code Cleanup

### Removed Components

As part of the redesign, the following unused components were removed:

1. **`ErrorsOverview.tsx`** - Error statistics component (replaced by flaky tests panel)
2. **`RecentTests.tsx`** - Recent test runs list (data available in Tests page)
3. **`SystemInfo.tsx`** - System information display (not needed per requirements)

### Updated Barrel Exports

**Location**: `packages/web/src/features/dashboard/components/index.ts`

```typescript
// BEFORE
export {default as Dashboard} from './Dashboard'
export {DashboardStats} from './DashboardStats'
export {ErrorsOverview} from './ErrorsOverview' // ❌ Removed
export {RecentTests} from './RecentTests' // ❌ Removed
export {default as StatsCard} from './StatsCard'
export {SystemInfo} from './SystemInfo' // ❌ Removed
export * from './settings'

// AFTER
export {default as Dashboard} from './Dashboard'
export {DashboardStats} from './DashboardStats'
export {default as StatsCard} from './StatsCard'
export * from './settings'
```

## Dependencies

### New Package: Recharts

**Added to**: `packages/web/package.json`

```json
{
    "dependencies": {
        "recharts": "^2.12.7"
    }
}
```

**Why Recharts**:

- ✅ Excellent React integration
- ✅ Declarative API with components
- ✅ Responsive by default
- ✅ Supports dark mode via custom styles
- ✅ Lightweight and performant

## API Reference

### GET /api/tests/flaky

Retrieve flaky tests with configurable filtering.

**Query Parameters**:

- `days` (optional) - Time range in days (default: 30)
- `threshold` (optional) - Minimum failure percentage (default: 10)

**Example Request**:

```http
GET /api/tests/flaky?days=30&threshold=15
Authorization: Bearer {jwt-token}
```

**Response**:

```json
{
    "status": "success",
    "data": [
        {
            "testId": "test-xv3dl2",
            "name": "Change Action status",
            "filePath": "tests/api/actions.spec.ts",
            "totalRuns": 8,
            "failedRuns": 2,
            "passedRuns": 6,
            "flakyPercentage": 25,
            "history": [
                "passed",
                "failed",
                "passed",
                "passed",
                "failed",
                "passed",
                "passed",
                "passed"
            ],
            "lastRun": "2025-10-09 14:32:15"
        }
    ],
    "count": 1
}
```

### GET /api/tests/timeline

Retrieve daily test execution statistics.

**Query Parameters**:

- `days` (optional) - Time range in days (default: 30)

**Example Request**:

```http
GET /api/tests/timeline?days=30
Authorization: Bearer {jwt-token}
```

**Response**:

```json
{
    "status": "success",
    "data": [
        {
            "date": "2025-10-09",
            "total": 80,
            "passed": 75,
            "failed": 3,
            "skipped": 2
        },
        {
            "date": "2025-10-08",
            "total": 80,
            "passed": 78,
            "failed": 2,
            "skipped": 0
        }
    ],
    "count": 2
}
```

## User Experience

### Dashboard Layout

```
┌─────────────────────────────────────────────────────────┐
│ Dashboard                           Last updated: 2:30PM│
│ Test execution overview and statistics                  │
├─────────────────────────────────────────────────────────┤
│ ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐                    │
│ │📊 80│  │✅ 75│  │❌ 3 │  │📈94%│                    │
│ │Total│  │Pass │  │Fail │  │Rate │                    │
│ └─────┘  └─────┘  └─────┘  └─────┘                    │
├──────────────────────┬──────────────────────────────────┤
│ Flaky Tests          │ Test Execution Timeline         │
│ Period: [30 days ▼] │ Last 30 days activity           │
│ Threshold: [10] %   │                                  │
│                      │ ┌─────────────────────────────┐ │
│ API Test 1      25% │ │     [Chart visualization]   │ │
│ tests/api/...  2/8  │ │                             │ │
│ ✅❌✅✅❌✅✅✅    │ │                             │ │
│                      │ │                             │ │
│ UI Test 2       15% │ │                             │ │
│ tests/ui/...   3/20  │ └─────────────────────────────┘ │
│ ✅✅❌✅✅✅...      │                                  │
└──────────────────────┴──────────────────────────────────┘
```

### User Interactions

1. **View Flaky Tests**:
    - Adjust period (7/14/30/60 days) via dropdown
    - Adjust threshold (1-99%) via number input
    - Settings automatically saved to localStorage
    - Data refetches when settings change

2. **Analyze Test Stability**:
    - Hover over history dots to see run number and status
    - View flaky percentage and failed/total ratio
    - Click test name to view details (future enhancement)

3. **Monitor Trends**:
    - View stacked area chart showing daily test distribution
    - Hover over chart to see exact counts per day
    - Identify patterns in test failures over time

4. **Real-time Updates**:
    - Dashboard updates automatically when tests complete
    - No manual refresh needed
    - Live Updates indicator in Header shows connection status

## Technical Considerations

### Performance Optimizations

1. **React Query Caching**:
    - 60-second stale time prevents excessive API requests
    - Query keys include all parameters for accurate cache invalidation
    - Manual invalidation via WebSocket ensures fresh data

2. **Database Indexing**:
    - Existing indexes on `test_id`, `created_at`, `status` optimize queries
    - `GROUP BY` operations use indexed columns
    - `LIMIT 50` prevents excessive data transfer for flaky tests

3. **Component Optimization**:
    - Loading states prevent layout shifts
    - Empty states reduce unnecessary rendering
    - Scrollable containers with max-height prevent performance issues

### localStorage Schema

```typescript
{
  "dashboard_flaky_days": "30",      // Number as string
  "dashboard_flaky_threshold": "10"   // Number as string
}
```

**Migration**: No migration needed - defaults used if keys don't exist

### Dark Mode Support

All visualizations use **Tailwind CSS RGB color values** for automatic dark mode:

```typescript
// Light mode: Uses base color
// Dark mode: Automatically adjusts via dark: variants

Colors used:
- Success: rgb(34 197 94)   // green-500
- Danger:  rgb(239 68 68)   // red-500
- Gray:    rgb(156 163 175) // gray-400
- Background: Uses Tailwind dark: classes
```

## Benefits

### For Users

✅ **Identify Unstable Tests**: Quickly find tests with intermittent failures
✅ **Historical Context**: View test execution trends over time
✅ **Configurable Analysis**: Adjust parameters to focus on specific issues
✅ **Real-time Monitoring**: Dashboard updates automatically
✅ **Visual Insights**: Charts and history dots provide quick understanding

### For Developers

✅ **Clean Architecture**: Follows Feature-Based Architecture pattern
✅ **Type Safety**: Full TypeScript support across all components
✅ **Testable**: React Query hooks are easy to test
✅ **Maintainable**: Separation of concerns between data fetching and UI
✅ **Extensible**: Easy to add new metrics or visualizations

### For Test Quality

✅ **Proactive Detection**: Catch flaky tests before they become problems
✅ **Data-Driven Decisions**: Historical trends guide improvement efforts
✅ **Threshold Tuning**: Adjust sensitivity to match team standards
✅ **Accountability**: Clear visibility into test stability metrics

## Troubleshooting

### Flaky Tests Not Showing

**Symptom**: Flaky Tests panel shows "No flaky tests detected" but you expect some

**Possible Causes**:

1. Threshold too high (increase threshold to see more tests)
2. Period too short (tests need multiple runs within period)
3. Tests haven't run multiple times yet
4. All tests are 100% failing (not considered flaky)

**Solution**:

- Adjust threshold to lower value (e.g., 5%)
- Increase period to 60 days
- Run tests multiple times
- Check that tests have both passed and failed runs

### Timeline Shows No Data

**Symptom**: Timeline chart shows "No test data available"

**Possible Causes**:

1. No tests executed in last 30 days
2. All tests have `status = 'pending'` (discovery only)
3. Database has no test results

**Solution**:

- Run some tests to populate data
- Check `/api/tests/timeline?days=30` endpoint directly
- Verify test results exist in database

### WebSocket Not Updating

**Symptom**: Dashboard doesn't update automatically after test run completes

**Possible Causes**:

1. WebSocket connection failed (check Header indicator)
2. JWT token expired
3. `onRunCompleted` handler not triggered

**Solution**:

- Check browser console for WebSocket errors
- Verify "Live Updates: Connected" shows in Header
- Refresh page to reinitialize WebSocket connection

### Stats Cards Show "NaN%"

**Symptom**: Success Rate card displays "NaN%"

**Cause**: This issue was **already fixed** in current implementation

**Solution**: DashboardStats now uses fallback logic that computes stats directly from `tests` array, ensuring correct display even if hook data is unavailable.

## Future Enhancements

Potential improvements for this feature:

1. **Test Comparison**: Side-by-side comparison of multiple flaky tests
2. **Trend Analysis**: Show if test is getting more/less flaky over time
3. **Automated Alerts**: Notify when test crosses flakiness threshold
4. **Export Data**: Download flaky tests report as CSV/PDF
5. **Historical Snapshots**: Save dashboard state for specific dates
6. **Drill-down**: Click test to see detailed execution history
7. **Filters**: Filter flaky tests by file path, tags, or duration
8. **Charts**: Additional visualizations (pie charts, bar charts, etc.)

## Related Documentation

- [Architecture Overview](../ARCHITECTURE.md) - Feature-Based Architecture details
- [Historical Test Tracking](./HISTORICAL_TEST_TRACKING.md) - Test execution history system
- [API Reference](../API_REFERENCE.md) - Complete API endpoints documentation
- [Development Guidelines](../DEVELOPMENT.md) - Development best practices
- [Authentication Implementation](./AUTHENTICATION_IMPLEMENTATION.md) - JWT-based API auth
