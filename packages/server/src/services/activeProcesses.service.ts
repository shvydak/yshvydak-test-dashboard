import {ActiveProcessInfo, ProcessStartData, TestProgress} from '@yshvydak/core'
import {Logger} from '../utils/logger.util'

export class ActiveProcessesTracker {
    private activeProcesses = new Map<string, ActiveProcessInfo>()

    constructor() {
        Logger.info('ActiveProcessesTracker initialized')
    }

    /**
     * Add a new active process
     */
    addProcess(data: ProcessStartData): void {
        const processInfo: ActiveProcessInfo = {
            id: data.runId,
            type: data.type,
            startedAt: new Date().toISOString(),
            details: {
                runId: data.runId,
                testId: data.testId,
                filePath: data.filePath,
                totalTests: data.totalTests,
                originalTestId: data.originalTestId,
            },
            progress: {
                processId: data.runId,
                type: data.type,
                totalTests: data.totalTests || 0,
                completedTests: 0,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                runningTests: [],
                startTime: Date.now(),
            },
        }

        this.activeProcesses.set(data.runId, processInfo)
        Logger.info(`Added active process: ${data.runId} (${data.type})`)
        this.logCurrentState()
    }

    /**
     * Start tracking a test execution
     */
    startTest(
        runId: string,
        testInfo: {
            testId: string
            name: string
            filePath: string
        }
    ): TestProgress | null {
        const process = this.activeProcesses.get(runId)
        if (!process || !process.progress) {
            Logger.warn(`Cannot start test for non-existent process: ${runId}`)
            return null
        }

        const progress = process.progress

        // Remove if already exists (shouldn't happen, but safety check)
        progress.runningTests = progress.runningTests.filter((t) => t.testId !== testInfo.testId)

        // Add to running tests
        progress.runningTests.push({
            testId: testInfo.testId,
            name: testInfo.name,
            filePath: testInfo.filePath,
            startedAt: new Date().toISOString(),
        })

        Logger.debug(`Started test ${testInfo.name} in process ${runId}`)

        return progress
    }

    /**
     * Update progress for a running process (called when test completes)
     */
    updateProgress(
        runId: string,
        testResult: {
            testId: string
            name: string
            filePath: string
            status: 'passed' | 'failed' | 'skipped' | 'pending'
        }
    ): TestProgress | null {
        const process = this.activeProcesses.get(runId)
        if (!process || !process.progress) {
            Logger.warn(`Cannot update progress for non-existent process: ${runId}`)
            return null
        }

        const progress = process.progress

        // Remove test from running tests
        progress.runningTests = progress.runningTests.filter((t) => t.testId !== testResult.testId)

        // Update completed test counts
        progress.completedTests++

        if (testResult.status === 'passed') {
            progress.passedTests++
        } else if (testResult.status === 'failed') {
            progress.failedTests++
        } else if (testResult.status === 'skipped') {
            progress.skippedTests++
        }

        // Calculate estimated end time based on progress
        if (progress.completedTests > 0 && progress.totalTests > 0) {
            const elapsedTime = Date.now() - progress.startTime
            const avgTimePerTest = elapsedTime / progress.completedTests
            const remainingTests = progress.totalTests - progress.completedTests
            progress.estimatedEndTime = Date.now() + avgTimePerTest * remainingTests
        }

        Logger.debug(
            `Updated progress for ${runId}: ${progress.completedTests}/${progress.totalTests}`
        )

        return progress
    }

    /**
     * Get progress for a specific process
     */
    getProgress(runId: string): TestProgress | null {
        const process = this.activeProcesses.get(runId)
        return process?.progress || null
    }

    /**
     * Remove an active process
     */
    removeProcess(runId: string): void {
        const removed = this.activeProcesses.delete(runId)
        if (removed) {
            Logger.info(`Removed active process: ${runId}`)
        } else {
            Logger.warn(`Attempted to remove non-existent process: ${runId}`)
        }
        this.logCurrentState()
    }

    /**
     * Get all active processes
     */
    getActiveProcesses(): ActiveProcessInfo[] {
        return Array.from(this.activeProcesses.values())
    }

    /**
     * Get active groups (file paths for run-group processes)
     */
    getActiveGroups(): string[] {
        return Array.from(this.activeProcesses.values())
            .filter((process) => process.type === 'run-group' && process.details.filePath)
            .map((process) => process.details.filePath!)
    }

    /**
     * Check if any process is currently running
     */
    isAnyProcessRunning(): boolean {
        return this.activeProcesses.size > 0
    }

    /**
     * Check if a specific process is running
     */
    isProcessRunning(runId: string): boolean {
        return this.activeProcesses.has(runId)
    }

    /**
     * Check if run-all is currently active
     */
    isRunAllActive(): boolean {
        return Array.from(this.activeProcesses.values()).some(
            (process) => process.type === 'run-all'
        )
    }

    /**
     * Check if a specific group is running
     */
    isGroupRunning(filePath: string): boolean {
        return Array.from(this.activeProcesses.values()).some(
            (process) => process.type === 'run-group' && process.details.filePath === filePath
        )
    }

    /**
     * Check if a specific test is running
     */
    isTestRunning(testId: string): boolean {
        return Array.from(this.activeProcesses.values()).some(
            (process) =>
                process.type === 'rerun' &&
                (process.details.testId === testId || process.details.originalTestId === testId)
        )
    }

    /**
     * Get current state for WebSocket connection status
     * Also performs cleanup of old processes as a failsafe
     */
    getConnectionStatus() {
        // Perform cleanup of old processes before returning status
        this.cleanupOldProcesses(30) // Clean up processes older than 30 minutes

        const status = {
            activeRuns: this.getActiveProcesses(),
            activeGroups: this.getActiveGroups(),
            isAnyProcessRunning: this.isAnyProcessRunning(),
        }

        Logger.debug('📊 Connection status requested', status)
        return status
    }

    /**
     * Clean up old processes (fallback for processes that didn't properly notify end)
     */
    cleanupOldProcesses(maxAgeMinutes: number = 30): void {
        const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000)
        let cleanedCount = 0

        for (const [runId, process] of this.activeProcesses.entries()) {
            const processStartTime = new Date(process.startedAt)
            if (processStartTime < cutoffTime) {
                this.activeProcesses.delete(runId)
                cleanedCount++
                Logger.warn(`Cleaned up old process: ${runId} (started at ${process.startedAt})`)
            }
        }

        if (cleanedCount > 0) {
            Logger.info(`Cleaned up ${cleanedCount} old processes`)
            this.logCurrentState()
        }
    }

    /**
     * Force clear all processes (emergency reset)
     */
    forceReset(): void {
        const count = this.activeProcesses.size
        this.activeProcesses.clear()
        Logger.warn(`🚨 Force reset: cleared ${count} processes`)
        this.logCurrentState()
    }

    /**
     * Log current state for debugging
     */
    private logCurrentState(): void {
        const count = this.activeProcesses.size
        if (count === 0) {
            Logger.debug('No active processes')
        } else {
            Logger.debug(`Active processes (${count}):`)
            for (const [runId, process] of this.activeProcesses.entries()) {
                Logger.debug(`  - ${runId}: ${process.type} (started: ${process.startedAt})`)
            }
        }
    }
}

// Singleton instance
export const activeProcessesTracker = new ActiveProcessesTracker()
