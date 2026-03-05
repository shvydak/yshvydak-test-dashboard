import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import request from 'supertest'
import type {TestServerInstance} from '../helpers/testServer'
import {setupTestServer, teardownTestServer, cleanDatabase} from '../helpers/testServer'

describe('GET /api/tests/projects - Get Available Projects (Integration)', () => {
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

    describe('Success scenarios', () => {
        it('should return list of available projects', async () => {
            // Arrange — mock the internal --list command to include config.projects
            const mockListOutput = {
                config: {
                    projects: [
                        {id: 'proj-1', name: 'All_Tests'},
                        {id: 'proj-2', name: 'Sanity'},
                    ],
                },
                suites: [],
            }
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'executePlaywrightListCommand'
            ).mockResolvedValue(mockListOutput)

            // Act
            const response = await request(server.app)
                .get('/api/tests/projects')
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect('Content-Type', /json/)
                .expect(200)

            // Assert
            expect(response.body).toMatchObject({
                success: true,
                data: ['All_Tests', 'Sanity'],
            })
        })

        it('should return empty array when no projects configured', async () => {
            // Arrange
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'executePlaywrightListCommand'
            ).mockResolvedValue({suites: []})

            // Act
            const response = await request(server.app)
                .get('/api/tests/projects')
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)

            // Assert
            expect(response.body.success).toBe(true)
            expect(response.body.data).toEqual([])
        })

        it('should return empty array when Playwright command fails (graceful fallback)', async () => {
            // Arrange — simulate Playwright not installed
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'executePlaywrightListCommand'
            ).mockRejectedValue(new Error('Playwright not found'))

            // Act
            const response = await request(server.app)
                .get('/api/tests/projects')
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)

            // Assert — graceful empty array, not 500
            expect(response.body.success).toBe(true)
            expect(response.body.data).toEqual([])
        })
    })

    describe('Public access', () => {
        it('should be accessible without authentication token', async () => {
            // Arrange
            vi.spyOn(
                server.serviceContainer.playwrightService as any,
                'executePlaywrightListCommand'
            ).mockResolvedValue({config: {projects: [{id: 'p', name: 'All_Tests'}]}, suites: []})

            // Act & Assert — no Authorization header
            const response = await request(server.app).get('/api/tests/projects').expect(200)

            expect(response.body.success).toBe(true)
        })
    })
})
