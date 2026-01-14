/**
 * AttachmentService Tests (CRITICAL)
 *
 * These tests verify the attachment service layer functionality.
 * This is CRITICAL because:
 * 1. Ensures attachment files are copied to permanent storage
 * 2. Validates proper integration between AttachmentManager and Repository
 * 3. Verifies error handling for missing files and invalid attachments
 * 4. Tests batch processing of multiple attachments
 *
 * Coverage target: 80%+
 */

import {describe, it, expect, beforeEach, afterEach, vi, Mock} from 'vitest'
import {AttachmentService} from '../attachment.service'
import {AttachmentRepository} from '../../repositories/attachment.repository'
import {AttachmentManager} from '../../storage/attachmentManager'
import {AttachmentData} from '../../types/database.types'
import {Logger} from '../../utils/logger.util'
import fs from 'fs'

// Mock fs module
vi.mock('fs', () => ({
    default: {
        existsSync: vi.fn(),
    },
}))

// Mock config
vi.mock('../../config/environment.config', () => ({
    config: {
        storage: {
            outputDir: '/test/output/dir',
        },
    },
}))

// Mock AttachmentManager
vi.mock('../../storage/attachmentManager', () => ({
    AttachmentManager: vi.fn(),
}))

describe('AttachmentService', () => {
    let service: AttachmentService
    let mockRepository: AttachmentRepository
    let mockAttachmentManager: {
        copyPlaywrightAttachment: Mock
        clearAllAttachments: Mock
        deleteTestAttachments: Mock
    }
    let mockFs: {existsSync: Mock}
    const testResultId = 'test-result-123'

    beforeEach(() => {
        // Setup mocks
        mockFs = fs as any
        mockFs.existsSync = vi.fn().mockReturnValue(true)

        // Create mock repository
        mockRepository = {
            saveAttachment: vi.fn().mockResolvedValue('attachment-id'),
            getAttachmentsWithUrls: vi.fn().mockResolvedValue([]),
            getAttachmentById: vi.fn().mockResolvedValue(null),
            deleteAttachmentsByTestResult: vi.fn().mockResolvedValue(undefined),
        } as any

        // Create mock attachment manager
        mockAttachmentManager = {
            copyPlaywrightAttachment: vi.fn().mockResolvedValue({
                id: 'att-123',
                type: 'screenshot',
                fileName: 'screenshot.png',
                filePath: '/test/output/dir/attachments/screenshot.png',
                fileSize: 1024,
                mimeType: 'image/png',
                url: '/attachments/screenshot.png',
            }),
            clearAllAttachments: vi.fn().mockResolvedValue({
                deletedFiles: 0,
                freedSpace: 0,
            }),
            deleteTestAttachments: vi.fn().mockResolvedValue(0),
        }

        // Mock AttachmentManager constructor
        ;(AttachmentManager as any).mockImplementation(() => mockAttachmentManager)

        // Create service instance
        service = new AttachmentService(mockRepository)
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    describe('mapContentTypeToDbType', () => {
        it('should map video MIME type to "video"', () => {
            const result = service.mapContentTypeToDbType('video/webm', 'test.webm')
            expect(result).toBe('video')
        })

        it('should map image MIME type to "screenshot"', () => {
            const result = service.mapContentTypeToDbType('image/png', 'test.png')
            expect(result).toBe('screenshot')
        })

        it('should map trace file to "trace"', () => {
            const result = service.mapContentTypeToDbType('application/zip', 'trace.zip')
            expect(result).toBe('trace')
        })

        it('should handle unknown content type with fallback to log', () => {
            const result = service.mapContentTypeToDbType('application/unknown', 'file.unknown')
            expect(result).toBe('log')
        })
    })

    describe('processAttachments', () => {
        it('should process valid attachment with all fields', async () => {
            const attachments = [
                {
                    name: 'screenshot',
                    path: '/source/screenshot.png',
                    contentType: 'image/png',
                },
            ]

            const result = await service.processAttachments(attachments, testResultId)

            expect(result).toHaveLength(1)
            expect(result[0]).toMatchObject({
                id: 'att-123',
                testResultId,
                type: 'screenshot',
                fileName: 'screenshot.png',
                filePath: '/test/output/dir/attachments/screenshot.png',
                fileSize: 1024,
                mimeType: 'image/png',
                url: '/attachments/screenshot.png',
            })

            expect(mockAttachmentManager.copyPlaywrightAttachment).toHaveBeenCalledWith(
                '/source/screenshot.png',
                testResultId,
                'screenshot'
            )
        })

        it('should process multiple attachments', async () => {
            mockAttachmentManager.copyPlaywrightAttachment
                .mockResolvedValueOnce({
                    id: 'att-1',
                    type: 'screenshot',
                    fileName: 'screenshot.png',
                    filePath: '/test/screenshot.png',
                    fileSize: 1024,
                    mimeType: 'image/png',
                    url: '/attachments/screenshot.png',
                })
                .mockResolvedValueOnce({
                    id: 'att-2',
                    type: 'video',
                    fileName: 'video.webm',
                    filePath: '/test/video.webm',
                    fileSize: 2048,
                    mimeType: 'video/webm',
                    url: '/attachments/video.webm',
                })

            const attachments = [
                {
                    name: 'screenshot',
                    path: '/source/screenshot.png',
                    contentType: 'image/png',
                },
                {
                    name: 'video',
                    path: '/source/video.webm',
                    contentType: 'video/webm',
                },
            ]

            const result = await service.processAttachments(attachments, testResultId)

            expect(result).toHaveLength(2)
            expect(result[0].type).toBe('screenshot')
            expect(result[1].type).toBe('video')
            expect(mockAttachmentManager.copyPlaywrightAttachment).toHaveBeenCalledTimes(2)
        })

        it('should skip attachment with missing name', async () => {
            const attachments = [
                {
                    path: '/source/screenshot.png',
                    contentType: 'image/png',
                },
            ]

            const result = await service.processAttachments(attachments, testResultId)

            expect(result).toHaveLength(0)
            expect(mockAttachmentManager.copyPlaywrightAttachment).not.toHaveBeenCalled()
        })

        it('should skip attachment with missing path', async () => {
            const attachments = [
                {
                    name: 'screenshot',
                    contentType: 'image/png',
                },
            ]

            const result = await service.processAttachments(attachments, testResultId)

            expect(result).toHaveLength(0)
            expect(mockAttachmentManager.copyPlaywrightAttachment).not.toHaveBeenCalled()
        })

        it('should skip attachment with non-existent file', async () => {
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
            mockFs.existsSync.mockReturnValue(false)

            const attachments = [
                {
                    name: 'screenshot',
                    path: '/non/existent/file.png',
                    contentType: 'image/png',
                },
            ]

            const result = await service.processAttachments(attachments, testResultId)

            expect(result).toHaveLength(0)
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Source file not found')
            )
            expect(mockAttachmentManager.copyPlaywrightAttachment).not.toHaveBeenCalled()

            consoleWarnSpy.mockRestore()
        })

        it('should handle attachment with missing contentType', async () => {
            const attachments = [
                {
                    name: 'screenshot.png',
                    path: '/source/screenshot.png',
                },
            ]

            const result = await service.processAttachments(attachments, testResultId)

            expect(result).toHaveLength(1)
            expect(result[0].type).toBe('screenshot')
        })

        it('should continue processing on error for individual attachment', async () => {
            const loggerErrorSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {})

            mockAttachmentManager.copyPlaywrightAttachment
                .mockResolvedValueOnce({
                    id: 'att-1',
                    type: 'screenshot',
                    fileName: 'valid.png',
                    filePath: '/test/valid.png',
                    fileSize: 1024,
                    mimeType: 'image/png',
                    url: '/attachments/valid.png',
                })
                .mockRejectedValueOnce(new Error('Copy failed'))

            const attachments = [
                {
                    name: 'valid',
                    path: '/source/valid.png',
                    contentType: 'image/png',
                },
                {
                    name: 'invalid',
                    path: '/source/invalid.png',
                    contentType: 'image/png',
                },
            ]

            const result = await service.processAttachments(attachments, testResultId)

            // Should process the valid one and skip the invalid one
            expect(result).toHaveLength(1)
            expect(result[0].fileName).toBe('valid.png')
            expect(loggerErrorSpy).toHaveBeenCalled()

            loggerErrorSpy.mockRestore()
        })

        it('should handle attachments with special characters in name', async () => {
            const attachments = [
                {
                    name: 'screenshot with spaces & special-chars',
                    path: '/source/screenshot.png',
                    contentType: 'image/png',
                },
            ]

            const result = await service.processAttachments(attachments, testResultId)

            expect(result).toHaveLength(1)
            expect(result[0].fileName).toBeDefined()
        })

        it('should process trace file correctly', async () => {
            mockAttachmentManager.copyPlaywrightAttachment.mockResolvedValue({
                id: 'att-trace',
                type: 'trace',
                fileName: 'trace.zip',
                filePath: '/test/trace.zip',
                fileSize: 3072,
                mimeType: 'application/zip',
                url: '/attachments/trace.zip',
            })

            const attachments = [
                {
                    name: 'trace',
                    path: '/source/trace.zip',
                    contentType: 'application/zip',
                },
            ]

            const result = await service.processAttachments(attachments, testResultId)

            expect(result).toHaveLength(1)
            expect(result[0].type).toBe('trace')
            expect(result[0].mimeType).toBe('application/zip')
        })

        it('should return empty array for empty attachments', async () => {
            const result = await service.processAttachments([], testResultId)

            expect(result).toHaveLength(0)
        })
    })

    describe('getAttachmentsByTestResult', () => {
        it('should retrieve attachments from repository', async () => {
            const mockAttachments: AttachmentData[] = [
                {
                    id: 'att-1',
                    testResultId,
                    type: 'screenshot',
                    fileName: 'screenshot.png',
                    filePath: '/path/to/screenshot.png',
                    fileSize: 1024,
                    mimeType: 'image/png',
                    url: '/attachments/screenshot.png',
                },
            ]

            mockRepository.getAttachmentsWithUrls = vi.fn().mockResolvedValue(mockAttachments)

            const result = await service.getAttachmentsByTestResult(testResultId)

            expect(result).toEqual(mockAttachments)
            expect(mockRepository.getAttachmentsWithUrls).toHaveBeenCalledWith(testResultId)
        })

        it('should return empty array when no attachments found', async () => {
            mockRepository.getAttachmentsWithUrls = vi.fn().mockResolvedValue([])

            const result = await service.getAttachmentsByTestResult(testResultId)

            expect(result).toEqual([])
        })

        it('should handle multiple attachments', async () => {
            const mockAttachments: AttachmentData[] = [
                {
                    id: 'att-1',
                    testResultId,
                    type: 'screenshot',
                    fileName: 'screenshot.png',
                    filePath: '/path/to/screenshot.png',
                    fileSize: 1024,
                    mimeType: 'image/png',
                    url: '/attachments/screenshot.png',
                },
                {
                    id: 'att-2',
                    testResultId,
                    type: 'video',
                    fileName: 'video.webm',
                    filePath: '/path/to/video.webm',
                    fileSize: 2048,
                    mimeType: 'video/webm',
                    url: '/attachments/video.webm',
                },
            ]

            mockRepository.getAttachmentsWithUrls = vi.fn().mockResolvedValue(mockAttachments)

            const result = await service.getAttachmentsByTestResult(testResultId)

            expect(result).toHaveLength(2)
            expect(result).toEqual(mockAttachments)
        })
    })

    describe('saveAttachmentsForTestResult', () => {
        it('should process and save single attachment', async () => {
            const attachments = [
                {
                    name: 'screenshot',
                    path: '/source/screenshot.png',
                    contentType: 'image/png',
                },
            ]

            await service.saveAttachmentsForTestResult(testResultId, attachments)

            expect(mockRepository.saveAttachment).toHaveBeenCalledTimes(1)
            expect(mockRepository.saveAttachment).toHaveBeenCalledWith(
                expect.objectContaining({
                    testResultId,
                    type: 'screenshot',
                    mimeType: 'image/png',
                })
            )
        })

        it('should process and save multiple attachments', async () => {
            mockAttachmentManager.copyPlaywrightAttachment
                .mockResolvedValueOnce({
                    id: 'att-1',
                    type: 'screenshot',
                    fileName: 'screenshot.png',
                    filePath: '/test/screenshot.png',
                    fileSize: 1024,
                    mimeType: 'image/png',
                    url: '/attachments/screenshot.png',
                })
                .mockResolvedValueOnce({
                    id: 'att-2',
                    type: 'video',
                    fileName: 'video.webm',
                    filePath: '/test/video.webm',
                    fileSize: 2048,
                    mimeType: 'video/webm',
                    url: '/attachments/video.webm',
                })

            const attachments = [
                {
                    name: 'screenshot',
                    path: '/source/screenshot.png',
                    contentType: 'image/png',
                },
                {
                    name: 'video',
                    path: '/source/video.webm',
                    contentType: 'video/webm',
                },
            ]

            await service.saveAttachmentsForTestResult(testResultId, attachments)

            expect(mockRepository.saveAttachment).toHaveBeenCalledTimes(2)
        })

        it('should not save if no valid attachments', async () => {
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
            mockFs.existsSync.mockReturnValue(false)

            const attachments = [
                {
                    name: 'screenshot',
                    path: '/non/existent/file.png',
                    contentType: 'image/png',
                },
            ]

            await service.saveAttachmentsForTestResult(testResultId, attachments)

            expect(mockRepository.saveAttachment).not.toHaveBeenCalled()

            consoleWarnSpy.mockRestore()
        })

        it('should handle empty attachments array', async () => {
            await service.saveAttachmentsForTestResult(testResultId, [])

            expect(mockRepository.saveAttachment).not.toHaveBeenCalled()
        })

        it('should save all processed attachments to repository', async () => {
            mockAttachmentManager.copyPlaywrightAttachment
                .mockResolvedValueOnce({
                    id: 'att-1',
                    type: 'screenshot',
                    fileName: 'screenshot.png',
                    filePath: '/test/screenshot.png',
                    fileSize: 1024,
                    mimeType: 'image/png',
                    url: '/attachments/screenshot.png',
                })
                .mockResolvedValueOnce({
                    id: 'att-2',
                    type: 'video',
                    fileName: 'video.webm',
                    filePath: '/test/video.webm',
                    fileSize: 2048,
                    mimeType: 'video/webm',
                    url: '/attachments/video.webm',
                })
                .mockResolvedValueOnce({
                    id: 'att-3',
                    type: 'trace',
                    fileName: 'trace.zip',
                    filePath: '/test/trace.zip',
                    fileSize: 3072,
                    mimeType: 'application/zip',
                    url: '/attachments/trace.zip',
                })

            const attachments = [
                {
                    name: 'screenshot',
                    path: '/source/screenshot.png',
                    contentType: 'image/png',
                },
                {
                    name: 'video',
                    path: '/source/video.webm',
                    contentType: 'video/webm',
                },
                {
                    name: 'trace',
                    path: '/source/trace.zip',
                    contentType: 'application/zip',
                },
            ]

            await service.saveAttachmentsForTestResult(testResultId, attachments)

            expect(mockRepository.saveAttachment).toHaveBeenCalledTimes(3)

            // Verify each call
            const calls = (mockRepository.saveAttachment as any).mock.calls
            expect(calls[0][0]).toMatchObject({
                testResultId,
                type: 'screenshot',
            })
            expect(calls[1][0]).toMatchObject({
                testResultId,
                type: 'video',
            })
            expect(calls[2][0]).toMatchObject({
                testResultId,
                type: 'trace',
            })
        })

        it('should continue saving even if one attachment fails to process', async () => {
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

            mockFs.existsSync
                .mockReturnValueOnce(true) // First file exists
                .mockReturnValueOnce(false) // Second file doesn't exist
                .mockReturnValueOnce(true) // Third file exists

            mockAttachmentManager.copyPlaywrightAttachment
                .mockResolvedValueOnce({
                    id: 'att-1',
                    type: 'screenshot',
                    fileName: 'valid.png',
                    filePath: '/test/valid.png',
                    fileSize: 1024,
                    mimeType: 'image/png',
                    url: '/attachments/valid.png',
                })
                .mockResolvedValueOnce({
                    id: 'att-2',
                    type: 'screenshot',
                    fileName: 'also-valid.png',
                    filePath: '/test/also-valid.png',
                    fileSize: 1024,
                    mimeType: 'image/png',
                    url: '/attachments/also-valid.png',
                })

            const attachments = [
                {
                    name: 'valid',
                    path: '/source/valid.png',
                    contentType: 'image/png',
                },
                {
                    name: 'will-fail',
                    path: '/non/existent/file.png',
                    contentType: 'image/png',
                },
                {
                    name: 'also-valid',
                    path: '/source/also-valid.png',
                    contentType: 'image/png',
                },
            ]

            await service.saveAttachmentsForTestResult(testResultId, attachments)

            // Should save 2 valid attachments
            expect(mockRepository.saveAttachment).toHaveBeenCalledTimes(2)

            consoleWarnSpy.mockRestore()
        })
    })

    describe('getAttachmentById', () => {
        it('should retrieve attachment by ID', async () => {
            const mockAttachment: AttachmentData = {
                id: 'att-1',
                testResultId,
                type: 'screenshot',
                fileName: 'screenshot.png',
                filePath: '/path/to/screenshot.png',
                fileSize: 1024,
                mimeType: 'image/png',
                url: '/attachments/screenshot.png',
            }

            mockRepository.getAttachmentById = vi.fn().mockResolvedValue(mockAttachment)

            const result = await service.getAttachmentById('att-1')

            expect(result).toEqual(mockAttachment)
            expect(mockRepository.getAttachmentById).toHaveBeenCalledWith('att-1')
        })

        it('should return null when attachment not found', async () => {
            mockRepository.getAttachmentById = vi.fn().mockResolvedValue(null)

            const result = await service.getAttachmentById('non-existent')

            expect(result).toBeNull()
        })
    })

    describe('clearAllAttachments', () => {
        it('should clear all attachments successfully', async () => {
            mockAttachmentManager.clearAllAttachments.mockResolvedValue({
                deletedFiles: 150,
                freedSpace: 5200000000, // 5.2GB
            })

            const result = await service.clearAllAttachments()

            expect(result.deletedFiles).toBe(150)
            expect(result.freedSpace).toBe(5200000000)
            expect(mockAttachmentManager.clearAllAttachments).toHaveBeenCalledTimes(1)
        })

        it('should return zero stats when no attachments exist', async () => {
            mockAttachmentManager.clearAllAttachments.mockResolvedValue({
                deletedFiles: 0,
                freedSpace: 0,
            })

            const result = await service.clearAllAttachments()

            expect(result.deletedFiles).toBe(0)
            expect(result.freedSpace).toBe(0)
            expect(mockAttachmentManager.clearAllAttachments).toHaveBeenCalledTimes(1)
        })

        it('should handle errors during attachment cleanup', async () => {
            mockAttachmentManager.clearAllAttachments.mockRejectedValue(
                new Error('Failed to delete attachments directory')
            )

            await expect(service.clearAllAttachments()).rejects.toThrow(
                'Failed to delete attachments directory'
            )
        })

        it('should propagate AttachmentManager errors', async () => {
            const error = new Error('Permission denied')
            mockAttachmentManager.clearAllAttachments.mockRejectedValue(error)

            await expect(service.clearAllAttachments()).rejects.toThrow('Permission denied')
            expect(mockAttachmentManager.clearAllAttachments).toHaveBeenCalledTimes(1)
        })
    })

    describe('Error Handling', () => {
        it('should handle repository errors gracefully in getAttachmentsByTestResult', async () => {
            mockRepository.getAttachmentsWithUrls = vi
                .fn()
                .mockRejectedValue(new Error('Database error'))

            await expect(service.getAttachmentsByTestResult(testResultId)).rejects.toThrow(
                'Database error'
            )
        })

        it('should handle repository errors gracefully in saveAttachment', async () => {
            mockRepository.saveAttachment = vi.fn().mockRejectedValue(new Error('Database error'))

            const attachments = [
                {
                    name: 'screenshot',
                    path: '/source/screenshot.png',
                    contentType: 'image/png',
                },
            ]

            await expect(
                service.saveAttachmentsForTestResult(testResultId, attachments)
            ).rejects.toThrow('Database error')
        })

        it('should handle AttachmentManager errors during copy', async () => {
            const loggerErrorSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {})

            mockAttachmentManager.copyPlaywrightAttachment.mockRejectedValue(
                new Error('Copy failed')
            )

            const attachments = [
                {
                    name: 'screenshot',
                    path: '/source/screenshot.png',
                    contentType: 'image/png',
                },
            ]

            const result = await service.processAttachments(attachments, testResultId)

            expect(result).toHaveLength(0)
            expect(loggerErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to copy attachment'),
                expect.any(Error)
            )

            loggerErrorSpy.mockRestore()
        })
    })

    describe('deleteAttachmentsForTestResult', () => {
        it('should call AttachmentManager.deleteTestAttachments with correct testResultId', async () => {
            mockAttachmentManager.deleteTestAttachments = vi.fn().mockResolvedValue(3)

            const result = await service.deleteAttachmentsForTestResult(testResultId)

            expect(mockAttachmentManager.deleteTestAttachments).toHaveBeenCalledWith(testResultId)
            expect(result).toBe(3)
        })

        it('should return deleted file count from AttachmentManager', async () => {
            mockAttachmentManager.deleteTestAttachments = vi.fn().mockResolvedValue(5)

            const result = await service.deleteAttachmentsForTestResult(testResultId)

            expect(result).toBe(5)
        })

        it('should return 0 when no attachments exist', async () => {
            mockAttachmentManager.deleteTestAttachments = vi.fn().mockResolvedValue(0)

            const result = await service.deleteAttachmentsForTestResult(testResultId)

            expect(result).toBe(0)
        })

        it('should propagate errors from AttachmentManager', async () => {
            mockAttachmentManager.deleteTestAttachments = vi
                .fn()
                .mockRejectedValue(new Error('Delete failed'))

            await expect(service.deleteAttachmentsForTestResult(testResultId)).rejects.toThrow(
                'Delete failed'
            )
        })

        it('should handle permission errors gracefully', async () => {
            const permissionError = new Error('EACCES: permission denied')
            ;(permissionError as any).code = 'EACCES'

            mockAttachmentManager.deleteTestAttachments = vi.fn().mockRejectedValue(permissionError)

            await expect(service.deleteAttachmentsForTestResult(testResultId)).rejects.toThrow(
                'permission denied'
            )
        })
    })
})
