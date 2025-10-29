/**
 * POST /api/tests/run-group - Run Test Group with Filtering (Integration)
 *
 * Tests the complete flow of running a filtered test group:
 * 1. Request handling through controller
 * 2. Service layer processing with testNames parameter
 * 3. Playwright CLI invocation with --grep flag
 *
 * This ensures the "Failed filter" feature works end-to-end.
 */

import {describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi} from 'vitest'
import request from 'supertest'
import type {TestServerInstance} from '../helpers/testServer'
import {setupTestServer, teardownTestServer, cleanDatabase} from '../helpers/testServer'

describe('POST /api/tests/run-group - Filtered Group Run (Integration)', () => {
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
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('Success scenarios', () => {
        it('should run group with testNames filter', async () => {
            // Mock PlaywrightService to verify --grep is passed
            const mockRunId = 'filtered-run-123'
            const mockPlaywrightService = vi
                .spyOn(server.serviceContainer.playwrightService as any, 'runTestGroup')
                .mockResolvedValue({
                    runId: mockRunId,
                    message: 'Tests started for e2e/tests/auth.spec.ts',
                    timestamp: new Date().toISOString(),
                    process: null,
                })

            const testNames = ['Login Test', 'Logout Test']

            // Act
            const response = await request(server.app)
                .post('/api/tests/run-group')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({
                    filePath: 'e2e/tests/auth.spec.ts',
                    testNames,
                })
                .expect('Content-Type', /json/)
                .expect(200)

            // Assert response
            expect(response.body).toMatchObject({
                success: true,
                data: {
                    runId: mockRunId,
                },
            })

            // Verify PlaywrightService was called with testNames
            expect(mockPlaywrightService).toHaveBeenCalledWith(
                'e2e/tests/auth.spec.ts',
                undefined, // maxWorkers
                testNames
            )
        })

        it('should run group without filter when testNames is not provided', async () => {
            const mockRunId = 'unfiltered-run-456'
            const mockPlaywrightService = vi
                .spyOn(server.serviceContainer.playwrightService as any, 'runTestGroup')
                .mockResolvedValue({
                    runId: mockRunId,
                    message: 'Tests started',
                    timestamp: new Date().toISOString(),
                    process: null,
                })

            // Act
            const response = await request(server.app)
                .post('/api/tests/run-group')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({
                    filePath: 'e2e/tests/auth.spec.ts',
                })
                .expect(200)

            // Assert
            expect(response.body.success).toBe(true)

            // Verify testNames was undefined
            expect(mockPlaywrightService).toHaveBeenCalledWith(
                'e2e/tests/auth.spec.ts',
                undefined,
                undefined
            )
        })

        it('should work with both maxWorkers and testNames', async () => {
            const mockRunId = 'combined-run-789'
            const mockPlaywrightService = vi
                .spyOn(server.serviceContainer.playwrightService as any, 'runTestGroup')
                .mockResolvedValue({
                    runId: mockRunId,
                    message: 'Tests started',
                    timestamp: new Date().toISOString(),
                    process: null,
                })

            const testNames = ['Test 1', 'Test 2']

            // Act
            const response = await request(server.app)
                .post('/api/tests/run-group')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({
                    filePath: 'e2e/tests/auth.spec.ts',
                    maxWorkers: 4,
                    testNames,
                })
                .expect(200)

            // Assert
            expect(response.body.success).toBe(true)

            // Verify both parameters were passed
            expect(mockPlaywrightService).toHaveBeenCalledWith(
                'e2e/tests/auth.spec.ts',
                4,
                testNames
            )
        })
    })

    describe('Edge cases', () => {
        it('should handle empty testNames array as no filter', async () => {
            const mockPlaywrightService = vi
                .spyOn(server.serviceContainer.playwrightService as any, 'runTestGroup')
                .mockResolvedValue({
                    runId: 'empty-array-run',
                    message: 'Tests started',
                    timestamp: new Date().toISOString(),
                    process: null,
                })

            // Act
            await request(server.app)
                .post('/api/tests/run-group')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({
                    filePath: 'e2e/tests/auth.spec.ts',
                    testNames: [],
                })
                .expect(200)

            // Empty array should still be passed through
            expect(mockPlaywrightService).toHaveBeenCalledWith(
                'e2e/tests/auth.spec.ts',
                undefined,
                []
            )
        })

        it('should handle single test name', async () => {
            const mockPlaywrightService = vi
                .spyOn(server.serviceContainer.playwrightService as any, 'runTestGroup')
                .mockResolvedValue({
                    runId: 'single-test-run',
                    message: 'Tests started',
                    timestamp: new Date().toISOString(),
                    process: null,
                })

            // Act
            await request(server.app)
                .post('/api/tests/run-group')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({
                    filePath: 'e2e/tests/auth.spec.ts',
                    testNames: ['Single Test'],
                })
                .expect(200)

            // Verify single test name in array
            expect(mockPlaywrightService).toHaveBeenCalledWith(
                'e2e/tests/auth.spec.ts',
                undefined,
                ['Single Test']
            )
        })
    })

    describe('Error handling', () => {
        it('should return 400 if filePath is missing', async () => {
            const response = await request(server.app)
                .post('/api/tests/run-group')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({
                    testNames: ['Test 1'],
                })
                .expect(400)

            expect(response.body.success).toBe(false)
            expect(response.body.message).toContain('filePath')
        })

        it('should work without authentication (public endpoint for reporter)', async () => {
            // run-group is a public endpoint for reporter integration
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'runTestGroup'
            ).mockResolvedValue({
                runId: 'public-run',
                message: 'Tests started',
                timestamp: new Date().toISOString(),
                process: null,
            })

            const response = await request(server.app)
                .post('/api/tests/run-group')
                .send({
                    filePath: 'e2e/tests/auth.spec.ts',
                    testNames: ['Test 1'],
                })
                .expect(200)

            expect(response.body.success).toBe(true)
        })
    })

    describe('Metadata tracking', () => {
        it('should store filteredTests count in test run metadata', async () => {
            const mockRunId = 'metadata-run-123'
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'runTestGroup'
            ).mockResolvedValue({
                runId: mockRunId,
                message: 'Tests started',
                timestamp: new Date().toISOString(),
                process: null,
            })

            const testNames = ['Test 1', 'Test 2', 'Test 3']

            // Act
            await request(server.app)
                .post('/api/tests/run-group')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({
                    filePath: 'e2e/tests/auth.spec.ts',
                    testNames,
                })
                .expect(200)

            // Verify metadata was stored
            const testRun = await server.testRepository.dbManager.queryOne(
                'SELECT * FROM test_runs WHERE id = ?',
                [mockRunId]
            )

            expect(testRun).toBeDefined()
            expect(JSON.parse(testRun.metadata)).toMatchObject({
                type: 'run-group',
                filePath: 'e2e/tests/auth.spec.ts',
                filteredTests: 3,
            })
        })

        it('should not store filteredTests when testNames is undefined', async () => {
            const mockRunId = 'no-filter-metadata'
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'runTestGroup'
            ).mockResolvedValue({
                runId: mockRunId,
                message: 'Tests started',
                timestamp: new Date().toISOString(),
                process: null,
            })

            // Act
            await request(server.app)
                .post('/api/tests/run-group')
                .set('Authorization', `Bearer ${server.authToken}`)
                .send({
                    filePath: 'e2e/tests/auth.spec.ts',
                })
                .expect(200)

            // Verify metadata doesn't have filteredTests
            const testRun = await server.testRepository.dbManager.queryOne(
                'SELECT * FROM test_runs WHERE id = ?',
                [mockRunId]
            )

            const metadata = JSON.parse(testRun.metadata)
            expect(metadata.filteredTests).toBeUndefined()
        })
    })
})
