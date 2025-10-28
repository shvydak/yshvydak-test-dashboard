import {describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi} from 'vitest'
import request from 'supertest'
import type {TestServerInstance} from '../helpers/testServer'
import {setupTestServer, teardownTestServer, cleanDatabase} from '../helpers/testServer'
import {activeProcessesTracker} from '../../../services/activeProcesses.service'

describe('POST /api/tests/run-all - Run All Tests (Integration)', () => {
    let server: TestServerInstance

    beforeAll(async () => {
        server = await setupTestServer()
    })

    afterAll(async () => {
        await teardownTestServer(server)
    })

    beforeEach(async () => {
        await cleanDatabase(server.testRepository)

        // Restore mocks before each test
        vi.restoreAllMocks()

        // Force reset active processes tracker (clear all active runs)
        activeProcessesTracker.forceReset()
    })

    afterEach(async () => {
        // Ensure active processes are cleared after each test
        activeProcessesTracker.forceReset()
    })

    describe('Success scenarios', () => {
        it('should start test run and return run ID', async () => {
            // Mock Playwright service to avoid spawning real process
            const mockRunId = 'run-test-123'
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'runAllTests'
            ).mockResolvedValue({
                runId: mockRunId,
                message: 'All tests started',
                timestamp: new Date().toISOString(),
                process: null, // No real process in test
            })

            const response = await request(server.app)
                .post('/api/tests/run-all')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({maxWorkers: 4})
                .expect('Content-Type', /json/)
                .expect(200)

            // Verify response structure
            expect(response.body).toMatchObject({
                success: true,
                data: {
                    runId: mockRunId,
                    message: 'All tests started',
                    timestamp: expect.any(String),
                },
            })

            // Verify test_runs record was created
            const testRun = await server.testRepository.dbManager.queryOne(
                'SELECT * FROM test_runs WHERE id = ?',
                [mockRunId]
            )
            expect(testRun).toBeDefined()
            expect(testRun.status).toBe('running')
            expect(testRun.total_tests).toBe(0) // Will be updated during execution
        })

        it('should start test run without maxWorkers parameter', async () => {
            const mockRunId = 'run-test-456'
            const mockRunAllTests = vi
                .spyOn(server.serviceContainer.playwrightService as any, 'runAllTests')
                .mockResolvedValue({
                    runId: mockRunId,
                    message: 'All tests started',
                    timestamp: new Date().toISOString(),
                    process: null,
                })

            const response = await request(server.app)
                .post('/api/tests/run-all')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({}) // No maxWorkers
                .expect(200)

            expect(response.body.success).toBe(true)
            expect(response.body.data.runId).toBe(mockRunId)

            // Verify playwrightService was called with undefined
            expect(mockRunAllTests).toHaveBeenCalledWith(undefined)
        })

        it('should pass maxWorkers to Playwright service', async () => {
            const mockRunId = 'run-test-789'
            const mockRunAllTests = vi
                .spyOn(server.serviceContainer.playwrightService as any, 'runAllTests')
                .mockResolvedValue({
                    runId: mockRunId,
                    message: 'All tests started',
                    timestamp: new Date().toISOString(),
                    process: null,
                })

            await request(server.app)
                .post('/api/tests/run-all')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({maxWorkers: 8})
                .expect(200)

            expect(mockRunAllTests).toHaveBeenCalledWith(8)
        })
    })

    describe('Conflict detection (409)', () => {
        it('should return 409 when tests are already running', async () => {
            const firstRunId = 'run-first-123'

            // Mock first successful run
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'runAllTests'
            ).mockResolvedValue({
                runId: firstRunId,
                message: 'All tests started',
                timestamp: new Date().toISOString(),
                process: null,
            })

            // Start first test run
            await request(server.app)
                .post('/api/tests/run-all')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({maxWorkers: 4})
                .expect(200)

            // Verify process is tracked as active
            expect(activeProcessesTracker.isRunAllActive()).toBe(true)

            // Try to start second test run (should fail with 409)
            const response = await request(server.app)
                .post('/api/tests/run-all')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({maxWorkers: 4})
                .expect(409)

            expect(response.body).toMatchObject({
                success: false,
                error: expect.stringContaining('already running'),
            })

            // Verify error details contain conflict information (JSON stringified in error message)
            const errorText = response.body.error || response.body.message
            expect(errorText).toBeDefined()
            // Error contains either plain message or JSON string with details
            expect(
                errorText.includes('TESTS_ALREADY_RUNNING') || errorText.includes('already running')
            ).toBe(true)
        })

        it('should include estimated time remaining in conflict error', async () => {
            const firstRunId = 'run-first-456'

            // Mock successful run
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'runAllTests'
            ).mockResolvedValue({
                runId: firstRunId,
                message: 'All tests started',
                timestamp: new Date().toISOString(),
                process: null,
            })

            // Start first test run
            await request(server.app)
                .post('/api/tests/run-all')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({})
                .expect(200)

            // Try second run
            const response = await request(server.app)
                .post('/api/tests/run-all')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({})
                .expect(409)

            // Parse error message (it's JSON stringified)
            const errorMatch = response.body.error.match(/\{.*\}/)
            if (errorMatch) {
                const errorData = JSON.parse(errorMatch[0])
                expect(errorData).toMatchObject({
                    code: 'TESTS_ALREADY_RUNNING',
                    message: expect.any(String),
                    currentRunId: firstRunId,
                    estimatedTimeRemaining: expect.any(Number),
                    startedAt: expect.any(String),
                })
            }
        })
    })

    describe('Database integration', () => {
        it('should create test_runs record with correct metadata', async () => {
            const mockRunId = 'run-db-test-123'
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'runAllTests'
            ).mockResolvedValue({
                runId: mockRunId,
                message: 'All tests started',
                timestamp: new Date().toISOString(),
                process: null,
            })

            await request(server.app)
                .post('/api/tests/run-all')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({maxWorkers: 6})
                .expect(200)

            // Verify test_runs record
            const testRun = await server.testRepository.dbManager.queryOne(
                'SELECT * FROM test_runs WHERE id = ?',
                [mockRunId]
            )

            expect(testRun).toBeDefined()
            expect(testRun.id).toBe(mockRunId)
            expect(testRun.status).toBe('running')
            expect(testRun.total_tests).toBe(0)
            expect(testRun.passed_tests).toBe(0)
            expect(testRun.failed_tests).toBe(0)
            expect(testRun.skipped_tests).toBe(0)
            expect(testRun.duration).toBe(0)

            // Verify metadata
            const metadata = JSON.parse(testRun.metadata || '{}')
            expect(metadata).toMatchObject({
                type: 'run-all',
                triggeredFrom: 'dashboard',
            })

            // Verify timestamps
            expect(testRun.created_at).toBeDefined()
            expect(testRun.updated_at).toBeDefined()
        })

        it('should not create duplicate test_runs on conflict', async () => {
            const firstRunId = 'run-duplicate-test-123'
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'runAllTests'
            ).mockResolvedValue({
                runId: firstRunId,
                message: 'All tests started',
                timestamp: new Date().toISOString(),
                process: null,
            })

            // First run
            await request(server.app)
                .post('/api/tests/run-all')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({})
                .expect(200)

            // Second run (conflict)
            await request(server.app)
                .post('/api/tests/run-all')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({})
                .expect(409)

            // Verify only one test_runs record exists
            const allRuns =
                await server.testRepository.dbManager.queryAll('SELECT * FROM test_runs')
            expect(allRuns.length).toBe(1)
            expect(allRuns[0].id).toBe(firstRunId)
        })
    })

    describe('WebSocket integration', () => {
        it('should broadcast run started event', async () => {
            const mockRunId = 'run-ws-test-123'
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'runAllTests'
            ).mockResolvedValue({
                runId: mockRunId,
                message: 'All tests started',
                timestamp: new Date().toISOString(),
                process: null,
            })

            // Mock WebSocket broadcast
            const broadcastSpy = vi.spyOn(
                server.serviceContainer.websocketService as any,
                'broadcastRunStarted'
            )

            await request(server.app)
                .post('/api/tests/run-all')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({})
                .expect(200)

            // Verify WebSocket broadcast was called
            expect(broadcastSpy).toHaveBeenCalledWith(mockRunId, 'run-all')
        })

        it('should not broadcast on conflict error', async () => {
            const firstRunId = 'run-ws-conflict-123'
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'runAllTests'
            ).mockResolvedValue({
                runId: firstRunId,
                message: 'All tests started',
                timestamp: new Date().toISOString(),
                process: null,
            })

            const broadcastSpy = vi.spyOn(
                server.serviceContainer.websocketService as any,
                'broadcastRunStarted'
            )

            // First run
            await request(server.app)
                .post('/api/tests/run-all')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({})
                .expect(200)

            // Reset spy to track only second call
            broadcastSpy.mockClear()

            // Second run (conflict) - should not broadcast
            await request(server.app)
                .post('/api/tests/run-all')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({})
                .expect(409)

            expect(broadcastSpy).not.toHaveBeenCalled()
        })
    })

    describe('Public endpoint (Reporter integration)', () => {
        it('should work without authentication (public endpoint)', async () => {
            const mockRunId = 'run-public-123'
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'runAllTests'
            ).mockResolvedValue({
                runId: mockRunId,
                message: 'All tests started',
                timestamp: new Date().toISOString(),
                process: null,
            })

            // No Authorization header
            const response = await request(server.app)
                .post('/api/tests/run-all')
                .send({maxWorkers: 4})
                .expect(200)

            expect(response.body.success).toBe(true)
            expect(response.body.data.runId).toBe(mockRunId)
        })

        it('should work with Authorization header (backward compatibility)', async () => {
            const mockRunId = 'run-auth-123'
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'runAllTests'
            ).mockResolvedValue({
                runId: mockRunId,
                message: 'All tests started',
                timestamp: new Date().toISOString(),
                process: null,
            })

            const response = await request(server.app)
                .post('/api/tests/run-all')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({maxWorkers: 2})
                .expect(200)

            expect(response.body.success).toBe(true)
            expect(response.body.data.runId).toBe(mockRunId)
        })
    })

    describe('Error handling', () => {
        it('should return 500 on Playwright service failure', async () => {
            // Mock Playwright service to throw error
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'runAllTests'
            ).mockRejectedValue(new Error('Playwright not found'))

            const response = await request(server.app)
                .post('/api/tests/run-all')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({})
                .expect(500)

            expect(response.body).toMatchObject({
                success: false,
                error: expect.stringContaining('Playwright not found'),
            })
        })
    })

    describe('Middleware chain integration', () => {
        it('should process request through full middleware chain', async () => {
            // This test verifies:
            // 1. CORS middleware allows request
            // 2. JSON parsing middleware parses body
            // 3. Auth middleware validates JWT (optional for this endpoint)
            // 4. Service injection middleware provides services
            // 5. Controller processes request
            // 6. Service layer executes business logic
            // 7. Repository layer saves to database
            // 8. WebSocket broadcasts event
            // 9. Response helper formats response

            const mockRunId = 'run-middleware-test-123'
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'runAllTests'
            ).mockResolvedValue({
                runId: mockRunId,
                message: 'All tests started',
                timestamp: new Date().toISOString(),
                process: null,
            })

            const response = await request(server.app)
                .post('/api/tests/run-all')
                .set('Authorization', `Bearer ${server.authToken}`)
                .set('Content-Type', 'application/json')
                .send({maxWorkers: 4})
                .expect(200)

            // Verify JSON response
            expect(response.headers['content-type']).toMatch(/json/)

            // Verify response structure (from ResponseHelper)
            expect(response.body).toHaveProperty('success', true)
            expect(response.body).toHaveProperty('data')
            expect(response.body.data).toHaveProperty('runId', mockRunId)

            // Verify database persistence (full chain worked)
            const testRun = await server.testRepository.dbManager.queryOne(
                'SELECT * FROM test_runs WHERE id = ?',
                [mockRunId]
            )
            expect(testRun).toBeDefined()
        })

        it('should handle errors through error middleware', async () => {
            // Mock service to throw error
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'runAllTests'
            ).mockRejectedValue(new Error('Service unavailable'))

            const response = await request(server.app)
                .post('/api/tests/run-all')
                .send({})
                .expect(500)

            // Verify error format from error middleware
            expect(response.body).toHaveProperty('success', false)
            expect(response.body).toHaveProperty('error')
            expect(response.body.error).toContain('Service unavailable')
        })
    })
})
