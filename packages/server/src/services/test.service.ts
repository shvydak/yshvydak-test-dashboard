import {
    ITestService,
    TestDiscoveryResult,
    TestResult,
    TestFilters,
    DatabaseStats,
} from '../types/service.types'
import {TestResultData} from '../types/database.types'
import {TestRepository} from '../repositories/test.repository'
import {RunRepository} from '../repositories/run.repository'
import {PlaywrightService} from './playwright.service'
import {WebSocketService} from './websocket.service'
import {AttachmentService} from './attachment.service'
import {Logger} from '../utils/logger.util'
import {FileUtil} from '../utils/file.util'
import {activeProcessesTracker} from './activeProcesses.service'

export class TestService implements ITestService {
    constructor(
        private testRepository: TestRepository,
        private runRepository: RunRepository,
        private playwrightService: PlaywrightService,
        private websocketService: WebSocketService,
        private attachmentService: AttachmentService
    ) {}

    async discoverTests(): Promise<TestDiscoveryResult> {
        try {
            // Clear existing pending tests before adding discovered ones
            await this.testRepository['execute']('DELETE FROM test_results WHERE status = ?', [
                'pending',
            ])

            // Discover tests using Playwright
            const discoveredTests = await this.playwrightService.discoverTests()

            // Save discovered tests to database
            let savedCount = 0
            for (const test of discoveredTests) {
                try {
                    await this.testRepository.saveTestResult(test as any)
                    savedCount++
                } catch (error) {
                    Logger.error(`Failed to save discovered test ${test.name}`, error)
                }
            }

            // Broadcast discovery update via WebSocket
            this.websocketService.broadcastDiscoveryCompleted(discoveredTests.length, savedCount)

            Logger.testDiscovery(discoveredTests.length, savedCount)

            return {
                discovered: discoveredTests.length,
                saved: savedCount,
                timestamp: new Date().toISOString(),
            }
        } catch (error) {
            Logger.error('Test discovery failed', error)
            throw error
        }
    }

    async getAllTests(filters: TestFilters): Promise<TestResult[]> {
        return this.testRepository.getAllTests(filters)
    }

    async getTestById(id: string): Promise<TestResult | null> {
        const test = await this.testRepository.getTestResult(id)
        if (!test) return null

        // Get attachments for this test
        const attachments = await this.attachmentService.getAttachmentsByTestResult(id)
        test.attachments = attachments

        return test
    }

    async getTestHistory(testId: string, limit: number = 50): Promise<TestResult[]> {
        const history = await this.testRepository.getTestResultsByTestId(testId, limit)

        // Load attachments for each execution
        for (const execution of history) {
            const attachments = await this.attachmentService.getAttachmentsByTestResult(
                execution.id
            )
            execution.attachments = attachments
        }

        return history
    }

    async deleteTest(testId: string): Promise<{deletedExecutions: number}> {
        // Get all executions for this testId to delete their attachments
        const executions = await this.testRepository.getTestResultsByTestId(testId, 1000)

        // Delete physical attachment files for each execution
        for (const execution of executions) {
            try {
                await this.attachmentService.deleteAttachmentsForTestResult(execution.id)
            } catch (error) {
                Logger.error(`Failed to delete attachments for execution ${execution.id}`, error)
            }
        }

        // Delete all test_results records (CASCADE will delete attachment records)
        const deletedCount = await this.testRepository.deleteByTestId(testId)

        Logger.info(`Deleted test ${testId}: ${deletedCount} executions`)

        return {deletedExecutions: deletedCount}
    }

    async clearAllTests(): Promise<void> {
        // Clear database records
        await this.testRepository.clearAllTests()

        // Clear physical attachment files
        await this.attachmentService.clearAllAttachments()
    }

    async saveTestResult(testData: TestResultData): Promise<string> {
        const resultId = await this.testRepository.saveTestResult(testData)

        // Save attachments if provided
        if ((testData as any).attachments && Array.isArray((testData as any).attachments)) {
            await this.attachmentService.saveAttachmentsForTestResult(
                resultId,
                (testData as any).attachments
            )
        }

        return resultId
    }

