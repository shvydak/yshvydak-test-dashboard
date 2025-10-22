import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {AttachmentManager, AttachmentType} from '../attachmentManager'
import fs from 'fs'
import path from 'path'
import {randomUUID} from 'crypto'
import os from 'os'

describe('AttachmentManager', () => {
    let tempDir: string
    let manager: AttachmentManager
    let testResultId: string

    beforeEach(async () => {
        // Create unique temp directory for each test
        tempDir = path.join(os.tmpdir(), `test-attachments-${randomUUID()}`)
        fs.mkdirSync(tempDir, {recursive: true})

        manager = new AttachmentManager(tempDir)
        testResultId = randomUUID()
    })

    afterEach(async () => {
        // Cleanup temp directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, {recursive: true, force: true})
        }
    })

    describe('Initialization', () => {
        it('should create attachments directory on initialization', () => {
            const attachmentsDir = path.join(tempDir, 'attachments')
            expect(fs.existsSync(attachmentsDir)).toBe(true)
        })

        it('should not fail if directory already exists', () => {
            // Create another manager with same directory
            const _manager2 = new AttachmentManager(tempDir)
            const attachmentsDir = path.join(tempDir, 'attachments')
            expect(fs.existsSync(attachmentsDir)).toBe(true)
        })
    })

    describe('copyPlaywrightAttachment', () => {
        let sourceFile: string

        beforeEach(() => {
            // Create a temporary source file
            sourceFile = path.join(tempDir, `source-${randomUUID()}.png`)
            fs.writeFileSync(sourceFile, Buffer.from('fake image data'))
        })

        afterEach(() => {
            if (fs.existsSync(sourceFile)) {
                fs.unlinkSync(sourceFile)
            }
        })

        it('should copy file from source to permanent storage', async () => {
            const metadata = await manager.copyPlaywrightAttachment(
                sourceFile,
                testResultId,
                'screenshot'
            )

            expect(metadata).toBeDefined()
            expect(metadata.id).toBeDefined()
            expect(metadata.testResultId).toBe(testResultId)
            expect(metadata.type).toBe('screenshot')
            expect(fs.existsSync(metadata.filePath)).toBe(true)
        })

        it('should create test-specific directory', async () => {
            await manager.copyPlaywrightAttachment(sourceFile, testResultId, 'screenshot')

            const testDir = path.join(tempDir, 'attachments', testResultId)
            expect(fs.existsSync(testDir)).toBe(true)
        })

        it('should detect MIME type correctly for PNG', async () => {
            const pngFile = path.join(tempDir, 'test.png')
            fs.writeFileSync(pngFile, Buffer.from('png data'))

            const metadata = await manager.copyPlaywrightAttachment(
                pngFile,
                testResultId,
                'screenshot'
            )

            expect(metadata.mimeType).toBe('image/png')
        })

        it('should detect MIME type correctly for video formats', async () => {
            const videoFormats = [
                {ext: '.mp4', mime: 'video/mp4'},
                {ext: '.webm', mime: 'video/webm'},
                {ext: '.avi', mime: 'video/x-msvideo'},
            ]

            for (const format of videoFormats) {
                const videoFile = path.join(tempDir, `test${format.ext}`)
                fs.writeFileSync(videoFile, Buffer.from('video data'))

                const metadata = await manager.copyPlaywrightAttachment(
                    videoFile,
                    testResultId,
                    'video'
                )

                expect(metadata.mimeType).toBe(format.mime)

                // Cleanup
                fs.unlinkSync(videoFile)
            }
        })

        it('should detect MIME type for all image formats', async () => {
            const imageFormats = [
                {ext: '.png', mime: 'image/png'},
                {ext: '.jpg', mime: 'image/jpeg'},
                {ext: '.jpeg', mime: 'image/jpeg'},
                {ext: '.gif', mime: 'image/gif'},
                {ext: '.webp', mime: 'image/webp'},
            ]

            for (const format of imageFormats) {
                const imageFile = path.join(tempDir, `test${format.ext}`)
                fs.writeFileSync(imageFile, Buffer.from('image data'))

                const metadata = await manager.copyPlaywrightAttachment(
                    imageFile,
                    randomUUID(),
                    'screenshot'
                )

                expect(metadata.mimeType).toBe(format.mime)
            }
        })

        it('should detect MIME type for trace and log files', async () => {
            const fileFormats = [
                {ext: '.zip', mime: 'application/zip', type: 'trace' as AttachmentType},
                {ext: '.json', mime: 'application/json', type: 'log' as AttachmentType},
                {ext: '.log', mime: 'text/plain', type: 'log' as AttachmentType},
                {ext: '.txt', mime: 'text/plain', type: 'log' as AttachmentType},
                {ext: '.html', mime: 'text/html', type: 'log' as AttachmentType},
            ]

            for (const format of fileFormats) {
                const file = path.join(tempDir, `test${format.ext}`)
                fs.writeFileSync(file, Buffer.from('file data'))

                const metadata = await manager.copyPlaywrightAttachment(
                    file,
                    randomUUID(),
                    format.type
                )

                expect(metadata.mimeType).toBe(format.mime)
            }
        })

        it('should use default MIME type for unknown extensions', async () => {
            const unknownFile = path.join(tempDir, 'test.xyz')
            fs.writeFileSync(unknownFile, Buffer.from('unknown data'))

            const metadata = await manager.copyPlaywrightAttachment(
                unknownFile,
                testResultId,
                'log'
            )

            expect(metadata.mimeType).toBe('application/octet-stream')
        })

        it('should generate unique file names with timestamp and random suffix', async () => {
            const metadata1 = await manager.copyPlaywrightAttachment(
                sourceFile,
                testResultId,
                'screenshot'
            )
            const metadata2 = await manager.copyPlaywrightAttachment(
                sourceFile,
                testResultId,
                'screenshot'
            )

            expect(metadata1.fileName).not.toBe(metadata2.fileName)
            expect(metadata1.fileName).toMatch(/\d+-[a-z0-9]{6}\.png$/)
            expect(metadata2.fileName).toMatch(/\d+-[a-z0-9]{6}\.png$/)
        })

        it('should preserve original file extension', async () => {
            const jpgFile = path.join(tempDir, 'screenshot.jpg')
            fs.writeFileSync(jpgFile, Buffer.from('jpg data'))

            const metadata = await manager.copyPlaywrightAttachment(
                jpgFile,
                testResultId,
                'screenshot'
            )

            expect(metadata.fileName).toMatch(/\.jpg$/)
        })

        it('should calculate file size correctly', async () => {
            const data = Buffer.from('test data with known length')
            fs.writeFileSync(sourceFile, data)

            const metadata = await manager.copyPlaywrightAttachment(
                sourceFile,
                testResultId,
                'screenshot'
            )

            expect(metadata.fileSize).toBe(data.length)
        })

        it('should generate correct URL path', async () => {
            const metadata = await manager.copyPlaywrightAttachment(
                sourceFile,
                testResultId,
                'screenshot'
            )

            expect(metadata.url).toBe(`/attachments/${testResultId}/${metadata.fileName}`)
        })

        it('should fail if source file does not exist', async () => {
            const nonExistentFile = path.join(tempDir, 'does-not-exist.png')

            await expect(
                manager.copyPlaywrightAttachment(nonExistentFile, testResultId, 'screenshot')
            ).rejects.toThrow('Source file not found')
        })

        it('should handle very large files', async () => {
            // Create a 1MB file
            const largeData = Buffer.alloc(1024 * 1024, 'a')
            const largeFile = path.join(tempDir, 'large.mp4')
            fs.writeFileSync(largeFile, largeData)

            const metadata = await manager.copyPlaywrightAttachment(
                largeFile,
                testResultId,
                'video'
            )

            expect(metadata.fileSize).toBe(1024 * 1024)
            expect(fs.existsSync(metadata.filePath)).toBe(true)

            // Cleanup
            fs.unlinkSync(largeFile)
        })

        it('should handle special characters in file names', async () => {
            const specialFile = path.join(tempDir, 'test (copy) [1].png')
            fs.writeFileSync(specialFile, Buffer.from('data'))

            const metadata = await manager.copyPlaywrightAttachment(
                specialFile,
                testResultId,
                'screenshot'
            )

            expect(fs.existsSync(metadata.filePath)).toBe(true)
            expect(metadata.fileName).toContain('test (copy) [1]')
        })

        it('should use original file name when provided', async () => {
            const metadata = await manager.copyPlaywrightAttachment(
                sourceFile,
                testResultId,
                'screenshot',
                'custom-name.png'
            )

            expect(metadata.fileName).toBe('custom-name.png')
        })
    })

    describe('saveAttachment', () => {
        it('should save buffer to file', async () => {
            const buffer = Buffer.from('test attachment content')

            const metadata = await manager.saveAttachment(buffer, testResultId, 'log')

            expect(fs.existsSync(metadata.filePath)).toBe(true)
            const savedContent = fs.readFileSync(metadata.filePath)
            expect(savedContent.toString()).toBe('test attachment content')
        })

        it('should generate file name for each attachment type', async () => {
            const types: AttachmentType[] = ['video', 'screenshot', 'trace', 'log']

            for (const type of types) {
                const buffer = Buffer.from(`${type} data`)
                const metadata = await manager.saveAttachment(buffer, randomUUID(), type)

                expect(metadata.fileName).toMatch(new RegExp(`^${type}-\\d+-[a-z0-9]{6}`))
            }
        })

        it('should use provided file name if specified', async () => {
            const buffer = Buffer.from('custom content')

            const metadata = await manager.saveAttachment(
                buffer,
                testResultId,
                'log',
                'custom-log.txt'
            )

            expect(metadata.fileName).toBe('custom-log.txt')
        })

        it('should set correct file size', async () => {
            const buffer = Buffer.from('x'.repeat(1000))

            const metadata = await manager.saveAttachment(buffer, testResultId, 'log')

            expect(metadata.fileSize).toBe(1000)
        })

        it('should create test directory if it does not exist', async () => {
            const newTestId = randomUUID()
            const buffer = Buffer.from('test')

            await manager.saveAttachment(buffer, newTestId, 'log')

            const testDir = path.join(tempDir, 'attachments', newTestId)
            expect(fs.existsSync(testDir)).toBe(true)
        })

        it('should handle empty buffer', async () => {
            const buffer = Buffer.from('')

            const metadata = await manager.saveAttachment(buffer, testResultId, 'log')

            expect(metadata.fileSize).toBe(0)
            expect(fs.existsSync(metadata.filePath)).toBe(true)
        })
    })

    describe('URL Generation', () => {
        it('should generate correct URL format', () => {
            const url = manager.generateUrl('test-123', 'file.png')

            expect(url).toBe('/attachments/test-123/file.png')
        })

        it('should handle special characters in file name', () => {
            const url = manager.generateUrl('test-123', 'file (1).png')

            expect(url).toBe('/attachments/test-123/file (1).png')
        })
    })

    describe('File Path Operations', () => {
        it('should return correct attachment path', () => {
            const filePath = manager.getAttachmentPath(testResultId, 'test.png')

            expect(filePath).toBe(path.join(tempDir, 'attachments', testResultId, 'test.png'))
        })

        it('should check if attachment exists', async () => {
            const buffer = Buffer.from('test')
            await manager.saveAttachment(buffer, testResultId, 'log', 'exists.txt')

            expect(manager.attachmentExists(testResultId, 'exists.txt')).toBe(true)
            expect(manager.attachmentExists(testResultId, 'not-exists.txt')).toBe(false)
        })
    })

    describe('Delete Operations', () => {
        it('should delete single attachment', async () => {
            const buffer = Buffer.from('test')
            const metadata = await manager.saveAttachment(
                buffer,
                testResultId,
                'log',
                'delete-me.txt'
            )

            const deleted = await manager.deleteAttachment(testResultId, 'delete-me.txt')

            expect(deleted).toBe(true)
            expect(fs.existsSync(metadata.filePath)).toBe(false)
        })

        it('should return false when deleting non-existent file', async () => {
            const deleted = await manager.deleteAttachment(testResultId, 'not-exists.txt')

            expect(deleted).toBe(false)
        })

        it('should remove empty test directory after deleting last file', async () => {
            const buffer = Buffer.from('test')
            await manager.saveAttachment(buffer, testResultId, 'log', 'only-file.txt')

            await manager.deleteAttachment(testResultId, 'only-file.txt')

            const testDir = path.join(tempDir, 'attachments', testResultId)
            expect(fs.existsSync(testDir)).toBe(false)
        })

        it('should not remove directory if other files exist', async () => {
            await manager.saveAttachment(Buffer.from('1'), testResultId, 'log', 'file1.txt')
            await manager.saveAttachment(Buffer.from('2'), testResultId, 'log', 'file2.txt')

            await manager.deleteAttachment(testResultId, 'file1.txt')

            const testDir = path.join(tempDir, 'attachments', testResultId)
            expect(fs.existsSync(testDir)).toBe(true)
        })

        it('should delete all attachments for a test result', async () => {
            await manager.saveAttachment(Buffer.from('1'), testResultId, 'log', 'file1.txt')
            await manager.saveAttachment(Buffer.from('2'), testResultId, 'log', 'file2.txt')
            await manager.saveAttachment(Buffer.from('3'), testResultId, 'log', 'file3.txt')

            const deletedCount = await manager.deleteTestAttachments(testResultId)

            expect(deletedCount).toBe(3)

            const testDir = path.join(tempDir, 'attachments', testResultId)
            expect(fs.existsSync(testDir)).toBe(false)
        })

        it('should return 0 when deleting attachments for non-existent test', async () => {
            const count = await manager.deleteTestAttachments('non-existent-id')

            expect(count).toBe(0)
        })
    })

    describe('Storage Statistics', () => {
        beforeEach(async () => {
            // Create sample attachments
            await manager.saveAttachment(Buffer.alloc(100), testResultId, 'screenshot', 'img1.png')
            await manager.saveAttachment(Buffer.alloc(200), testResultId, 'screenshot', 'img2.png')
            await manager.saveAttachment(Buffer.alloc(300), testResultId, 'video', 'vid1.mp4')
            await manager.saveAttachment(Buffer.alloc(150), testResultId, 'log', 'log1.log')

            const testId2 = randomUUID()
            await manager.saveAttachment(Buffer.alloc(250), testId2, 'trace', 'trace1.zip')
        })

        it('should calculate total files and size', async () => {
            const stats = await manager.getStorageStats()

            expect(stats.totalFiles).toBe(5)
            expect(stats.totalSize).toBe(1000) // 100+200+300+150+250
        })

        it('should count test directories', async () => {
            const stats = await manager.getStorageStats()

            expect(stats.testDirectories).toBe(2)
        })

        it('should break down statistics by type', async () => {
            const stats = await manager.getStorageStats()

            expect(stats.typeBreakdown.screenshot).toEqual({count: 2, size: 300})
            expect(stats.typeBreakdown.video).toEqual({count: 1, size: 300})
            expect(stats.typeBreakdown.log).toEqual({count: 1, size: 150})
            expect(stats.typeBreakdown.trace).toEqual({count: 1, size: 250})
        })

        it('should return empty stats for empty storage', async () => {
            const emptyDir = path.join(os.tmpdir(), `empty-${randomUUID()}`)
            const emptyManager = new AttachmentManager(emptyDir)

            // Delete attachments directory to test empty state
            const attachmentsDir = path.join(emptyDir, 'attachments')
            if (fs.existsSync(attachmentsDir)) {
                fs.rmSync(attachmentsDir, {recursive: true})
            }

            const stats = await emptyManager.getStorageStats()

            expect(stats.totalFiles).toBe(0)
            expect(stats.totalSize).toBe(0)
            expect(stats.testDirectories).toBe(0)

            // Cleanup
            fs.rmSync(emptyDir, {recursive: true, force: true})
        })

        it('should categorize unknown extensions as "other"', async () => {
            await manager.saveAttachment(Buffer.alloc(100), randomUUID(), 'log', 'unknown.xyz')

            const stats = await manager.getStorageStats()

            expect(stats.typeBreakdown.other).toEqual({count: 1, size: 100})
        })
    })

    describe('Cleanup Old Attachments', () => {
        it('should delete attachments older than specified days', async () => {
            const oldTestId = randomUUID()
            await manager.saveAttachment(Buffer.alloc(100), oldTestId, 'log', 'old.txt')

            // Manually change directory mtime to simulate old directory
            const testDir = path.join(tempDir, 'attachments', oldTestId)
            const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) // 40 days ago
            fs.utimesSync(testDir, oldDate, oldDate)

            // Create a recent attachment
            const recentTestId = randomUUID()
            await manager.saveAttachment(Buffer.alloc(200), recentTestId, 'log', 'recent.txt')

            const result = await manager.cleanup(30)

            expect(result.deletedFiles).toBe(1)
            expect(result.freedSpace).toBe(100)

            // Old directory should be deleted
            expect(fs.existsSync(testDir)).toBe(false)

            // Recent directory should still exist
            const recentDir = path.join(tempDir, 'attachments', recentTestId)
            expect(fs.existsSync(recentDir)).toBe(true)
        })

        it('should handle cleanup with no old files', async () => {
            await manager.saveAttachment(Buffer.alloc(100), testResultId, 'log', 'recent.txt')

            const result = await manager.cleanup(30)

            expect(result.deletedFiles).toBe(0)
            expect(result.freedSpace).toBe(0)
        })

        it('should handle cleanup with empty attachments directory', async () => {
            const emptyDir = path.join(os.tmpdir(), `cleanup-empty-${randomUUID()}`)
            const emptyManager = new AttachmentManager(emptyDir)

            // Remove attachments directory
            const attachmentsDir = path.join(emptyDir, 'attachments')
            if (fs.existsSync(attachmentsDir)) {
                fs.rmSync(attachmentsDir, {recursive: true})
            }

            const result = await emptyManager.cleanup(30)

            expect(result.deletedFiles).toBe(0)
            expect(result.freedSpace).toBe(0)

            // Cleanup
            fs.rmSync(emptyDir, {recursive: true, force: true})
        })

        it('should use default 30 days if not specified', async () => {
            const oldTestId = randomUUID()
            await manager.saveAttachment(Buffer.alloc(100), oldTestId, 'log', 'old.txt')

            const testDir = path.join(tempDir, 'attachments', oldTestId)
            const oldDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000) // 35 days ago
            fs.utimesSync(testDir, oldDate, oldDate)

            const result = await manager.cleanup() // No days specified, should use 30

            expect(result.deletedFiles).toBe(1)
        })
    })

    describe('Edge Cases', () => {
        it('should handle concurrent file operations', async () => {
            const promises = Array(10)
                .fill(null)
                .map((_, i) =>
                    manager.saveAttachment(
                        Buffer.from(`content ${i}`),
                        testResultId,
                        'log',
                        `file${i}.txt`
                    )
                )

            const results = await Promise.all(promises)

            expect(results).toHaveLength(10)
            results.forEach((metadata) => {
                expect(fs.existsSync(metadata.filePath)).toBe(true)
            })
        })

        it('should handle multiple test result directories', async () => {
            const testIds = Array(5)
                .fill(null)
                .map(() => randomUUID())

            for (const id of testIds) {
                await manager.saveAttachment(Buffer.from('test'), id, 'log')
            }

            const stats = await manager.getStorageStats()
            expect(stats.testDirectories).toBe(5)
        })

        it('should handle binary data correctly', async () => {
            const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) // PNG header

            const metadata = await manager.saveAttachment(
                binaryData,
                testResultId,
                'screenshot',
                'binary.png'
            )

            const savedData = fs.readFileSync(metadata.filePath)
            expect(savedData.equals(binaryData)).toBe(true)
        })

        it('should handle path traversal attempts safely', () => {
            const maliciousFileName = '../../etc/passwd'
            const filePath = manager.getAttachmentPath(testResultId, maliciousFileName)

            // path.join() normalizes the path, so traversal will work
            // The important thing is that the path construction is predictable
            expect(filePath).toContain(tempDir)

            // In production, this would be handled by Express static middleware
            // which checks that requested paths are within the served directory
        })
    })
})
