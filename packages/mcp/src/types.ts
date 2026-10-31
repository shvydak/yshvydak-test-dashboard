// Local mirrors of the server's response shapes (not @yshvydak/core: those drift from the wire);
// the integration test against the real server harness is the drift guard.

export type TestStatus = 'passed' | 'failed' | 'skipped' | 'timedOut' | 'pending'

export interface AttachmentRow {
    id: string
    testResultId: string
    type: 'video' | 'screenshot' | 'trace' | 'log'
    fileName: string
    fileSize: number
    mimeType?: string
    url: string
}

export interface TestRow {
    id: string
    runId: string
    testId: string
    name: string
    filePath: string
    status: TestStatus
    duration: number
    errorMessage?: string
    errorStack?: string
    project?: string
    timestamp?: string
    createdAt?: string
    notInCode?: boolean
    note?: {content: string; updatedAt?: string}
    attachmentsClearedAt?: string
    attachments?: AttachmentRow[]
    metadata?: {
        tags?: string[]
        describe?: string[]
        annotations?: Array<{type: string; description?: string}>
        line?: number
        steps?: Array<{title: string; duration?: number; error?: string; category?: string}>
        console?: {entries?: Array<{type: string; text: string}>}
        errors?: Array<{message?: string; stack?: string}>
    }
}

export interface Envelope<T> {
    success: boolean
    data: T
    count?: number
}

export interface TabConfig {
    project: string
    displayName?: string
    visible?: boolean
}

export interface ProjectSummary {
    project: string
    total: number
    passed: number
    failed: number
}

export type JiraStatusCategory = 'new' | 'indeterminate' | 'done'

export interface JiraTicket {
    key: string
    issueType: string
    statusName: string
    statusCategory: JiraStatusCategory
}

export interface JiraStatus {
    enabled: boolean
    lastSyncAt: string | null
    lastSyncOk: boolean | null
    lastSyncError: string | null
}

export interface RunRow {
    id: string
    status: string
    totalTests: number
    passedTests: number
    failedTests: number
    skippedTests: number
    duration: number
    metadata?: {type?: string; filePath?: string; project?: string; originalTestId?: string}
}
