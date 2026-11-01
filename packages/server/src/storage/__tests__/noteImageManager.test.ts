import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {NoteImageManager} from '../noteImageManager'
import fs from 'fs'
import path from 'path'
import {randomUUID} from 'crypto'
import os from 'os'

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPG_SIG = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
const GIF_SIG = Buffer.from('GIF89a')
const WEBP_SIG = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])
const BMP_SIG = Buffer.from('BM')
const png = (body = '') => Buffer.concat([PNG_SIG, Buffer.from(body)])

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
            const buffer = png('fake image data')

            const metadata = await manager.saveImage(buffer, testId)

            expect(metadata).toBeDefined()
            expect(metadata.id).toBeDefined()
            expect(metadata.testId).toBe(testId)
            expect(fs.existsSync(metadata.filePath)).toBe(true)
            const savedContent = fs.readFileSync(metadata.filePath)
            expect(savedContent.equals(png('fake image data'))).toBe(true)
        })

        it('should create test-specific directory', async () => {
            const buffer = png('test image')
            await manager.saveImage(buffer, testId)

            const testDir = path.join(tempDir, 'note-images', testId)
            expect(fs.existsSync(testDir)).toBe(true)
        })

        it('should detect MIME type correctly for PNG', async () => {
            const buffer = png('png data')
            const metadata = await manager.saveImage(buffer, testId, 'test.png')

            expect(metadata.mimeType).toBe('image/png')
        })

        it('should take MIME type and extension from the content, not the file name', async () => {
            const formats = [
                {buf: PNG_SIG, ext: '.png', mime: 'image/png'},
                {buf: JPG_SIG, ext: '.jpg', mime: 'image/jpeg'},
                {buf: GIF_SIG, ext: '.gif', mime: 'image/gif'},
                {buf: WEBP_SIG, ext: '.webp', mime: 'image/webp'},
                {buf: BMP_SIG, ext: '.bmp', mime: 'image/bmp'},
            ]

            for (const format of formats) {
                const metadata = await manager.saveImage(format.buf, randomUUID(), 'name.png')

                expect(metadata.mimeType).toBe(format.mime)
                expect(metadata.fileName.endsWith(format.ext)).toBe(true)
            }
        })

        it('should store a .svg-named PNG with a .png extension', async () => {
            const metadata = await manager.saveImage(png(), testId, 'evil.svg')

            expect(metadata.fileName).toMatch(/^evil-\d+-[a-z0-9]{6}\.png$/)
            expect(metadata.mimeType).toBe('image/png')
        })

        it('should reject SVG content even when named .png', async () => {
            const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')

            await expect(manager.saveImage(svg, testId, 'x.png')).rejects.toThrow(
                /Unsupported image content/
            )
            expect(fs.existsSync(path.join(tempDir, 'note-images', testId))).toBe(false)
        })

        it('should reject unrecognised content', async () => {
            await expect(manager.saveImage(Buffer.from('plain text'), testId)).rejects.toThrow()
            await expect(manager.saveImage(Buffer.alloc(0), testId)).rejects.toThrow()
        })

        it('should generate unique file names with timestamp and random suffix', async () => {
            const buffer = png('test')
            const metadata1 = await manager.saveImage(buffer, testId)
            const metadata2 = await manager.saveImage(buffer, testId)

            expect(metadata1.fileName).not.toBe(metadata2.fileName)
            expect(metadata1.fileName).toMatch(/^image-\d+-[a-z0-9]{6}\.png$/)
            expect(metadata2.fileName).toMatch(/^image-\d+-[a-z0-9]{6}\.png$/)
        })

        it('should use the sniffed extension for a JPEG', async () => {
            const metadata = await manager.saveImage(JPG_SIG, testId, 'screenshot.jpg')

            expect(metadata.fileName).toMatch(/\.jpg$/)
        })

        it('should generate unique file name when original file name is provided', async () => {
            const buffer = png('test')
            const metadata = await manager.saveImage(buffer, testId, 'my-image.png')

            expect(metadata.fileName).toMatch(/^my-image-\d+-[a-z0-9]{6}\.png$/)
        })

        it('should normalize invalid extension while keeping original base name', async () => {
            const buffer = png('test')
            const metadata = await manager.saveImage(buffer, testId, 'image.exe')

            expect(metadata.fileName).toMatch(/^image-\d+-[a-z0-9]{6}\.png$/)
            expect(metadata.mimeType).toBe('image/png')
        })

        it('should calculate file size correctly', async () => {
            const data = png('x'.repeat(1000))
            const metadata = await manager.saveImage(data, testId)

            expect(metadata.fileSize).toBe(data.length)
        })

        it('should generate correct URL path', async () => {
            const buffer = png('test')
            const metadata = await manager.saveImage(buffer, testId, 'test.png')

            expect(metadata.url).toBe(`/note-images/${testId}/${metadata.fileName}`)
        })

        it('should handle a signature-only image', async () => {
            const buffer = png('')
            const metadata = await manager.saveImage(buffer, testId)

            expect(metadata.fileSize).toBe(PNG_SIG.length)
            expect(fs.existsSync(metadata.filePath)).toBe(true)
        })

        it('should handle special characters in file names', async () => {
            const buffer = png('data')
            const metadata = await manager.saveImage(buffer, testId, 'test (copy) [1].png')

            expect(fs.existsSync(metadata.filePath)).toBe(true)
            expect(metadata.fileName).toMatch(/^test \(copy\) \[1\]-\d+-[a-z0-9]{6}\.png$/)
        })

        it('should avoid overwriting pasted images with the same original name', async () => {
            const first = await manager.saveImage(png('first'), testId, 'image.png')
            const second = await manager.saveImage(png('second'), testId, 'image.png')

            expect(first.fileName).not.toBe(second.fileName)
            expect(first.url).not.toBe(second.url)
            expect(fs.readFileSync(first.filePath).equals(png('first'))).toBe(true)
            expect(fs.readFileSync(second.filePath).equals(png('second'))).toBe(true)
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
            const buffer = png('test')
            const metadata = await manager.saveImage(buffer, testId, 'exists.png')

            expect(manager.imageExists(testId, metadata.fileName)).toBe(true)
            expect(manager.imageExists(testId, 'not-exists.png')).toBe(false)
        })
    })

    describe('Delete Operations', () => {
        it('should delete single image', async () => {
            const buffer = png('test')
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
            const buffer = png('test')
            const metadata = await manager.saveImage(buffer, testId, 'only-file.png')

            await manager.deleteImage(testId, metadata.fileName)

            const testDir = path.join(tempDir, 'note-images', testId)
            expect(fs.existsSync(testDir)).toBe(false)
        })

        it('should not remove directory if other files exist', async () => {
            const metadata1 = await manager.saveImage(png('1'), testId, 'file1.png')
            await manager.saveImage(png('2'), testId, 'file2.png')

            await manager.deleteImage(testId, metadata1.fileName)

            const testDir = path.join(tempDir, 'note-images', testId)
            expect(fs.existsSync(testDir)).toBe(true)
        })

        it('should delete all images for a test', async () => {
            await manager.saveImage(png('1'), testId, 'file1.png')
            await manager.saveImage(png('2'), testId, 'file2.png')
            await manager.saveImage(png('3'), testId, 'file3.png')

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
                .map((_, i) => manager.saveImage(png(`content ${i}`), testId, `file${i}.png`))

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
                await manager.saveImage(png('test'), id)
            }

            // Verify all directories exist
            for (const id of testIds) {
                const testDir = path.join(tempDir, 'note-images', id)
                expect(fs.existsSync(testDir)).toBe(true)
            }
        })

        it.each(['..', '../victim', '../../victim', 'a/../..', '/abs'])(
            'should refuse testId %j that escapes the storage dir',
            async (badId) => {
                const sentinelDir = path.join(tempDir, 'victim')
                fs.mkdirSync(sentinelDir)
                fs.writeFileSync(path.join(sentinelDir, 'keep.txt'), 'keep')

                await expect(manager.saveImage(png(), badId)).rejects.toThrow(/escapes/)
                await expect(manager.deleteImagesByTestId(badId)).rejects.toThrow(/escapes/)
                await expect(manager.deleteImage(badId, 'keep.txt')).rejects.toThrow(/escapes/)
                expect(() => manager.getImagePath(badId, 'x.png')).toThrow(/escapes/)
                expect(fs.readFileSync(path.join(sentinelDir, 'keep.txt'), 'utf8')).toBe('keep')
            }
        )

        it('should refuse a file name that escapes the test directory', () => {
            expect(() => manager.getImagePath(testId, '../../etc/passwd')).toThrow(/escapes/)
            expect(() => manager.imageExists(testId, '../other/x.png')).toThrow(/escapes/)
        })

        it('should drop directory parts from the client file name', async () => {
            const metadata = await manager.saveImage(png(), testId, '../../planted/x.svg')

            expect(metadata.filePath.startsWith(path.join(tempDir, 'note-images', testId))).toBe(
                true
            )
            expect(metadata.fileName).toMatch(/^x-\d+-[a-z0-9]{6}\.png$/)
        })

        it('should handle very large image files', async () => {
            // Create a 1MB file
            const largeData = Buffer.concat([PNG_SIG, Buffer.alloc(1024 * 1024 - 8, 'a')])
            const metadata = await manager.saveImage(largeData, testId, 'large.png')

            expect(metadata.fileSize).toBe(1024 * 1024)
            expect(fs.existsSync(metadata.filePath)).toBe(true)
        })
    })
})