    async getTestStats(): Promise<DatabaseStats> {
        return this.testRepository.getTestStats()
    }

    async getFlakyTests(days: number = 30, thresholdPercent: number = 10): Promise<any[]> {
        return this.testRepository.getFlakyTests(days, thresholdPercent)
    }

    async getTestTimeline(days: number = 30): Promise<any[]> {
        return this.testRepository.getTestTimeline(days)
    }

    async runAllTests(maxWorkers?: number): Promise<any> {
        // Check if tests are already running
        if (activeProcessesTracker.isRunAllActive()) {
            const activeRuns = activeProcessesTracker.getActiveProcesses()
            const currentRun = activeRuns.find((r) => r.type === 'run-all')

            if (currentRun) {
                // Calculate estimated time remaining (rough estimate based on typical test duration)
                const startTime = new Date(currentRun.startedAt).getTime()
                const elapsed = Date.now() - startTime
                const estimatedTotal = 180000 // 3 minutes typical duration
                const remaining = Math.max(0, Math.floor((estimatedTotal - elapsed) / 1000))

                throw new Error(
                    JSON.stringify({
                        code: 'TESTS_ALREADY_RUNNING',
                        message: 'Tests are already running',
                        currentRunId: currentRun.id,
                        estimatedTimeRemaining: remaining,
                        startedAt: currentRun.startedAt,
                    })
                )
            }
        }

        const result = await this.playwrightService.runAllTests(maxWorkers)

        // Add process to tracker
        activeProcessesTracker.addProcess({
            runId: result.runId,
            type: 'run-all',
            totalTests: undefined, // Will be determined during execution
        })

        // Create test run record
        await this.runRepository.createTestRun({
            id: result.runId,
            status: 'running',
            totalTests: 0, // Will be updated when tests complete
            passedTests: 0,
            failedTests: 0,
            skippedTests: 0,
            duration: 0,
            metadata: {
                type: 'run-all',
                triggeredFrom: 'dashboard',
            },
        })

        // Broadcast run start
        this.websocketService.broadcastRunStarted(result.runId, 'run-all')

        // Handle process completion
        if (result.process) {
            result.process.on('close', (code) => {
                Logger.info(`All tests completed with code: ${code}`)

                // Remove process from tracker
                activeProcessesTracker.removeProcess(result.runId)

                this.websocketService.broadcastRunCompleted(result.runId, code || 1, 'run-all')
            })
        }

        return result
    }

    async runTestGroup(filePath: string, maxWorkers?: number): Promise<any> {
        const result = await this.playwrightService.runTestGroup(filePath, maxWorkers)

        // Add process to tracker
        activeProcessesTracker.addProcess({
            runId: result.runId,
            type: 'run-group',
            filePath: filePath,
        })

        // Create test run record
        await this.runRepository.createTestRun({
            id: result.runId,
            status: 'running',
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            skippedTests: 0,
            duration: 0,
            metadata: {
                type: 'run-group',
                filePath,
                triggeredFrom: 'dashboard',
            },
        })

        // Broadcast run start
        this.websocketService.broadcastRunStarted(result.runId, 'run-group', filePath)

        // Handle process completion
        if (result.process) {
            result.process.on('close', (code) => {
                Logger.info(`Group tests completed with code: ${code}`)

                // Remove process from tracker
                activeProcessesTracker.removeProcess(result.runId)

                this.websocketService.broadcastRunCompleted(
                    result.runId,
                    code || 1,
                    'run-group',
                    filePath
                )
            })
        }

        return result
    }

