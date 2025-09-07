export interface TestResult {
     id: string
     name: string
     filePath: string
     status: 'passed' | 'failed' | 'skipped' | 'pending'
     duration: number
     errorMessage?: string
     timestamp?: string | null
     created_at?: string
     updated_at?: string
     runId: string
     rerunCount?: number
     steps?: TestStep[]
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
