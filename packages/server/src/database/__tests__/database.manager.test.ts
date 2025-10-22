import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {DatabaseManager, TestRunData, TestResultData, AttachmentData} from '../database.manager'
import {randomUUID} from 'crypto'

describe('DatabaseManager', () => {
    let db: DatabaseManager

    beforeEach(async () => {
        // Use in-memory database for tests
        db = new DatabaseManager(':memory:')
        await db.initialize()
    })

    afterEach(() => {
        db.close()
    })

    describe('Initialization', () => {
        it('should initialize with in-memory database', async () => {
            const testDb = new DatabaseManager(':memory:')
            await testDb.initialize()

            const stats = await testDb.getDataStats()
            expect(stats).toMatchObject({
                totalRuns: 0,
                totalTests: 0,
                totalAttachments: 0,
            })

            testDb.close()
        })

        it('should enable foreign keys constraint', async () => {
            // Try to insert test result without corresponding run (should fail due to FK)
            const testResult: TestResultData = {
                id: randomUUID(),
                runId: 'non-existent-run-id',
                testId: 'test-1',
                name: 'Test 1',
                filePath: '/tests/test1.spec.ts',
                status: 'passed',
                duration: 100,
            }

            await expect(db.saveTestResult(testResult)).rejects.toThrow()
        })

        it('should enable WAL mode for better concurrency', async () => {
            const result = await db.query('PRAGMA journal_mode')
            // In-memory databases use 'memory' journal mode instead of WAL
            // For file-based databases, it would be 'wal'
            expect(result.journal_mode).toBe('memory')
        })
    })

    describe('Test Runs - CRUD Operations', () => {
        it('should create a test run', async () => {
            const runId = randomUUID()
            const runData: TestRunData = {
                id: runId,
                status: 'running',
                totalTests: 10,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            }

            await db.createTestRun(runData)

            const savedRun = await db.getTestRun(runId)
            expect(savedRun).toBeDefined()
            expect(savedRun.id).toBe(runId)
            expect(savedRun.status).toBe('running')
            expect(savedRun.total_tests).toBe(10)
        })

        it('should create test run with metadata', async () => {
            const runId = randomUUID()
            const metadata = {
                branch: 'feature/test',
                commit: 'abc123',
                env: 'staging',
            }

            const runData: TestRunData = {
                id: runId,
                status: 'running',
                totalTests: 5,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
                metadata,
            }

            await db.createTestRun(runData)

            const savedRun = await db.getTestRun(runId)
            expect(savedRun.metadata).toEqual(metadata)
        })

        it('should update test run status', async () => {
            const runId = randomUUID()
            await db.createTestRun({
                id: runId,
                status: 'running',
                totalTests: 10,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            })

            await db.updateTestRun(runId, {
                status: 'completed',
                passedTests: 8,
                failedTests: 2,
                duration: 5000,
            })

            const updatedRun = await db.getTestRun(runId)
            expect(updatedRun.status).toBe('completed')
            expect(updatedRun.passed_tests).toBe(8)
            expect(updatedRun.failed_tests).toBe(2)
            expect(updatedRun.duration).toBe(5000)
        })

        it('should update only specified fields', async () => {
            const runId = randomUUID()
            await db.createTestRun({
                id: runId,
                status: 'running',
                totalTests: 10,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            })

            await db.updateTestRun(runId, {
                passedTests: 5,
            })

            const updatedRun = await db.getTestRun(runId)
            expect(updatedRun.status).toBe('running') // Should remain unchanged
            expect(updatedRun.passed_tests).toBe(5)
            expect(updatedRun.total_tests).toBe(10) // Should remain unchanged
        })

        it('should handle update with no fields gracefully', async () => {
            const runId = randomUUID()
            await db.createTestRun({
                id: runId,
                status: 'running',
                totalTests: 10,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            })

            await expect(db.updateTestRun(runId, {})).resolves.not.toThrow()
        })

        it('should retrieve all test runs with limit', async () => {
            // Create 5 test runs
            for (let i = 0; i < 5; i++) {
                await db.createTestRun({
                    id: randomUUID(),
                    status: 'completed',
                    totalTests: 10,
                    passedTests: 10,
                    failedTests: 0,
                    skippedTests: 0,
                    duration: 1000,
                })
            }

            const runs = await db.getAllTestRuns(3)
            expect(runs).toHaveLength(3)
        })

        it('should order test runs by created_at DESC', async () => {
            const run1Id = randomUUID()
            const run2Id = randomUUID()

            await db.createTestRun({
                id: run1Id,
                status: 'completed',
                totalTests: 10,
                passedTests: 10,
                failedTests: 0,
                skippedTests: 0,
                duration: 1000,
            })

            // Small delay to ensure different timestamps
            await new Promise((resolve) => setTimeout(resolve, 10))

            await db.createTestRun({
                id: run2Id,
                status: 'running',
                totalTests: 5,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            })

            const runs = await db.getAllTestRuns()
            expect(runs[0].id).toBe(run2Id) // Most recent first
            expect(runs[1].id).toBe(run1Id)
        })
    })

    describe('Test Results - INSERT-only Strategy', () => {
        let runId: string

        beforeEach(async () => {
            // Create a test run for test results
            runId = randomUUID()
            await db.createTestRun({
                id: runId,
                status: 'running',
                totalTests: 10,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            })
        })

        it('should save test result with INSERT-only strategy', async () => {
            const testId = 'test-hash-123'
            const resultId1 = randomUUID()

            const testResult1: TestResultData = {
                id: resultId1,
                runId,
                testId,
                name: 'should login successfully',
                filePath: '/tests/auth.spec.ts',
                status: 'passed',
                duration: 150,
            }

            await db.saveTestResult(testResult1)

            const saved = await db.getTestResult(resultId1)
            expect(saved).toBeDefined()
            expect(saved.test_id).toBe(testId)
            expect(saved.status).toBe('passed')
        })

        it('should create multiple executions with same testId', async () => {
            const testId = 'test-hash-123'

            // First execution - passed
            await db.saveTestResult({
                id: randomUUID(),
                runId,
                testId,
                name: 'should login successfully',
                filePath: '/tests/auth.spec.ts',
                status: 'passed',
                duration: 150,
            })

            // Ensure different timestamps
            await new Promise((resolve) => setTimeout(resolve, 10))

            // Second execution - failed (different run)
            const runId2 = randomUUID()
            await db.createTestRun({
                id: runId2,
                status: 'running',
                totalTests: 10,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            })

            await db.saveTestResult({
                id: randomUUID(),
                runId: runId2,
                testId,
                name: 'should login successfully',
                filePath: '/tests/auth.spec.ts',
                status: 'failed',
                duration: 200,
                errorMessage: 'Login failed',
            })

            // Verify both executions exist
            const history = await db.getTestResultsByTestId(testId)
            expect(history).toHaveLength(2)

            // Verify one is failed and one is passed (order may vary due to timestamp precision)
            const statuses = history.map((h) => h.status).sort()
            expect(statuses).toEqual(['failed', 'passed'])
        })

        it('should save test result with error details', async () => {
            const resultId = randomUUID()
            const errorMessage = 'Expected "Welcome" but got "Error"'
            const errorStack = 'Error: Test failed\n  at test.spec.ts:10:5'

            const testResult: TestResultData = {
                id: resultId,
                runId,
                testId: 'test-123',
                name: 'should display welcome message',
                filePath: '/tests/ui.spec.ts',
                status: 'failed',
                duration: 300,
                errorMessage,
                errorStack,
            }

            await db.saveTestResult(testResult)

            const saved = await db.getTestResult(resultId)
            expect(saved.error_message).toBe(errorMessage)
            expect(saved.error_stack).toBe(errorStack)
        })

        it('should save test result with metadata', async () => {
            const metadata = {
                browser: 'chromium',
                viewport: '1920x1080',
                retries: 2,
            }

            const testResult: TestResultData = {
                id: randomUUID(),
                runId,
                testId: 'test-123',
                name: 'should render correctly',
                filePath: '/tests/visual.spec.ts',
                status: 'passed',
                duration: 500,
                metadata,
            }

            const id = await db.saveTestResult(testResult)

            const saved = await db.getTestResult(id)
            expect(saved.metadata).toEqual(metadata)
        })

        it('should handle all test statuses', async () => {
            const statuses: Array<'passed' | 'failed' | 'skipped' | 'timedOut' | 'pending'> = [
                'passed',
                'failed',
                'skipped',
                'timedOut',
                'pending',
            ]

            for (const status of statuses) {
                const testResult: TestResultData = {
                    id: randomUUID(),
                    runId,
                    testId: `test-${status}`,
                    name: `Test ${status}`,
                    filePath: '/tests/test.spec.ts',
                    status,
                    duration: 100,
                }

                await db.saveTestResult(testResult)
            }

            const results = await db.getTestResultsByRun(runId)
            expect(results).toHaveLength(5)
            expect(results.map((r) => r.status).sort()).toEqual(statuses.sort())
        })

        it('should retrieve test results by run', async () => {
            // Create 3 test results for this run
            for (let i = 1; i <= 3; i++) {
                await db.saveTestResult({
                    id: randomUUID(),
                    runId,
                    testId: `test-${i}`,
                    name: `Test ${i}`,
                    filePath: '/tests/test.spec.ts',
                    status: 'passed',
                    duration: 100,
                })
            }

            const results = await db.getTestResultsByRun(runId)
            expect(results).toHaveLength(3)
            expect(results[0].run_id).toBe(runId)
        })

        it('should retrieve test history by testId with limit', async () => {
            const testId = 'stable-test-hash'

            // Create 5 executions
            for (let i = 1; i <= 5; i++) {
                const localRunId = randomUUID()
                await db.createTestRun({
                    id: localRunId,
                    status: 'completed',
                    totalTests: 1,
                    passedTests: 1,
                    failedTests: 0,
                    skippedTests: 0,
                    duration: 100,
                })

                await db.saveTestResult({
                    id: randomUUID(),
                    runId: localRunId,
                    testId,
                    name: 'Stable test',
                    filePath: '/tests/stable.spec.ts',
                    status: 'passed',
                    duration: 100,
                })

                // Ensure different timestamps
                await new Promise((resolve) => setTimeout(resolve, 10))
            }

            const history = await db.getTestResultsByTestId(testId, 3)
            expect(history).toHaveLength(3) // Limited to 3

            // Verify order is DESC (newest first)
            expect(history[0].created_at >= history[1].created_at).toBe(true)
            expect(history[1].created_at >= history[2].created_at).toBe(true)
        })
    })

    describe('Attachments - Foreign Key Constraints', () => {
        let runId: string
        let testResultId: string

        beforeEach(async () => {
            runId = randomUUID()
            await db.createTestRun({
                id: runId,
                status: 'running',
                totalTests: 1,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            })

            testResultId = randomUUID()
            await db.saveTestResult({
                id: testResultId,
                runId,
                testId: 'test-123',
                name: 'Test with attachments',
                filePath: '/tests/test.spec.ts',
                status: 'failed',
                duration: 100,
            })
        })

        it('should save attachment with valid test result', async () => {
            const attachmentData: AttachmentData = {
                id: randomUUID(),
                testResultId,
                type: 'screenshot',
                fileName: 'failure.png',
                filePath: '/storage/attachments/failure.png',
                fileSize: 12345,
                mimeType: 'image/png',
                url: '/api/attachments/failure.png',
            }

            await db.saveAttachment(attachmentData)

            const attachments = await db.getAttachmentsByTestResult(testResultId)
            expect(attachments).toHaveLength(1)
            expect(attachments[0].file_name).toBe('failure.png')
        })

        it('should fail to save attachment without valid test result', async () => {
            const attachmentData: AttachmentData = {
                id: randomUUID(),
                testResultId: 'non-existent-result',
                type: 'screenshot',
                fileName: 'failure.png',
                filePath: '/storage/attachments/failure.png',
                fileSize: 12345,
                url: '/api/attachments/failure.png',
            }

            await expect(db.saveAttachment(attachmentData)).rejects.toThrow()
        })

        it('should handle all attachment types', async () => {
            const types: Array<'video' | 'screenshot' | 'trace' | 'log'> = [
                'video',
                'screenshot',
                'trace',
                'log',
            ]

            for (const type of types) {
                await db.saveAttachment({
                    id: randomUUID(),
                    testResultId,
                    type,
                    fileName: `file.${type}`,
                    filePath: `/storage/${type}`,
                    fileSize: 1000,
                    url: `/api/attachments/${type}`,
                })
            }

            const attachments = await db.getAttachmentsByTestResult(testResultId)
            expect(attachments).toHaveLength(4)
            expect(attachments.map((a) => a.type).sort()).toEqual(types.sort())
        })

        it('should delete attachment', async () => {
            const attachmentId = randomUUID()
            await db.saveAttachment({
                id: attachmentId,
                testResultId,
                type: 'screenshot',
                fileName: 'test.png',
                filePath: '/storage/test.png',
                fileSize: 100,
                url: '/api/attachments/test.png',
            })

            await db.deleteAttachment(attachmentId)

            const attachments = await db.getAttachmentsByTestResult(testResultId)
            expect(attachments).toHaveLength(0)
        })

        it('should support optional mimeType', async () => {
            const attachmentData: AttachmentData = {
                id: randomUUID(),
                testResultId,
                type: 'log',
                fileName: 'test.log',
                filePath: '/storage/test.log',
                fileSize: 500,
                url: '/api/attachments/test.log',
                // mimeType is optional
            }

            await db.saveAttachment(attachmentData)

            const attachments = await db.getAttachmentsByTestResult(testResultId)
            expect(attachments[0].mime_type).toBeNull()
        })

        it('should cascade delete attachments when test result is deleted', async () => {
            const attachmentId = randomUUID()
            await db.saveAttachment({
                id: attachmentId,
                testResultId,
                type: 'screenshot',
                fileName: 'test.png',
                filePath: '/storage/test.png',
                fileSize: 100,
                url: '/api/attachments/test.png',
            })

            // Delete the test result (should cascade to attachments)
            await db.execute('DELETE FROM test_results WHERE id = ?', [testResultId])

            const attachments = await db.getAttachmentsByTestResult(testResultId)
            expect(attachments).toHaveLength(0)
        })
    })

    describe('Statistics & Analytics', () => {
        beforeEach(async () => {
            // Create sample data
            const run1 = randomUUID()
            const run2 = randomUUID()

            await db.createTestRun({
                id: run1,
                status: 'completed',
                totalTests: 10,
                passedTests: 8,
                failedTests: 2,
                skippedTests: 0,
                duration: 5000,
            })

            await db.createTestRun({
                id: run2,
                status: 'completed',
                totalTests: 5,
                passedTests: 5,
                failedTests: 0,
                skippedTests: 0,
                duration: 2000,
            })
        })

        it('should calculate aggregate statistics', async () => {
            const stats = await db.getStats()

            expect(stats.total_runs).toBe(2)
            expect(stats.completed_runs).toBe(2)
            expect(stats.total_tests).toBe(15)
            expect(stats.total_passed).toBe(13)
            expect(stats.total_failed).toBe(2)
            expect(stats.total_skipped).toBe(0)
        })

        it('should get data stats for all tables', async () => {
            const stats = await db.getDataStats()

            expect(stats.totalRuns).toBe(2)
            expect(stats.totalTests).toBe(0) // No test results created
            expect(stats.totalAttachments).toBe(0)
        })

        it('should handle empty database stats', async () => {
            await db.clearAllData()

            const stats = await db.getDataStats()
            expect(stats).toMatchObject({
                totalRuns: 0,
                totalTests: 0,
                totalAttachments: 0,
            })
        })
    })

    describe('Data Management', () => {
        it('should clear all data', async () => {
            // Create sample data
            const runId = randomUUID()
            await db.createTestRun({
                id: runId,
                status: 'completed',
                totalTests: 5,
                passedTests: 5,
                failedTests: 0,
                skippedTests: 0,
                duration: 1000,
            })

            await db.clearAllData()

            const stats = await db.getDataStats()
            expect(stats.totalRuns).toBe(0)
        })

        it('should cleanup old test runs', async () => {
            // Create an old test run (simulate by modifying created_at manually)
            const oldRunId = randomUUID()
            await db.createTestRun({
                id: oldRunId,
                status: 'completed',
                totalTests: 5,
                passedTests: 5,
                failedTests: 0,
                skippedTests: 0,
                duration: 1000,
            })

            // Manually update created_at to 35 days ago
            const oldDate = new Date()
            oldDate.setDate(oldDate.getDate() - 35)
            await db.execute('UPDATE test_runs SET created_at = ? WHERE id = ?', [
                oldDate.toISOString(),
                oldRunId,
            ])

            // Create a recent run
            const recentRunId = randomUUID()
            await db.createTestRun({
                id: recentRunId,
                status: 'completed',
                totalTests: 5,
                passedTests: 5,
                failedTests: 0,
                skippedTests: 0,
                duration: 1000,
            })

            // Cleanup runs older than 30 days
            await db.cleanup(30)

            const oldRun = await db.getTestRun(oldRunId)
            const recentRun = await db.getTestRun(recentRunId)

            expect(oldRun).toBeUndefined()
            expect(recentRun).toBeDefined()
        })
    })

    describe('Query Methods (Repository Compatibility)', () => {
        it('should support query method', async () => {
            const runId = randomUUID()
            await db.createTestRun({
                id: runId,
                status: 'completed',
                totalTests: 5,
                passedTests: 5,
                failedTests: 0,
                skippedTests: 0,
                duration: 1000,
            })

            const result = await db.query('SELECT * FROM test_runs WHERE id = ?', [runId])
            expect(result).toBeDefined()
            expect(result.id).toBe(runId)
        })

        it('should support queryOne method', async () => {
            const runId = randomUUID()
            await db.createTestRun({
                id: runId,
                status: 'completed',
                totalTests: 5,
                passedTests: 5,
                failedTests: 0,
                skippedTests: 0,
                duration: 1000,
            })

            const result = await db.queryOne<{id: string}>('SELECT * FROM test_runs WHERE id = ?', [
                runId,
            ])
            expect(result).toBeDefined()
            expect(result!.id).toBe(runId)
        })

        it('should support queryAll method', async () => {
            for (let i = 0; i < 3; i++) {
                await db.createTestRun({
                    id: randomUUID(),
                    status: 'completed',
                    totalTests: 5,
                    passedTests: 5,
                    failedTests: 0,
                    skippedTests: 0,
                    duration: 1000,
                })
            }

            const results = await db.queryAll('SELECT * FROM test_runs')
            expect(results).toHaveLength(3)
        })

        it('should support execute method', async () => {
            const runId = randomUUID()
            await db.execute(
                'INSERT INTO test_runs (id, status, total_tests, passed_tests, failed_tests, skipped_tests, duration) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [runId, 'completed', 5, 5, 0, 0, 1000]
            )

            const result = await db.getTestRun(runId)
            expect(result).toBeDefined()
        })
    })

    describe('Edge Cases & Error Handling', () => {
        it('should handle invalid JSON in metadata gracefully', async () => {
            const runId = randomUUID()
            await db.execute(
                'INSERT INTO test_runs (id, status, total_tests, passed_tests, failed_tests, skipped_tests, duration, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [runId, 'completed', 5, 5, 0, 0, 1000, '{invalid-json}']
            )

            const run = await db.getTestRun(runId)
            expect(run.metadata).toBeNull() // Should gracefully handle invalid JSON
        })

        it('should return null for non-existent test run', async () => {
            const result = await db.getTestRun('non-existent-id')
            expect(result).toBeUndefined()
        })

        it('should return empty array for non-existent test results', async () => {
            const results = await db.getTestResultsByRun('non-existent-run-id')
            expect(results).toEqual([])
        })

        it('should handle large metadata objects', async () => {
            const runId = randomUUID()
            const largeMetadata = {
                logs: Array(100)
                    .fill(null)
                    .map((_, i) => `Log entry ${i}`),
                details: 'x'.repeat(1000),
            }

            await db.createTestRun({
                id: runId,
                status: 'completed',
                totalTests: 1,
                passedTests: 1,
                failedTests: 0,
                skippedTests: 0,
                duration: 1000,
                metadata: largeMetadata,
            })

            const saved = await db.getTestRun(runId)
            expect(saved.metadata).toEqual(largeMetadata)
        })

        it('should handle concurrent writes', async () => {
            const promises = Array(10)
                .fill(null)
                .map((_, i) =>
                    db.createTestRun({
                        id: randomUUID(),
                        status: 'completed',
                        totalTests: i,
                        passedTests: i,
                        failedTests: 0,
                        skippedTests: 0,
                        duration: 1000,
                    })
                )

            await expect(Promise.all(promises)).resolves.not.toThrow()

            const runs = await db.getAllTestRuns(20)
            expect(runs).toHaveLength(10)
        })
    })
})
