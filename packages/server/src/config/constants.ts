export const API_ENDPOINTS = {
    TESTS: '/api/tests',
    RUNS: '/api/runs',
    ATTACHMENTS: '/api/attachments',
    HEALTH: '/api/health',
} as const

export const TEST_STATUSES = {
    PASSED: 'passed',
    FAILED: 'failed',
    SKIPPED: 'skipped',
    TIMED_OUT: 'timedOut',
    PENDING: 'pending',
} as const

export const RUN_STATUSES = {
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
} as const

export const ATTACHMENT_TYPES = {
    VIDEO: 'video',
    SCREENSHOT: 'screenshot',
    TRACE: 'trace',
    LOG: 'log',
} as const

export const WEBSOCKET_EVENTS = {
    RUN_STARTED: 'run:started',
    RUN_COMPLETED: 'run:completed',
    DISCOVERY_COMPLETED: 'discovery:completed',
    JIRA_SYNCED: 'jira:synced',
    DASHBOARD_REFRESH: 'dashboard:refresh',
} as const

export const DEFAULT_LIMITS = {
    TESTS_PER_PAGE: 100,
    /** Cap for a single-project list fetch — high enough for real suites, still bounded. */
    TESTS_PER_PROJECT: 5000,
    TEST_HISTORY: 200,
    SEARCH_DEFAULT: 20,
    SEARCH_MAX: 50,
}

export const SEARCH_MIN_QUERY_LENGTH = 2

export const PLAYWRIGHT_CONSTANTS = {
    LIST_REPORTER: 'json',
    STABLE_TEST_ID_PREFIX: 'test-',
    CONFIG_FILES: ['playwright.config.ts', 'playwright.config.js'],
    PACKAGE_NAME: '@playwright/test',
    REPORTER_PACKAGE_NAME: 'playwright-dashboard-reporter',
} as const

// Same cap as the per-tab `workers` setting in the web UI.
export const MAX_WORKERS = 16

export const RUN_STOP = {
    /** SIGINT lets Playwright run its teardown; the group is SIGKILLed if it ignores it this long. */
    KILL_AFTER_MS: 20_000,
    /** Extra wait for `close` after SIGKILL before the stop gives up on a child. */
    CLOSE_GIVE_UP_MS: 5_000,
    /** Reporter requests already in flight when the child closes; deleting earlier would race them. */
    LATE_POSTS_GRACE_MS: 1_000,
    /** Server shutdown: SIGINT every group, SIGKILL the survivors after this (pm2 kill_timeout is 5 s). */
    SHUTDOWN_GRACE_MS: 2_500,
} as const
