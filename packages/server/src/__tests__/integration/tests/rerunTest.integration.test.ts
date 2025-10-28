import {describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi} from 'vitest'
import request from 'supertest'
import type {TestServerInstance} from '../helpers/testServer'
import {setupTestServer, teardownTestServer, cleanDatabase} from '../helpers/testServer'
import {seedTestRuns} from '../helpers/database'
import {activeProcessesTracker} from '../../../services/activeProcesses.service'

describe('POST /api/tests/:id/rerun - Rerun Test (Integration)', () => {
    let server: TestServerInstance

    beforeAll(async () => {
        server = await setupTestServer()
    })

    afterAll(async () => {
        await teardownTestServer(server)
    })

    beforeEach(async () => {
        await cleanDatabase(server.testRepository)
        vi.restoreAllMocks()
        activeProcessesTracker.forceReset()
    })

    afterEach(async () => {
        activeProcessesTracker.forceReset()
    })

    describe('Success scenarios', () => {
        it('should start test rerun and return run ID', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-original', status: 'completed'},
            ])

            // Create test execution
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    'exec-1',
                    'test-123',
                    'run-original',
                    'My Test',
                    'tests/my.spec.ts',
                    'failed',
                    1500,
                ]
            )

            // Mock Playwright service to avoid spawning real process
            const mockRunId = 'rerun-test-123'
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'rerunSingleTest'
            ).mockResolvedValue({
                runId: mockRunId,
                message: 'Test rerun started',
                timestamp: new Date().toISOString(),
                process: null,
            })

            const response = await request(server.app)
                .post('/api/tests/exec-1/rerun')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({maxWorkers: 2})
                .expect('Content-Type', /json/)
                .expect(200)

            expect(response.body).toMatchObject({
                success: true,
                data: {
                    runId: mockRunId,
                    message: 'Test rerun started',
                },
                message: 'Test rerun started',
            })

            // Verify test_runs record was created
            const testRun = await server.testRepository.dbManager.queryOne(
                'SELECT * FROM test_runs WHERE id = ?',
                [mockRunId]
            )
            expect(testRun).toBeDefined()
            expect(testRun.status).toBe('running')
            expect(testRun.total_tests).toBe(1)

            // Verify metadata
            const metadata = JSON.parse(testRun.metadata || '{}')
            expect(metadata).toMatchObject({
                type: 'rerun',
                originalTestId: 'exec-1',
                originalTestName: 'My Test',
                filePath: 'tests/my.spec.ts',
            })
        })

        it('should rerun test without maxWorkers parameter', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-original', status: 'completed'},
            ])

            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    'exec-2',
                    'test-456',
                    'run-original',
                    'Test 2',
                    'tests/test2.spec.ts',
                    'failed',
                    1000,
                ]
            )

            const mockRunId = 'rerun-test-456'
            const mockRerunSingleTest = vi
                .spyOn(server.serviceContainer.playwrightService as any, 'rerunSingleTest')
                .mockResolvedValue({
                    runId: mockRunId,
                    message: 'Test rerun started',
                    timestamp: new Date().toISOString(),
                    process: null,
                })

            const response = await request(server.app)
                .post('/api/tests/exec-2/rerun')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({}) // No maxWorkers
                .expect(200)

            expect(response.body.success).toBe(true)
            expect(response.body.data.runId).toBe(mockRunId)

            // Verify playwrightService was called with undefined maxWorkers
            expect(mockRerunSingleTest).toHaveBeenCalledWith(
                'tests/test2.spec.ts',
                'Test 2',
                undefined
            )
        })

        it('should pass maxWorkers to Playwright service', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-original', status: 'completed'},
            ])

            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    'exec-3',
                    'test-789',
                    'run-original',
                    'Test 3',
                    'tests/test3.spec.ts',
                    'passed',
                    1000,
                ]
            )

            const mockRerunSingleTest = vi
                .spyOn(server.serviceContainer.playwrightService as any, 'rerunSingleTest')
                .mockResolvedValue({
                    runId: 'rerun-789',
                    message: 'Test rerun started',
                    timestamp: new Date().toISOString(),
                    process: null,
                })

            await request(server.app)
                .post('/api/tests/exec-3/rerun')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({maxWorkers: 4})
                .expect(200)

            expect(mockRerunSingleTest).toHaveBeenCalledWith('tests/test3.spec.ts', 'Test 3', 4)
        })
    })

    describe('Error handling', () => {
        it('should return 404 when test not found', async () => {
            const response = await request(server.app)
                .post('/api/tests/non-existent-test/rerun')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({})
                .expect(404)

            expect(response.body).toMatchObject({
                success: false,
                error: expect.stringContaining('not found'),
            })

            // Verify no test_runs record created
            const testRuns =
                await server.testRepository.dbManager.queryAll('SELECT * FROM test_runs')
            expect(testRuns.length).toBe(0)
        })

        it('should return 500 on Playwright service failure', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-original', status: 'completed'},
            ])

            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-error', 'test-error', 'run-original', 'Test', 'test.spec.ts', 'failed', 1000]
            )

            // Mock Playwright service to throw error
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'rerunSingleTest'
            ).mockRejectedValue(new Error('Playwright not available'))

            const response = await request(server.app)
                .post('/api/tests/exec-error/rerun')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({})
                .expect(500)

            expect(response.body).toMatchObject({
                success: false,
                error: expect.stringContaining('Playwright not available'),
            })
        })
    })

    describe('Active processes tracking', () => {
        it('should add rerun process to tracker', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-original', status: 'completed'},
            ])

            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-track', 'test-track', 'run-original', 'Test', 'test.spec.ts', 'failed', 1000]
            )

            const mockRunId = 'rerun-track-123'
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'rerunSingleTest'
            ).mockResolvedValue({
                runId: mockRunId,
                message: 'Test rerun started',
                timestamp: new Date().toISOString(),
                process: null,
            })

            await request(server.app)
                .post('/api/tests/exec-track/rerun')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({})
                .expect(200)

            // Verify process is tracked
            const activeProcesses = activeProcessesTracker.getActiveProcesses()
            expect(activeProcesses.length).toBe(1)
            expect(activeProcesses[0].id).toBe(mockRunId)
            expect(activeProcesses[0].type).toBe('rerun')
        })
    })

    describe('Database integration', () => {
        it('should create test_runs record with rerun metadata', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-original', status: 'completed'},
            ])

            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    'exec-db-test',
                    'test-db-123',
                    'run-original',
                    'Database Test',
                    'tests/db.spec.ts',
                    'failed',
                    2000,
                ]
            )

            const mockRunId = 'rerun-db-test-123'
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'rerunSingleTest'
            ).mockResolvedValue({
                runId: mockRunId,
                message: 'Test rerun started',
                timestamp: new Date().toISOString(),
                process: null,
            })

            await request(server.app)
                .post('/api/tests/exec-db-test/rerun')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({maxWorkers: 1})
                .expect(200)

            // Verify test_runs record
            const testRun = await server.testRepository.dbManager.queryOne(
                'SELECT * FROM test_runs WHERE id = ?',
                [mockRunId]
            )

            expect(testRun).toBeDefined()
            expect(testRun.id).toBe(mockRunId)
            expect(testRun.status).toBe('running')
            expect(testRun.total_tests).toBe(1)
            expect(testRun.passed_tests).toBe(0)
            expect(testRun.failed_tests).toBe(0)

            // Verify rerun metadata
            const metadata = JSON.parse(testRun.metadata || '{}')
            expect(metadata).toMatchObject({
                type: 'rerun',
                originalTestId: 'exec-db-test',
                originalTestName: 'Database Test',
                filePath: 'tests/db.spec.ts',
            })
        })
    })

    describe('Public endpoint (Reporter integration)', () => {
        it('should work without authentication (public endpoint)', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-original', status: 'completed'},
            ])

            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    'exec-public',
                    'test-public',
                    'run-original',
                    'Test',
                    'test.spec.ts',
                    'failed',
                    1000,
                ]
            )

            const mockRunId = 'rerun-public-123'
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'rerunSingleTest'
            ).mockResolvedValue({
                runId: mockRunId,
                message: 'Test rerun started',
                timestamp: new Date().toISOString(),
                process: null,
            })

            // No Authorization header
            const response = await request(server.app)
                .post('/api/tests/exec-public/rerun')
                .send({maxWorkers: 2})
                .expect(200)

            expect(response.body.success).toBe(true)
            expect(response.body.data.runId).toBe(mockRunId)
        })

        it('should work with Authorization header (backward compatibility)', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-original', status: 'completed'},
            ])

            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-auth', 'test-auth', 'run-original', 'Test', 'test.spec.ts', 'failed', 1000]
            )

            const mockRunId = 'rerun-auth-123'
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'rerunSingleTest'
            ).mockResolvedValue({
                runId: mockRunId,
                message: 'Test rerun started',
                timestamp: new Date().toISOString(),
                process: null,
            })

            const response = await request(server.app)
                .post('/api/tests/exec-auth/rerun')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({maxWorkers: 1})
                .expect(200)

            expect(response.body.success).toBe(true)
            expect(response.body.data.runId).toBe(mockRunId)
        })
    })

    describe('Middleware chain integration', () => {
        it('should process request through full middleware chain', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-original', status: 'completed'},
            ])

            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    'exec-middleware',
                    'test-middleware',
                    'run-original',
                    'Test',
                    'test.spec.ts',
                    'failed',
                    1000,
                ]
            )

            const mockRunId = 'rerun-middleware-123'
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'rerunSingleTest'
            ).mockResolvedValue({
                runId: mockRunId,
                message: 'Test rerun started',
                timestamp: new Date().toISOString(),
                process: null,
            })

            const response = await request(server.app)
                .post('/api/tests/exec-middleware/rerun')
                .set('Authorization', `Bearer ${server.authToken}`)
                .set('Content-Type', 'application/json')
                .send({maxWorkers: 2})
                .expect(200)

            // Verify JSON response
            expect(response.headers['content-type']).toMatch(/json/)

            // Verify response structure (from ResponseHelper)
            expect(response.body).toHaveProperty('success', true)
            expect(response.body).toHaveProperty('data')
            expect(response.body).toHaveProperty('message', 'Test rerun started')
            expect(response.body.data).toHaveProperty('runId', mockRunId)

            // Verify database persistence (full chain worked)
            const testRun = await server.testRepository.dbManager.queryOne(
                'SELECT * FROM test_runs WHERE id = ?',
                [mockRunId]
            )
            expect(testRun).toBeDefined()
        })

        it('should handle errors through error middleware', async () => {
            // Test doesn't exist - should trigger 404
            const response = await request(server.app)
                .post('/api/tests/nonexistent/rerun')
                .send({})
                .expect(404)

            // Verify error format from error middleware
            expect(response.body).toHaveProperty('success', false)
            expect(response.body).toHaveProperty('error')
        })
    })
})