    async rerunTest(testId: string, maxWorkers?: number): Promise<any> {
        // Get the test to rerun
        const test = await this.testRepository.getTestResult(testId)
        if (!test) {
            throw new Error('Test not found')
        }

        const result = await this.playwrightService.rerunSingleTest(
            test.filePath,
            test.name,
            maxWorkers
        )

        // Add process to tracker
        activeProcessesTracker.addProcess({
            runId: result.runId,
            type: 'rerun',
            testId: testId,
            originalTestId: testId,
            filePath: test.filePath,
        })

        // Create a new run for this rerun
        await this.runRepository.createTestRun({
            id: result.runId,
            status: 'running',
            totalTests: 1,
            passedTests: 0,
            failedTests: 0,
            skippedTests: 0,
            duration: 0,
            metadata: {
                type: 'rerun',
                originalTestId: testId,
                originalTestName: test.name,
                filePath: test.filePath,
            },
        })

        // Handle process completion
        if (result.process) {
            let _stdout = ''
            let _stderr = ''

            result.process.stdout?.on('data', (data) => {
                _stdout += data.toString()
            })

            result.process.stderr?.on('data', (data) => {
                _stderr += data.toString()
            })

            result.process.on('close', async (code) => {
                try {
                    const runStatus = code === 0 ? 'completed' : 'failed'
                    await this.runRepository.updateTestRun(result.runId, {status: runStatus})

                    Logger.info(`Test rerun completed with code: ${code}`)

                    // Remove process from tracker
                    activeProcessesTracker.removeProcess(result.runId)

                    // Send WebSocket updates
                    this.websocketService.broadcast({
                        type: 'run:completed',
                        data: {
                            runId: result.runId,
                            exitCode: code,
                            testId: test.testId,
                            testName: test.name,
                            originalTestId: testId,
                            isRerun: true,
                            type: 'rerun',
                        },
                    })

                    this.websocketService.broadcastDashboardRefresh('test_rerun_completed', {
                        testId: test.testId,
                        runId: result.runId,
                        status: runStatus,
                    })
                } catch (error) {
                    Logger.error('Error processing rerun results', error)
                }
            })
        }

        return {
            ...result,
            testId,
            testName: test.name,
        }
    }

    async getDiagnostics(): Promise<{
        playwright: {
            version: string
            config: any
            validation: {
                isValid: boolean
                issues: string[]
                projectDir: string
                reporterPath: string
                reporterExists: boolean
            }
            healthCheck: {
                canDiscoverTests: boolean
                error?: string
            }
        }
        reporter: {
            reporterPath: string
            reporterExists: boolean
            canImportReporter: boolean
            reporterDiagnostics?: any
            error?: string
        }
        database: {
            connected: boolean
            stats: DatabaseStats
        }
        timestamp: string
    }> {
        Logger.info('Getting diagnostics')

        // Get all diagnostics in parallel
        const [playwrightDiagnostics, reporterDiagnostics, dbStats] = await Promise.all([
            this.playwrightService.getDiagnostics(),
            this.playwrightService.getReporterDiagnostics(),
            this.getTestStats(),
        ])

        return {
            playwright: playwrightDiagnostics,
            reporter: reporterDiagnostics,
            database: {
                connected: true, // If we got stats, DB is connected
                stats: dbStats,
            },
            timestamp: new Date().toISOString(),
        }
    }

    async getTraceFileById(
        attachmentId: string
    ): Promise<{filePath: string; fileName: string} | null> {
        try {
            // Get attachment from database
            const attachment = await this.attachmentService.getAttachmentById(attachmentId)

            if (!attachment) {
                Logger.warn(`Attachment not found: ${attachmentId}`)
                return null
            }

            // Check if attachment is a trace file
            if (attachment.type !== 'trace') {
                Logger.warn(
                    `Attachment ${attachmentId} is not a trace file, type: ${attachment.type}`
                )
                return null
            }

            // Check if file exists
            if (!attachment.filePath) {
                Logger.warn(`Attachment ${attachmentId} has no file path`)
                return null
            }

            if (!FileUtil.fileExists(attachment.filePath)) {
                Logger.warn(`Trace file not found: ${attachment.filePath}`)
                return null
            }

            return {
                filePath: attachment.filePath,
                fileName: attachment.fileName || 'trace.zip',
            }
        } catch (error) {
            Logger.error('Error getting trace file:', error)
            throw error
        }
    }
}
