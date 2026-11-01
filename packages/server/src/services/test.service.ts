import {
    ITestService,
    TestDiscoveryResult,
    TestResult,
    TestFilters,
    DatabaseStats,
    TestStatusCounts,
    TestSearchHit,
    TestRunProcess,
    DiscoveryMode,
    DiscoveredTest,
} from '../types/service.types'
import {TestResultData} from '../types/database.types'
import {TestRepository} from '../repositories/test.repository'
import {TestCatalogRepository, CatalogEntry} from '../repositories/testCatalog.repository'
import {RunRepository} from '../repositories/run.repository'
import {AttachmentCleanupRepository} from '../repositories/attachmentCleanup.repository'
import {PlaywrightService} from './playwright.service'
import {WebSocketService} from './websocket.service'
import {AttachmentService} from './attachment.service'
import {NoteService} from './note.service'
import {JiraService} from './jira.service'
import {SettingsService} from './settings.service'
import {Logger} from '../utils/logger.util'
import {FileUtil} from '../utils/file.util'
import {activeProcessesTracker} from './activeProcesses.service'
import {runProcessRegistry} from './runProcessRegistry.service'
import {CIRunQueueService} from './ciRunQueue.service'
import {createRunCancelledError} from '../utils/runStop.util'

// A discovery this close before a run-all (UI: discover, then run) belongs to that run.
const RECENT_DISCOVERY_MS = 30_000

// A spec's projects; falls back to its single project for a discovered test built without the list.
const projectsOf = (test: DiscoveredTest): string[] => test.projects ?? [test.project ?? '']

export class TestService implements ITestService {
    private markerWrites: Promise<void> = Promise.resolve()
    // Per project ('*' = all): when its last discovery began and ended, so a run can tell its own from a stale one.
    private lastDiscoveries = new Map<string, {startedAt: string; finishedAtMs: number}>()

    constructor(
        private testRepository: TestRepository,
        private runRepository: RunRepository,
        private playwrightService: PlaywrightService,
        private websocketService: WebSocketService,
        private attachmentService: AttachmentService,
        private noteService: NoteService,
        private settingsService: SettingsService,
        private attachmentCleanupRepository: AttachmentCleanupRepository,
        private ciRunQueue: CIRunQueueService,
        private testCatalogRepository: TestCatalogRepository,
        private jiraService?: JiraService
    ) {}

    private async getExecutionProject(): Promise<string | undefined> {
        const project = await this.settingsService.getGlobalPlaywrightProject()
        return project || undefined
    }

    async discoverTests(
        project?: string,
        mode: DiscoveryMode = 'reset'
    ): Promise<TestDiscoveryResult> {
        const startedAt = new Date().toISOString()
        // Manual Discover always scans every project: a scoped scan cannot see a test that moved to
        // another project (@to-fix) and would flag it "not in code" in the tab it left.
        const scope = mode === 'incremental' ? undefined : project
        try {
            // --list first: if it fails (any non-zero exit, incl. a broken spec file) nothing in the DB changes.
            const discoveredTests = await this.playwrightService.discoverTests(scope)
            const scanAt = new Date().toISOString()

            await this.refreshCatalog(discoveredTests, scope, scanAt)

            const toSave =
                mode === 'reset'
                    ? await this.rebuildPendingRows(discoveredTests, scope)
                    : await this.selectNewPendingRows(discoveredTests)

            let savedCount = 0
            for (const test of toSave) {
                try {
                    await this.testRepository.saveTestResult(test as any)
                    savedCount++
                } catch (error) {
                    Logger.error(`Failed to save discovered test ${test.name}`, error)
                }
            }

            // Only reset pending rows belong to a run's window (Stop / recent-discovery rules).
            if (mode === 'reset') {
                this.lastDiscoveries.set(scope ?? '*', {startedAt, finishedAtMs: Date.now()})
            } else {
                this.syncJiraAfterDiscovery()
            }

            // Broadcast discovery update via WebSocket
            this.websocketService.broadcastDiscoveryCompleted(
                discoveredTests.length,
                savedCount,
                scope
            )

            Logger.testDiscovery(discoveredTests.length, savedCount)

            return {
                discovered: discoveredTests.length,
                saved: savedCount,
                mode,
                timestamp: new Date().toISOString(),
            }
        } catch (error) {
            Logger.error('Test discovery failed', error)
            throw error
        }
    }

