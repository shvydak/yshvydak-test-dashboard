/**
 * StorageService Tests
 *
 * These tests verify the storage service layer functionality.
 * This is IMPORTANT because:
 * 1. Ensures proper error handling for storage statistics
 * 2. Validates integration between StorageRepository and service layer
 * 3. Verifies logging of storage operations
 * 4. Tests business logic around storage statistics
 *
 * Coverage target: 80%+
 */

import {describe, it, expect, beforeEach, vi, Mock} from 'vitest'
import {StorageService} from '../storage.service'
import {StorageStats} from '../../repositories/storage.repository'
import {Logger} from '../../utils/logger.util'

// Mock Logger
vi.mock('../../utils/logger.util', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}))

describe('StorageService', () => {
    let service: StorageService
    let mockRepository: {
        getStorageStats: Mock
    }

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

    beforeEach(() => {
        // Create mock repository
        mockRepository = {
            getStorageStats: vi.fn(),
        }

        // Create service with mocked repository
        service = new StorageService(mockRepository as any)

        // Clear all mocks
        vi.clearAllMocks()
    })

    describe('getStorageStats()', () => {
        it('should return storage statistics successfully', async () => {
            mockRepository.getStorageStats.mockResolvedValue(mockStats)

            const result = await service.getStorageStats()

            expect(result).toEqual(mockStats)
            expect(mockRepository.getStorageStats).toHaveBeenCalledTimes(1)
            expect(Logger.info).toHaveBeenCalledWith('Storage stats retrieved', {
                totalSize: mockStats.total.size,
                databaseSize: mockStats.database.size,
                attachmentsSize: mockStats.attachments.totalSize,
            })
        })

        it('should log storage statistics on successful retrieval', async () => {
            mockRepository.getStorageStats.mockResolvedValue(mockStats)

            await service.getStorageStats()

            expect(Logger.info).toHaveBeenCalledWith('Storage stats retrieved', {
                totalSize: 6 * 1024 * 1024,
                databaseSize: 1024 * 1024,
                attachmentsSize: 5 * 1024 * 1024,
            })
        })

        it('should handle repository errors and throw descriptive error', async () => {
            const error = new Error('Database connection failed')
            mockRepository.getStorageStats.mockRejectedValue(error)

            await expect(service.getStorageStats()).rejects.toThrow(
                'Failed to retrieve storage statistics'
            )

            expect(Logger.error).toHaveBeenCalledWith('Failed to retrieve storage stats', error)
        })

        it('should handle unexpected errors gracefully', async () => {
            mockRepository.getStorageStats.mockRejectedValue('Unknown error')

            await expect(service.getStorageStats()).rejects.toThrow(
                'Failed to retrieve storage statistics'
            )

            expect(Logger.error).toHaveBeenCalledWith(
                'Failed to retrieve storage stats',
                'Unknown error'
            )
        })

        it('should return zero stats when database is empty', async () => {
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

            mockRepository.getStorageStats.mockResolvedValue(emptyStats)

            const result = await service.getStorageStats()

            expect(result).toEqual(emptyStats)
            expect(result.total.size).toBe(0)
            expect(result.total.averageSizePerTest).toBe(0)
        })

        it('should handle large storage values correctly', async () => {
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
                    averageSizePerTest: 1.1 * 1024 * 1024, // ~1.1 MB per test
                },
            }

            mockRepository.getStorageStats.mockResolvedValue(largeStats)

            const result = await service.getStorageStats()

            expect(result.total.size).toBeGreaterThan(100 * 1024 * 1024 * 1024)
            expect(result.database.totalResults).toBe(100000)
        })

        it('should preserve all type breakdown information', async () => {
            mockRepository.getStorageStats.mockResolvedValue(mockStats)

            const result = await service.getStorageStats()

            expect(result.attachments.typeBreakdown).toEqual({
                video: {count: 20, size: 3 * 1024 * 1024},
                screenshot: {count: 20, size: 1 * 1024 * 1024},
                trace: {count: 10, size: 1 * 1024 * 1024},
                log: {count: 0, size: 0},
                other: {count: 0, size: 0},
            })
        })
    })
})
