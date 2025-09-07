export const API_ENDPOINTS = {
    TESTS: '/api/tests',
    RUNS: '/api/runs',
    ATTACHMENTS: '/api/attachments',
    HEALTH: '/api/health'
} as const

export const TEST_STATUSES = {
    PASSED: 'passed',
    FAILED: 'failed',
    SKIPPED: 'skipped',
    TIMED_OUT: 'timedOut',
    PENDING: 'pending'
} as const

export const RUN_STATUSES = {
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed'
} as const

export const ATTACHMENT_TYPES = {
    VIDEO: 'video',
    SCREENSHOT: 'screenshot',
    TRACE: 'trace',
    LOG: 'log'
} as const

export const WEBSOCKET_EVENTS = {
    RUN_STARTED: 'run:started',
    RUN_COMPLETED: 'run:completed',
    DISCOVERY_COMPLETED: 'discovery:completed',
    DASHBOARD_REFRESH: 'dashboard:refresh'
} as const

export const DEFAULT_LIMITS = {
    TESTS_PER_PAGE: 100,
    TEST_HISTORY: 10
}