    // Upsert every (project, test) the list found, then drop catalog rows the scan no longer
    // contains -- only after a scan of ALL projects (a scoped scan cannot see a test that moved to
    // another project via @to-fix) and only for projects it found something in.
    private async refreshCatalog(
        discovered: DiscoveredTest[],
        project: string | undefined,
        scanAt: string
    ): Promise<void> {
        const entries: CatalogEntry[] = []
        const scannedProjects = new Set<string>()
        for (const test of discovered) {
            for (const p of projectsOf(test)) {
                entries.push({
                    project: p,
                    testId: test.testId,
                    name: test.name,
                    filePath: test.filePath,
                    metadata: test.metadata,
                    discoveredAt: scanAt,
                })
                scannedProjects.add(p)
            }
        }
        await this.testCatalogRepository.upsertMany(entries)

        const toClean = project ? [] : scannedProjects
        // Only an all-projects scan can say a test left the code
        if (!project && discovered.length > 0) await this.testCatalogRepository.markFullScan(scanAt)
        for (const p of toClean) {
            await this.testCatalogRepository.deleteStale(p, scanAt)
        }
    }

    // Reset: today's behaviour -- every discovered spec gets a fresh pending row.
    private async rebuildPendingRows(
        discovered: DiscoveredTest[],
        project: string | undefined
    ): Promise<DiscoveredTest[]> {
        await this.testRepository.deletePendingRows(project)
        return discovered
    }

    // Incremental: a pending row only for a test with no row at all, or one whose latest row is in
    // a project the spec no longer runs in (moved, e.g. @to-fix added/removed). Others keep status.
    private async selectNewPendingRows(discovered: DiscoveredTest[]): Promise<DiscoveredTest[]> {
        const latest = await this.testRepository.getLatestProjects(discovered.map((t) => t.testId))
        return discovered.filter((t) => {
            const latestProject = latest.get(t.testId)
            return latestProject === undefined || !projectsOf(t).includes(latestProject)
        })
    }

    // Manual Discover only: new tags may name tickets the cache lacks. Fire-and-forget.
    private syncJiraAfterDiscovery(): void {
        if (!this.jiraService?.isEnabled()) return
        this.jiraService
            .refreshAllKnownKeys()
            .then(() => this.websocketService.broadcastJiraSynced())
            .catch((error) => Logger.error('Jira sync after Discover failed', error))
    }

    async getAllTests(filters: TestFilters): Promise<TestResult[]> {
        return this.testRepository.getAllTests(filters)
    }

    async getLatestTestByTestId(testId: string): Promise<TestResult | null> {
        return this.testRepository.getLatestByTestId(testId)
    }

    async searchTests(query: string, limit: number): Promise<TestSearchHit[]> {
        return this.testRepository.searchLatestTests(query, limit)
    }

    async getTestById(id: string): Promise<TestResult | null> {
        const test = await this.testRepository.getTestResult(id)
        if (!test) return null

        // Get attachments for this test
        const attachments = await this.attachmentService.getAttachmentsByTestResult(id)
        test.attachments = attachments

        return test
    }

    async getTestHistory(
        testId: string,
        limit: number = 50,
        before?: string
    ): Promise<TestResult[]> {
        // Attachments and notes are loaded via JOIN inside the repository, so a
        // single SQL roundtrip is sufficient — no per-execution N+1 fan-out here.
        // `before` enables keyset pagination for long histories.
        return this.testRepository.getTestResultsByTestId(testId, limit, before)
    }

