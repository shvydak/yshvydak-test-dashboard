// Database entities (keep compatible with existing schema)
export interface TestRunData {
    id: string
    status: 'running' | 'completed' | 'failed'
    totalTests: number
    passedTests: number
    failedTests: number
    skippedTests: number
    duration: number
    metadata?: any
}

export interface TestResultData {
    id: string
    runId: string
    testId: string
    name: string
    filePath: string
    status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'pending'
    duration: number
    errorMessage?: string | null
    errorStack?: string | null
    retryCount?: number
    metadata?: any
    timestamp: string
}

export interface AttachmentData {
    id: string
    testResultId: string
    type: 'video' | 'screenshot' | 'trace' | 'log'
    fileName: string
    filePath: string
    fileSize: number
    mimeType?: string
    url: string
}

// Database row types (snake_case from DB)
export interface TestResultRow {
    id: string
    run_id: string
    test_id: string
    name: string
    file_path: string
    status: string
    duration: number
    error_message?: string
    error_stack?: string
    retry_count?: number
    metadata?: string
    created_at: string
    updated_at: string
    // Joined attachment fields
    attachment_id?: string
    attachment_type?: string
    attachment_url?: string
}

// Discovered test from Playwright
export interface DiscoveredTest {
    id: string
    testId: string
    runId: string | null
    name: string
    filePath: string
    status: 'pending'
    duration: number
    errorMessage?: undefined
    errorStack?: undefined
    retryCount: number
    metadata: string
    timestamp: string
}

// Database statistics
export interface DatabaseStats {
    totalTests: number
    totalRuns: number
    totalAttachments: number
    databaseSize: number
    lastUpdated: string
}