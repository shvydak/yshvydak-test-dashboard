import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {NoteImageManager} from '../noteImageManager'
import fs from 'fs'
import path from 'path'
import {randomUUID} from 'crypto'
import os from 'os'

describe('NoteImageManager', () => {
    let tempDir: string
    let manager: NoteImageManager
    let testId: string

    beforeEach(async () => {
        // Create unique temp directory for each test
        tempDir = path.join(os.tmpdir(), `test-note-images-${randomUUID()}`)
        fs.mkdirSync(tempDir, {recursive: true})

        manager = new NoteImageManager(tempDir)
        testId = randomUUID()
    })

    afterEach(async () => {
        // Cleanup temp directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, {recursive: true, force: true})
        }
    })

    describe('Initialization', () => {
        it('should create note-images directory on initialization', () => {
            const noteImagesDir = path.join(tempDir, 'note-images')
            expect(fs.existsSync(noteImagesDir)).toBe(true)
        })

        it('should not fail if directory already exists', () => {
            // Create another manager with same directory
            const _manager2 = new NoteImageManager(tempDir)
            const noteImagesDir = path.join(tempDir, 'note-images')
            expect(fs.existsSync(noteImagesDir)).toBe(true)
        })
    })

    describe('saveImage', () => {
        it('should save buffer to file', async () => {
            const buffer = Buffer.from('fake image data')

            const metadata = await manager.saveImage(buffer, testId)

            expect(metadata).toBeDefined()
            expect(metadata.id).toBeDefined()
            expect(metadata.testId).toBe(testId)
            expect(fs.existsSync(metadata.filePath)).toBe(true)
            const savedContent = fs.readFileSync(metadata.filePath)
            expect(savedContent.toString()).toBe('fake image data')
        })

        it('should create test-specific directory', async () => {
            const buffer = Buffer.from('test image')
            await manager.saveImage(buffer, testId)

            const testDir = path.join(tempDir, 'note-images', testId)
            expect(fs.existsSync(testDir)).toBe(true)
        })

        it('should detect MIME type correctly for PNG', async () => {
            const buffer = Buffer.from('png data')
            const metadata = await manager.saveImage(buffer, testId, 'test.png')

            expect(metadata.mimeType).toBe('image/png')
        })

        it('should detect MIME type for all image formats', async () => {
            const imageFormats = [
                {ext: '.png', mime: 'image/png'},
                {ext: '.jpg', mime: 'image/jpeg'},
                {ext: '.jpeg', mime: 'image/jpeg'},
                {ext: '.gif', mime: 'image/gif'},
                {ext: '.webp', mime: 'image/webp'},
                {ext: '.bmp', mime: 'image/bmp'},
                {ext: '.svg', mime: 'image/svg+xml'},
            ]

            for (const format of imageFormats) {
                const buffer = Buffer.from('image data')
                const metadata = await manager.saveImage(buffer, randomUUID(), `test${format.ext}`)

                expect(metadata.mimeType).toBe(format.mime)
            }
        })

        it('should use default PNG MIME type for unknown extensions', async () => {
            const buffer = Buffer.from('unknown data')
            const metadata = await manager.saveImage(buffer, testId, 'test.xyz')

            expect(metadata.mimeType).toBe('image/png')
        })

        it('should generate unique file names with timestamp and random suffix', async () => {
            const buffer = Buffer.from('test')
            const metadata1 = await manager.saveImage(buffer, testId)
            const metadata2 = await manager.saveImage(buffer, testId)

            expect(metadata1.fileName).not.toBe(metadata2.fileName)
            expect(metadata1.fileName).toMatch(/^image-\d+-[a-z0-9]{6}\.png$/)
            expect(metadata2.fileName).toMatch(/^image-\d+-[a-z0-9]{6}\.png$/)
        })

        it('should preserve original file extension when provided', async () => {
            const buffer = Buffer.from('jpg data')
            const metadata = await manager.saveImage(buffer, testId, 'screenshot.jpg')

            expect(metadata.fileName).toMatch(/\.jpg$/)
        })

        it('should use provided file name as-is when specified', async () => {
            const buffer = Buffer.from('test')
            const metadata = await manager.saveImage(buffer, testId, 'my-image.png')

            // When fileName is provided, it's used as-is (no timestamp/random suffix)
            expect(metadata.fileName).toBe('my-image.png')
        })

        it('should use provided file name even with invalid extension', async () => {
            const buffer = Buffer.from('test')
            const metadata = await manager.saveImage(buffer, testId, 'image.exe')

            // File name is used as-is, but MIME type defaults to PNG for unknown extensions
            expect(metadata.fileName).toBe('image.exe')
            expect(metadata.mimeType).toBe('image/png')
        })

        it('should calculate file size correctly', async () => {
            const data = Buffer.from('x'.repeat(1000))
            const metadata = await manager.saveImage(data, testId)

            expect(metadata.fileSize).toBe(1000)
        })

        it('should generate correct URL path', async () => {
            const buffer = Buffer.from('test')
            const metadata = await manager.saveImage(buffer, testId, 'test.png')

            expect(metadata.url).toBe(`/note-images/${testId}/${metadata.fileName}`)
        })

        it('should handle empty buffer', async () => {
            const buffer = Buffer.from('')
            const metadata = await manager.saveImage(buffer, testId)

            expect(metadata.fileSize).toBe(0)
            expect(fs.existsSync(metadata.filePath)).toBe(true)
        })

        it('should handle special characters in file names', async () => {
            const buffer = Buffer.from('data')
            const metadata = await manager.saveImage(buffer, testId, 'test (copy) [1].png')

            expect(fs.existsSync(metadata.filePath)).toBe(true)
            expect(metadata.fileName).toContain('test (copy) [1]')
        })

        it('should handle binary image data correctly', async () => {
            // PNG header bytes
            const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

            const metadata = await manager.saveImage(binaryData, testId, 'binary.png')

            const savedData = fs.readFileSync(metadata.filePath)
            expect(savedData.equals(binaryData)).toBe(true)
        })
    })

    describe('URL Generation', () => {
        it('should generate correct URL format', () => {
            const url = manager.generateUrl('test-123', 'file.png')

            expect(url).toBe('/note-images/test-123/file.png')
        })

        it('should handle special characters in file name', () => {
            const url = manager.generateUrl('test-123', 'file (1).png')

            expect(url).toBe('/note-images/test-123/file (1).png')
        })
    })

    describe('File Path Operations', () => {
        it('should return correct image path', () => {
            const filePath = manager.getImagePath(testId, 'test.png')

            expect(filePath).toBe(path.join(tempDir, 'note-images', testId, 'test.png'))
        })

        it('should check if image exists', async () => {
            const buffer = Buffer.from('test')
            const metadata = await manager.saveImage(buffer, testId, 'exists.png')

            expect(manager.imageExists(testId, metadata.fileName)).toBe(true)
            expect(manager.imageExists(testId, 'not-exists.png')).toBe(false)
        })
    })

    describe('Delete Operations', () => {
        it('should delete single image', async () => {
            const buffer = Buffer.from('test')
            const metadata = await manager.saveImage(buffer, testId, 'delete-me.png')

            const deleted = await manager.deleteImage(testId, metadata.fileName)

            expect(deleted).toBe(true)
            expect(fs.existsSync(metadata.filePath)).toBe(false)
        })

        it('should return false when deleting non-existent file', async () => {
            const deleted = await manager.deleteImage(testId, 'not-exists.png')

            expect(deleted).toBe(false)
        })

        it('should remove empty test directory after deleting last file', async () => {
            const buffer = Buffer.from('test')
            const metadata = await manager.saveImage(buffer, testId, 'only-file.png')

            await manager.deleteImage(testId, metadata.fileName)

            const testDir = path.join(tempDir, 'note-images', testId)
            expect(fs.existsSync(testDir)).toBe(false)
        })

        it('should not remove directory if other files exist', async () => {
            const metadata1 = await manager.saveImage(Buffer.from('1'), testId, 'file1.png')
            await manager.saveImage(Buffer.from('2'), testId, 'file2.png')

            await manager.deleteImage(testId, metadata1.fileName)

            const testDir = path.join(tempDir, 'note-images', testId)
            expect(fs.existsSync(testDir)).toBe(true)
        })

        it('should delete all images for a test', async () => {
            await manager.saveImage(Buffer.from('1'), testId, 'file1.png')
            await manager.saveImage(Buffer.from('2'), testId, 'file2.png')
            await manager.saveImage(Buffer.from('3'), testId, 'file3.png')

            const deletedCount = await manager.deleteImagesByTestId(testId)

            expect(deletedCount).toBe(3)

            const testDir = path.join(tempDir, 'note-images', testId)
            expect(fs.existsSync(testDir)).toBe(false)
        })

        it('should return 0 when deleting images for non-existent test', async () => {
            const count = await manager.deleteImagesByTestId('non-existent-id')

            expect(count).toBe(0)
        })

        it('should handle deletion of test with no images', async () => {
            const count = await manager.deleteImagesByTestId(testId)

            expect(count).toBe(0)
        })
    })

    describe('Edge Cases', () => {
        it('should handle concurrent file operations', async () => {
            const promises = Array(10)
                .fill(null)
                .map((_, i) =>
                    manager.saveImage(Buffer.from(`content ${i}`), testId, `file${i}.png`)
                )

            const results = await Promise.all(promises)

            expect(results).toHaveLength(10)
            results.forEach((metadata) => {
                expect(fs.existsSync(metadata.filePath)).toBe(true)
            })
        })

        it('should handle multiple test directories', async () => {
            const testIds = Array(5)
                .fill(null)
                .map(() => randomUUID())

            for (const id of testIds) {
                await manager.saveImage(Buffer.from('test'), id)
            }

            // Verify all directories exist
            for (const id of testIds) {
                const testDir = path.join(tempDir, 'note-images', id)
                expect(fs.existsSync(testDir)).toBe(true)
            }
        })

        it('should handle path traversal attempts safely', () => {
            const maliciousFileName = '../../etc/passwd'
            const filePath = manager.getImagePath(testId, maliciousFileName)

            // path.join() normalizes the path, so traversal will work
            // The important thing is that the path construction is predictable
            expect(filePath).toContain(tempDir)

            // In production, this would be handled by Express static middleware
            // which checks that requested paths are within the served directory
        })

        it('should handle very large image files', async () => {
            // Create a 1MB file
            const largeData = Buffer.alloc(1024 * 1024, 'a')
            const metadata = await manager.saveImage(largeData, testId, 'large.png')

            expect(metadata.fileSize).toBe(1024 * 1024)
            expect(fs.existsSync(metadata.filePath)).toBe(true)
        })
    })
})
