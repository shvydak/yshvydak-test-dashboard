import {ChildProcess} from 'child_process'
import {TestResultData, TestRunData, AttachmentData} from './database.types'

// Service interfaces
export interface ITestService {
    discoverTests(): Promise<TestDiscoveryResult>
    getAllTests(filters: TestFilters): Promise<TestResult[]>
    getTestById(id: string): Promise<TestResult | null>
    getTestHistory(testId: string, limit?: number): Promise<TestResult[]>
    deleteTest(testId: string): Promise<{deletedExecutions: number}>
    deleteExecution(executionId: string): Promise<{success: boolean}>
    clearAllTests(): Promise<void>
    cleanupData(options: CleanupOptions): Promise<CleanupResult>
    saveTestResult(testData: TestResultData): Promise<string>
    getTestStats(): Promise<DatabaseStats>
    getTraceFileById(attachmentId: string): Promise<{filePath: string; fileName: string} | null>
}

export interface CleanupOptions {
    type: 'date' | 'count'
    value: string | number
}

export interface CleanupResult {
    deletedExecutions: number
    freedSpace: number
    message: string
}

export interface IPlaywrightService {
    discoverTests(): Promise<DiscoveredTest[]>
    runAllTests(): Promise<TestRunProcess>
    runTestGroup(
        filePath: string,
        maxWorkers?: number,
        testNames?: string[]
    ): Promise<TestRunProcess>
    rerunSingleTest(testFile: string, testName: string): Promise<TestRunProcess>
}

export interface IWebSocketService {
    broadcast(message: WebSocketMessage): void
    getConnectedClients(): number
}

export interface IAttachmentService {
    mapContentTypeToDbType(contentType: string, fileName: string): string
    processAttachments(attachments: any[], testResultId: string): Promise<AttachmentData[]>
    getAttachmentsByTestResult(testResultId: string): Promise<AttachmentData[]>
    getAttachmentById(attachmentId: string): Promise<AttachmentData | null>
    getStorageStats(): Promise<{
        totalFiles: number
        totalSize: number
        testDirectories: number
        typeBreakdown: {[key: string]: {count: number; size: number}}
    }>
}

// Service result types
export interface TestDiscoveryResult {
    discovered: number
    saved: number
    timestamp: string
}

export interface TestRunProcess {
    runId: string
    message: string
    timestamp: string
    process?: ChildProcess
}

export interface TestResult extends TestResultData {
    attachments?: AttachmentData[]
    note?: {
        testId: string
        content: string
        createdAt: string
        updatedAt: string
    }
}

export interface TestFilters {
    runId?: string
    status?: string
    limit?: number
}

export interface DatabaseStats {
    totalTests: number
    totalRuns: number
    totalAttachments: number
    databaseSize: number
    lastUpdated: string
}

// Playwright integration types
export interface DiscoveredTest {
    id: string
    testId: string
    runId: string | null
    name: string
    filePath: string
    status: 'pending'
    duration: number
    metadata: string
    timestamp: string
}

export interface WebSocketMessage {
    type: string
    data: any
}

// Repository interfaces
export interface ITestRepository {
    saveTestResult(testData: TestResultData): Promise<string>
    getTestResult(id: string): Promise<TestResult | null>
    getTestResultsByRun(runId: string): Promise<TestResult[]>
    getTestResultsByTestId(testId: string, limit?: number): Promise<TestResult[]>
    getAllTests(filters: TestFilters): Promise<TestResult[]>
    deleteByTestId(testId: string): Promise<number>
    deleteByExecutionId(executionId: string): Promise<number>
    clearAllTests(): Promise<void>
    getTestStats(): Promise<DatabaseStats>
}

export interface IRunRepository {
    createTestRun(runData: TestRunData): Promise<string>
    updateTestRun(runId: string, updates: Partial<TestRunData>): Promise<void>
    getTestRun(runId: string): Promise<TestRunData | null>
}
