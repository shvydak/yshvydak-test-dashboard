export interface TestResult {
    id: string
    testId: string
    name: string
    filePath: string
    status: 'passed' | 'failed' | 'skipped' | 'pending'
    duration: number
    errorMessage?: string
    timestamp?: string | null
    created_at?: string
    createdAt?: string
    updated_at?: string
    runId: string
    rerunCount?: number
    steps?: TestStep[]
    attachments?: Attachment[]
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
