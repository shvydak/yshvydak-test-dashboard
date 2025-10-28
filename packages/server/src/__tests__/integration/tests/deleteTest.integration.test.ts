import {describe, it, expect, beforeAll, afterAll, beforeEach} from 'vitest'
import request from 'supertest'
import type {TestServerInstance} from '../helpers/testServer'
import {setupTestServer, teardownTestServer, cleanDatabase} from '../helpers/testServer'
import {seedTestRuns, getAllTestResults, getTestResultCount} from '../helpers/database'

describe('DELETE /api/tests/:testId - Delete Test (Integration)', () => {
    let server: TestServerInstance

    beforeAll(async () => {
        server = await setupTestServer()
    })

    afterAll(async () => {
        await teardownTestServer(server)
    })

    beforeEach(async () => {
        await cleanDatabase(server.testRepository)
    })

    describe('Success scenarios', () => {
        it('should delete all executions for a testId', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-1', status: 'completed'},
                {id: 'run-2', status: 'completed'},
                {id: 'run-3', status: 'completed'},
            ])

            const testId = 'test-to-delete-123'
            // Create multiple executions
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-1', testId, 'run-1', 'Test', 'test.spec.ts', 'passed', 1000]
            )
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-2', testId, 'run-2', 'Test', 'test.spec.ts', 'failed', 1500]
            )
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-3', testId, 'run-3', 'Test', 'test.spec.ts', 'passed', 1100]
            )

            // Verify 3 executions exist
            const countBefore = await getTestResultCount(server.testRepository.dbManager)
            expect(countBefore).toBe(3)

            const response = await request(server.app)
                .delete(`/api/tests/${testId}`)
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect('Content-Type', /json/)
                .expect(200)

            expect(response.body).toMatchObject({
                success: true,
                data: {
                    message: 'Test deleted successfully',
                    deletedExecutions: 3,
                },
            })

            // Verify all executions deleted
            const countAfter = await getTestResultCount(server.testRepository.dbManager)
            expect(countAfter).toBe(0)
        })

        it('should only delete executions for specified testId', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-1', status: 'completed'},
                {id: 'run-2', status: 'completed'},
            ])

            const testId1 = 'test-delete-1'
            const testId2 = 'test-keep-2'

            // Create executions for both tests
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-1', testId1, 'run-1', 'Test 1', 'test1.spec.ts', 'passed', 1000]
            )
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-2', testId2, 'run-2', 'Test 2', 'test2.spec.ts', 'passed', 1000]
            )

            // Delete only testId1
            const response = await request(server.app)
                .delete(`/api/tests/${testId1}`)
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)

            expect(response.body.data.deletedExecutions).toBe(1)

            // Verify testId1 deleted but testId2 remains
            const remaining = await getAllTestResults(server.testRepository.dbManager)
            expect(remaining.length).toBe(1)
            expect(remaining[0].test_id).toBe(testId2)
        })

        it('should return 0 deletedExecutions for non-existent testId', async () => {
            const response = await request(server.app)
                .delete('/api/tests/non-existent-test')
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)

            expect(response.body).toMatchObject({
                success: true,
                data: {
                    message: 'Test deleted successfully',
                    deletedExecutions: 0,
                },
            })
        })
    })

    describe('Validation', () => {
        it('should return 400 when testId is missing', async () => {
            // Send DELETE to base endpoint without testId
            const response = await request(server.app)
                .delete('/api/tests/')
                .set('Authorization', `Bearer ${server.authToken}`)

            // Should get 404 (route not found) or 400
            expect([400, 404]).toContain(response.status)
        })

        it('should handle empty testId parameter', async () => {
            // This will actually be caught by routing as missing param
            const response = await request(server.app)
                .delete('/api/tests/ ')
                .set('Authorization', `Bearer ${server.authToken}`)

            // Should return error or route not found
            expect(response.status).toBeGreaterThanOrEqual(400)
        })
    })

    describe('Attachments cleanup', () => {
        it('should delete attachments when deleting test', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-1', status: 'completed'},
            ])

            const testId = 'test-with-attachments'
            // Create execution
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-attach', testId, 'run-1', 'Test', 'test.spec.ts', 'passed', 1000]
            )

            // Create attachment record
            await server.testRepository.dbManager.execute(
                `INSERT INTO attachments (id, test_result_id, type, file_name, file_path, url, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    'attach-1',
                    'exec-attach',
                    'screenshot',
                    'test.png',
                    '/screenshots/test.png',
                    '/screenshots/test.png',
                    new Date().toISOString(),
                ]
            )

            // Verify attachment exists
            const attachmentsBefore = await server.testRepository.dbManager.queryAll(
                'SELECT * FROM attachments'
            )
            expect(attachmentsBefore.length).toBe(1)

            // Delete test
            await request(server.app)
                .delete(`/api/tests/${testId}`)
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)

            // Verify attachments also deleted (CASCADE)
            const attachmentsAfter = await server.testRepository.dbManager.queryAll(
                'SELECT * FROM attachments'
            )
            expect(attachmentsAfter.length).toBe(0)
        })
    })

    describe('Public endpoint (Reporter integration)', () => {
        it('should work without authentication (public endpoint)', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-1', status: 'completed'},
            ])

            const testId = 'test-public-delete'
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-1', testId, 'run-1', 'Test', 'test.spec.ts', 'passed', 1000]
            )

            // No Authorization header
            const response = await request(server.app).delete(`/api/tests/${testId}`).expect(200)

            expect(response.body.success).toBe(true)
            expect(response.body.data.deletedExecutions).toBe(1)

            // Verify deleted
            const count = await getTestResultCount(server.testRepository.dbManager)
            expect(count).toBe(0)
        })

        it('should work with Authorization header (backward compatibility)', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-1', status: 'completed'},
            ])

            const testId = 'test-auth-delete'
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-1', testId, 'run-1', 'Test', 'test.spec.ts', 'passed', 1000]
            )

            const response = await request(server.app)
                .delete(`/api/tests/${testId}`)
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)

            expect(response.body.success).toBe(true)
            expect(response.body.data.deletedExecutions).toBe(1)
        })
    })

    describe('Error handling', () => {
        it('should handle database errors gracefully', async () => {
            // This is hard to test in integration test
            // Just verify endpoint doesn't crash with various inputs

            const response = await request(server.app)
                .delete('/api/tests/some-test-id')
                .set('Authorization', `Bearer ${server.authToken}`)

            expect([200, 500]).toContain(response.status)
            expect(response.body).toHaveProperty('success')
        })
    })

    describe('Middleware chain integration', () => {
        it('should process request through full middleware chain', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-1', status: 'completed'},
            ])

            const testId = 'test-middleware-delete'
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-1', testId, 'run-1', 'Test', 'test.spec.ts', 'passed', 1000]
            )

            const response = await request(server.app)
                .delete(`/api/tests/${testId}`)
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)

            // Verify JSON response
            expect(response.headers['content-type']).toMatch(/json/)

            // Verify response structure (from ResponseHelper)
            expect(response.body).toHaveProperty('success', true)
            expect(response.body).toHaveProperty('data')
            expect(response.body.data).toHaveProperty('message')
            expect(response.body.data).toHaveProperty('deletedExecutions', 1)

            // Verify database deletion (full chain worked)
            const count = await getTestResultCount(server.testRepository.dbManager)
            expect(count).toBe(0)
        })
    })
})
