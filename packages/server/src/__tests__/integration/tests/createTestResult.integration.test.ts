import {describe, it, expect, beforeAll, afterAll, beforeEach} from 'vitest'
import request from 'supertest'
import type {TestServerInstance} from '../helpers/testServer'
import {setupTestServer, teardownTestServer, cleanDatabase} from '../helpers/testServer'
import {fixtures} from '../helpers/fixtures'
import {getAllTestResults, getTestResultCount, seedTestRuns} from '../helpers/database'

describe('POST /api/tests - Create Test Result (Integration)', () => {
    let server: TestServerInstance

    beforeAll(async () => {
        server = await setupTestServer()
    })

    afterAll(async () => {
        await teardownTestServer(server)
    })

    beforeEach(async () => {
        await cleanDatabase(server.testRepository)

        // Create test runs for foreign key constraints
        await seedTestRuns(server.testRepository.dbManager, [
            {id: 'run-789', status: 'running'},
            {id: 'run-minimal', status: 'running'},
            {id: 'run-001', status: 'completed'},
            {id: 'run-002', status: 'completed'},
            {id: 'run-003', status: 'completed'},
        ])
    })

    describe('Success scenarios', () => {
        it('should save test result with all fields and return 200', async () => {
            const testData = fixtures.validTestResult

            const response = await request(server.app)
                .post('/api/tests')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send(testData)
                .expect('Content-Type', /json/)
                .expect(200)

            // Verify response structure
            expect(response.body).toMatchObject({
                success: true,
                data: {id: testData.id},
                message: 'Test result saved successfully',
            })

            // Verify database insertion
            const savedTests = await getAllTestResults(server.testRepository.dbManager)
            expect(savedTests.length).toBe(1)

            const savedTest = savedTests[0]
            expect(savedTest.id).toBe(testData.id)
            expect(savedTest.test_id).toBe(testData.testId)
            expect(savedTest.run_id).toBe(testData.runId)
            expect(savedTest.name).toBe(testData.name)
            expect(savedTest.file_path).toBe(testData.filePath)
            expect(savedTest.status).toBe(testData.status)
            expect(savedTest.duration).toBe(testData.duration)
            expect(savedTest.retry_count).toBe(testData.retryCount)
        })

        it('should save test result with minimal fields', async () => {
            const testData = fixtures.minimalTestResult

            const response = await request(server.app)
                .post('/api/tests')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send(testData)
                .expect(200)

            expect(response.body.success).toBe(true)
            expect(response.body.data.id).toBe(testData.id)

            // Verify database uses values from fixture
            const savedTests = await getAllTestResults(server.testRepository.dbManager)
            expect(savedTests.length).toBe(1)
            expect(savedTests[0].status).toBe('passed')
            expect(savedTests[0].duration).toBe(0)
            expect(savedTests[0].retry_count).toBe(0)
            expect(savedTests[0].file_path).toBe('')
        })

        it('should save failed test with error details', async () => {
            const testData = fixtures.failedTestResult

            const response = await request(server.app)
                .post('/api/tests')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send(testData)
                .expect(200)

            expect(response.body.success).toBe(true)

            const savedTests = await getAllTestResults(server.testRepository.dbManager)
            expect(savedTests.length).toBe(1)
            expect(savedTests[0].status).toBe('failed')
            expect(savedTests[0].error_message).toBe(testData.errorMessage)
            expect(savedTests[0].error_stack).toBe(testData.errorStack)
            expect(savedTests[0].retry_count).toBe(2)
        })
    })

    describe('Validation errors', () => {
        it('should return 400 when missing id field', async () => {
            const response = await request(server.app)
                .post('/api/tests')
                .send(fixtures.invalidTestResults.missingId)
                .expect(400)

            expect(response.body.success).toBe(false)
            expect(response.body.message || response.body.error).toContain(
                'Missing required fields'
            )

            // Verify nothing saved to database
            const count = await getTestResultCount(server.testRepository.dbManager)
            expect(count).toBe(0)
        })

        it('should return 400 when missing testId field', async () => {
            const response = await request(server.app)
                .post('/api/tests')
                .send(fixtures.invalidTestResults.missingTestId)
                .expect(400)

            expect(response.body.success).toBe(false)
            expect(response.body.message || response.body.error).toContain(
                'Missing required fields'
            )
        })

        it('should return 400 when missing runId field', async () => {
            const response = await request(server.app)
                .post('/api/tests')
                .send(fixtures.invalidTestResults.missingRunId)
                .expect(400)

            expect(response.body.success).toBe(false)
            expect(response.body.message || response.body.error).toContain(
                'Missing required fields'
            )
        })

        it('should return 400 when missing name field', async () => {
            const response = await request(server.app)
                .post('/api/tests')
                .send(fixtures.invalidTestResults.missingName)
                .expect(400)

            expect(response.body.success).toBe(false)
        })

        it('should return 400 when sending empty object', async () => {
            const response = await request(server.app).post('/api/tests').send({}).expect(400)

            expect(response.body.success).toBe(false)
            expect(response.body.message || response.body.error).toContain(
                'Missing required fields'
            )
        })
    })

    describe('Public endpoint (Reporter integration)', () => {
        it('should accept requests without Authorization header (public endpoint)', async () => {
            // /api/tests is public for reporter integration - no auth required
            const response = await request(server.app)
                .post('/api/tests')
                .send(fixtures.validTestResult)
                .expect(200)

            expect(response.body.success).toBe(true)
            expect(response.body.data.id).toBe(fixtures.validTestResult.id)

            const count = await getTestResultCount(server.testRepository.dbManager)
            expect(count).toBe(1)
        })

        it('should work with Authorization header (backward compatibility)', async () => {
            const response = await request(server.app)
                .post('/api/tests')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send(fixtures.failedTestResult)
                .expect(200)

            expect(response.body.success).toBe(true)

            const count = await getTestResultCount(server.testRepository.dbManager)
            expect(count).toBe(1)
        })

        it('should accept requests with any Authorization format (ignored)', async () => {
            const response = await request(server.app)
                .post('/api/tests')
                .set('Authorization', 'InvalidFormat')
                .send(fixtures.minimalTestResult)
                .expect(200)

            expect(response.body.success).toBe(true)
        })
    })

    describe('INSERT-only strategy (Historical Tracking)', () => {
        it('should create new record for same testId (not update)', async () => {
            const baseData = {
                testId: 'test-same-id',
                runId: 'run-001',
                name: 'Same Test Different Executions',
                filePath: 'tests/same.spec.ts',
            }

            // First execution - passed
            await request(server.app)
                .post('/api/tests')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({
                    ...baseData,
                    id: 'result-execution-1',
                    status: 'passed',
                    duration: 1000,
                })
                .expect(200)

            // Second execution - failed
            await request(server.app)
                .post('/api/tests')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({
                    ...baseData,
                    id: 'result-execution-2',
                    status: 'failed',
                    duration: 1500,
                    runId: 'run-002',
                })
                .expect(200)

            // Third execution - passed
            await request(server.app)
                .post('/api/tests')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({
                    ...baseData,
                    id: 'result-execution-3',
                    status: 'passed',
                    duration: 1100,
                    runId: 'run-003',
                })
                .expect(200)

            // Verify all 3 records exist in database
            const allResults = await server.testRepository.dbManager.queryAll(
                'SELECT * FROM test_results WHERE test_id = ? ORDER BY created_at ASC',
                ['test-same-id']
            )

            expect(allResults.length).toBe(3)
            expect(allResults[0].id).toBe('result-execution-1')
            expect(allResults[0].status).toBe('passed')
            expect(allResults[1].id).toBe('result-execution-2')
            expect(allResults[1].status).toBe('failed')
            expect(allResults[2].id).toBe('result-execution-3')
            expect(allResults[2].status).toBe('passed')
        })

        it('should maintain independent execution data', async () => {
            const testData1 = {
                id: 'result-1',
                testId: 'test-independent',
                runId: 'run-001',
                name: 'Test',
                duration: 1000,
                status: 'passed',
            }

            const testData2 = {
                id: 'result-2',
                testId: 'test-independent',
                runId: 'run-002',
                name: 'Test',
                duration: 2000,
                status: 'failed',
                errorMessage: 'Timeout exceeded',
            }

            await request(server.app)
                .post('/api/tests')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send(testData1)
                .expect(200)

            await request(server.app)
                .post('/api/tests')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send(testData2)
                .expect(200)

            // Verify first execution data unchanged
            const result1 = await server.testRepository.dbManager.queryOne(
                'SELECT * FROM test_results WHERE id = ?',
                ['result-1']
            )
            expect(result1?.duration).toBe(1000)
            expect(result1?.status).toBe('passed')
            expect(result1?.error_message).toBeNull()

            // Verify second execution has different data
            const result2 = await server.testRepository.dbManager.queryOne(
                'SELECT * FROM test_results WHERE id = ?',
                ['result-2']
            )
            expect(result2?.duration).toBe(2000)
            expect(result2?.status).toBe('failed')
            expect(result2?.error_message).toBe('Timeout exceeded')
        })
    })

    describe('Middleware chain integration', () => {
        it('should process request through full middleware chain', async () => {
            // This test verifies:
            // 1. CORS middleware allows request
            // 2. JSON parsing middleware parses body
            // 3. Auth middleware validates JWT
            // 4. Service injection middleware provides services
            // 5. Controller processes request
            // 6. Service layer executes business logic
            // 7. Repository layer saves to database
            // 8. Response helper formats response

            const response = await request(server.app)
                .post('/api/tests')
                .set('Authorization', `Bearer ${server.authToken}`)
                .set('Content-Type', 'application/json')
                .send(fixtures.validTestResult)
                .expect(200)

            // Verify JSON response
            expect(response.headers['content-type']).toMatch(/json/)

            // Verify response structure (from ResponseHelper)
            expect(response.body).toHaveProperty('success', true)
            expect(response.body).toHaveProperty('data')
            expect(response.body).toHaveProperty('message')

            // Verify database persistence (full chain worked)
            const count = await getTestResultCount(server.testRepository.dbManager)
            expect(count).toBe(1)
        })

        it('should handle errors through error middleware', async () => {
            // Send invalid data to trigger error
            const response = await request(server.app)
                .post('/api/tests')
                .send({invalid: 'data'})
                .expect(400)

            // Verify error format from error middleware
            expect(response.body).toHaveProperty('success', false)
            expect(response.body).toHaveProperty('error')
            expect(response.body.error || response.body.message).toBeDefined()
        })
    })
})
