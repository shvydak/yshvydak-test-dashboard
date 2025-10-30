/**
 * StorageRepository Comprehensive Tests
 *
 * These tests verify the storage statistics calculation functionality.
 * This is IMPORTANT because:
 * 1. StorageRepository calculates database and attachment storage sizes
 * 2. Database size includes main DB file + WAL + SHM files
 * 3. Attachment stats are aggregated from AttachmentManager
 * 4. Average size per test must be calculated correctly
 * 5. Handles missing database files gracefully
 *
 * Coverage target: 80%+
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {StorageRepository} from '../storage.repository'
import {DatabaseManager} from '../../database/database.manager'
import fs from 'fs'

describe('StorageRepository - Core Functionality', () => {
    let storageRepository: StorageRepository
    let dbManager: DatabaseManager
    let mockAttachmentManager: any
    const testOutputDir = ':memory:' // Use in-memory DB for tests
    let statSyncSpy: any

    beforeEach(async () => {
        // Create database manager with in-memory DB
        dbManager = new DatabaseManager(testOutputDir)
        await dbManager.initialize()

        // Create mock attachment manager (avoid file system operations)
        mockAttachmentManager = {
            getStorageStats: vi.fn(),
        }

        // Create storage repository with mocked attachment manager
        storageRepository = new StorageRepository(dbManager, mockAttachmentManager)

        // Spy on fs.statSync (will be configured per test)
        statSyncSpy = vi.spyOn(fs, 'statSync')
    })

    afterEach(async () => {
        await dbManager.close()
        vi.restoreAllMocks()
    })

    describe('getStorageStats()', () => {
        it('should return complete storage statistics', async () => {
            // Mock database file stats
            statSyncSpy.mockImplementation((filePath: any) => {
                if (filePath.toString().endsWith('test-results.db')) {
                    return {size: 1024 * 1024} as any // 1 MB
                }
                if (filePath.toString().endsWith('-wal')) {
                    return {size: 512 * 1024} as any // 512 KB
                }
                if (filePath.toString().endsWith('-shm')) {
                    return {size: 256 * 1024} as any // 256 KB
                }
                throw new Error('File not found')
            })

            // Mock attachment manager stats
            mockAttachmentManager.getStorageStats.mockResolvedValue({
                totalFiles: 10,
                totalSize: 5 * 1024 * 1024, // 5 MB
                testDirectories: 5,
                typeBreakdown: {
                    video: {count: 3, size: 3 * 1024 * 1024},
                    screenshot: {count: 5, size: 1 * 1024 * 1024},
                    trace: {count: 2, size: 1 * 1024 * 1024},
                    log: {count: 0, size: 0},
                    other: {count: 0, size: 0},
                },
            })

            // Create some test data
            await dbManager.createTestRun({
                id: 'run-1',
                status: 'completed',
                totalTests: 5,
                passedTests: 5,
                failedTests: 0,
                skippedTests: 0,
                duration: 5000,
            })

            for (let i = 0; i < 5; i++) {
                await dbManager.saveTestResult({
                    id: `result-${i}`,
                    runId: 'run-1',
                    testId: `test-${i}`,
                    name: `Test ${i}`,
                    filePath: 'test.spec.ts',
                    status: 'passed',
                    duration: 1000,
                    timestamp: new Date().toISOString(),
                })
            }

            const stats = await storageRepository.getStorageStats()

            // Verify database stats
            expect(stats.database.size).toBe(1024 * 1024 + 512 * 1024 + 256 * 1024) // DB + WAL + SHM
            expect(stats.database.totalRuns).toBe(1)
            expect(stats.database.totalResults).toBe(5)
            expect(stats.database.totalAttachments).toBe(0)

            // Verify attachment stats
            expect(stats.attachments.totalSize).toBe(5 * 1024 * 1024)
            expect(stats.attachments.totalFiles).toBe(10)
            expect(stats.attachments.testDirectories).toBe(5)
            expect(stats.attachments.typeBreakdown.video).toEqual({
                count: 3,
                size: 3 * 1024 * 1024,
            })
            expect(stats.attachments.typeBreakdown.screenshot).toEqual({
                count: 5,
                size: 1 * 1024 * 1024,
            })

            // Verify total stats
            const expectedTotal = 1024 * 1024 + 512 * 1024 + 256 * 1024 + 5 * 1024 * 1024
            expect(stats.total.size).toBe(expectedTotal)
            expect(stats.total.averageSizePerTest).toBe(Math.round(expectedTotal / 5))
        })

        it('should handle missing database files gracefully', async () => {
            // Mock file not found
            statSyncSpy.mockImplementation(() => {
                throw new Error('ENOENT: no such file or directory')
            })

            // Mock attachment manager stats
            mockAttachmentManager.getStorageStats.mockResolvedValue({
                totalFiles: 0,
                totalSize: 0,
                testDirectories: 0,
                typeBreakdown: {
                    video: {count: 0, size: 0},
                    screenshot: {count: 0, size: 0},
                    trace: {count: 0, size: 0},
                    log: {count: 0, size: 0},
                    other: {count: 0, size: 0},
                },
            })

            const stats = await storageRepository.getStorageStats()

            // Should return zero database size
            expect(stats.database.size).toBe(0)
            expect(stats.database.totalRuns).toBe(0)
            expect(stats.database.totalResults).toBe(0)
            expect(stats.total.size).toBe(0)
            expect(stats.total.averageSizePerTest).toBe(0)
        })

        it('should calculate average size as zero when no tests exist', async () => {
            // Mock database file stats
            statSyncSpy.mockReturnValue({size: 1024} as any)

            // Mock attachment manager stats
            mockAttachmentManager.getStorageStats.mockResolvedValue({
                totalFiles: 0,
                totalSize: 0,
                testDirectories: 0,
                typeBreakdown: {
                    video: {count: 0, size: 0},
                    screenshot: {count: 0, size: 0},
                    trace: {count: 0, size: 0},
                    log: {count: 0, size: 0},
                    other: {count: 0, size: 0},
                },
            })

            const stats = await storageRepository.getStorageStats()

            expect(stats.database.totalResults).toBe(0)
            expect(stats.total.averageSizePerTest).toBe(0)
        })

        it('should include WAL file size when present', async () => {
            statSyncSpy.mockImplementation((filePath: any) => {
                if (filePath.toString().endsWith('test-results.db')) {
                    return {size: 1024 * 1024} as any
                }
                if (filePath.toString().endsWith('-wal')) {
                    return {size: 512 * 1024} as any
                }
                throw new Error('File not found')
            })

            mockAttachmentManager.getStorageStats.mockResolvedValue({
                totalFiles: 0,
                totalSize: 0,
                testDirectories: 0,
                typeBreakdown: {
                    video: {count: 0, size: 0},
                    screenshot: {count: 0, size: 0},
                    trace: {count: 0, size: 0},
                    log: {count: 0, size: 0},
                    other: {count: 0, size: 0},
                },
            })

            const stats = await storageRepository.getStorageStats()

            expect(stats.database.size).toBe(1024 * 1024 + 512 * 1024)
        })

        it('should handle missing type breakdown gracefully', async () => {
            statSyncSpy.mockReturnValue({size: 0} as any)

            // Mock attachment manager with missing types
            mockAttachmentManager.getStorageStats.mockResolvedValue({
                totalFiles: 5,
                totalSize: 1024,
                testDirectories: 1,
                typeBreakdown: {
                    video: {count: 5, size: 1024},
                    // Missing other types
                } as any,
            })

            const stats = await storageRepository.getStorageStats()

            // Should fill in missing types with zeros
            expect(stats.attachments.typeBreakdown.screenshot).toEqual({count: 0, size: 0})
            expect(stats.attachments.typeBreakdown.trace).toEqual({count: 0, size: 0})
            expect(stats.attachments.typeBreakdown.log).toEqual({count: 0, size: 0})
            expect(stats.attachments.typeBreakdown.other).toEqual({count: 0, size: 0})
        })

        it('should correctly aggregate multiple test runs', async () => {
            statSyncSpy.mockReturnValue({size: 2048} as any)

            mockAttachmentManager.getStorageStats.mockResolvedValue({
                totalFiles: 20,
                totalSize: 10 * 1024 * 1024,
                testDirectories: 10,
                typeBreakdown: {
                    video: {count: 10, size: 8 * 1024 * 1024},
                    screenshot: {count: 10, size: 2 * 1024 * 1024},
                    trace: {count: 0, size: 0},
                    log: {count: 0, size: 0},
                    other: {count: 0, size: 0},
                },
            })

            // Create multiple runs with tests
            for (let run = 0; run < 3; run++) {
                await dbManager.createTestRun({
                    id: `run-${run}`,
                    status: 'completed',
                    totalTests: 5,
                    passedTests: 5,
                    failedTests: 0,
                    skippedTests: 0,
                    duration: 5000,
                })

                for (let i = 0; i < 5; i++) {
                    await dbManager.saveTestResult({
                        id: `result-${run}-${i}`,
                        runId: `run-${run}`,
                        testId: `test-${i}`,
                        name: `Test ${i}`,
                        filePath: 'test.spec.ts',
                        status: 'passed',
                        duration: 1000,
                        timestamp: new Date().toISOString(),
                    })
                }
            }

            const stats = await storageRepository.getStorageStats()

            expect(stats.database.totalRuns).toBe(3)
            expect(stats.database.totalResults).toBe(15) // 3 runs * 5 tests
            expect(stats.total.averageSizePerTest).toBeGreaterThan(0)
        })
    })
})
