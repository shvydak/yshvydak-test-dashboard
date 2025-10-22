import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {RunRepository} from '../run.repository'
import {DatabaseManager} from '../../database/database.manager'
import {TestRunData} from '../../types/database.types'

describe('RunRepository', () => {
    let runRepository: RunRepository
    let dbManager: DatabaseManager

    beforeEach(async () => {
        // Use in-memory database for isolation
        dbManager = new DatabaseManager(':memory:')
        await dbManager.initialize()

        runRepository = new RunRepository(dbManager)
    })

    afterEach(async () => {
        await dbManager.close()
    })

    describe('createTestRun', () => {
        it('should create a test run with all fields', async () => {
            const runData: TestRunData = {
                id: 'run-123',
                status: 'running',
                totalTests: 10,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
                metadata: {
                    environment: 'test',
                    browser: 'chromium',
                },
            }

            const runId = await runRepository.createTestRun(runData)

            expect(runId).toBe('run-123')

            // Verify it was saved
            const savedRun = await runRepository.getTestRun(runId)
            expect(savedRun).toBeDefined()
            expect(savedRun?.id).toBe(runData.id)
            expect(savedRun?.status).toBe(runData.status)
            expect(savedRun?.totalTests).toBe(runData.totalTests)
            expect(savedRun?.metadata).toEqual(runData.metadata)
        })

        it('should create a test run without metadata', async () => {
            const runData: TestRunData = {
                id: 'run-456',
                status: 'running',
                totalTests: 5,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            }

            const runId = await runRepository.createTestRun(runData)

            expect(runId).toBe('run-456')

            const savedRun = await runRepository.getTestRun(runId)
            expect(savedRun).toBeDefined()
            expect(savedRun?.metadata).toBeUndefined()
        })

        it('should create a test run with zero values', async () => {
            const runData: TestRunData = {
                id: 'run-zero',
                status: 'completed',
                totalTests: 0,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            }

            const runId = await runRepository.createTestRun(runData)

            const savedRun = await runRepository.getTestRun(runId)
            expect(savedRun).toBeDefined()
            expect(savedRun?.totalTests).toBe(0)
            expect(savedRun?.duration).toBe(0)
        })

        it('should handle different status values', async () => {
            const statuses: Array<'running' | 'completed' | 'failed'> = [
                'running',
                'completed',
                'failed',
            ]

            for (const status of statuses) {
                const runData: TestRunData = {
                    id: `run-${status}`,
                    status,
                    totalTests: 1,
                    passedTests: 0,
                    failedTests: 0,
                    skippedTests: 0,
                    duration: 0,
                }

                await runRepository.createTestRun(runData)

                const savedRun = await runRepository.getTestRun(runData.id)
                expect(savedRun?.status).toBe(status)
            }
        })

        it('should handle complex metadata objects', async () => {
            const runData: TestRunData = {
                id: 'run-complex-meta',
                status: 'running',
                totalTests: 10,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
                metadata: {
                    environment: 'test',
                    browser: 'chromium',
                    viewport: {width: 1920, height: 1080},
                    tags: ['smoke', 'regression'],
                    nested: {
                        level1: {
                            level2: 'deep value',
                        },
                    },
                },
            }

            const runId = await runRepository.createTestRun(runData)

            const savedRun = await runRepository.getTestRun(runId)
            expect(savedRun?.metadata).toEqual(runData.metadata)
        })

        it('should throw error on duplicate run ID', async () => {
            const runData: TestRunData = {
                id: 'run-duplicate',
                status: 'running',
                totalTests: 1,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            }

            await runRepository.createTestRun(runData)

            // Try to create again with same ID
            await expect(runRepository.createTestRun(runData)).rejects.toThrow()
        })
    })

    describe('updateTestRun', () => {
        beforeEach(async () => {
            // Create initial run for updates
            await runRepository.createTestRun({
                id: 'run-to-update',
                status: 'running',
                totalTests: 10,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            })
        })

        it('should update status', async () => {
            await runRepository.updateTestRun('run-to-update', {
                status: 'completed',
            })

            const run = await runRepository.getTestRun('run-to-update')
            expect(run?.status).toBe('completed')
        })

        it('should update test counts', async () => {
            await runRepository.updateTestRun('run-to-update', {
                passedTests: 7,
                failedTests: 2,
                skippedTests: 1,
            })

            const run = await runRepository.getTestRun('run-to-update')
            expect(run?.passedTests).toBe(7)
            expect(run?.failedTests).toBe(2)
            expect(run?.skippedTests).toBe(1)
        })

        it('should update duration', async () => {
            await runRepository.updateTestRun('run-to-update', {
                duration: 5000,
            })

            const run = await runRepository.getTestRun('run-to-update')
            expect(run?.duration).toBe(5000)
        })

        it('should update multiple fields at once', async () => {
            await runRepository.updateTestRun('run-to-update', {
                status: 'completed',
                passedTests: 8,
                failedTests: 2,
                duration: 12000,
            })

            const run = await runRepository.getTestRun('run-to-update')
            expect(run?.status).toBe('completed')
            expect(run?.passedTests).toBe(8)
            expect(run?.failedTests).toBe(2)
            expect(run?.duration).toBe(12000)
        })

        it('should handle partial updates without affecting other fields', async () => {
            // First update
            await runRepository.updateTestRun('run-to-update', {
                passedTests: 5,
            })

            // Second update - different field
            await runRepository.updateTestRun('run-to-update', {
                failedTests: 2,
            })

            const run = await runRepository.getTestRun('run-to-update')
            expect(run?.passedTests).toBe(5)
            expect(run?.failedTests).toBe(2)
            expect(run?.status).toBe('running') // Original value preserved
        })

        it('should update totalTests', async () => {
            await runRepository.updateTestRun('run-to-update', {
                totalTests: 15,
            })

            const run = await runRepository.getTestRun('run-to-update')
            expect(run?.totalTests).toBe(15)
        })

        it('should handle updates with zero values', async () => {
            await runRepository.updateTestRun('run-to-update', {
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            })

            const run = await runRepository.getTestRun('run-to-update')
            expect(run?.passedTests).toBe(0)
            expect(run?.failedTests).toBe(0)
            expect(run?.skippedTests).toBe(0)
            expect(run?.duration).toBe(0)
        })

        it('should not throw error when updating non-existent run', async () => {
            // SQLite won't throw error if no rows affected
            await expect(
                runRepository.updateTestRun('non-existent-run', {
                    status: 'completed',
                })
            ).resolves.not.toThrow()
        })
    })

    describe('getTestRun', () => {
        it('should retrieve an existing test run', async () => {
            const runData: TestRunData = {
                id: 'run-get',
                status: 'completed',
                totalTests: 10,
                passedTests: 8,
                failedTests: 2,
                skippedTests: 0,
                duration: 5000,
                metadata: {env: 'test'},
            }

            await runRepository.createTestRun(runData)

            const run = await runRepository.getTestRun('run-get')
            expect(run).toBeDefined()
            expect(run?.id).toBe(runData.id)
            expect(run?.status).toBe(runData.status)
            expect(run?.totalTests).toBe(runData.totalTests)
            expect(run?.passedTests).toBe(runData.passedTests)
            expect(run?.failedTests).toBe(runData.failedTests)
            expect(run?.skippedTests).toBe(runData.skippedTests)
            expect(run?.duration).toBe(runData.duration)
            expect(run?.metadata).toEqual(runData.metadata)
        })

        it('should return null for non-existent run', async () => {
            const run = await runRepository.getTestRun('non-existent')
            expect(run).toBeNull()
        })

        it('should handle run with null metadata', async () => {
            const runData: TestRunData = {
                id: 'run-no-meta',
                status: 'completed',
                totalTests: 5,
                passedTests: 5,
                failedTests: 0,
                skippedTests: 0,
                duration: 1000,
            }

            await runRepository.createTestRun(runData)

            const run = await runRepository.getTestRun('run-no-meta')
            expect(run?.metadata).toBeUndefined()
        })
    })

    describe('getAllTestRuns', () => {
        it('should retrieve all test runs ordered by created_at DESC', async () => {
            // Create multiple runs
            for (let i = 1; i <= 5; i++) {
                await runRepository.createTestRun({
                    id: `run-${i}`,
                    status: 'completed',
                    totalTests: i,
                    passedTests: i,
                    failedTests: 0,
                    skippedTests: 0,
                    duration: i * 1000,
                })
            }

            const runs = await runRepository.getAllTestRuns()
            expect(runs).toHaveLength(5)

            // Should be in reverse order (newest first)
            expect(runs[0].id).toBe('run-5')
            expect(runs[4].id).toBe('run-1')
        })

        it('should respect limit parameter', async () => {
            // Create 10 runs
            for (let i = 1; i <= 10; i++) {
                await runRepository.createTestRun({
                    id: `run-limit-${i}`,
                    status: 'completed',
                    totalTests: 1,
                    passedTests: 1,
                    failedTests: 0,
                    skippedTests: 0,
                    duration: 100,
                })
            }

            const runs = await runRepository.getAllTestRuns(5)
            expect(runs).toHaveLength(5)
        })

        it('should return empty array when no runs exist', async () => {
            const runs = await runRepository.getAllTestRuns()
            expect(runs).toEqual([])
        })

        it('should use default limit of 50', async () => {
            // Create 60 runs
            for (let i = 1; i <= 60; i++) {
                await runRepository.createTestRun({
                    id: `run-default-${i}`,
                    status: 'completed',
                    totalTests: 1,
                    passedTests: 1,
                    failedTests: 0,
                    skippedTests: 0,
                    duration: 100,
                })
            }

            const runs = await runRepository.getAllTestRuns()
            expect(runs).toHaveLength(50) // Default limit
        })

        it('should properly map all fields', async () => {
            await runRepository.createTestRun({
                id: 'run-mapping',
                status: 'failed',
                totalTests: 10,
                passedTests: 7,
                failedTests: 3,
                skippedTests: 0,
                duration: 5000,
                metadata: {env: 'production'},
            })

            const runs = await runRepository.getAllTestRuns()
            const run = runs[0]

            expect(run.id).toBe('run-mapping')
            expect(run.status).toBe('failed')
            expect(run.totalTests).toBe(10)
            expect(run.passedTests).toBe(7)
            expect(run.failedTests).toBe(3)
            expect(run.skippedTests).toBe(0)
            expect(run.duration).toBe(5000)
            expect(run.metadata).toEqual({env: 'production'})
        })

        it('should handle runs with different statuses', async () => {
            await runRepository.createTestRun({
                id: 'run-running',
                status: 'running',
                totalTests: 10,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            })

            await runRepository.createTestRun({
                id: 'run-completed',
                status: 'completed',
                totalTests: 10,
                passedTests: 10,
                failedTests: 0,
                skippedTests: 0,
                duration: 5000,
            })

            await runRepository.createTestRun({
                id: 'run-failed',
                status: 'failed',
                totalTests: 10,
                passedTests: 5,
                failedTests: 5,
                skippedTests: 0,
                duration: 3000,
            })

            const runs = await runRepository.getAllTestRuns()
            expect(runs).toHaveLength(3)

            const statuses = runs.map((r) => r.status)
            expect(statuses).toContain('running')
            expect(statuses).toContain('completed')
            expect(statuses).toContain('failed')
        })
    })

    describe('getStats', () => {
        it('should return statistics for all runs', async () => {
            // Create runs with different statuses and counts
            await runRepository.createTestRun({
                id: 'run-stats-1',
                status: 'completed',
                totalTests: 10,
                passedTests: 8,
                failedTests: 2,
                skippedTests: 0,
                duration: 5000,
            })

            await runRepository.createTestRun({
                id: 'run-stats-2',
                status: 'completed',
                totalTests: 5,
                passedTests: 5,
                failedTests: 0,
                skippedTests: 0,
                duration: 3000,
            })

            await runRepository.createTestRun({
                id: 'run-stats-3',
                status: 'running',
                totalTests: 3,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            })

            const stats = await runRepository.getStats()

            expect(stats.total_runs).toBe(3)
            expect(stats.completed_runs).toBe(2)
            expect(stats.total_tests).toBe(18) // 10 + 5 + 3
            expect(stats.total_passed).toBe(13) // 8 + 5 + 0
            expect(stats.total_failed).toBe(2) // 2 + 0 + 0
            expect(stats.total_skipped).toBe(0)
        })

        it('should return zero stats when no runs exist', async () => {
            const stats = await runRepository.getStats()

            // SQLite returns null for SUM() when no rows exist
            expect(stats.total_runs).toBe(0)
            expect(stats.completed_runs === 0 || stats.completed_runs === null).toBe(true)
            expect(stats.total_tests === 0 || stats.total_tests === null).toBe(true)
            expect(stats.total_passed === 0 || stats.total_passed === null).toBe(true)
            expect(stats.total_failed === 0 || stats.total_failed === null).toBe(true)
            expect(stats.total_skipped === 0 || stats.total_skipped === null).toBe(true)
        })

        it('should count only completed runs in completed_runs', async () => {
            await runRepository.createTestRun({
                id: 'run-completed',
                status: 'completed',
                totalTests: 10,
                passedTests: 10,
                failedTests: 0,
                skippedTests: 0,
                duration: 5000,
            })

            await runRepository.createTestRun({
                id: 'run-failed',
                status: 'failed',
                totalTests: 10,
                passedTests: 5,
                failedTests: 5,
                skippedTests: 0,
                duration: 3000,
            })

            await runRepository.createTestRun({
                id: 'run-running',
                status: 'running',
                totalTests: 10,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            })

            const stats = await runRepository.getStats()

            expect(stats.total_runs).toBe(3)
            expect(stats.completed_runs).toBe(1) // Only 'completed' status
        })
    })

    describe('Foreign key constraints', () => {
        it('should allow test_results to reference run_id', async () => {
            // Create run
            await runRepository.createTestRun({
                id: 'run-with-tests',
                status: 'running',
                totalTests: 1,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            })

            // Create test result with run_id
            await dbManager.execute(
                `INSERT INTO test_results (id, run_id, test_id, name, file_path, status, duration) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    'test-1',
                    'run-with-tests',
                    'test-id-1',
                    'Sample Test',
                    '/path/to/test.spec.ts',
                    'passed',
                    1000,
                ]
            )

            // Verify test was created
            const result = await dbManager.query('SELECT * FROM test_results WHERE id = ?', [
                'test-1',
            ])
            expect(result).toBeDefined()
            expect(result.run_id).toBe('run-with-tests')
        })

        it('should cascade delete test_results when run is deleted', async () => {
            // Create run
            await runRepository.createTestRun({
                id: 'run-cascade',
                status: 'completed',
                totalTests: 2,
                passedTests: 2,
                failedTests: 0,
                skippedTests: 0,
                duration: 2000,
            })

            // Create test results
            await dbManager.execute(
                `INSERT INTO test_results (id, run_id, test_id, name, file_path, status, duration) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    'test-cascade-1',
                    'run-cascade',
                    'test-id-1',
                    'Test 1',
                    '/path/test.spec.ts',
                    'passed',
                    1000,
                ]
            )

            await dbManager.execute(
                `INSERT INTO test_results (id, run_id, test_id, name, file_path, status, duration) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    'test-cascade-2',
                    'run-cascade',
                    'test-id-2',
                    'Test 2',
                    '/path/test.spec.ts',
                    'passed',
                    1000,
                ]
            )

            // Verify tests exist
            const testsBefore = await dbManager.queryAll(
                'SELECT * FROM test_results WHERE run_id = ?',
                ['run-cascade']
            )
            expect(testsBefore).toHaveLength(2)

            // Delete run
            await dbManager.execute('DELETE FROM test_runs WHERE id = ?', ['run-cascade'])

            // Verify tests were cascade deleted
            const testsAfter = await dbManager.queryAll(
                'SELECT * FROM test_results WHERE run_id = ?',
                ['run-cascade']
            )
            expect(testsAfter).toHaveLength(0)
        })

        it('should allow test_results with NULL run_id (discovered tests)', async () => {
            // Create test result without run_id (discovered test)
            await dbManager.execute(
                `INSERT INTO test_results (id, run_id, test_id, name, file_path, status, duration) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    'test-discovered',
                    null,
                    'test-id-discovered',
                    'Discovered Test',
                    '/path/test.spec.ts',
                    'pending',
                    0,
                ]
            )

            // Verify test was created
            const results = await dbManager.queryAll<any>(
                'SELECT * FROM test_results WHERE id = ? LIMIT 1',
                ['test-discovered']
            )
            expect(results).toHaveLength(1)
            expect(results[0].run_id).toBeNull()
        })

        it('should reject test_results with invalid run_id', async () => {
            // Try to create test result with non-existent run_id
            await expect(
                dbManager.execute(
                    `INSERT INTO test_results (id, run_id, test_id, name, file_path, status, duration) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        'test-invalid-run',
                        'non-existent-run-id',
                        'test-id-invalid',
                        'Test',
                        '/path/test.spec.ts',
                        'passed',
                        1000,
                    ]
                )
            ).rejects.toThrow()
        })
    })

    describe('Edge cases', () => {
        it('should handle very long run IDs', async () => {
            const longId = 'run-' + 'a'.repeat(200)

            await runRepository.createTestRun({
                id: longId,
                status: 'running',
                totalTests: 1,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            })

            const run = await runRepository.getTestRun(longId)
            expect(run?.id).toBe(longId)
        })

        it('should handle special characters in run ID', async () => {
            const specialId = 'run-test@#$%^&*()_+-=[]{}|;:,.<>?'

            await runRepository.createTestRun({
                id: specialId,
                status: 'running',
                totalTests: 1,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            })

            const run = await runRepository.getTestRun(specialId)
            expect(run?.id).toBe(specialId)
        })

        it('should handle large test counts', async () => {
            await runRepository.createTestRun({
                id: 'run-large-counts',
                status: 'completed',
                totalTests: 999999,
                passedTests: 500000,
                failedTests: 400000,
                skippedTests: 99999,
                duration: 3600000,
            })

            const run = await runRepository.getTestRun('run-large-counts')
            expect(run?.totalTests).toBe(999999)
            expect(run?.passedTests).toBe(500000)
            expect(run?.failedTests).toBe(400000)
            expect(run?.skippedTests).toBe(99999)
            expect(run?.duration).toBe(3600000)
        })

        it('should handle metadata with special characters and Unicode', async () => {
            const metadata = {
                description: 'Test with special chars: @#$%^&*()',
                unicode: '测试 🚀 тест',
                emoji: '😀 😃 😄',
            }

            await runRepository.createTestRun({
                id: 'run-special-meta',
                status: 'completed',
                totalTests: 1,
                passedTests: 1,
                failedTests: 0,
                skippedTests: 0,
                duration: 1000,
                metadata,
            })

            const run = await runRepository.getTestRun('run-special-meta')
            expect(run?.metadata).toEqual(metadata)
        })

        it('should handle concurrent run creation', async () => {
            const promises = []
            for (let i = 0; i < 10; i++) {
                promises.push(
                    runRepository.createTestRun({
                        id: `run-concurrent-${i}`,
                        status: 'running',
                        totalTests: i,
                        passedTests: 0,
                        failedTests: 0,
                        skippedTests: 0,
                        duration: 0,
                    })
                )
            }

            await Promise.all(promises)

            const runs = await runRepository.getAllTestRuns(20)
            expect(runs).toHaveLength(10)
        })

        it('should handle concurrent updates to same run', async () => {
            await runRepository.createTestRun({
                id: 'run-concurrent-update',
                status: 'running',
                totalTests: 10,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            })

            // Multiple concurrent updates
            await Promise.all([
                runRepository.updateTestRun('run-concurrent-update', {
                    passedTests: 5,
                }),
                runRepository.updateTestRun('run-concurrent-update', {
                    failedTests: 2,
                }),
                runRepository.updateTestRun('run-concurrent-update', {
                    duration: 3000,
                }),
            ])

            const run = await runRepository.getTestRun('run-concurrent-update')
            expect(run).toBeDefined()
            // At least one update should succeed
            expect(run!.passedTests > 0 || run!.failedTests > 0 || run!.duration > 0).toBe(true)
        })
    })

    describe('Integration scenarios', () => {
        it('should handle complete test run lifecycle', async () => {
            // 1. Create run
            const runId = await runRepository.createTestRun({
                id: 'run-lifecycle',
                status: 'running',
                totalTests: 10,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            })

            let run = await runRepository.getTestRun(runId)
            expect(run?.status).toBe('running')

            // 2. Update during execution
            await runRepository.updateTestRun(runId, {
                passedTests: 5,
            })

            run = await runRepository.getTestRun(runId)
            expect(run?.passedTests).toBe(5)

            // 3. Update with more results
            await runRepository.updateTestRun(runId, {
                passedTests: 8,
                failedTests: 2,
            })

            // 4. Complete run
            await runRepository.updateTestRun(runId, {
                status: 'completed',
                duration: 15000,
            })

            run = await runRepository.getTestRun(runId)
            expect(run?.status).toBe('completed')
            expect(run?.passedTests).toBe(8)
            expect(run?.failedTests).toBe(2)
            expect(run?.duration).toBe(15000)
        })

        it('should properly aggregate stats across multiple runs', async () => {
            // Create diverse set of runs
            const runConfigs = [
                {passed: 10, failed: 0, skipped: 0, status: 'completed' as const},
                {passed: 8, failed: 2, skipped: 0, status: 'completed' as const},
                {passed: 5, failed: 3, skipped: 2, status: 'failed' as const},
                {passed: 0, failed: 0, skipped: 0, status: 'running' as const},
            ]

            for (let i = 0; i < runConfigs.length; i++) {
                const config = runConfigs[i]
                await runRepository.createTestRun({
                    id: `run-agg-${i}`,
                    status: config.status,
                    totalTests: config.passed + config.failed + config.skipped,
                    passedTests: config.passed,
                    failedTests: config.failed,
                    skippedTests: config.skipped,
                    duration: 1000,
                })
            }

            const stats = await runRepository.getStats()

            expect(stats.total_runs).toBe(4)
            expect(stats.completed_runs).toBe(2)
            expect(stats.total_passed).toBe(23) // 10 + 8 + 5 + 0
            expect(stats.total_failed).toBe(5) // 0 + 2 + 3 + 0
            expect(stats.total_skipped).toBe(2) // 0 + 0 + 2 + 0
        })

        it('should maintain referential integrity when creating related records', async () => {
            // Create run
            await runRepository.createTestRun({
                id: 'run-integrity',
                status: 'completed',
                totalTests: 2,
                passedTests: 1,
                failedTests: 1,
                skippedTests: 0,
                duration: 5000,
            })

            // Create test results
            await dbManager.execute(
                `INSERT INTO test_results (id, run_id, test_id, name, file_path, status, duration) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    'test-passed',
                    'run-integrity',
                    'test-id-1',
                    'Passing Test',
                    '/path/test.spec.ts',
                    'passed',
                    2000,
                ]
            )

            await dbManager.execute(
                `INSERT INTO test_results (id, run_id, test_id, name, file_path, status, duration) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    'test-failed',
                    'run-integrity',
                    'test-id-2',
                    'Failing Test',
                    '/path/test.spec.ts',
                    'failed',
                    3000,
                ]
            )

            // Verify run exists
            const run = await runRepository.getTestRun('run-integrity')
            expect(run).toBeDefined()

            // Verify tests exist
            const tests = await dbManager.queryAll<any>(
                'SELECT * FROM test_results WHERE run_id = ?',
                ['run-integrity']
            )
            expect(tests).toHaveLength(2)

            // Verify relationship
            expect(tests[0].run_id).toBe('run-integrity')
            expect(tests[1].run_id).toBe('run-integrity')
        })
    })
})
