import {ChildProcess} from 'child_process'
import {TestResultData, TestRunData, AttachmentData} from './database.types'

// Service interfaces
export interface ITestService {
    discoverTests(): Promise<TestDiscoveryResult>
    getAllTests(filters: TestFilters): Promise<TestResult[]>
    getTestById(id: string): Promise<TestResult | null>
    getTestHistory(testId: string, limit?: number): Promise<TestResult[]>
    clearAllTests(): Promise<void>
    saveTestResult(testData: TestResultData): Promise<string>
    getTestStats(): Promise<DatabaseStats>
    getTraceFileById(attachmentId: string): Promise<{filePath: string; fileName: string} | null>
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
    clearAllTests(): Promise<void>
    getTestStats(): Promise<DatabaseStats>
}

export interface IRunRepository {
    createTestRun(runData: TestRunData): Promise<string>
    updateTestRun(runId: string, updates: Partial<TestRunData>): Promise<void>
    getTestRun(runId: string): Promise<TestRunData | null>
}
