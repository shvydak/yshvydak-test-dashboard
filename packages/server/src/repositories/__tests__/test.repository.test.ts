/**
 * TestRepository Comprehensive Tests
 *
 * These tests verify the core repository functionality for test data management.
 * This is CRITICAL because:
 * 1. TestRepository is the main data access layer for test results
 * 2. INSERT-only strategy must be enforced (never UPDATE)
 * 3. Historical tracking depends on correct data retrieval
 * 4. Attachment JOIN queries must work correctly
 * 5. Filtering and pagination are essential for UI performance
 *
 * Coverage target: 80%+
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {TestRepository} from '../test.repository'
import {AttachmentRepository} from '../attachment.repository'
import {DatabaseManager} from '../../database/database.manager'
import {TestResultData, AttachmentData} from '../../types/database.types'

describe('TestRepository - Core Functionality', () => {
    let repository: TestRepository
    let attachmentRepository: AttachmentRepository
    let dbManager: DatabaseManager
    let currentRunId: string

    let testCounter = 0 // For unique IDs

    // Helper function to create test result data
    const createTestResult = (
        testId: string,
        status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'pending',
        overrides: Partial<TestResultData> = {}
    ): TestResultData => {
        testCounter++
        return {
            id: overrides.id || `result-${Date.now()}-${testCounter}`,
            runId: currentRunId,
            testId,
            name: 'Test Name',
            filePath: 'test/file.spec.ts',
            status,
            duration: 1000,
            timestamp: new Date().toISOString(),
            errorMessage: status === 'failed' ? 'Test failed' : undefined,
            errorStack: status === 'failed' ? 'Stack trace here' : undefined,
            ...overrides,
        }
    }

    // Helper to create a test run
    const createTestRun = async (runId?: string) => {
        const id = runId || `run-${Date.now()}-${Math.random()}`
        await dbManager.createTestRun({
            id,
            status: 'completed',
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            skippedTests: 0,
            duration: 0,
        })
        return id
    }

    beforeEach(async () => {
        // Reset counter for each test
        testCounter = 0

        // Use in-memory database for tests
        dbManager = new DatabaseManager(':memory:')
        await dbManager.initialize()

        repository = new TestRepository(dbManager)
        attachmentRepository = new AttachmentRepository(dbManager)

        // Create a test run for foreign key constraint
        currentRunId = await createTestRun()
    })

    afterEach(async () => {
        await dbManager.close()
    })

    describe('saveTestResult()', () => {
        it('should save test result with INSERT-only strategy', async () => {
            const testData = createTestResult('test-1', 'passed')

            const resultId = await repository.saveTestResult(testData)

            expect(resultId).toBeDefined()
            expect(typeof resultId).toBe('string')

            // Verify it was saved
            const saved = await repository.getTestResult(resultId)
            expect(saved).toBeDefined()
            expect(saved?.testId).toBe('test-1')
            expect(saved?.status).toBe('passed')
        })

        it('should create NEW row for same testId (not UPDATE)', async () => {
            const testId = 'test-insert-only'

            // First execution: passed
            const result1 = createTestResult(testId, 'passed')
            const id1 = await repository.saveTestResult(result1)

            // Second execution: failed (should be NEW row, not update)
            const result2 = createTestResult(testId, 'failed')
            const id2 = await repository.saveTestResult(result2)

            // IDs should be DIFFERENT (proves INSERT, not UPDATE)
            expect(id1).not.toBe(id2)

            // Both results should exist in database
            const saved1 = await repository.getTestResult(id1)
            const saved2 = await repository.getTestResult(id2)

            expect(saved1?.status).toBe('passed')
            expect(saved2?.status).toBe('failed')

            // History should show both executions
            const history = await repository.getTestResultsByTestId(testId)
            expect(history).toHaveLength(2)
        })

        it('should save all test result fields correctly', async () => {
            const metadata = {browser: 'chromium', viewport: '1920x1080'}
            const testData: TestResultData = {
                id: 'custom-id',
                runId: currentRunId,
                testId: 'test-fields',
                name: 'should validate all fields',
                filePath: 'tests/validation.spec.ts',
                status: 'failed',
                duration: 5432,
                timestamp: '2025-01-15T10:30:00.000Z',
                errorMessage: 'Expected true to be false',
                errorStack: 'Error: Expected true to be false\n  at test.spec.ts:42',
                retryCount: 2,
                metadata: metadata as any, // DatabaseManager will stringify it
            }

            await repository.saveTestResult(testData)

            const saved = await repository.getTestResult('custom-id')

            expect(saved).toMatchObject({
                id: 'custom-id',
                runId: currentRunId,
                testId: 'test-fields',
                name: 'should validate all fields',
                filePath: 'tests/validation.spec.ts',
                status: 'failed',
                duration: 5432,
                errorMessage: 'Expected true to be false',
                errorStack: 'Error: Expected true to be false\n  at test.spec.ts:42',
                retryCount: 2,
            })

            // metadata should be parsed from JSON by repository
            expect(saved?.metadata).toBeDefined()
            expect(saved?.metadata).toEqual(metadata)
        })

        it('should handle test result without error fields', async () => {
            const testData = createTestResult('test-no-error', 'passed', {
                errorMessage: undefined,
                errorStack: undefined,
            })

            const id = await repository.saveTestResult(testData)
            const saved = await repository.getTestResult(id)

            expect(saved?.errorMessage).toBeNull()
            expect(saved?.errorStack).toBeNull()
        })

        it('should handle test result with metadata', async () => {
            const metadata = {
                browser: 'firefox',
                os: 'linux',
                retries: 1,
            }

            const testData = createTestResult('test-metadata', 'passed', {
                metadata: metadata as any, // DatabaseManager will stringify it
            })

            const id = await repository.saveTestResult(testData)
            const saved = await repository.getTestResult(id)

            // metadata should be parsed from JSON and match original object
            expect(saved?.metadata).toEqual(metadata)
        })

        it('should handle test result without metadata', async () => {
            const testData = createTestResult('test-no-metadata', 'passed', {
                metadata: undefined,
            })

            const id = await repository.saveTestResult(testData)
            const saved = await repository.getTestResult(id)

            expect(saved?.metadata).toBeUndefined()
        })
    })

    describe('getTestResult()', () => {
        it('should retrieve test result by id', async () => {
            const testData = createTestResult('test-get', 'passed')
            const id = await repository.saveTestResult(testData)

            const result = await repository.getTestResult(id)

            expect(result).toBeDefined()
            expect(result?.id).toBe(id)
            expect(result?.testId).toBe('test-get')
        })

        it('should return null for non-existent id', async () => {
            const result = await repository.getTestResult('non-existent-id')

            expect(result).toBeNull()
        })

        it('should include empty attachments array', async () => {
            const testData = createTestResult('test-attachments', 'passed')
            const id = await repository.saveTestResult(testData)

            const result = await repository.getTestResult(id)

            expect(result?.attachments).toEqual([])
        })
    })

    describe('getAllTests()', () => {
        it('should return latest test result for each testId (no runId filter)', async () => {
            const testId1 = 'test-latest-1'
            const testId2 = 'test-latest-2'

            // Test 1: 3 executions (with sufficient delay for SQLite timestamp precision)
            await repository.saveTestResult(createTestResult(testId1, 'failed'))
            await new Promise((resolve) => setTimeout(resolve, 100))
            await repository.saveTestResult(createTestResult(testId1, 'failed'))
            await new Promise((resolve) => setTimeout(resolve, 100))
            await repository.saveTestResult(createTestResult(testId1, 'passed')) // Latest

            // Test 2: 2 executions
            await repository.saveTestResult(createTestResult(testId2, 'passed'))
            await new Promise((resolve) => setTimeout(resolve, 100))
            await repository.saveTestResult(createTestResult(testId2, 'failed')) // Latest

            const results = await repository.getAllTests({})

            // Should only return 2 results (latest for each testId)
            expect(results).toHaveLength(2)

            // Verify we got distinct testIds
            const testIds = results.map((r) => r.testId)
            expect(testIds).toContain(testId1)
            expect(testIds).toContain(testId2)

            // Each testId should appear only once (latest execution)
            const uniqueTestIds = new Set(testIds)
            expect(uniqueTestIds.size).toBe(2)
        })

        it('should filter by runId when provided', async () => {
            const runId1 = await createTestRun()
            const runId2 = await createTestRun()

            // Tests in run 1
            await repository.saveTestResult(
                createTestResult('test-run1-a', 'passed', {runId: runId1})
            )
            await repository.saveTestResult(
                createTestResult('test-run1-b', 'failed', {runId: runId1})
            )

            // Tests in run 2
            await repository.saveTestResult(
                createTestResult('test-run2-a', 'passed', {runId: runId2})
            )

            // Filter by runId1
            const run1Tests = await repository.getAllTests({runId: runId1})
            expect(run1Tests).toHaveLength(2)
            expect(run1Tests.every((t) => t.runId === runId1)).toBe(true)

            // Filter by runId2
            const run2Tests = await repository.getAllTests({runId: runId2})
            expect(run2Tests).toHaveLength(1)
            expect(run2Tests[0].runId).toBe(runId2)
        })

        it('should filter by status when provided', async () => {
            await repository.saveTestResult(createTestResult('test-pass-1', 'passed'))
            await repository.saveTestResult(createTestResult('test-pass-2', 'passed'))
            await repository.saveTestResult(createTestResult('test-fail-1', 'failed'))
            await repository.saveTestResult(createTestResult('test-skip-1', 'skipped'))

            // Filter by passed
            const passedTests = await repository.getAllTests({status: 'passed'})
            expect(passedTests).toHaveLength(2)
            expect(passedTests.every((t) => t.status === 'passed')).toBe(true)

            // Filter by failed
            const failedTests = await repository.getAllTests({status: 'failed'})
            expect(failedTests).toHaveLength(1)
            expect(failedTests[0].status).toBe('failed')
        })

        it('should filter by both runId and status', async () => {
            const runId = await createTestRun()

            await repository.saveTestResult(createTestResult('test-1', 'passed', {runId}))
            await repository.saveTestResult(createTestResult('test-2', 'failed', {runId}))
            await repository.saveTestResult(createTestResult('test-3', 'passed', {runId}))

            const results = await repository.getAllTests({runId, status: 'passed'})

            expect(results).toHaveLength(2)
            expect(results.every((t) => t.runId === runId && t.status === 'passed')).toBe(true)
        })

        it('should respect limit parameter', async () => {
            // Create 15 tests
            for (let i = 0; i < 15; i++) {
                await repository.saveTestResult(createTestResult(`test-${i}`, 'passed'))
            }

            // Default limit (should use DEFAULT_LIMITS.TESTS_PER_PAGE)
            const defaultResults = await repository.getAllTests({})
            expect(defaultResults.length).toBeLessThanOrEqual(100) // DEFAULT_LIMITS.TESTS_PER_PAGE

            // Custom limit
            const limitedResults = await repository.getAllTests({limit: 5})
            expect(limitedResults).toHaveLength(5)
        })

        it('should order results by updated_at DESC', async () => {
            // Create tests with delays to ensure different timestamps
            await repository.saveTestResult(createTestResult('test-old', 'passed'))
            await new Promise((resolve) => setTimeout(resolve, 100))
            await repository.saveTestResult(createTestResult('test-medium', 'passed'))
            await new Promise((resolve) => setTimeout(resolve, 100))
            await repository.saveTestResult(createTestResult('test-new', 'passed'))

            const results = await repository.getAllTests({})

            // Verify ordering by checking that updated_at decreases
            expect(results.length).toBeGreaterThanOrEqual(3)
            for (let i = 0; i < results.length - 1; i++) {
                const current = new Date(results[i].updatedAt!).getTime()
                const next = new Date(results[i + 1].updatedAt!).getTime()
                expect(current).toBeGreaterThanOrEqual(next)
            }
        })

        it('should handle empty results', async () => {
            const results = await repository.getAllTests({})

            expect(results).toEqual([])
        })

        it('should include attachments in results', async () => {
            // This will be tested more thoroughly in attachment JOIN tests
            const results = await repository.getAllTests({})

            results.forEach((result) => {
                expect(result.attachments).toBeDefined()
                expect(Array.isArray(result.attachments)).toBe(true)
            })
        })
    })

    describe('getTestResultsByTestId()', () => {
        it('should retrieve all executions for a testId', async () => {
            const testId = 'test-history'

            // Create 5 executions
            for (let i = 0; i < 5; i++) {
                await repository.saveTestResult(
                    createTestResult(testId, i % 2 === 0 ? 'passed' : 'failed')
                )
                await new Promise((resolve) => setTimeout(resolve, 10))
            }

            const history = await repository.getTestResultsByTestId(testId)

            expect(history).toHaveLength(5)
            expect(history.every((r) => r.testId === testId)).toBe(true)
        })

        it('should order results by created_at DESC (latest first)', async () => {
            const testId = 'test-order'

            // Create 3 executions with delays
            await repository.saveTestResult(createTestResult(testId, 'passed'))
            await new Promise((resolve) => setTimeout(resolve, 100))
            await repository.saveTestResult(createTestResult(testId, 'failed'))
            await new Promise((resolve) => setTimeout(resolve, 100))
            await repository.saveTestResult(createTestResult(testId, 'passed'))

            const history = await repository.getTestResultsByTestId(testId)

            // Verify ordering by checking that created_at decreases
            expect(history).toHaveLength(3)
            for (let i = 0; i < history.length - 1; i++) {
                const current = new Date(history[i].createdAt!).getTime()
                const next = new Date(history[i + 1].createdAt!).getTime()
                expect(current).toBeGreaterThanOrEqual(next)
            }
        })

        it('should exclude pending and skipped tests', async () => {
            const testId = 'test-exclude-status'

            await repository.saveTestResult(createTestResult(testId, 'passed'))
            await repository.saveTestResult(createTestResult(testId, 'failed'))
            await repository.saveTestResult(createTestResult(testId, 'pending'))
            await repository.saveTestResult(createTestResult(testId, 'skipped'))
            await repository.saveTestResult(createTestResult(testId, 'passed'))

            const history = await repository.getTestResultsByTestId(testId)

            // Should only include passed and failed (not pending or skipped)
            expect(history).toHaveLength(3)
            expect(history.every((r) => r.status === 'passed' || r.status === 'failed')).toBe(true)
        })

        it('should respect limit parameter', async () => {
            const testId = 'test-limit'

            // Create 15 executions
            for (let i = 0; i < 15; i++) {
                await repository.saveTestResult(createTestResult(testId, 'passed'))
            }

            // With limit of 5
            const limited = await repository.getTestResultsByTestId(testId, 5)
            expect(limited).toHaveLength(5)

            // Default limit (DEFAULT_LIMITS.TEST_HISTORY = 200)
            const defaultLimit = await repository.getTestResultsByTestId(testId)
            expect(defaultLimit).toHaveLength(15) // All 15 results (under default limit of 200)

            // With higher limit than we have data
            const customLimit = await repository.getTestResultsByTestId(testId, 20)
            expect(customLimit).toHaveLength(15) // All 15 results
        })

        it('should return empty array for non-existent testId', async () => {
            const history = await repository.getTestResultsByTestId('non-existent')

            expect(history).toEqual([])
        })

        it('should include attachments in history', async () => {
            const testId = 'test-history-attachments'

            await repository.saveTestResult(createTestResult(testId, 'passed'))
            await repository.saveTestResult(createTestResult(testId, 'failed'))

            const history = await repository.getTestResultsByTestId(testId)

            history.forEach((result) => {
                expect(result.attachments).toBeDefined()
                expect(Array.isArray(result.attachments)).toBe(true)
            })
        })
    })

    describe('getTestResultsByRun()', () => {
        it('should retrieve all tests for a specific run', async () => {
            const runId = await createTestRun()

            // Create tests for this run
            await repository.saveTestResult(createTestResult('test-1', 'passed', {runId}))
            await repository.saveTestResult(createTestResult('test-2', 'failed', {runId}))
            await repository.saveTestResult(createTestResult('test-3', 'skipped', {runId}))

            const results = await repository.getTestResultsByRun(runId)

            expect(results).toHaveLength(3)
            expect(results.every((r) => r.runId === runId)).toBe(true)
        })

        it('should NOT include tests from other runs', async () => {
            const runId1 = await createTestRun()
            const runId2 = await createTestRun()

            await repository.saveTestResult(
                createTestResult('test-run1', 'passed', {runId: runId1})
            )
            await repository.saveTestResult(
                createTestResult('test-run2', 'passed', {runId: runId2})
            )

            const run1Results = await repository.getTestResultsByRun(runId1)

            expect(run1Results).toHaveLength(1)
            expect(run1Results[0].testId).toBe('test-run1')
        })

        it('should order results by created_at DESC', async () => {
            const runId = await createTestRun()

            // Create with delays to ensure ordering
            await repository.saveTestResult(createTestResult('test-1', 'passed', {runId}))
            await new Promise((resolve) => setTimeout(resolve, 100))
            await repository.saveTestResult(createTestResult('test-2', 'passed', {runId}))
            await new Promise((resolve) => setTimeout(resolve, 100))
            await repository.saveTestResult(createTestResult('test-3', 'passed', {runId}))

            const results = await repository.getTestResultsByRun(runId)

            // Verify ordering by checking that created_at decreases
            expect(results).toHaveLength(3)
            for (let i = 0; i < results.length - 1; i++) {
                const current = new Date(results[i].createdAt!).getTime()
                const next = new Date(results[i + 1].createdAt!).getTime()
                expect(current).toBeGreaterThanOrEqual(next)
            }
        })

        it('should return empty array for non-existent run', async () => {
            const results = await repository.getTestResultsByRun('non-existent-run')

            expect(results).toEqual([])
        })

        it('should include attachments in results', async () => {
            const runId = await createTestRun()

            await repository.saveTestResult(createTestResult('test-1', 'passed', {runId}))

            const results = await repository.getTestResultsByRun(runId)

            results.forEach((result) => {
                expect(result.attachments).toBeDefined()
                expect(Array.isArray(result.attachments)).toBe(true)
            })
        })
    })

    describe('Attachment JOIN Queries', () => {
        it('should correctly join attachments with test results in getAllTests()', async () => {
            const testData = createTestResult('test-with-attachment', 'passed')
            const testId = await repository.saveTestResult(testData)

            // Save attachment using repository
            const attachmentData: AttachmentData = {
                id: 'attachment-1',
                testResultId: testId,
                type: 'screenshot',
                fileName: 'screenshot.png',
                filePath: '/attachments/screenshot.png',
                fileSize: 12345,
                url: '/api/attachments/attachment-1',
            }
            await attachmentRepository.saveAttachment(attachmentData)

            const results = await repository.getAllTests({})

            expect(results).toHaveLength(1)
            expect(results[0].attachments).toHaveLength(1)
            expect(results[0].attachments?.[0]).toMatchObject({
                id: 'attachment-1',
                testResultId: testId,
                type: 'screenshot',
                url: '/api/attachments/attachment-1',
            })
        })

        it('should correctly join multiple attachments with single test result', async () => {
            const testData = createTestResult('test-multiple-attachments', 'failed')
            const testId = await repository.saveTestResult(testData)

            // Insert multiple attachments
            const attachments = [
                {id: 'att-1', type: 'screenshot' as const, url: '/api/attachments/att-1'},
                {id: 'att-2', type: 'video' as const, url: '/api/attachments/att-2'},
                {id: 'att-3', type: 'trace' as const, url: '/api/attachments/att-3'},
            ]

            for (const att of attachments) {
                const attachmentData: AttachmentData = {
                    id: att.id,
                    testResultId: testId,
                    type: att.type,
                    fileName: `${att.type}.file`,
                    filePath: `/attachments/${att.type}.file`,
                    fileSize: 1000,
                    url: att.url,
                }
                await attachmentRepository.saveAttachment(attachmentData)
            }

            const results = await repository.getAllTests({})

            expect(results).toHaveLength(1)
            expect(results[0].attachments).toHaveLength(3)

            // Verify all attachment types are present
            const types = results[0].attachments?.map((a) => a.type) || []
            expect(types).toContain('screenshot')
            expect(types).toContain('video')
            expect(types).toContain('trace')
        })

        it('should handle test results with no attachments (LEFT JOIN)', async () => {
            const testData = createTestResult('test-no-attachments', 'passed')
            await repository.saveTestResult(testData)

            const results = await repository.getAllTests({})

            expect(results).toHaveLength(1)
            expect(results[0].attachments).toEqual([])
        })

        it('should correctly join attachments in getTestResultsByRun()', async () => {
            const runId = await createTestRun()
            const testData = createTestResult('test-run-attachment', 'passed', {runId})
            const testId = await repository.saveTestResult(testData)

            const attachmentData: AttachmentData = {
                id: 'att-run',
                testResultId: testId,
                type: 'screenshot',
                fileName: 'screenshot.png',
                filePath: '/attachments/screenshot.png',
                fileSize: 5000,
                url: '/api/attachments/att-run',
            }
            await attachmentRepository.saveAttachment(attachmentData)

            const results = await repository.getTestResultsByRun(runId)

            expect(results).toHaveLength(1)
            expect(results[0].attachments).toHaveLength(1)
            expect(results[0].attachments?.[0].id).toBe('att-run')
        })

        it('should correctly join attachments in getTestResultsByTestId()', async () => {
            const testId = 'test-history-attachment'

            // Create 2 executions with delay
            const result1Id = await repository.saveTestResult(createTestResult(testId, 'passed'))
            await new Promise((resolve) => setTimeout(resolve, 100))
            const result2Id = await repository.saveTestResult(createTestResult(testId, 'failed'))

            // Add attachment to first execution (older)
            const attachment1: AttachmentData = {
                id: 'att-1',
                testResultId: result1Id,
                type: 'screenshot',
                fileName: 'screenshot1.png',
                filePath: '/attachments/screenshot1.png',
                fileSize: 1000,
                url: '/api/attachments/att-1',
            }
            await attachmentRepository.saveAttachment(attachment1)

            // Add attachment to second execution (newer)
            const attachment2: AttachmentData = {
                id: 'att-2',
                testResultId: result2Id,
                type: 'video',
                fileName: 'video.webm',
                filePath: '/attachments/video.webm',
                fileSize: 5000,
                url: '/api/attachments/att-2',
            }
            await attachmentRepository.saveAttachment(attachment2)

            const history = await repository.getTestResultsByTestId(testId)

            expect(history).toHaveLength(2)
            // Verify both executions have correct attachments (order might vary based on timing)
            const resultById = history.reduce(
                (acc, h) => {
                    acc[h.id] = h
                    return acc
                },
                {} as Record<string, (typeof history)[0]>
            )

            // Check result1 has screenshot
            expect(resultById[result1Id].attachments).toHaveLength(1)
            expect(resultById[result1Id].attachments?.[0].type).toBe('screenshot')

            // Check result2 has video
            expect(resultById[result2Id].attachments).toHaveLength(1)
            expect(resultById[result2Id].attachments?.[0].type).toBe('video')
        })

        it('should not duplicate test results when joining multiple attachments', async () => {
            const testData = createTestResult('test-no-duplicate', 'passed')
            const testId = await repository.saveTestResult(testData)

            // Add 5 attachments
            for (let i = 0; i < 5; i++) {
                const attachmentData: AttachmentData = {
                    id: `att-${i}`,
                    testResultId: testId,
                    type: 'screenshot',
                    fileName: `screenshot-${i}.png`,
                    filePath: `/attachments/screenshot-${i}.png`,
                    fileSize: 1000,
                    url: `/api/attachments/att-${i}`,
                }
                await attachmentRepository.saveAttachment(attachmentData)
            }

            const results = await repository.getAllTests({})

            // Should still be 1 test result, not 5
            expect(results).toHaveLength(1)
            // But with 5 attachments
            expect(results[0].attachments).toHaveLength(5)
        })

        it('should apply LIMIT to executions, not to JOIN rows (regression test)', async () => {
            const testId = 'test-limit-regression'

            // Create 10 executions with small delays to ensure different timestamps
            const executionIds: string[] = []
            for (let i = 0; i < 10; i++) {
                const id = await repository.saveTestResult(createTestResult(testId, 'passed'))
                executionIds.push(id)
                // Small delay to ensure different created_at timestamps
                await new Promise((resolve) => setTimeout(resolve, 10))
            }

            // Add 3 attachments to EACH execution (30 attachments total)
            // This creates 10 executions × 3 attachments = 30 JOIN rows
            for (const executionId of executionIds) {
                for (let j = 0; j < 3; j++) {
                    await attachmentRepository.saveAttachment({
                        id: `att-${executionId}-${j}`,
                        testResultId: executionId,
                        type: j === 0 ? 'screenshot' : j === 1 ? 'video' : 'trace',
                        fileName: `file-${j}.png`,
                        filePath: `/path/to/file-${j}.png`,
                        fileSize: 1024,
                        url: `/attachments/file-${j}.png`,
                    })
                }
            }

            // Request with LIMIT 5
            const limited = await repository.getTestResultsByTestId(testId, 5)

            // Should return exactly 5 EXECUTIONS, not 5 JOIN rows
            expect(limited).toHaveLength(5)

            // Each execution should have 3 attachments
            limited.forEach((execution) => {
                expect(execution.attachments).toHaveLength(3)
            })

            // Verify we got the 5 most recent executions (in DESC order)
            const returnedIds = limited.map((e) => e.id)
            const expectedIds = executionIds.slice(-5).reverse() // Last 5, newest first
            expect(returnedIds).toEqual(expectedIds)
        })
    })

    describe('clearAllTests()', () => {
        it('should delete all test results', async () => {
            // Create several tests
            await repository.saveTestResult(createTestResult('test-1', 'passed'))
            await repository.saveTestResult(createTestResult('test-2', 'failed'))
            await repository.saveTestResult(createTestResult('test-3', 'skipped'))

            // Verify they exist
            const beforeClear = await repository.getAllTests({})
            expect(beforeClear.length).toBeGreaterThan(0)

            // Clear all
            await repository.clearAllTests()

            // Verify they're gone
            const afterClear = await repository.getAllTests({})
            expect(afterClear).toEqual([])
        })

        it('should clear test stats', async () => {
            await repository.saveTestResult(createTestResult('test-1', 'passed'))

            await repository.clearAllTests()

            const stats = await repository.getTestStats()
            // DatabaseManager returns: {totalRuns, totalTests, totalAttachments}
            expect(stats).toBeDefined()
            expect(stats.totalTests).toBe(0)
            expect(stats.totalRuns).toBe(0)
            expect(stats.totalAttachments).toBe(0)
        })
    })

    describe('getTestStats()', () => {
        it('should return database statistics', async () => {
            // Create some test data
            await repository.saveTestResult(createTestResult('test-1', 'passed'))
            await repository.saveTestResult(createTestResult('test-2', 'failed'))

            const stats = await repository.getTestStats()

            expect(stats).toBeDefined()
            // DatabaseManager returns: {totalRuns, totalTests, totalAttachments}
            expect(stats.totalTests).toBeGreaterThan(0)
            expect(stats.totalRuns).toBeGreaterThan(0)
        })

        it('should return correct counts', async () => {
            // Clear and start fresh
            await repository.clearAllTests()

            // Create a new run for this test
            const newRunId = await createTestRun()

            // Create known number of tests
            await repository.saveTestResult(createTestResult('test-1', 'passed', {runId: newRunId}))
            await repository.saveTestResult(createTestResult('test-2', 'failed', {runId: newRunId}))
            await repository.saveTestResult(createTestResult('test-3', 'passed', {runId: newRunId}))

            const stats = await repository.getTestStats()

            expect(stats.totalTests).toBe(3)
        })
    })

    describe('Edge Cases', () => {
        it('should handle concurrent saveTestResult calls', async () => {
            const testId = 'test-concurrent'

            // Save 10 results concurrently
            const promises = []
            for (let i = 0; i < 10; i++) {
                promises.push(repository.saveTestResult(createTestResult(testId, 'passed')))
            }

            const ids = await Promise.all(promises)

            // All IDs should be unique
            const uniqueIds = new Set(ids)
            expect(uniqueIds.size).toBe(10)

            // All results should be saved
            const history = await repository.getTestResultsByTestId(testId)
            expect(history).toHaveLength(10)
        })

        it('should handle very long test names', async () => {
            const longName = 'a'.repeat(1000)
            const testData = createTestResult('test-long-name', 'passed', {name: longName})

            const id = await repository.saveTestResult(testData)
            const saved = await repository.getTestResult(id)

            expect(saved?.name).toBe(longName)
        })

        it('should handle special characters in test names', async () => {
            const specialName = 'Test with "quotes" and \'apostrophes\' and <tags> and &ampersands;'
            const testData = createTestResult('test-special', 'passed', {name: specialName})

            const id = await repository.saveTestResult(testData)
            const saved = await repository.getTestResult(id)

            expect(saved?.name).toBe(specialName)
        })

        it('should handle special characters in file paths', async () => {
            const specialPath = 'tests/folder with spaces/file-with-dashes/test.spec.ts'
            const testData = createTestResult('test-path', 'passed', {filePath: specialPath})

            const id = await repository.saveTestResult(testData)
            const saved = await repository.getTestResult(id)

            expect(saved?.filePath).toBe(specialPath)
        })

        it('should handle very long error messages and stacks', async () => {
            const longError = 'Error: ' + 'x'.repeat(5000)
            const longStack = 'Stack trace:\n' + 'line\n'.repeat(1000)

            const testData = createTestResult('test-long-error', 'failed', {
                errorMessage: longError,
                errorStack: longStack,
            })

            const id = await repository.saveTestResult(testData)
            const saved = await repository.getTestResult(id)

            expect(saved?.errorMessage).toBe(longError)
            expect(saved?.errorStack).toBe(longStack)
        })

        it('should handle zero duration', async () => {
            const testData = createTestResult('test-zero-duration', 'passed', {duration: 0})

            const id = await repository.saveTestResult(testData)
            const saved = await repository.getTestResult(id)

            expect(saved?.duration).toBe(0)
        })

        it('should handle very large duration', async () => {
            const testData = createTestResult('test-large-duration', 'passed', {
                duration: 999999999,
            })

            const id = await repository.saveTestResult(testData)
            const saved = await repository.getTestResult(id)

            expect(saved?.duration).toBe(999999999)
        })
    })

    describe('deleteByTestId()', () => {
        it('should delete all executions for a specific testId', async () => {
            const testId = 'test-to-delete'

            // Create multiple executions for the same testId
            await repository.saveTestResult(createTestResult(testId, 'passed'))
            await repository.saveTestResult(createTestResult(testId, 'failed'))
            await repository.saveTestResult(createTestResult(testId, 'passed'))

            // Verify they exist
            const beforeDelete = await repository.getTestResultsByTestId(testId)
            expect(beforeDelete).toHaveLength(3)

            // Delete all executions
            const deletedCount = await repository.deleteByTestId(testId)

            expect(deletedCount).toBe(3)

            // Verify they're gone
            const afterDelete = await repository.getTestResultsByTestId(testId)
            expect(afterDelete).toHaveLength(0)
        })

        it('should NOT delete executions from other tests', async () => {
            const testId1 = 'test-delete-1'
            const testId2 = 'test-keep-2'

            await repository.saveTestResult(createTestResult(testId1, 'passed'))
            await repository.saveTestResult(createTestResult(testId1, 'failed'))
            await repository.saveTestResult(createTestResult(testId2, 'passed'))

            // Delete only testId1
            const deletedCount = await repository.deleteByTestId(testId1)

            expect(deletedCount).toBe(2)

            // Verify testId1 is gone
            const deleted = await repository.getTestResultsByTestId(testId1)
            expect(deleted).toHaveLength(0)

            // Verify testId2 still exists
            const kept = await repository.getTestResultsByTestId(testId2)
            expect(kept).toHaveLength(1)
        })

        it('should return 0 when deleting non-existent testId', async () => {
            const deletedCount = await repository.deleteByTestId('non-existent-test-id')

            expect(deletedCount).toBe(0)
        })

        it('should cascade delete attachments from database', async () => {
            const testId = 'test-with-attachments'

            // Create test execution
            const testData = createTestResult(testId, 'passed')
            const resultId = await repository.saveTestResult(testData)

            // Create attachment
            const attachmentData: AttachmentData = {
                id: `att-${Date.now()}`,
                testResultId: resultId,
                type: 'screenshot',
                fileName: 'test.png',
                filePath: '/path/to/test.png',
                fileSize: 1024,
                url: '/attachments/test.png',
            }
            await attachmentRepository.saveAttachment(attachmentData)

            // Verify attachment exists
            const beforeDelete = await attachmentRepository.getAttachmentsByTestResult(resultId)
            expect(beforeDelete).toHaveLength(1)

            // Delete test (CASCADE should delete attachments)
            await repository.deleteByTestId(testId)

            // Verify attachment is gone (CASCADE)
            const afterDelete = await attachmentRepository.getAttachmentsByTestResult(resultId)
            expect(afterDelete).toHaveLength(0)
        })

        it('should handle deleting tests with multiple executions and attachments', async () => {
            const testId = 'test-complex-delete'

            // Create 3 executions with attachments
            for (let i = 0; i < 3; i++) {
                const testData = createTestResult(testId, i % 2 === 0 ? 'passed' : 'failed')
                const resultId = await repository.saveTestResult(testData)

                // Add 2 attachments per execution
                for (let j = 0; j < 2; j++) {
                    await attachmentRepository.saveAttachment({
                        id: `att-${Date.now()}-${i}-${j}`,
                        testResultId: resultId,
                        type: j === 0 ? 'screenshot' : 'video',
                        fileName: `file-${i}-${j}.png`,
                        filePath: `/path/to/file-${i}-${j}.png`,
                        fileSize: 1024,
                        url: `/attachments/file-${i}-${j}.png`,
                    })
                }
            }

            // Verify setup: 3 executions exist
            const beforeDelete = await repository.getTestResultsByTestId(testId)
            expect(beforeDelete).toHaveLength(3)

            // Delete all
            const deletedCount = await repository.deleteByTestId(testId)

            expect(deletedCount).toBe(3)

            // Verify all executions are gone
            const afterDelete = await repository.getTestResultsByTestId(testId)
            expect(afterDelete).toHaveLength(0)
        })
    })

    describe('deleteByExecutionId()', () => {
        it('should delete a specific execution by id', async () => {
            const testId = 'test-execution-delete'

            // Create multiple executions for the same testId
            const result1Id = await repository.saveTestResult(createTestResult(testId, 'passed'))
            const result2Id = await repository.saveTestResult(createTestResult(testId, 'failed'))
            const result3Id = await repository.saveTestResult(createTestResult(testId, 'passed'))

            // Verify all exist
            const beforeDelete = await repository.getTestResultsByTestId(testId)
            expect(beforeDelete).toHaveLength(3)

            // Delete only the second execution
            const deletedCount = await repository.deleteByExecutionId(result2Id)

            expect(deletedCount).toBe(1)

            // Verify only result2 is gone
            const afterDelete = await repository.getTestResultsByTestId(testId)
            expect(afterDelete).toHaveLength(2)

            const remaining = afterDelete.map((r) => r.id)
            expect(remaining).toContain(result1Id)
            expect(remaining).toContain(result3Id)
            expect(remaining).not.toContain(result2Id)
        })

        it('should return 0 when deleting non-existent execution', async () => {
            const deletedCount = await repository.deleteByExecutionId('non-existent-execution-id')

            expect(deletedCount).toBe(0)
        })

        it('should cascade delete attachments from database', async () => {
            const testId = 'test-execution-with-attachments'

            // Create 2 executions
            const result1Id = await repository.saveTestResult(createTestResult(testId, 'passed'))
            const result2Id = await repository.saveTestResult(createTestResult(testId, 'failed'))

            // Add attachment to result1
            const attachment1: AttachmentData = {
                id: `att-result1-${Date.now()}`,
                testResultId: result1Id,
                type: 'screenshot',
                fileName: 'screenshot1.png',
                filePath: '/path/to/screenshot1.png',
                fileSize: 1024,
                url: '/attachments/screenshot1.png',
            }
            await attachmentRepository.saveAttachment(attachment1)

            // Add attachment to result2
            const attachment2: AttachmentData = {
                id: `att-result2-${Date.now()}`,
                testResultId: result2Id,
                type: 'video',
                fileName: 'video2.webm',
                filePath: '/path/to/video2.webm',
                fileSize: 2048,
                url: '/attachments/video2.webm',
            }
            await attachmentRepository.saveAttachment(attachment2)

            // Verify both attachments exist
            const attachments1Before =
                await attachmentRepository.getAttachmentsByTestResult(result1Id)
            const attachments2Before =
                await attachmentRepository.getAttachmentsByTestResult(result2Id)
            expect(attachments1Before).toHaveLength(1)
            expect(attachments2Before).toHaveLength(1)

            // Delete only result1 (should CASCADE delete attachment1)
            await repository.deleteByExecutionId(result1Id)

            // Verify attachment1 is gone (CASCADE)
            const attachments1After =
                await attachmentRepository.getAttachmentsByTestResult(result1Id)
            expect(attachments1After).toHaveLength(0)

            // Verify attachment2 still exists
            const attachments2After =
                await attachmentRepository.getAttachmentsByTestResult(result2Id)
            expect(attachments2After).toHaveLength(1)
        })

        it('should NOT delete other executions of the same test', async () => {
            const testId = 'test-preserve-other-executions'

            // Create 5 executions for the same test
            const executionIds = []
            for (let i = 0; i < 5; i++) {
                const id = await repository.saveTestResult(
                    createTestResult(testId, i % 2 === 0 ? 'passed' : 'failed')
                )
                executionIds.push(id)
            }

            // Delete the middle execution (index 2)
            await repository.deleteByExecutionId(executionIds[2])

            // Verify 4 executions remain
            const remaining = await repository.getTestResultsByTestId(testId)
            expect(remaining).toHaveLength(4)

            // Verify the deleted one is gone
            const remainingIds = remaining.map((r) => r.id)
            expect(remainingIds).not.toContain(executionIds[2])

            // Verify others still exist
            expect(remainingIds).toContain(executionIds[0])
            expect(remainingIds).toContain(executionIds[1])
            expect(remainingIds).toContain(executionIds[3])
            expect(remainingIds).toContain(executionIds[4])
        })

        it('should handle deletion of execution with multiple attachments', async () => {
            const testId = 'test-multiple-attachments-delete'
            const resultId = await repository.saveTestResult(createTestResult(testId, 'passed'))

            // Add 5 attachments
            for (let i = 0; i < 5; i++) {
                await attachmentRepository.saveAttachment({
                    id: `att-${Date.now()}-${i}`,
                    testResultId: resultId,
                    type: i % 2 === 0 ? 'screenshot' : 'video',
                    fileName: `file-${i}.png`,
                    filePath: `/path/to/file-${i}.png`,
                    fileSize: 1024 * (i + 1),
                    url: `/attachments/file-${i}.png`,
                })
            }

            // Verify all attachments exist
            const beforeDelete = await attachmentRepository.getAttachmentsByTestResult(resultId)
            expect(beforeDelete).toHaveLength(5)

            // Delete execution
            const deletedCount = await repository.deleteByExecutionId(resultId)

            expect(deletedCount).toBe(1)

            // Verify all attachments are gone (CASCADE)
            const afterDelete = await attachmentRepository.getAttachmentsByTestResult(resultId)
            expect(afterDelete).toHaveLength(0)
        })

        it('should work correctly when deleting the latest execution', async () => {
            const testId = 'test-delete-latest'

            // Create 3 executions
            await repository.saveTestResult(createTestResult(testId, 'passed'))
            await new Promise((resolve) => setTimeout(resolve, 100))
            await repository.saveTestResult(createTestResult(testId, 'failed'))
            await new Promise((resolve) => setTimeout(resolve, 100))
            const latestId = await repository.saveTestResult(createTestResult(testId, 'passed'))

            // Verify latest is the one we expect
            const beforeDelete = await repository.getTestResultsByTestId(testId)
            expect(beforeDelete).toHaveLength(3)
            expect(beforeDelete[0].id).toBe(latestId) // First in array is latest

            // Delete the latest execution
            await repository.deleteByExecutionId(latestId)

            // Verify deletion worked
            const afterDelete = await repository.getTestResultsByTestId(testId)
            expect(afterDelete).toHaveLength(2)
            expect(afterDelete[0].id).not.toBe(latestId) // New latest is different
        })

        it('should work correctly when deleting the oldest execution', async () => {
            const testId = 'test-delete-oldest'

            // Create 3 executions
            const oldestId = await repository.saveTestResult(createTestResult(testId, 'passed'))
            await new Promise((resolve) => setTimeout(resolve, 100))
            await repository.saveTestResult(createTestResult(testId, 'failed'))
            await new Promise((resolve) => setTimeout(resolve, 100))
            await repository.saveTestResult(createTestResult(testId, 'passed'))

            // Verify oldest is the one we expect
            const beforeDelete = await repository.getTestResultsByTestId(testId)
            expect(beforeDelete).toHaveLength(3)
            expect(beforeDelete[2].id).toBe(oldestId) // Last in array is oldest

            // Delete the oldest execution
            await repository.deleteByExecutionId(oldestId)

            // Verify deletion worked
            const afterDelete = await repository.getTestResultsByTestId(testId)
            expect(afterDelete).toHaveLength(2)
            expect(afterDelete.map((r) => r.id)).not.toContain(oldestId)
        })

        it('should handle SQL injection attempts safely', async () => {
            const testId = 'test-sql-injection'
            const validId = await repository.saveTestResult(createTestResult(testId, 'passed'))

            // Attempt SQL injection via executionId parameter
            const maliciousId = "'; DROP TABLE test_results; --"

            // Should return 0 (no deletion) without throwing error
            const deletedCount = await repository.deleteByExecutionId(maliciousId)

            expect(deletedCount).toBe(0)

            // Verify original execution still exists
            const result = await repository.getTestResult(validId)
            expect(result).toBeDefined()
            expect(result?.id).toBe(validId)
        })
    })
})
