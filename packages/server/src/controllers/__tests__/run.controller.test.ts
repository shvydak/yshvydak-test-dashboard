import {describe, it, expect, vi, beforeEach} from 'vitest'
import {RunController} from '../run.controller'
import type {Request, Response} from 'express'
import {ResponseHelper} from '../../utils/response.helper'
import {Logger} from '../../utils/logger.util'

// Mock dependencies
vi.mock('../../repositories/run.repository')
vi.mock('../../utils/response.helper')
vi.mock('../../utils/logger.util', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        success: vi.fn(),
    },
}))

describe('RunController', () => {
    let controller: RunController
    let mockRunRepository: any
    let mockReq: Partial<Request>
    let mockRes: Partial<Response>

    // Helper function to create mock request
    const createMockRequest = (overrides: Partial<Request> = {}): Request => {
        return {
            body: {},
            params: {},
            query: {},
            ...overrides,
        } as Request
    }

    // Helper function to create mock response
    const createMockResponse = (): Response => {
        const res: any = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            send: vi.fn().mockReturnThis(),
            setHeader: vi.fn().mockReturnThis(),
        }
        return res
    }

    beforeEach(() => {
        // Clear all mocks
        vi.clearAllMocks()

        // Setup mock repository
        mockRunRepository = {
            createTestRun: vi.fn(),
            updateTestRun: vi.fn(),
            getTestRun: vi.fn(),
            getAllTestRuns: vi.fn(),
            getStats: vi.fn(),
        }

        // Create controller instance
        controller = new RunController(mockRunRepository)

        // Setup default request and response
        mockReq = createMockRequest()
        mockRes = createMockResponse()

        // Setup ResponseHelper mocks with proper return values
        vi.mocked(ResponseHelper.success).mockImplementation((res: Response) => res)
        vi.mocked(ResponseHelper.badRequest).mockImplementation((res: Response) => res)
        vi.mocked(ResponseHelper.notFound).mockImplementation((res: Response) => res)
        vi.mocked(ResponseHelper.error).mockImplementation((res: Response) => res)
        vi.mocked(ResponseHelper.successData).mockImplementation((data: any, message?: string) => ({
            success: true,
            data,
            message,
            timestamp: new Date().toISOString(),
        }))
        vi.mocked(ResponseHelper.errorData).mockImplementation(
            (message: string, error?: string) => ({
                success: false,
                message,
                error,
                timestamp: new Date().toISOString(),
            })
        )
    })

    describe('createTestRun', () => {
        it('should create a test run successfully', async () => {
            // Arrange
            const runData = {
                id: 'run-123',
                status: 'running',
                totalTests: 10,
                passedTests: 5,
                failedTests: 2,
                skippedTests: 3,
                duration: 1000,
                metadata: {project: 'test-project'},
            }
            mockReq = createMockRequest({body: runData})
            mockRunRepository.createTestRun.mockResolvedValue('run-123')

            // Act
            await controller.createTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.createTestRun).toHaveBeenCalledWith(runData)
            expect(ResponseHelper.success).toHaveBeenCalledWith(
                mockRes,
                {id: 'run-123'},
                'Test run created successfully'
            )
            expect(Logger.success).toHaveBeenCalledWith('Test run created with ID: run-123')
        })

        it('should return 400 if id is missing', async () => {
            // Arrange
            mockReq = createMockRequest({
                body: {status: 'running', totalTests: 10},
            })

            // Act
            await controller.createTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.createTestRun).not.toHaveBeenCalled()
            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                mockRes,
                'Missing required fields: id, status, totalTests'
            )
        })

        it('should return 400 if status is missing', async () => {
            // Arrange
            mockReq = createMockRequest({
                body: {id: 'run-123', totalTests: 10},
            })

            // Act
            await controller.createTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.createTestRun).not.toHaveBeenCalled()
            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                mockRes,
                'Missing required fields: id, status, totalTests'
            )
        })

        it('should return 400 if totalTests is missing', async () => {
            // Arrange
            mockReq = createMockRequest({
                body: {id: 'run-123', status: 'running'},
            })

            // Act
            await controller.createTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.createTestRun).not.toHaveBeenCalled()
            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                mockRes,
                'Missing required fields: id, status, totalTests'
            )
        })

        it('should return 400 if totalTests is not a number', async () => {
            // Arrange
            mockReq = createMockRequest({
                body: {id: 'run-123', status: 'running', totalTests: 'invalid'},
            })

            // Act
            await controller.createTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.createTestRun).not.toHaveBeenCalled()
            expect(ResponseHelper.badRequest).toHaveBeenCalledWith(
                mockRes,
                'Missing required fields: id, status, totalTests'
            )
        })

        it('should use default values for optional fields', async () => {
            // Arrange
            const minimalRunData = {
                id: 'run-123',
                status: 'running',
                totalTests: 10,
            }
            mockReq = createMockRequest({body: minimalRunData})
            mockRunRepository.createTestRun.mockResolvedValue('run-123')

            // Act
            await controller.createTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.createTestRun).toHaveBeenCalledWith({
                id: 'run-123',
                status: 'running',
                totalTests: 10,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
                metadata: undefined,
            })
        })

        it('should handle repository errors', async () => {
            // Arrange
            const runData = {
                id: 'run-123',
                status: 'running',
                totalTests: 10,
            }
            mockReq = createMockRequest({body: runData})
            const error = new Error('Database error')
            mockRunRepository.createTestRun.mockRejectedValue(error)

            // Act
            await controller.createTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(Logger.error).toHaveBeenCalledWith('Error creating test run', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Database error',
                'Failed to create test run',
                500
            )
        })

        it('should handle unknown errors', async () => {
            // Arrange
            const runData = {
                id: 'run-123',
                status: 'running',
                totalTests: 10,
            }
            mockReq = createMockRequest({body: runData})
            mockRunRepository.createTestRun.mockRejectedValue('string error')

            // Act
            await controller.createTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Unknown error',
                'Failed to create test run',
                500
            )
        })
    })

    describe('updateTestRun', () => {
        it('should update a test run successfully', async () => {
            // Arrange
            const updates = {
                status: 'completed',
                passedTests: 8,
                failedTests: 2,
                duration: 5000,
            }
            mockReq = createMockRequest({
                params: {id: 'run-123'},
                body: updates,
            })
            mockRunRepository.updateTestRun.mockResolvedValue(undefined)

            // Act
            await controller.updateTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.updateTestRun).toHaveBeenCalledWith('run-123', updates)
            expect(ResponseHelper.success).toHaveBeenCalledWith(
                mockRes,
                {id: 'run-123'},
                'Test run updated successfully'
            )
            expect(Logger.success).toHaveBeenCalledWith('Test run updated: run-123')
        })

        it('should handle empty updates', async () => {
            // Arrange
            mockReq = createMockRequest({
                params: {id: 'run-123'},
                body: {},
            })
            mockRunRepository.updateTestRun.mockResolvedValue(undefined)

            // Act
            await controller.updateTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.updateTestRun).toHaveBeenCalledWith('run-123', {})
            expect(ResponseHelper.success).toHaveBeenCalled()
        })

        it('should handle partial updates', async () => {
            // Arrange
            const partialUpdate = {status: 'completed'}
            mockReq = createMockRequest({
                params: {id: 'run-123'},
                body: partialUpdate,
            })
            mockRunRepository.updateTestRun.mockResolvedValue(undefined)

            // Act
            await controller.updateTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.updateTestRun).toHaveBeenCalledWith('run-123', partialUpdate)
        })

        it('should handle repository errors', async () => {
            // Arrange
            mockReq = createMockRequest({
                params: {id: 'run-123'},
                body: {status: 'completed'},
            })
            const error = new Error('Database error')
            mockRunRepository.updateTestRun.mockRejectedValue(error)

            // Act
            await controller.updateTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(Logger.error).toHaveBeenCalledWith('Error updating test run', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Database error',
                'Failed to update test run',
                500
            )
        })

        it('should handle unknown errors', async () => {
            // Arrange
            mockReq = createMockRequest({
                params: {id: 'run-123'},
                body: {status: 'completed'},
            })
            mockRunRepository.updateTestRun.mockRejectedValue('string error')

            // Act
            await controller.updateTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Unknown error',
                'Failed to update test run',
                500
            )
        })
    })

    describe('getAllTestRuns', () => {
        it('should get all test runs with default limit', async () => {
            // Arrange
            const mockRuns = [
                {
                    id: 'run-1',
                    status: 'completed',
                    totalTests: 10,
                    passedTests: 8,
                    failedTests: 2,
                },
                {
                    id: 'run-2',
                    status: 'running',
                    totalTests: 5,
                    passedTests: 3,
                    failedTests: 0,
                },
            ]
            mockReq = createMockRequest({query: {}})
            mockRunRepository.getAllTestRuns.mockResolvedValue(mockRuns)

            // Act
            await controller.getAllTestRuns(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.getAllTestRuns).toHaveBeenCalledWith(50)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: mockRuns,
                    message: 'Found 2 runs',
                })
            )
        })

        it('should get all test runs with custom limit', async () => {
            // Arrange
            const mockRuns = [{id: 'run-1'}]
            mockReq = createMockRequest({query: {limit: '10'}})
            mockRunRepository.getAllTestRuns.mockResolvedValue(mockRuns)

            // Act
            await controller.getAllTestRuns(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.getAllTestRuns).toHaveBeenCalledWith(10)
        })

        it('should handle empty runs list', async () => {
            // Arrange
            mockReq = createMockRequest({query: {}})
            mockRunRepository.getAllTestRuns.mockResolvedValue([])

            // Act
            await controller.getAllTestRuns(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: [],
                    message: 'Found 0 runs',
                })
            )
        })

        it('should ignore status query parameter', async () => {
            // Arrange
            mockReq = createMockRequest({query: {status: 'completed', limit: '20'}})
            mockRunRepository.getAllTestRuns.mockResolvedValue([])

            // Act
            await controller.getAllTestRuns(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.getAllTestRuns).toHaveBeenCalledWith(20)
        })

        it('should handle repository errors', async () => {
            // Arrange
            mockReq = createMockRequest({query: {}})
            const error = new Error('Database error')
            mockRunRepository.getAllTestRuns.mockRejectedValue(error)

            // Act
            await controller.getAllTestRuns(mockReq as Request, mockRes as Response)

            // Assert
            expect(Logger.error).toHaveBeenCalledWith('Error fetching runs', error)
            expect(mockRes.status).toHaveBeenCalledWith(500)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Failed to fetch runs',
                    error: 'Database error',
                })
            )
        })

        it('should handle unknown errors', async () => {
            // Arrange
            mockReq = createMockRequest({query: {}})
            mockRunRepository.getAllTestRuns.mockRejectedValue('string error')

            // Act
            await controller.getAllTestRuns(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Failed to fetch runs',
                    error: 'Unknown error',
                })
            )
        })
    })

    describe('getStats', () => {
        it('should get stats with success rate', async () => {
            // Arrange
            const mockStats = {
                total_runs: 10,
                total_tests: 100,
                total_passed: 80,
                total_failed: 15,
                total_skipped: 5,
            }
            const mockRecentRuns = [
                {id: 'run-1', status: 'completed'},
                {id: 'run-2', status: 'completed'},
            ]
            mockReq = createMockRequest({query: {}})
            mockRunRepository.getStats.mockResolvedValue(mockStats)
            mockRunRepository.getAllTestRuns.mockResolvedValue(mockRecentRuns)

            // Act
            await controller.getStats(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.getStats).toHaveBeenCalled()
            expect(mockRunRepository.getAllTestRuns).toHaveBeenCalledWith(5)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: {
                        ...mockStats,
                        success_rate: 80.0,
                        recent_runs: mockRecentRuns,
                    },
                    message: undefined,
                })
            )
        })

        it('should calculate success rate correctly', async () => {
            // Arrange
            const mockStats = {
                total_runs: 5,
                total_tests: 50,
                total_passed: 45,
                total_failed: 5,
                total_skipped: 0,
            }
            mockReq = createMockRequest({query: {}})
            mockRunRepository.getStats.mockResolvedValue(mockStats)
            mockRunRepository.getAllTestRuns.mockResolvedValue([])

            // Act
            await controller.getStats(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        success_rate: 90.0,
                    }),
                })
            )
        })

        it('should handle zero total tests', async () => {
            // Arrange
            const mockStats = {
                total_runs: 0,
                total_tests: 0,
                total_passed: 0,
                total_failed: 0,
                total_skipped: 0,
            }
            mockReq = createMockRequest({query: {}})
            mockRunRepository.getStats.mockResolvedValue(mockStats)
            mockRunRepository.getAllTestRuns.mockResolvedValue([])

            // Act
            await controller.getStats(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        success_rate: 0,
                    }),
                })
            )
        })

        it('should handle empty recent runs', async () => {
            // Arrange
            const mockStats = {
                total_runs: 10,
                total_tests: 100,
                total_passed: 80,
                total_failed: 20,
                total_skipped: 0,
            }
            mockReq = createMockRequest({query: {}})
            mockRunRepository.getStats.mockResolvedValue(mockStats)
            mockRunRepository.getAllTestRuns.mockResolvedValue([])

            // Act
            await controller.getStats(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        recent_runs: [],
                    }),
                })
            )
        })

        it('should handle repository errors', async () => {
            // Arrange
            mockReq = createMockRequest({query: {}})
            const error = new Error('Database error')
            mockRunRepository.getStats.mockRejectedValue(error)

            // Act
            await controller.getStats(mockReq as Request, mockRes as Response)

            // Assert
            expect(Logger.error).toHaveBeenCalledWith('Error fetching stats', error)
            expect(mockRes.status).toHaveBeenCalledWith(500)
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Failed to fetch stats',
                    error: 'Database error',
                })
            )
        })

        it('should handle unknown errors', async () => {
            // Arrange
            mockReq = createMockRequest({query: {}})
            mockRunRepository.getStats.mockRejectedValue('string error')

            // Act
            await controller.getStats(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Failed to fetch stats',
                    error: 'Unknown error',
                })
            )
        })
    })

    describe('getTestRun', () => {
        it('should get a test run by id', async () => {
            // Arrange
            const mockRun = {
                id: 'run-123',
                status: 'completed',
                totalTests: 10,
                passedTests: 8,
                failedTests: 2,
                skippedTests: 0,
                duration: 5000,
            }
            mockReq = createMockRequest({params: {id: 'run-123'}})
            mockRunRepository.getTestRun.mockResolvedValue(mockRun)

            // Act
            await controller.getTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.getTestRun).toHaveBeenCalledWith('run-123')
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, mockRun)
        })

        it('should return 404 if test run not found', async () => {
            // Arrange
            mockReq = createMockRequest({params: {id: 'non-existent'}})
            mockRunRepository.getTestRun.mockResolvedValue(null)

            // Act
            await controller.getTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.getTestRun).toHaveBeenCalledWith('non-existent')
            expect(ResponseHelper.notFound).toHaveBeenCalledWith(mockRes, 'Test run')
        })

        it('should return 404 if test run is undefined', async () => {
            // Arrange
            mockReq = createMockRequest({params: {id: 'undefined-run'}})
            mockRunRepository.getTestRun.mockResolvedValue(undefined)

            // Act
            await controller.getTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(ResponseHelper.notFound).toHaveBeenCalledWith(mockRes, 'Test run')
        })

        it('should handle repository errors', async () => {
            // Arrange
            mockReq = createMockRequest({params: {id: 'run-123'}})
            const error = new Error('Database error')
            mockRunRepository.getTestRun.mockRejectedValue(error)

            // Act
            await controller.getTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(Logger.error).toHaveBeenCalledWith('Error fetching test run', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Database error',
                'Failed to fetch test run',
                500
            )
        })

        it('should handle unknown errors', async () => {
            // Arrange
            mockReq = createMockRequest({params: {id: 'run-123'}})
            mockRunRepository.getTestRun.mockRejectedValue('string error')

            // Act
            await controller.getTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Unknown error',
                'Failed to fetch test run',
                500
            )
        })
    })

    describe('Edge Cases', () => {
        it('should handle long run IDs', async () => {
            // Arrange
            const longId = 'a'.repeat(500)
            const runData = {
                id: longId,
                status: 'running',
                totalTests: 10,
            }
            mockReq = createMockRequest({body: runData})
            mockRunRepository.createTestRun.mockResolvedValue(longId)

            // Act
            await controller.createTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.createTestRun).toHaveBeenCalledWith(
                expect.objectContaining({id: longId})
            )
        })

        it('should handle special characters in run IDs', async () => {
            // Arrange
            const specialId = 'run-123-@#$%'
            const runData = {
                id: specialId,
                status: 'running',
                totalTests: 10,
            }
            mockReq = createMockRequest({body: runData})
            mockRunRepository.createTestRun.mockResolvedValue(specialId)

            // Act
            await controller.createTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.createTestRun).toHaveBeenCalled()
        })

        it('should handle very large test counts', async () => {
            // Arrange
            const runData = {
                id: 'run-123',
                status: 'running',
                totalTests: 999999,
                passedTests: 500000,
                failedTests: 499999,
            }
            mockReq = createMockRequest({body: runData})
            mockRunRepository.createTestRun.mockResolvedValue('run-123')

            // Act
            await controller.createTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.createTestRun).toHaveBeenCalledWith({
                ...runData,
                skippedTests: 0,
                duration: 0,
                metadata: undefined,
            })
        })

        it('should handle very large limit values', async () => {
            // Arrange
            mockReq = createMockRequest({query: {limit: '999999'}})
            mockRunRepository.getAllTestRuns.mockResolvedValue([])

            // Act
            await controller.getAllTestRuns(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.getAllTestRuns).toHaveBeenCalledWith(999999)
        })

        it('should handle invalid limit values', async () => {
            // Arrange
            mockReq = createMockRequest({query: {limit: 'invalid'}})
            mockRunRepository.getAllTestRuns.mockResolvedValue([])

            // Act
            await controller.getAllTestRuns(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.getAllTestRuns).toHaveBeenCalledWith(NaN)
        })

        it('should handle success rate with decimal precision', async () => {
            // Arrange
            const mockStats = {
                total_runs: 3,
                total_tests: 3,
                total_passed: 2,
                total_failed: 1,
                total_skipped: 0,
            }
            mockReq = createMockRequest({query: {}})
            mockRunRepository.getStats.mockResolvedValue(mockStats)
            mockRunRepository.getAllTestRuns.mockResolvedValue([])

            // Act
            await controller.getStats(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        success_rate: 66.7,
                    }),
                })
            )
        })

        it('should handle metadata with nested objects', async () => {
            // Arrange
            const complexMetadata = {
                project: 'test',
                environment: {
                    os: 'linux',
                    node: '20.x',
                    browser: {
                        name: 'chromium',
                        version: '120.0',
                    },
                },
                tags: ['smoke', 'regression'],
            }
            const runData = {
                id: 'run-123',
                status: 'running',
                totalTests: 10,
                metadata: complexMetadata,
            }
            mockReq = createMockRequest({body: runData})
            mockRunRepository.createTestRun.mockResolvedValue('run-123')

            // Act
            await controller.createTestRun(mockReq as Request, mockRes as Response)

            // Assert
            expect(mockRunRepository.createTestRun).toHaveBeenCalledWith(
                expect.objectContaining({metadata: complexMetadata})
            )
        })
    })
})
