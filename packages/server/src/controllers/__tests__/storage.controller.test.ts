/**
 * StorageController Tests
 *
 * These tests verify the storage controller HTTP endpoint functionality.
 * This is IMPORTANT because:
 * 1. Ensures proper HTTP response formatting
 * 2. Validates error handling and status codes
 * 3. Tests integration with StorageService
 * 4. Verifies request/response flow
 *
 * Coverage target: 80%+
 */

import {describe, it, expect, vi, beforeEach} from 'vitest'
import {StorageController} from '../storage.controller'
import type {ServiceRequest} from '../../types/api.types'
import type {Response} from 'express'
import {ResponseHelper} from '../../utils/response.helper'
import {Logger} from '../../utils/logger.util'
import {StorageStats} from '../../repositories/storage.repository'

// Mock all dependencies
vi.mock('../../services/storage.service')
vi.mock('../../utils/response.helper')
vi.mock('../../utils/logger.util', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
}))

describe('StorageController', () => {
    let controller: StorageController
    let mockStorageService: any
    let mockReq: Partial<ServiceRequest>
    let mockRes: Partial<Response>

    const mockStats: StorageStats = {
        database: {
            size: 1024 * 1024,
            totalRuns: 10,
            totalResults: 100,
            totalAttachments: 50,
        },
        attachments: {
            totalSize: 5 * 1024 * 1024,
            totalFiles: 50,
            testDirectories: 25,
            typeBreakdown: {
                video: {count: 20, size: 3 * 1024 * 1024},
                screenshot: {count: 20, size: 1 * 1024 * 1024},
                trace: {count: 10, size: 1 * 1024 * 1024},
                log: {count: 0, size: 0},
                other: {count: 0, size: 0},
            },
        },
        total: {
            size: 6 * 1024 * 1024,
            averageSizePerTest: 60 * 1024,
        },
    }

    // Helper function to create mock request
    const createMockRequest = (overrides: Partial<ServiceRequest> = {}): ServiceRequest => {
        return {
            body: {},
            params: {},
            query: {},
            ...overrides,
        } as ServiceRequest
    }

    // Helper function to create mock response
    const createMockResponse = (): Response => {
        const res: any = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        }
        return res as Response
    }

    beforeEach(() => {
        // Create mock service
        mockStorageService = {
            getStorageStats: vi.fn(),
        }

        // Create controller with mocked service
        controller = new StorageController(mockStorageService)

        // Create mock request and response
        mockReq = createMockRequest()
        mockRes = createMockResponse()

        // Clear all mocks
        vi.clearAllMocks()
    })

    describe('GET /api/storage/stats', () => {
        it('should return storage statistics successfully', async () => {
            mockStorageService.getStorageStats.mockResolvedValue(mockStats)
            vi.mocked(ResponseHelper.success).mockReturnValue({} as any)

            await controller.getStorageStats(mockReq as ServiceRequest, mockRes as Response)

            expect(mockStorageService.getStorageStats).toHaveBeenCalledTimes(1)
            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, mockStats)
        })

        it('should handle service errors and return error response', async () => {
            const error = new Error('Failed to retrieve storage statistics')
            mockStorageService.getStorageStats.mockRejectedValue(error)
            vi.mocked(ResponseHelper.error).mockReturnValue({} as any)

            await controller.getStorageStats(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith('Error retrieving storage stats', error)
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Failed to retrieve storage statistics',
                'Failed to retrieve storage statistics',
                500
            )
        })

        it('should handle non-Error exceptions', async () => {
            mockStorageService.getStorageStats.mockRejectedValue('String error')
            vi.mocked(ResponseHelper.error).mockReturnValue({} as any)

            await controller.getStorageStats(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalledWith(
                'Error retrieving storage stats',
                'String error'
            )
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Unknown error',
                'Failed to retrieve storage statistics',
                500
            )
        })

        it('should return stats with zero values when database is empty', async () => {
            const emptyStats: StorageStats = {
                database: {
                    size: 0,
                    totalRuns: 0,
                    totalResults: 0,
                    totalAttachments: 0,
                },
                attachments: {
                    totalSize: 0,
                    totalFiles: 0,
                    testDirectories: 0,
                    typeBreakdown: {
                        video: {count: 0, size: 0},
                        screenshot: {count: 0, size: 0},
                        trace: {count: 0, size: 0},
                        log: {count: 0, size: 0},
                        other: {count: 0, size: 0},
                    },
                },
                total: {
                    size: 0,
                    averageSizePerTest: 0,
                },
            }

            mockStorageService.getStorageStats.mockResolvedValue(emptyStats)
            vi.mocked(ResponseHelper.success).mockReturnValue({} as any)

            await controller.getStorageStats(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, emptyStats)
        })

        it('should handle large storage values', async () => {
            const largeStats: StorageStats = {
                database: {
                    size: 10 * 1024 * 1024 * 1024, // 10 GB
                    totalRuns: 10000,
                    totalResults: 100000,
                    totalAttachments: 50000,
                },
                attachments: {
                    totalSize: 100 * 1024 * 1024 * 1024, // 100 GB
                    totalFiles: 50000,
                    testDirectories: 25000,
                    typeBreakdown: {
                        video: {count: 20000, size: 80 * 1024 * 1024 * 1024},
                        screenshot: {count: 20000, size: 15 * 1024 * 1024 * 1024},
                        trace: {count: 10000, size: 5 * 1024 * 1024 * 1024},
                        log: {count: 0, size: 0},
                        other: {count: 0, size: 0},
                    },
                },
                total: {
                    size: 110 * 1024 * 1024 * 1024, // 110 GB
                    averageSizePerTest: 1.1 * 1024 * 1024,
                },
            }

            mockStorageService.getStorageStats.mockResolvedValue(largeStats)
            vi.mocked(ResponseHelper.success).mockReturnValue({} as any)

            await controller.getStorageStats(mockReq as ServiceRequest, mockRes as Response)

            expect(ResponseHelper.success).toHaveBeenCalledWith(mockRes, largeStats)
        })

        it('should handle database connection failures', async () => {
            const error = new Error('Database connection failed')
            mockStorageService.getStorageStats.mockRejectedValue(error)
            vi.mocked(ResponseHelper.error).mockReturnValue({} as any)

            await controller.getStorageStats(mockReq as ServiceRequest, mockRes as Response)

            expect(Logger.error).toHaveBeenCalled()
            expect(ResponseHelper.error).toHaveBeenCalledWith(
                mockRes,
                'Database connection failed',
                'Failed to retrieve storage statistics',
                500
            )
        })

        it('should preserve all type breakdown in response', async () => {
            mockStorageService.getStorageStats.mockResolvedValue(mockStats)
            vi.mocked(ResponseHelper.success).mockReturnValue({} as any)

            await controller.getStorageStats(mockReq as ServiceRequest, mockRes as Response)

            const callArgs = vi.mocked(ResponseHelper.success).mock.calls[0]
            const responseData = callArgs[1] as StorageStats

            expect(responseData.attachments.typeBreakdown).toEqual({
                video: {count: 20, size: 3 * 1024 * 1024},
                screenshot: {count: 20, size: 1 * 1024 * 1024},
                trace: {count: 10, size: 1 * 1024 * 1024},
                log: {count: 0, size: 0},
                other: {count: 0, size: 0},
            })
        })
    })
})