    async getTestExecutionCount(testId: string): Promise<number> {
        return this.testRepository.getTestExecutionCount(testId)
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

        // Delete test note if exists
        try {
            await this.noteService.deleteNote(testId)
        } catch (error) {
            Logger.error(`Failed to delete note for test ${testId}`, error)
        }

        // Delete all test_results records (CASCADE will delete attachment records)
        const deletedCount = await this.testRepository.deleteByTestId(testId)
        await this.testCatalogRepository.deleteByTestId(testId)

        Logger.info(`Deleted test ${testId}: ${deletedCount} executions`)
        this.websocketService.broadcastTestsDeleted('test', {testId})

        return {deletedExecutions: deletedCount}
    }

    async deleteExecution(executionId: string): Promise<{success: boolean}> {
        // Row first: files are only touched for an execution that exists
        if (!(await this.testRepository.getTestResult(executionId))) {
            Logger.warn(`Execution ${executionId} not found`)
            return {success: false}
        }

        // Delete physical attachment files for this execution
        try {
            await this.attachmentService.deleteAttachmentsForTestResult(executionId)
        } catch (error) {
            Logger.error(`Failed to delete attachments for execution ${executionId}`, error)
        }

        // Delete the test_results record (CASCADE will delete attachment records)
        const deletedCount = await this.testRepository.deleteByExecutionId(executionId)

        if (deletedCount === 0) {
            Logger.warn(`Execution ${executionId} not found`)
            return {success: false}
        }

        Logger.info(`Deleted execution ${executionId}`)
        this.websocketService.broadcastTestsDeleted('execution', {executionId})

        return {success: true}
    }

    async clearProjectData(project: string): Promise<{deletedExecutions: number}> {
        // Get all executions and distinct test_ids for this project up front,
        // since deleting test_results rows first would make them unrecoverable.
        const executionIds = await this.testRepository.getExecutionIdsByProject(project)
        const testIds = await this.testRepository.getDistinctTestIdsByProject(project)

        // Delete physical attachment files for each execution
        for (const executionId of executionIds) {
            try {
                await this.attachmentService.deleteAttachmentsForTestResult(executionId)
            } catch (error) {
                Logger.error(`Failed to delete attachments for execution ${executionId}`, error)
            }
        }

        // Delete test notes for each test in this project
        for (const testId of testIds) {
            try {
                await this.noteService.deleteNote(testId)
            } catch (error) {
                Logger.error(`Failed to delete note for test ${testId}`, error)
            }
        }

        // Delete all test_results records for this project (CASCADE will delete attachment records)
        const deletedCount = await this.testRepository.deleteByProject(project)
        await this.testCatalogRepository.deleteByProject(project)

        Logger.info(`Cleared project ${project}: ${deletedCount} executions`)
        this.websocketService.broadcastTestsDeleted('project', {project})

        return {deletedExecutions: deletedCount}
    }

    async clearAllTests(): Promise<void> {
        // Clear database records
        await this.testRepository.clearAllTests()

        // Clear physical attachment files
        await this.attachmentService.clearAllAttachments()

        this.websocketService.broadcastTestsDeleted('all')
    }

