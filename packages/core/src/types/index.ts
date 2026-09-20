export interface TestResult {
    id: string
    testId: string
    name: string
    filePath: string
    status: 'passed' | 'failed' | 'skipped' | 'pending'
    duration: number
    errorMessage?: string
    metadata?: TestMetadata
    timestamp?: string | null
    created_at?: string
    createdAt?: string
    updated_at?: string
    runId: string
    rerunCount?: number
    steps?: TestStep[]
    attachments?: Attachment[]
    note?: TestNote
    // ISO timestamp set when this execution's attachments were stripped to free
    // disk space (the execution itself is kept for history/timeline). Undefined
    // means attachments were never purged.
    attachmentsClearedAt?: string
    // Playwright project this test was run under. Empty string = discovered/unrun.
    project?: string
}

export type ConsoleEntryType = 'stdout' | 'stderr'

export interface ConsoleEntry {
    type: ConsoleEntryType
    text: string
    timestamp: string
}

export interface TestMetadata {
    steps?: TestStep[]
    console?: {
        entries: ConsoleEntry[]
        truncated?: boolean
    }
    // Playwright tags incl. leading '@' (e.g. '@ABC-123'), sent by reporter and Discover
    tags?: string[]
    // Describe titles only (no root/project/file/test title), outermost first (reporter + Discover)
    describe?: string[]
    // De-duplicated, capped test annotations: skip/fixme/fail reasons and custom ones (reporter + Discover)
    annotations?: Array<{type: string; description?: string}>
    // Test declaration position in the file (reporter + Discover)
    line?: number
    column?: number
    // Static config from Playwright (reporter + Discover)
    timeout?: number
    expectedStatus?: string
    // Reporter only: every result error (soft assertions too), capped; truncated = a field was cut
    errors?: Array<{message?: string; stack?: string; truncated?: boolean}>
    // Reporter only: more errors existed than the cap kept
    errorsTruncated?: boolean
    // Reporter only: test.outcome() after this result
    outcome?: 'skipped' | 'expected' | 'unexpected' | 'flaky'
    // Reporter only: retry index of this result and the test's configured retries
    retry?: number
    retries?: number
    // Reporter only: ISO start time of this result and the worker that ran it
    startTime?: string
    workerIndex?: number
    parallelIndex?: number
    // Allow forward-compatible extra metadata without breaking consumers
    [key: string]: unknown
}

export interface TestNote {
    testId: string
    content: string
    createdAt: string
    updatedAt: string
}

export interface NoteImage {
    id: string
    testId: string
    fileName: string
    fileSize: number
    mimeType: string
    url: string
    createdAt: string
}

export interface TestStep {
    title: string
    duration: number
    error?: string
    category: string
}

export interface TestRun {
    id: string
    createdAt: string
    status: 'running' | 'completed'
    totalTests: number
    passedTests: number
    failedTests: number
    skippedTests: number
}

export interface Attachment {
    id: string
    testResultId: string
    type: 'video' | 'screenshot' | 'trace'
    filePath: string
    fileSize: number
    url: string
}

export interface ReporterOptions {
    outputDir: string
    serverPort?: number
    enableWebSocket?: boolean
    attachmentRetention?: number // days
}

export type AttachmentType = 'video' | 'screenshot' | 'trace'

export interface TestResultData {
    id: string
    runId: string | null
    testId: string
    name: string
    filePath: string
    status: 'passed' | 'failed' | 'skipped' | 'timeout' | 'pending'
    duration: number
    errorMessage?: string
    errorStack?: string
    retryCount?: number
    metadata?: string
    timestamp?: string
}

export interface AttachmentData {
    testResultId: string
    type: AttachmentType
    filePath: string
    fileSize: number
    url: string
}

// WebSocket and Active Process Tracking Types
export interface ActiveProcessInfo {
    id: string
    type: 'run-all' | 'run-group' | 'rerun'
    startedAt: string
    details: {
        runId?: string
        testId?: string
        filePath?: string
        totalTests?: number
        originalTestId?: string
        project?: string
    }
    progress?: TestProgress
}

export interface ConnectionStatusMessage {
    type: 'connection:status'
    data: {
        activeRuns: ActiveProcessInfo[]
        activeGroups: string[]
        isAnyProcessRunning: boolean
    }
    timestamp: string
    clientId?: string
}

export interface ProcessStartData {
    runId: string
    type: 'run-all' | 'run-group' | 'rerun'
    totalTests?: number
    filePath?: string
    testId?: string
    originalTestId?: string
    project?: string
}

export interface ProcessEndData {
    runId: string
    status: 'completed' | 'failed' | 'interrupted'
    results?: {
        passed: number
        failed: number
        skipped: number
        duration: number
    } | null
}

export interface WebSocketMessage {
    type: string
    data?: any
    timestamp?: string
    clientId?: string
}

// Test Progress Tracking Types
export interface RunningTestInfo {
    testId: string
    name: string
    filePath: string
    currentStep?: string
    stepProgress?: {
        current: number
        total: number
    }
    startedAt: string
}

export interface TestProgress {
    processId: string
    type: 'run-all' | 'run-group' | 'rerun'
    totalTests: number
    completedTests: number
    passedTests: number
    failedTests: number
    skippedTests: number
    runningTests: RunningTestInfo[]
    startTime: number
    estimatedEndTime?: number
}

export interface TestProgressUpdate extends WebSocketMessage {
    type: 'test:progress'
    data: TestProgress
}
