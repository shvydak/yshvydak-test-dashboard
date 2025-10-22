/**
 * AttachmentRepository Comprehensive Tests
 *
 * These tests verify the attachment data management functionality.
 * This is IMPORTANT because:
 * 1. AttachmentRepository is the data access layer for attachments
 * 2. Foreign key constraints (test_result_id) must be enforced
 * 3. Attachments must be correctly associated with test results
 * 4. URL generation and mapping must work correctly
 * 5. Delete operations should cascade properly
 *
 * Coverage target: 80%+
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {AttachmentRepository} from '../attachment.repository'
import {TestRepository} from '../test.repository'
import {DatabaseManager} from '../../database/database.manager'
import {AttachmentData, TestResultData} from '../../types/database.types'

describe('AttachmentRepository - Core Functionality', () => {
    let attachmentRepository: AttachmentRepository
    let testRepository: TestRepository
    let dbManager: DatabaseManager
    let currentRunId: string
    let testResultId: string

    let attachmentCounter = 0 // For unique IDs

    // Helper function to create test result data
    const createTestResult = (
        testId: string,
        status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'pending'
    ): TestResultData => {
        return {
            id: `result-${Date.now()}-${Math.random()}`,
            runId: currentRunId,
            testId,
            name: 'Test Name',
            filePath: 'test/file.spec.ts',
            status,
            duration: 1000,
            timestamp: new Date().toISOString(),
        }
    }

    // Helper function to create attachment data
    const createAttachment = (
        testResultId: string,
        type: 'video' | 'screenshot' | 'trace' | 'log',
        overrides: Partial<AttachmentData> = {}
    ): AttachmentData => {
        attachmentCounter++
        return {
            id: overrides.id || `attachment-${Date.now()}-${attachmentCounter}`,
            testResultId,
            type,
            fileName: `${type}-${attachmentCounter}.${type === 'screenshot' ? 'png' : type === 'video' ? 'webm' : 'json'}`,
            filePath: `/storage/attachments/${type}-${attachmentCounter}`,
            fileSize: 1024 * attachmentCounter,
            mimeType:
                type === 'screenshot'
                    ? 'image/png'
                    : type === 'video'
                      ? 'video/webm'
                      : 'application/json',
            url: `/attachments/${type}-${attachmentCounter}`,
            ...overrides,
        }
    }

    // Helper to create a test run
    const createTestRun = async (runId?: string) => {
        const id = runId || `run-${Date.now()}-${Math.random()}`
        await dbManager.createTestRun({
            id,
            status: 'completed',
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            skippedTests: 0,
            duration: 0,
        })
        return id
    }

    beforeEach(async () => {
        // Reset counter for each test
        attachmentCounter = 0

        // Use in-memory database for tests
        dbManager = new DatabaseManager(':memory:')
        await dbManager.initialize()

        attachmentRepository = new AttachmentRepository(dbManager)
        testRepository = new TestRepository(dbManager)

        // Create a test run and test result for foreign key constraints
        currentRunId = await createTestRun()
        const testData = createTestResult('test-1', 'passed')
        testResultId = await testRepository.saveTestResult(testData)
    })

    afterEach(async () => {
        await dbManager.close()
    })

    describe('saveAttachment()', () => {
        it('should save attachment data correctly', async () => {
            const attachmentData = createAttachment(testResultId, 'screenshot')

            const savedId = await attachmentRepository.saveAttachment(attachmentData)

            expect(savedId).toBe(attachmentData.id)

            // Verify it was saved
            const saved = await attachmentRepository.getAttachmentById(savedId)
            expect(saved).toBeDefined()
            expect(saved?.testResultId).toBe(testResultId)
            expect(saved?.type).toBe('screenshot')
            expect(saved?.fileName).toBe(attachmentData.fileName)
        })

        it('should save all attachment types', async () => {
            const types: Array<'video' | 'screenshot' | 'trace' | 'log'> = [
                'video',
                'screenshot',
                'trace',
                'log',
            ]

            for (const type of types) {
                const attachmentData = createAttachment(testResultId, type)
                const savedId = await attachmentRepository.saveAttachment(attachmentData)

                const saved = await attachmentRepository.getAttachmentById(savedId)
                expect(saved?.type).toBe(type)
            }
        })

        it('should save attachment with all fields', async () => {
            const attachmentData = createAttachment(testResultId, 'screenshot', {
                fileName: 'custom-screenshot.png',
                filePath: '/custom/path/screenshot.png',
                fileSize: 2048,
                mimeType: 'image/png',
                url: '/attachments/custom-screenshot',
            })

            const savedId = await attachmentRepository.saveAttachment(attachmentData)
            const saved = await attachmentRepository.getAttachmentById(savedId)

            expect(saved).toBeDefined()
            expect(saved?.fileName).toBe('custom-screenshot.png')
            expect(saved?.filePath).toBe('/custom/path/screenshot.png')
            expect(saved?.fileSize).toBe(2048)
            expect(saved?.mimeType).toBe('image/png')
            expect(saved?.url).toBe('/attachments/custom-screenshot')
        })

        it('should save multiple attachments for same test result', async () => {
            const attachment1 = createAttachment(testResultId, 'screenshot')
            const attachment2 = createAttachment(testResultId, 'video')
            const attachment3 = createAttachment(testResultId, 'trace')

            await attachmentRepository.saveAttachment(attachment1)
            await attachmentRepository.saveAttachment(attachment2)
            await attachmentRepository.saveAttachment(attachment3)

            const attachments = await attachmentRepository.getAttachmentsByTestResult(testResultId)
            expect(attachments).toHaveLength(3)
            expect(attachments.map((a) => a.type).sort()).toEqual(['screenshot', 'trace', 'video'])
        })

        it('should enforce foreign key constraint on test_result_id', async () => {
            const attachmentData = createAttachment('non-existent-result-id', 'screenshot')

            await expect(attachmentRepository.saveAttachment(attachmentData)).rejects.toThrow()
        })

        it('should handle large file sizes', async () => {
            const attachmentData = createAttachment(testResultId, 'video', {
                fileSize: 1024 * 1024 * 100, // 100 MB
            })

            const savedId = await attachmentRepository.saveAttachment(attachmentData)
            const saved = await attachmentRepository.getAttachmentById(savedId)

            expect(saved?.fileSize).toBe(1024 * 1024 * 100)
        })

        it('should handle special characters in file names', async () => {
            const attachmentData = createAttachment(testResultId, 'screenshot', {
                fileName: 'test-screenshot-@-#-$-%.png',
            })

            const savedId = await attachmentRepository.saveAttachment(attachmentData)
            const saved = await attachmentRepository.getAttachmentById(savedId)

            expect(saved?.fileName).toBe('test-screenshot-@-#-$-%.png')
        })
    })

    describe('getAttachmentsByTestResult()', () => {
        it('should retrieve all attachments for a test result', async () => {
            const attachment1 = createAttachment(testResultId, 'screenshot')
            const attachment2 = createAttachment(testResultId, 'video')

            await attachmentRepository.saveAttachment(attachment1)
            await attachmentRepository.saveAttachment(attachment2)

            const attachments = await attachmentRepository.getAttachmentsByTestResult(testResultId)

            expect(attachments).toHaveLength(2)
            expect(attachments[0].testResultId).toBe(testResultId)
            expect(attachments[1].testResultId).toBe(testResultId)
        })

        it('should return empty array for test result with no attachments', async () => {
            const attachments = await attachmentRepository.getAttachmentsByTestResult(testResultId)
            expect(attachments).toEqual([])
        })

        it('should not return attachments from other test results', async () => {
            // Create another test result
            const testData2 = createTestResult('test-2', 'passed')
            const testResultId2 = await testRepository.saveTestResult(testData2)

            // Add attachments to both test results
            await attachmentRepository.saveAttachment(createAttachment(testResultId, 'screenshot'))
            await attachmentRepository.saveAttachment(createAttachment(testResultId2, 'video'))

            // Get attachments for first test result
            const attachments = await attachmentRepository.getAttachmentsByTestResult(testResultId)

            expect(attachments).toHaveLength(1)
            expect(attachments[0].type).toBe('screenshot')
        })

        it('should map database fields correctly', async () => {
            const attachmentData = createAttachment(testResultId, 'screenshot', {
                fileName: 'test.png',
                filePath: '/path/to/test.png',
                fileSize: 2048,
                mimeType: 'image/png',
                url: '/attachments/test',
            })

            await attachmentRepository.saveAttachment(attachmentData)
            const attachments = await attachmentRepository.getAttachmentsByTestResult(testResultId)

            expect(attachments[0]).toMatchObject({
                id: attachmentData.id,
                testResultId: testResultId,
                type: 'screenshot',
                fileName: 'test.png',
                filePath: '/path/to/test.png',
                fileSize: 2048,
                mimeType: 'image/png',
                url: '/attachments/test',
            })
        })
    })

    describe('getAttachmentsWithUrls()', () => {
        it('should return attachments with existing URLs unchanged', async () => {
            const attachmentData = createAttachment(testResultId, 'screenshot', {
                url: '/attachments/existing-url',
                filePath: '/storage/path',
            })

            await attachmentRepository.saveAttachment(attachmentData)
            const attachments = await attachmentRepository.getAttachmentsWithUrls(testResultId)

            expect(attachments[0].url).toBe('/attachments/existing-url')
        })

        it('should generate URL from filePath when URL is empty', async () => {
            const attachmentData = createAttachment(testResultId, 'screenshot', {
                url: '',
                filePath: '/storage/attachments/screenshot-1.png',
            })

            await attachmentRepository.saveAttachment(attachmentData)
            const attachments = await attachmentRepository.getAttachmentsWithUrls(testResultId)

            // convertToRelativeUrl removes leading slash
            expect(attachments[0].url).toBe('storage/attachments/screenshot-1.png')
        })

        it('should handle attachment with URL not starting with /attachments/', async () => {
            const attachmentData = createAttachment(testResultId, 'screenshot', {
                url: 'http://example.com/image.png',
                filePath: '/storage/attachments/screenshot-1.png',
            })

            await attachmentRepository.saveAttachment(attachmentData)
            const attachments = await attachmentRepository.getAttachmentsWithUrls(testResultId)

            // Should convert filePath to relative URL (convertToRelativeUrl removes leading slash)
            expect(attachments[0].url).toBe('storage/attachments/screenshot-1.png')
        })

        it('should handle attachment with no filePath or URL', async () => {
            const attachmentData = createAttachment(testResultId, 'screenshot', {
                url: '',
                filePath: '',
            })

            await attachmentRepository.saveAttachment(attachmentData)
            const attachments = await attachmentRepository.getAttachmentsWithUrls(testResultId)

            expect(attachments[0].url).toBe('')
        })

        it('should process multiple attachments correctly', async () => {
            await attachmentRepository.saveAttachment(
                createAttachment(testResultId, 'screenshot', {
                    url: '/attachments/existing',
                    filePath: '/storage/path1',
                })
            )
            await attachmentRepository.saveAttachment(
                createAttachment(testResultId, 'video', {
                    url: '',
                    filePath: '/storage/attachments/video.webm',
                })
            )

            const attachments = await attachmentRepository.getAttachmentsWithUrls(testResultId)

            expect(attachments).toHaveLength(2)
            expect(attachments[0].url).toBe('/attachments/existing')
            // convertToRelativeUrl removes leading slash
            expect(attachments[1].url).toBe('storage/attachments/video.webm')
        })
    })

    describe('getAttachmentById()', () => {
        it('should retrieve attachment by ID', async () => {
            const attachmentData = createAttachment(testResultId, 'screenshot')
            const savedId = await attachmentRepository.saveAttachment(attachmentData)

            const attachment = await attachmentRepository.getAttachmentById(savedId)

            expect(attachment).toBeDefined()
            expect(attachment?.id).toBe(savedId)
            expect(attachment?.type).toBe('screenshot')
        })

        it('should return null for non-existent attachment ID', async () => {
            const attachment = await attachmentRepository.getAttachmentById('non-existent-id')
            expect(attachment).toBeNull()
        })

        it('should map all fields correctly', async () => {
            const attachmentData = createAttachment(testResultId, 'trace', {
                fileName: 'trace-file.json',
                filePath: '/storage/traces/trace.json',
                fileSize: 4096,
                mimeType: 'application/json',
                url: '/attachments/trace',
            })

            const savedId = await attachmentRepository.saveAttachment(attachmentData)
            const attachment = await attachmentRepository.getAttachmentById(savedId)

            expect(attachment).toMatchObject({
                id: savedId,
                testResultId: testResultId,
                type: 'trace',
                fileName: 'trace-file.json',
                filePath: '/storage/traces/trace.json',
                fileSize: 4096,
                mimeType: 'application/json',
                url: '/attachments/trace',
            })
        })
    })

    describe('deleteAttachmentsByTestResult()', () => {
        it('should delete all attachments for a test result', async () => {
            const attachment1 = createAttachment(testResultId, 'screenshot')
            const attachment2 = createAttachment(testResultId, 'video')

            await attachmentRepository.saveAttachment(attachment1)
            await attachmentRepository.saveAttachment(attachment2)

            // Verify attachments exist
            let attachments = await attachmentRepository.getAttachmentsByTestResult(testResultId)
            expect(attachments).toHaveLength(2)

            // Delete attachments
            await attachmentRepository.deleteAttachmentsByTestResult(testResultId)

            // Verify attachments are deleted
            attachments = await attachmentRepository.getAttachmentsByTestResult(testResultId)
            expect(attachments).toHaveLength(0)
        })

        it('should not affect attachments of other test results', async () => {
            // Create another test result
            const testData2 = createTestResult('test-2', 'passed')
            const testResultId2 = await testRepository.saveTestResult(testData2)

            // Add attachments to both test results
            await attachmentRepository.saveAttachment(createAttachment(testResultId, 'screenshot'))
            await attachmentRepository.saveAttachment(createAttachment(testResultId2, 'video'))

            // Delete attachments for first test result
            await attachmentRepository.deleteAttachmentsByTestResult(testResultId)

            // Verify first test result has no attachments
            const attachments1 = await attachmentRepository.getAttachmentsByTestResult(testResultId)
            expect(attachments1).toHaveLength(0)

            // Verify second test result still has attachments
            const attachments2 =
                await attachmentRepository.getAttachmentsByTestResult(testResultId2)
            expect(attachments2).toHaveLength(1)
        })

        it('should handle deleting from test result with no attachments', async () => {
            await expect(
                attachmentRepository.deleteAttachmentsByTestResult(testResultId)
            ).resolves.toBeUndefined()
        })

        it('should handle deleting from non-existent test result', async () => {
            await expect(
                attachmentRepository.deleteAttachmentsByTestResult('non-existent-id')
            ).resolves.toBeUndefined()
        })
    })

    describe('Foreign Key Constraints', () => {
        it('should cascade delete attachments when test result is deleted', async () => {
            // Add attachments to test result
            await attachmentRepository.saveAttachment(createAttachment(testResultId, 'screenshot'))
            await attachmentRepository.saveAttachment(createAttachment(testResultId, 'video'))

            // Verify attachments exist
            let attachments = await attachmentRepository.getAttachmentsByTestResult(testResultId)
            expect(attachments).toHaveLength(2)

            // Delete test result (should cascade to attachments)
            await dbManager.execute('DELETE FROM test_results WHERE id = ?', [testResultId])

            // Verify attachments are also deleted
            attachments = await attachmentRepository.getAttachmentsByTestResult(testResultId)
            expect(attachments).toHaveLength(0)
        })

        it('should prevent saving attachment with invalid test_result_id', async () => {
            const attachmentData = createAttachment('invalid-test-result-id', 'screenshot')

            await expect(attachmentRepository.saveAttachment(attachmentData)).rejects.toThrow()
        })

        it('should maintain referential integrity across multiple operations', async () => {
            // Create multiple test results with attachments
            const testData2 = createTestResult('test-2', 'passed')
            const testResultId2 = await testRepository.saveTestResult(testData2)

            await attachmentRepository.saveAttachment(createAttachment(testResultId, 'screenshot'))
            await attachmentRepository.saveAttachment(createAttachment(testResultId2, 'video'))

            // Delete one test result
            await dbManager.execute('DELETE FROM test_results WHERE id = ?', [testResultId])

            // Verify only attachments for deleted test result are removed
            const attachments1 = await attachmentRepository.getAttachmentsByTestResult(testResultId)
            expect(attachments1).toHaveLength(0)

            const attachments2 =
                await attachmentRepository.getAttachmentsByTestResult(testResultId2)
            expect(attachments2).toHaveLength(1)
        })
    })

    describe('Edge Cases', () => {
        it('should handle very long file names', async () => {
            const longFileName = 'a'.repeat(500) + '.png'
            const attachmentData = createAttachment(testResultId, 'screenshot', {
                fileName: longFileName,
            })

            const savedId = await attachmentRepository.saveAttachment(attachmentData)
            const saved = await attachmentRepository.getAttachmentById(savedId)

            expect(saved?.fileName).toBe(longFileName)
        })

        it('should handle very long file paths', async () => {
            const longPath = '/storage/' + 'a'.repeat(500)
            const attachmentData = createAttachment(testResultId, 'screenshot', {
                filePath: longPath,
            })

            const savedId = await attachmentRepository.saveAttachment(attachmentData)
            const saved = await attachmentRepository.getAttachmentById(savedId)

            expect(saved?.filePath).toBe(longPath)
        })

        it('should handle unicode characters in file names', async () => {
            const attachmentData = createAttachment(testResultId, 'screenshot', {
                fileName: 'тест-скриншот-日本語-🎉.png',
            })

            const savedId = await attachmentRepository.saveAttachment(attachmentData)
            const saved = await attachmentRepository.getAttachmentById(savedId)

            expect(saved?.fileName).toBe('тест-скриншот-日本語-🎉.png')
        })

        it('should handle zero file size', async () => {
            const attachmentData = createAttachment(testResultId, 'log', {
                fileSize: 0,
            })

            const savedId = await attachmentRepository.saveAttachment(attachmentData)
            const saved = await attachmentRepository.getAttachmentById(savedId)

            expect(saved?.fileSize).toBe(0)
        })

        it('should handle concurrent attachment saves', async () => {
            const attachments = Array.from({length: 10}, (_, i) =>
                createAttachment(testResultId, 'screenshot', {
                    fileName: `concurrent-${i}.png`,
                })
            )

            // Save all attachments concurrently
            const savePromises = attachments.map((a) => attachmentRepository.saveAttachment(a))
            await Promise.all(savePromises)

            const saved = await attachmentRepository.getAttachmentsByTestResult(testResultId)
            expect(saved).toHaveLength(10)
        })

        it('should handle empty MIME type', async () => {
            const attachmentData = createAttachment(testResultId, 'screenshot', {
                mimeType: '',
            })

            const savedId = await attachmentRepository.saveAttachment(attachmentData)
            const saved = await attachmentRepository.getAttachmentById(savedId)

            // Database converts empty string to null for optional fields
            expect(saved?.mimeType).toBeNull()
        })

        it('should handle attachment retrieval for deleted test result', async () => {
            await attachmentRepository.saveAttachment(createAttachment(testResultId, 'screenshot'))

            // Delete test result
            await dbManager.execute('DELETE FROM test_results WHERE id = ?', [testResultId])

            // Attachments should be cascade deleted
            const attachments = await attachmentRepository.getAttachmentsByTestResult(testResultId)
            expect(attachments).toHaveLength(0)
        })
    })

    describe('Integration Tests', () => {
        it('should work with complete test result workflow', async () => {
            // Create test result
            const testData = createTestResult('test-integration', 'passed')
            const resultId = await testRepository.saveTestResult(testData)

            // Add multiple attachments
            await attachmentRepository.saveAttachment(createAttachment(resultId, 'screenshot'))
            await attachmentRepository.saveAttachment(createAttachment(resultId, 'video'))
            await attachmentRepository.saveAttachment(createAttachment(resultId, 'trace'))

            // Retrieve attachments
            const attachments = await attachmentRepository.getAttachmentsByTestResult(resultId)
            expect(attachments).toHaveLength(3)

            // Retrieve with URLs
            const attachmentsWithUrls = await attachmentRepository.getAttachmentsWithUrls(resultId)
            expect(attachmentsWithUrls).toHaveLength(3)
            expect(attachmentsWithUrls.every((a) => a.url)).toBe(true)

            // Delete one attachment by deleting all
            await attachmentRepository.deleteAttachmentsByTestResult(resultId)

            // Verify deletion
            const remaining = await attachmentRepository.getAttachmentsByTestResult(resultId)
            expect(remaining).toHaveLength(0)
        })

        it('should handle multiple test results with attachments', async () => {
            // Create multiple test results
            const testData1 = createTestResult('test-1', 'passed')
            const testData2 = createTestResult('test-2', 'failed')
            const testData3 = createTestResult('test-3', 'passed')

            const resultId1 = await testRepository.saveTestResult(testData1)
            const resultId2 = await testRepository.saveTestResult(testData2)
            const resultId3 = await testRepository.saveTestResult(testData3)

            // Add attachments to each test result
            await attachmentRepository.saveAttachment(createAttachment(resultId1, 'screenshot'))
            await attachmentRepository.saveAttachment(createAttachment(resultId2, 'screenshot'))
            await attachmentRepository.saveAttachment(createAttachment(resultId2, 'video'))
            await attachmentRepository.saveAttachment(createAttachment(resultId3, 'trace'))

            // Verify each test result has correct attachments
            const attachments1 = await attachmentRepository.getAttachmentsByTestResult(resultId1)
            const attachments2 = await attachmentRepository.getAttachmentsByTestResult(resultId2)
            const attachments3 = await attachmentRepository.getAttachmentsByTestResult(resultId3)

            expect(attachments1).toHaveLength(1)
            expect(attachments2).toHaveLength(2)
            expect(attachments3).toHaveLength(1)
        })

        it('should maintain data integrity during bulk operations', async () => {
            // Create multiple test results
            const resultIds = await Promise.all([
                testRepository.saveTestResult(createTestResult('test-bulk-1', 'passed')),
                testRepository.saveTestResult(createTestResult('test-bulk-2', 'failed')),
                testRepository.saveTestResult(createTestResult('test-bulk-3', 'passed')),
            ])

            // Add attachments in bulk
            const savePromises: Promise<string>[] = []
            for (const resultId of resultIds) {
                savePromises.push(
                    attachmentRepository.saveAttachment(createAttachment(resultId, 'screenshot'))
                )
                savePromises.push(
                    attachmentRepository.saveAttachment(createAttachment(resultId, 'video'))
                )
            }
            await Promise.all(savePromises)

            // Verify all attachments were saved
            for (const resultId of resultIds) {
                const attachments = await attachmentRepository.getAttachmentsByTestResult(resultId)
                expect(attachments).toHaveLength(2)
            }
        })
    })
})