    async cleanupData(options: {
        type: 'date' | 'count'
        value: string | number
        mode?: 'strip' | 'full'
    }): Promise<{
        deletedExecutions: number
        freedSpace: number
        message: string
        mode: 'strip' | 'full'
    }> {
        // Prevent cleanup while a run is alive (or being stopped and cleaned up)
        if (this.ciRunQueue.isBusy()) {
            throw new Error('Cannot clean up data while tests are running')
        }

        // 'strip' (default) frees disk space but keeps test_results rows, so the
        // timeline and history survive. 'full' removes the executions entirely.
        const mode: 'strip' | 'full' = options.mode ?? 'strip'

        // Resolve & validate the selection criterion once.
        let date: Date | null = null
        let count = 0
        if (options.type === 'date') {
            date = new Date(options.value as string)
            if (isNaN(date.getTime())) {
                throw new Error('Invalid date provided')
            }
        } else if (options.type === 'count') {
            count = parseInt(options.value as string)
            if (isNaN(count) || count < 1) {
                throw new Error('Invalid count provided')
            }
        }

        // Select the affected executions. In strip mode we only target rows that
        // still have attachments (and never the latest run per test).
        let ids: string[] = []
        if (mode === 'strip') {
            ids =
                options.type === 'date'
                    ? await this.testRepository.getStrippableIdsOlderThan(date!)
                    : await this.testRepository.getStrippableIdsByCount(count)
        } else {
            ids =
                options.type === 'date'
                    ? await this.testRepository.getIdsOlderThan(date!)
                    : await this.testRepository.getIdsPrunedByCount(count)
        }

        if (ids.length === 0) {
            return {
                deletedExecutions: 0,
                freedSpace: 0,
                message: 'No data matched the cleanup criteria',
                mode,
            }
        }

        Logger.info(`Cleanup (${mode}): found ${ids.length} executions to process`)

        // Measure freed space from the DB (file_size column) before deleting files —
        // a single indexed aggregate, no double directory scan.
        const {total: freedSpace, perId} = await this.testRepository.getAttachmentsSizeForIds(ids)

        // Delete physical attachment files + their DB rows for every affected execution.
        for (const id of ids) {
            try {
                await this.attachmentService.deleteAttachmentsForTestResult(id)
            } catch (error) {
                Logger.warn(`Failed to delete attachments for execution ${id}`, error)
            }
        }

        if (mode === 'strip') {
            // Keep the test_results rows; record that artifacts were purged so the UI
            // can show "Attachments removed to free space" instead of "No attachments".
            await this.attachmentCleanupRepository.markCleared(
                ids.map((id) => ({testResultId: id, freedBytes: perId[id] || 0}))
            )

            Logger.info(
                `Cleanup complete (strip): freed ${freedSpace} bytes from ${ids.length} executions, history kept`
            )

            this.websocketService.broadcastTestsDeleted('cleanup')

            return {
                deletedExecutions: ids.length,
                freedSpace,
                message: `Freed space from ${ids.length} executions (history kept)`,
                mode,
            }
        }

        const deletedCount = await this.testRepository.deleteByIds(ids)

        Logger.info(
            `Cleanup complete (full): deleted ${deletedCount} records, freed ${freedSpace} bytes`
        )

        this.websocketService.broadcastTestsDeleted('cleanup')

        return {
            deletedExecutions: deletedCount,
            freedSpace,
            message: `Successfully deleted ${deletedCount} executions`,
            mode,
        }
    }

