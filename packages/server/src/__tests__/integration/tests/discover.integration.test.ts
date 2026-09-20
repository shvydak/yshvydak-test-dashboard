import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import request from 'supertest'
import type {TestServerInstance} from '../helpers/testServer'
import {setupTestServer, teardownTestServer, cleanDatabase} from '../helpers/testServer'
import {fixtures} from '../helpers/fixtures'
import {getAllTestResults, getTestResultCount} from '../helpers/database'

describe('POST /api/tests/discovery - Test Discovery (Integration)', () => {
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
    })

    describe('Success scenarios', () => {
        it('should discover tests and return correct count', async () => {
            // Mock Playwright service to return mock test data
            const mockDiscoverTests = vi
                .spyOn(
                    server.serviceContainer.playwrightService as any,
                    'executePlaywrightListCommand'
                )
                .mockResolvedValue(fixtures.playwrightListOutput)

            const response = await request(server.app)
                .post('/api/tests/discovery')
                .expect('Content-Type', /json/)
                .expect(200)

            expect(response.body).toMatchObject({
                success: true,
                data: {
                    discovered: 3, // 2 tests from auth.spec + 1 from dashboard.spec
                    saved: 3,
                    timestamp: expect.any(String),
                },
            })

            // Verify Playwright service was called
            expect(mockDiscoverTests).toHaveBeenCalledOnce()

            // Verify tests were saved to database
            const savedTests = await getAllTestResults(server.testRepository.dbManager)
            expect(savedTests.length).toBe(3)
            expect(savedTests.every((test) => test.status === 'pending')).toBe(true)
        })

        it('should clear existing pending tests before discovery', async () => {
            // Add some existing pending tests
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['old-1', 'test-old-1', null, 'Old Test 1', 'old.spec.ts', 'pending', 0]
            )
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['old-2', 'test-old-2', null, 'Old Test 2', 'old.spec.ts', 'pending', 0]
            )

            // Verify old pending tests exist
            let pendingCount = (await server.testRepository.dbManager.queryOne(
                'SELECT COUNT(*) as count FROM test_results WHERE status = ?',
                ['pending']
            )) as {count: number} | null
            expect(pendingCount?.count).toBe(2)

            // Mock discovery
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'executePlaywrightListCommand'
            ).mockResolvedValue(fixtures.playwrightListOutput)

            await request(server.app).post('/api/tests/discovery').expect(200)

            // Verify old pending tests were cleared and new ones added
            pendingCount = (await server.testRepository.dbManager.queryOne(
                'SELECT COUNT(*) as count FROM test_results WHERE status = ?',
                ['pending']
            )) as {count: number} | null
            expect(pendingCount?.count).toBe(3) // Only new discovered tests

            const savedTests = await getAllTestResults(server.testRepository.dbManager)
            expect(savedTests.every((test) => test.id !== 'old-1' && test.id !== 'old-2')).toBe(
                true
            )
        })

        it('should not clear non-pending tests during discovery', async () => {
            // Add completed test results
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_runs (id, status) VALUES (?, ?)`,
                ['run-completed', 'completed']
            )
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    'completed-1',
                    'test-comp-1',
                    'run-completed',
                    'Completed Test',
                    'completed.spec.ts',
                    'passed',
                    1000,
                ]
            )

            // Mock discovery
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'executePlaywrightListCommand'
            ).mockResolvedValue(fixtures.playwrightListOutput)

            await request(server.app).post('/api/tests/discovery').expect(200)

            // Verify completed test still exists
            const completedTest = await server.testRepository.dbManager.queryOne(
                'SELECT * FROM test_results WHERE id = ?',
                ['completed-1']
            )
            expect(completedTest).toBeDefined()
            expect(completedTest?.status).toBe('passed')
        })

        it('should handle empty test discovery', async () => {
            // Mock empty Playwright output
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'executePlaywrightListCommand'
            ).mockResolvedValue({
                suites: [],
            })

            const response = await request(server.app).post('/api/tests/discovery').expect(200)

            expect(response.body).toMatchObject({
                success: true,
                data: {
                    discovered: 0,
                    saved: 0,
                    timestamp: expect.any(String),
                },
            })

            const count = await getTestResultCount(server.testRepository.dbManager)
            expect(count).toBe(0)
        })
    })

    describe('Error handling', () => {
        it('should return 500 when Playwright discovery fails', async () => {
            // Mock Playwright failure
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'executePlaywrightListCommand'
            ).mockRejectedValue(new Error('Playwright not found'))

            const response = await request(server.app).post('/api/tests/discovery').expect(500)

            expect(response.body).toMatchObject({
                success: false,
                error: expect.stringContaining('Test discovery failed'),
                message: 'Test discovery failed',
            })

            // Verify no tests were saved
            const count = await getTestResultCount(server.testRepository.dbManager)
            expect(count).toBe(0)
        })

        it('should handle database errors gracefully', async () => {
            // Mock successful Playwright discovery
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'executePlaywrightListCommand'
            ).mockResolvedValue(fixtures.playwrightListOutput)

            // Mock database error by closing connection (simulate error)
            const mockSave = vi
                .spyOn(server.testRepository, 'saveTestResult')
                .mockRejectedValue(new Error('Database error'))

            const response = await request(server.app).post('/api/tests/discovery').expect(200)

            // Should still return success but with saved count = 0
            expect(response.body.success).toBe(true)
            expect(response.body.data.discovered).toBe(3)
            expect(response.body.data.saved).toBe(0) // None saved due to errors

            mockSave.mockRestore()
        })

        it('should handle malformed Playwright output', async () => {
            // Mock malformed Playwright output
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'executePlaywrightListCommand'
            ).mockResolvedValue({
                // Missing suites field
                invalid: true,
            })

            const response = await request(server.app).post('/api/tests/discovery').expect(200)

            // Should handle gracefully and return 0 discovered
            expect(response.body).toMatchObject({
                success: true,
                data: {
                    discovered: 0,
                    saved: 0,
                },
            })
        })
    })

    describe('Discover metadata round trip', () => {
        it('should return discovered metadata as an object with @-prefixed tags via GET /api/tests', async () => {
            // Real Playwright JSON output: tags come without the leading '@'
            const output = {
                suites: [
                    {
                        title: '',
                        file: 'tests/tagged.spec.ts',
                        line: 1,
                        column: 1,
                        specs: [
                            {
                                title: 'Tagged Test',
                                ok: true,
                                tags: ['sanity', 'ABC-123'],
                                tests: [
                                    {projectId: 'chromium', projectName: 'chromium', results: []},
                                ],
                                id: 'tagged-1',
                                file: 'tests/tagged.spec.ts',
                                line: 7,
                                column: 3,
                            },
                        ],
                        suites: [],
                    },
                ],
            }
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'executePlaywrightListCommand'
            ).mockResolvedValue(output)

            await request(server.app).post('/api/tests/discovery').expect(200)

            const response = await request(server.app)
                .get('/api/tests')
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)

            const [row] = response.body.data
            // A double-stringified value would come back here as a string
            expect(typeof row.metadata).toBe('object')
            expect(row.metadata).toMatchObject({
                line: 7,
                playwrightId: 'tagged-1',
                tags: ['@sanity', '@ABC-123'],
            })
            expect(row.metadata.discoveredAt).toBeDefined()
        })
    })

    describe('Rows without a project (Playwright config without named projects)', () => {
        const discoverUnnamed = async () => {
            // projectName '' (no named projects) -> rows are stored with project ''
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'executePlaywrightListCommand'
            ).mockResolvedValue(fixtures.playwrightListOutput)
            await request(server.app).post('/api/tests/discovery').expect(200)
        }
        const getListAndCounts = async () => {
            const list = await request(server.app)
                .get('/api/tests')
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)
            const counts = await request(server.app)
                .get('/api/tests/status-counts')
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)
            return {list: list.body.data, counts: counts.body.data}
        }

        it('are listed and counted while no named project exists', async () => {
            await discoverUnnamed()

            const stored = await getAllTestResults(server.testRepository.dbManager)
            expect(stored.length).toBe(3)
            expect(stored.every((row) => row.project === '')).toBe(true)

            const {list, counts} = await getListAndCounts()
            expect(list).toHaveLength(3)
            expect(counts).toMatchObject({total: 3, pending: 3})
        })

        it('are hidden from the list and the counts once a named-project row exists', async () => {
            await discoverUnnamed()
            await server.testRepository.dbManager.execute(
                `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration, project)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    'named-1',
                    'test-named-1',
                    null,
                    'Named',
                    'named.spec.ts',
                    'passed',
                    10,
                    'UI_Tests',
                ]
            )

            const {list, counts} = await getListAndCounts()

            expect(list.map((t: {name: string}) => t.name)).toEqual(['Named'])
            expect(counts).toMatchObject({total: 1, passed: 1, pending: 0})
        })
    })

    describe('Test ID generation consistency', () => {
        it('should generate consistent testId for same test', async () => {
            // Mock discovery with specific test
            const mockData = {
                suites: [
                    {
                        title: '',
                        file: 'tests/consistent.spec.ts',
                        line: 1,
                        column: 1,
                        specs: [
                            {
                                title: 'Consistent Test',
                                ok: true,
                                tags: [],
                                tests: [
                                    {
                                        timeout: 30000,
                                        annotations: [],
                                        expectedStatus: 'passed',
                                        projectId: '',
                                        projectName: '',
                                        results: [],
                                        status: 'skipped',
                                    },
                                ],
                                id: 'consistent-123',
                                file: 'tests/consistent.spec.ts',
                                line: 5,
                                column: 3,
                            },
                        ],
                        suites: [],
                    },
                ],
            }

            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'executePlaywrightListCommand'
            ).mockResolvedValue(mockData)

            // First discovery
            await request(server.app).post('/api/tests/discovery').expect(200)

            const firstDiscovery = await getAllTestResults(server.testRepository.dbManager)
            expect(firstDiscovery.length).toBe(1)
            const firstTestId = firstDiscovery[0].test_id

            // Clear and discover again
            await cleanDatabase(server.testRepository)
            await request(server.app).post('/api/tests/discovery').expect(200)

            const secondDiscovery = await getAllTestResults(server.testRepository.dbManager)
            expect(secondDiscovery.length).toBe(1)
            const secondTestId = secondDiscovery[0].test_id

            // TestId should be consistent across discoveries
            expect(secondTestId).toBe(firstTestId)
        })
    })

    describe('Public endpoint (Reporter integration)', () => {
        it('should work without authentication (public endpoint)', async () => {
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'executePlaywrightListCommand'
            ).mockResolvedValue(fixtures.playwrightListOutput)

            // No Authorization header
            const response = await request(server.app).post('/api/tests/discovery').expect(200)

            expect(response.body.success).toBe(true)
            expect(response.body.data.discovered).toBe(3)
        })

        it('should work with Authorization header (backward compatibility)', async () => {
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'executePlaywrightListCommand'
            ).mockResolvedValue(fixtures.playwrightListOutput)

            const response = await request(server.app)
                .post('/api/tests/discovery')
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)

            expect(response.body.success).toBe(true)
        })
    })
})
