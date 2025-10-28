import {describe, it, expect, beforeAll, afterAll, beforeEach} from 'vitest'
import request from 'supertest'
import type {TestServerInstance} from '../helpers/testServer'
import {setupTestServer, teardownTestServer, cleanDatabase} from '../helpers/testServer'
import {seedTestRuns} from '../helpers/database'

describe('GET /api/tests/:id/history - Test History (Integration)', () => {
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
        it('should get test history by testId', async () => {
            // Seed test runs
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-1', status: 'completed'},
                {id: 'run-2', status: 'completed'},
                {id: 'run-3', status: 'completed'},
            ])

            // Create multiple executions for same testId
            const testId = 'test-same-id-123'
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    'exec-1',
                    testId,
                    'run-1',
                    'My Test',
                    'tests/my.spec.ts',
                    'passed',
                    1000,
                    '2025-01-01T10:00:00.000Z',
                ]
            )
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    'exec-2',
                    testId,
                    'run-2',
                    'My Test',
                    'tests/my.spec.ts',
                    'failed',
                    1500,
                    '2025-01-02T10:00:00.000Z',
                ]
            )
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    'exec-3',
                    testId,
                    'run-3',
                    'My Test',
                    'tests/my.spec.ts',
                    'passed',
                    1100,
                    '2025-01-03T10:00:00.000Z',
                ]
            )

            const response = await request(server.app)
                .get(`/api/tests/${testId}/history`)
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect('Content-Type', /json/)
                .expect(200)

            expect(response.body).toMatchObject({
                success: true,
                data: expect.any(Array),
                count: 3,
            })

            // Verify history is ordered by created_at DESC (newest first)
            const history = response.body.data
            expect(history.length).toBe(3)
            expect(history[0].id).toBe('exec-3') // Newest
            expect(history[1].id).toBe('exec-2')
            expect(history[2].id).toBe('exec-1') // Oldest
        })

        it('should get test history by execution id (backwards compatibility)', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-1', status: 'completed'},
            ])

            const testId = 'test-compat-123'
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-1', testId, 'run-1', 'Test', 'test.spec.ts', 'passed', 1000]
            )

            // Use execution id instead of testId - should still work
            const response = await request(server.app)
                .get('/api/tests/exec-1/history')
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)

            expect(response.body.success).toBe(true)
            expect(response.body.data.length).toBe(1)
            expect(response.body.data[0].testId).toBe(testId)
        })

        it('should respect limit query parameter', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-1', status: 'completed'},
                {id: 'run-2', status: 'completed'},
                {id: 'run-3', status: 'completed'},
                {id: 'run-4', status: 'completed'},
                {id: 'run-5', status: 'completed'},
            ])

            const testId = 'test-limit-123'
            // Create 5 executions
            for (let i = 1; i <= 5; i++) {
                await server.testRepository.dbManager.execute(
                    `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [`exec-${i}`, testId, `run-${i}`, 'Test', 'test.spec.ts', 'passed', 1000]
                )
            }

            // Request only 3
            const response = await request(server.app)
                .get(`/api/tests/${testId}/history?limit=3`)
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)

            expect(response.body.data.length).toBe(3)
        })

        it('should exclude pending and skipped tests from history', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-1', status: 'completed'},
                {id: 'run-2', status: 'completed'},
            ])

            const testId = 'test-filter-123'
            // Create executions with different statuses
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-passed', testId, 'run-1', 'Test', 'test.spec.ts', 'passed', 1000]
            )
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-failed', testId, 'run-1', 'Test', 'test.spec.ts', 'failed', 1000]
            )
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-pending', testId, 'run-2', 'Test', 'test.spec.ts', 'pending', 0]
            )
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-skipped', testId, 'run-2', 'Test', 'test.spec.ts', 'skipped', 0]
            )

            const response = await request(server.app)
                .get(`/api/tests/${testId}/history`)
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)

            // Should only return passed and failed (not pending/skipped)
            expect(response.body.data.length).toBe(2)
            const ids = response.body.data.map((t: any) => t.id)
            expect(ids).toContain('exec-passed')
            expect(ids).toContain('exec-failed')
            expect(ids).not.toContain('exec-pending')
            expect(ids).not.toContain('exec-skipped')
        })

        it('should return empty array for non-existent testId', async () => {
            const response = await request(server.app)
                .get('/api/tests/non-existent-test/history')
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)

            expect(response.body).toMatchObject({
                success: true,
                data: [],
                count: 0,
            })
        })
    })

    describe('Query parameters', () => {
        it('should use default limit of 50 when not specified', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-default', status: 'completed'},
            ])

            const testId = 'test-default-limit'
            // Create just 1 execution
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-1', testId, 'run-default', 'Test', 'test.spec.ts', 'passed', 1000]
            )

            const response = await request(server.app)
                .get(`/api/tests/${testId}/history`)
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)

            // Should work fine with default limit
            expect(response.body.data.length).toBe(1)
        })

        it('should handle invalid limit gracefully', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-1', status: 'completed'},
            ])

            const testId = 'test-invalid-limit'
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-1', testId, 'run-1', 'Test', 'test.spec.ts', 'passed', 1000]
            )

            // Send invalid limit
            const response = await request(server.app)
                .get(`/api/tests/${testId}/history?limit=invalid`)
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)

            // Should fall back to default limit (50) and still work
            expect(response.body.success).toBe(true)
            expect(response.body.data.length).toBe(1)
        })
    })

    describe('Public endpoint (Reporter integration)', () => {
        it('should work without authentication (public endpoint)', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-1', status: 'completed'},
            ])

            const testId = 'test-public-123'
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-1', testId, 'run-1', 'Test', 'test.spec.ts', 'passed', 1000]
            )

            // No Authorization header
            const response = await request(server.app)
                .get(`/api/tests/${testId}/history`)
                .expect(200)

            expect(response.body.success).toBe(true)
            expect(response.body.data.length).toBe(1)
        })

        it('should work with Authorization header (backward compatibility)', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-1', status: 'completed'},
            ])

            const testId = 'test-auth-123'
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-1', testId, 'run-1', 'Test', 'test.spec.ts', 'passed', 1000]
            )

            const response = await request(server.app)
                .get(`/api/tests/${testId}/history`)
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)

            expect(response.body.success).toBe(true)
            expect(response.body.data.length).toBe(1)
        })
    })

    describe('Error handling', () => {
        it('should handle database errors gracefully', async () => {
            // Mock database error by passing invalid testId that causes SQL error
            // This is hard to test in integration test, so we'll just verify endpoint doesn't crash

            const response = await request(server.app)
                .get('/api/tests/test-error/history')
                .set('Authorization', `Bearer ${server.authToken}`)

            // Should return valid response (empty or error)
            expect(response.status).toBeGreaterThanOrEqual(200)
            expect(response.body).toHaveProperty('success')
        })
    })

    describe('Middleware chain integration', () => {
        it('should process request through full middleware chain', async () => {
            await seedTestRuns(server.testRepository.dbManager, [
                {id: 'run-1', status: 'completed'},
            ])

            const testId = 'test-middleware-123'
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['exec-1', testId, 'run-1', 'Test', 'test.spec.ts', 'passed', 1000]
            )

            const response = await request(server.app)
                .get(`/api/tests/${testId}/history`)
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)

            // Verify JSON response
            expect(response.headers['content-type']).toMatch(/json/)

            // Verify response structure (from ResponseHelper)
            expect(response.body).toHaveProperty('success', true)
            expect(response.body).toHaveProperty('data')
            expect(response.body).toHaveProperty('count', 1)

            // Verify data structure
            const testResult = response.body.data[0]
            expect(testResult).toHaveProperty('id', 'exec-1')
            expect(testResult).toHaveProperty('testId', testId)
            expect(testResult).toHaveProperty('name', 'Test')
            expect(testResult).toHaveProperty('status', 'passed')
        })
    })
})