    async saveTestResult(testData: TestResultData): Promise<string> {
        // If reporter didn't send project, fall back to the run's metadata.project
        if (!(testData as any).project && testData.runId) {
            const run = await this.runRepository.getTestRun(testData.runId)
            if (run?.metadata?.project) {
                ;(testData as any).project = run.metadata.project
            }
        }

        // Second fallback: look up project from the most recent result for the same file path.
        // Covers script-triggered runs where no project is passed and run metadata is empty.
        if (!(testData as any).project && testData.filePath) {
            const projectFromFile = await this.testRepository.getProjectByFilePath(
                testData.filePath
            )
            if (projectFromFile) {
                ;(testData as any).project = projectFromFile
            }
        }

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

    /** Reporter requests for a stopped run are dropped: its data is being (or was) deleted. */
    isRunCancelled(runId: string): boolean {
        return runProcessRegistry.isCancelled(runId)
    }

    // Stop: deletes what the runs wrote (files, results, run rows) and the discovery rows hiding older results; notes stay.
    async discardRuns(
        runIds: string[],
        discoveryScopes: Array<{project?: string; since: string}> = []
    ): Promise<void> {
        if (runIds.length > 0) {
            const resultIds = await this.testRepository.getResultIdsByRunIds(runIds)
            for (const resultId of resultIds) {
                try {
                    await this.attachmentService.deleteAttachmentsForTestResult(resultId)
                } catch (error) {
                    Logger.error(`Failed to delete attachments for execution ${resultId}`, error)
                }
            }
            await this.testRepository.deleteByRunIds(runIds)
            await this.runRepository.deleteTestRuns(runIds)
        }

        for (const scope of discoveryScopes) {
            await this.testRepository.deleteDiscoveryRowsHidingResults(scope.project, scope.since)
        }

        Logger.info(`Discarded ${runIds.length} stopped run(s)`)
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

    async getAvailableProjects(): Promise<string[]> {
        return this.playwrightService.getAvailableProjects()
    }

    async getProjectStatusSummary(): Promise<
        {project: string; total: number; passed: number; failed: number}[]
    > {
        return this.testRepository.getProjectStatusSummary()
    }

    async getTestStatusCounts(project?: string): Promise<TestStatusCounts> {
        return this.testRepository.getTestStatusCounts(project)
    }

    async runAllTests(
        maxWorkers?: number,
        skipAutoDiscovery?: boolean,
        requestedProject?: string,
        source?: string,
        options: {pipelineStep?: boolean} = {}
    ): Promise<any> {
        // Captured before any await: a Stop that lands while this start is still preparing bumps it.
        const stopGeneration = runProcessRegistry.getStopGeneration()

        // Block CI script triggers when paused
        if (source === 'script') {
            const pause = await this.settingsService.getCIAutoRunPause()
            if (pause.paused) {
                if (pause.resumeAt && new Date(pause.resumeAt) <= new Date()) {
                    // Auto-resume: time has passed
                    await this.settingsService.setCIAutoRunPause(false)
                } else {
                    throw new Error(
                        JSON.stringify({
                            code: 'CI_AUTORUN_PAUSED',
                            message: 'CI auto-run is paused',
                            resumeAt: pause.resumeAt,
                        })
                    )
                }
            }
        }

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

        // A pipeline's own steps run while its slot-mates wait; only standalone manual starts are refused.
        if (source !== 'script' && !options.pipelineStep) {
            this.ciRunQueue.assertManualStartAllowed()
        }

        // The pause lookup above is an await: a Stop that arrived meanwhile must not start this run.
        this.assertNotStopped(stopGeneration)

        // A step ignores its own pipeline's running flag; everything else sees the full busy state.
        this.assertNotBusy({ignorePipeline: options.pipelineStep === true})

        // Busy from before discovery until the tracker owns the process.
        const releaseStarting = this.ciRunQueue.beginStarting()
        let result: TestRunProcess
        let project: string | undefined
        let pendingSince: string | undefined
        try {
            project =
                requestedProject !== undefined && requestedProject !== ''
                    ? requestedProject
                    : await this.getExecutionProject()

            // Auto-discover tests before running unless explicitly skipped.
            // Scoped to the resolved project so this never resets other projects' pending status.
            if (!skipAutoDiscovery) {
                pendingSince = new Date().toISOString()
                await this.discoverTests(project)
            } else {
                // The UI discovers in its own request just before; with none (auto-discover off) there is nothing to undo.
                pendingSince = this.recentDiscoveryStart(project)
            }

            if (this.isStopRequestedSince(stopGeneration)) {
                // Spawn never happens; the discovery rows already hide older results, so undo them here.
                if (pendingSince) {
                    await this.testRepository.deleteDiscoveryRowsHidingResults(
                        project,
                        pendingSince
                    )
                }
                throw createRunCancelledError()
            }

            result = await this.playwrightService.runAllTests(maxWorkers, project)

            // Same tick as the spawn: a Stop can never see a child the registry does not know.
            runProcessRegistry.register(
                {runId: result.runId, type: 'run-all', project, pendingSince},
                result.process
            )

            // Add process to tracker
            activeProcessesTracker.addProcess({
                runId: result.runId,
                type: 'run-all',
                totalTests: undefined, // Will be determined during execution
                project,
            })
        } finally {
            releaseStarting()
        }

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
                project,
            },
        })

        if (!options.pipelineStep) {
            this.persistRunMarker(result, project, pendingSince)
        }

        // Broadcast run start
        this.websocketService.broadcastRunStarted(result.runId, 'run-all')

        // Handle process completion
        if (result.process) {
            result.process.on('close', (code) => {
                Logger.info(`All tests completed with code: ${code}`)

                // Remove process from tracker only if it still exists
                // (it may have already been removed by process-end notification from reporter)
                if (activeProcessesTracker.isProcessRunning(result.runId)) {
                    activeProcessesTracker.removeProcess(result.runId)
                }

                // A stopped run reports through run:cancelled once its data is deleted; the Stop drains.
                // At shutdown the marker must survive: the next start deletes what this run wrote.
                if (this.isRunSettledElsewhere(result.runId)) return

                this.websocketService.broadcastRunCompleted(result.runId, code || 1, 'run-all')

                // A pipeline step is not the end of the pipeline; the pipeline drains on its own finish.
                if (!options.pipelineStep) {
                    this.clearRunMarker()
                    this.ciRunQueue.requestDrain()
                }
            })
        }

        return result
    }

    async runTestGroup(filePath: string, maxWorkers?: number, testNames?: string[]): Promise<any> {
        const stopGeneration = runProcessRegistry.getStopGeneration()
        // Check and claim with no await in between.
        this.ciRunQueue.assertManualStartAllowed()
        this.assertNotBusy()
        const releaseStarting = this.ciRunQueue.beginStarting()
        let result: TestRunProcess
        let project: string | undefined
        try {
            const projectFromFile = await this.testRepository.getProjectByFilePath(filePath)
            project = projectFromFile || (await this.getExecutionProject())
            this.assertNotStopped(stopGeneration)
            result = await this.playwrightService.runTestGroup(
                filePath,
                maxWorkers,
                testNames,
                project
            )
            runProcessRegistry.register(
                {runId: result.runId, type: 'run-group', project},
                result.process
            )

            // Add process to tracker
            activeProcessesTracker.addProcess({
                runId: result.runId,
                type: 'run-group',
                filePath: filePath,
                project,
            })
        } finally {
            releaseStarting()
        }

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
                filteredTests: testNames ? testNames.length : undefined,
                project,
            },
        })

        this.persistRunMarker(result, project)

        // Broadcast run start
        this.websocketService.broadcastRunStarted(result.runId, 'run-group', filePath)

        // Handle process completion
        if (result.process) {
            result.process.on('close', (code) => {
                Logger.info(`Group tests completed with code: ${code}`)

                // Remove process from tracker only if it still exists
                // (it may have already been removed by process-end notification from reporter)
                if (activeProcessesTracker.isProcessRunning(result.runId)) {
                    activeProcessesTracker.removeProcess(result.runId)
                }

                if (this.isRunSettledElsewhere(result.runId)) return

                this.websocketService.broadcastRunCompleted(
                    result.runId,
                    code || 1,
                    'run-group',
                    filePath
                )

                this.clearRunMarker()
                this.ciRunQueue.requestDrain()
            })
        }

        return result
    }

    async rerunTest(testId: string, maxWorkers?: number, _project?: string): Promise<any> {
        const stopGeneration = runProcessRegistry.getStopGeneration()
        // Get the test to rerun
        const test = await this.testRepository.getTestResult(testId)
        if (!test) {
            throw new Error('Test not found')
        }

        // Check and claim with no await in between (the lookup above is the only gap).
        this.ciRunQueue.assertManualStartAllowed()
        this.assertNotBusy()
        const releaseStarting = this.ciRunQueue.beginStarting()
        let result: TestRunProcess
        let project: string | undefined
        try {
            project = test.project || (await this.getExecutionProject())
            this.assertNotStopped(stopGeneration)
            result = await this.playwrightService.rerunSingleTest(
                test.filePath,
                test.name,
                maxWorkers,
                project
            )
            runProcessRegistry.register(
                {runId: result.runId, type: 'rerun', project},
                result.process
            )

            // Add process to tracker
            activeProcessesTracker.addProcess({
                runId: result.runId,
                type: 'rerun',
                testId: testId,
                originalTestId: testId,
                filePath: test.filePath,
                project,
            })
        } finally {
            releaseStarting()
        }

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
                project,
            },
        })

        this.persistRunMarker(result, project)

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
                // A stopped rerun is deleted by the Stop; nothing to record, broadcast or drain here.
                if (this.isRunSettledElsewhere(result.runId)) {
                    if (activeProcessesTracker.isProcessRunning(result.runId)) {
                        activeProcessesTracker.removeProcess(result.runId)
                    }
                    return
                }

                try {
                    const runStatus = code === 0 ? 'completed' : 'failed'
                    await this.runRepository.updateTestRun(result.runId, {status: runStatus})

                    Logger.info(`Test rerun completed with code: ${code}`)

                    // Remove process from tracker only if it still exists
                    // (it may have already been removed by process-end notification from reporter)
                    if (activeProcessesTracker.isProcessRunning(result.runId)) {
                        activeProcessesTracker.removeProcess(result.runId)
                    }

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

                this.clearRunMarker()
                this.ciRunQueue.requestDrain()
            })
        }

        return {
            ...result,
            testId,
            testName: test.name,
        }
    }

    private recentDiscoveryStart(project: string | undefined): string | undefined {
        const candidates = [this.lastDiscoveries.get(project ?? '*')]
        if (project) candidates.push(this.lastDiscoveries.get('*'))
        const recent = candidates
            .filter((d): d is {startedAt: string; finishedAtMs: number} => d !== undefined)
            .filter((d) => Date.now() - d.finishedAtMs <= RECENT_DISCOVERY_MS)
            .sort((a, b) => b.finishedAtMs - a.finishedAtMs)
        return recent[0]?.startedAt
    }

    // A stopped run is cleaned up by the Stop; at shutdown the next start cleans up via the marker.
    private isRunSettledElsewhere(runId: string): boolean {
        return runProcessRegistry.isCancelled(runId) || runProcessRegistry.isShuttingDown()
    }

    private isStopRequestedSince(stopGeneration: number): boolean {
        return (
            runProcessRegistry.getStopGeneration() !== stopGeneration ||
            runProcessRegistry.isShuttingDown()
        )
    }

    private assertNotStopped(stopGeneration: number): void {
        if (this.isStopRequestedSince(stopGeneration)) throw createRunCancelledError()
    }

    // Lets a restart clean up after a manual run (a pipeline step is covered by the pipeline marker).
    // Writes run in call order, so a fast-closing run cannot have its clear overtaken by the set.
    private persistRunMarker(
        result: TestRunProcess,
        project: string | undefined,
        pendingSince?: string
    ): void {
        const marker = {
            runId: result.runId,
            pgid: result.process?.pid ?? null,
            project: project ?? null,
            pendingSince: pendingSince ?? null,
            startedAt: new Date().toISOString(),
        }
        this.enqueueMarkerWrite(() => this.settingsService.setInFlightRun(marker))
    }

    clearRunMarker(): Promise<void> {
        return this.enqueueMarkerWrite(() => this.settingsService.clearInFlightRun())
    }

    private enqueueMarkerWrite(write: () => Promise<void>): Promise<void> {
        this.markerWrites = this.markerWrites
            .then(write)
            .catch((error) => Logger.error('Failed to write the in-flight run marker', error))
        return this.markerWrites
    }

    private assertNotBusy(options: {ignorePipeline?: boolean} = {}): void {
        if (!this.ciRunQueue.isBusy(options)) return

        const currentRun = activeProcessesTracker.getActiveProcesses()[0]
        throw new Error(
            JSON.stringify({
                code: 'TESTS_ALREADY_RUNNING',
                message: 'Tests are already running',
                currentRunId: currentRun?.id,
                startedAt: currentRun?.startedAt,
            })
        )
    }

    /** After a manual tracker reset: a queued CI request may be waiting on an entry that will never close. */
    requestQueueDrain(): void {
        this.ciRunQueue.requestDrain()
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
