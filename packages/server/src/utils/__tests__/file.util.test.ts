/**
 * FileUtil Tests (CRITICAL)
 *
 * These tests verify the file utility functions work correctly.
 * This is CRITICAL because:
 * 1. File operations are used throughout the codebase
 * 2. MIME type mapping ensures correct attachment categorization
 * 3. Path normalization prevents security issues (path traversal)
 * 4. File size calculations are used for storage statistics
 *
 * Coverage target: 80%+
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {FileUtil} from '../file.util'

// Mock the config
vi.mock('../../config/environment.config', () => ({
    config: {
        playwright: {
            projectDir: '/home/user/projects/test-project',
        },
    },
}))

describe('FileUtil', () => {
    let tempDir: string

    beforeEach(() => {
        // Create a temporary directory for tests
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-util-test-'))
    })

    afterEach(() => {
        // Cleanup temp directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, {recursive: true, force: true})
        }
    })

    describe('ensureDirectoryExists', () => {
        it('should create directory if it does not exist', () => {
            const newDir = path.join(tempDir, 'new-directory')
            expect(fs.existsSync(newDir)).toBe(false)

            FileUtil.ensureDirectoryExists(newDir)

            expect(fs.existsSync(newDir)).toBe(true)
            expect(fs.statSync(newDir).isDirectory()).toBe(true)
        })

        it('should not throw error if directory already exists', () => {
            const existingDir = path.join(tempDir, 'existing')
            fs.mkdirSync(existingDir)

            expect(() => FileUtil.ensureDirectoryExists(existingDir)).not.toThrow()
            expect(fs.existsSync(existingDir)).toBe(true)
        })

        it('should create nested directories', () => {
            const nestedDir = path.join(tempDir, 'level1', 'level2', 'level3')
            expect(fs.existsSync(nestedDir)).toBe(false)

            FileUtil.ensureDirectoryExists(nestedDir)

            expect(fs.existsSync(nestedDir)).toBe(true)
            expect(fs.statSync(nestedDir).isDirectory()).toBe(true)
        })

        it('should be idempotent - multiple calls should work', () => {
            const dir = path.join(tempDir, 'idempotent')

            FileUtil.ensureDirectoryExists(dir)
            FileUtil.ensureDirectoryExists(dir)
            FileUtil.ensureDirectoryExists(dir)

            expect(fs.existsSync(dir)).toBe(true)
            expect(fs.statSync(dir).isDirectory()).toBe(true)
        })
    })

    describe('getFileSize', () => {
        it('should return file size in bytes', () => {
            const filePath = path.join(tempDir, 'test.txt')
            const content = 'Hello, World!'
            fs.writeFileSync(filePath, content)

            const size = FileUtil.getFileSize(filePath)

            expect(size).toBe(Buffer.byteLength(content))
        })

        it('should return 0 for non-existent file', () => {
            const nonExistentFile = path.join(tempDir, 'does-not-exist.txt')

            const size = FileUtil.getFileSize(nonExistentFile)

            expect(size).toBe(0)
        })

        it('should return 0 for empty file', () => {
            const filePath = path.join(tempDir, 'empty.txt')
            fs.writeFileSync(filePath, '')

            const size = FileUtil.getFileSize(filePath)

            expect(size).toBe(0)
        })

        it('should return correct size for large file', () => {
            const filePath = path.join(tempDir, 'large.txt')
            const content = 'A'.repeat(1024 * 1024) // 1MB
            fs.writeFileSync(filePath, content)

            const size = FileUtil.getFileSize(filePath)

            expect(size).toBe(1024 * 1024)
        })

        it('should return correct size for binary file', () => {
            const filePath = path.join(tempDir, 'binary.bin')
            const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe])
            fs.writeFileSync(filePath, buffer)

            const size = FileUtil.getFileSize(filePath)

            expect(size).toBe(6)
        })
    })

    describe('fileExists', () => {
        it('should return true for existing file', () => {
            const filePath = path.join(tempDir, 'exists.txt')
            fs.writeFileSync(filePath, 'content')

            const exists = FileUtil.fileExists(filePath)

            expect(exists).toBe(true)
        })

        it('should return true for existing directory', () => {
            const dirPath = path.join(tempDir, 'dir')
            fs.mkdirSync(dirPath)

            const exists = FileUtil.fileExists(dirPath)

            expect(exists).toBe(true)
        })

        it('should return false for non-existent file', () => {
            const filePath = path.join(tempDir, 'does-not-exist.txt')

            const exists = FileUtil.fileExists(filePath)

            expect(exists).toBe(false)
        })

        it('should return false for deleted file', () => {
            const filePath = path.join(tempDir, 'deleted.txt')
            fs.writeFileSync(filePath, 'content')
            expect(FileUtil.fileExists(filePath)).toBe(true)

            fs.unlinkSync(filePath)

            expect(FileUtil.fileExists(filePath)).toBe(false)
        })
    })

    describe('readJsonFile', () => {
        it('should read and parse valid JSON file', () => {
            const filePath = path.join(tempDir, 'valid.json')
            const data = {name: 'test', value: 123, nested: {key: 'value'}}
            fs.writeFileSync(filePath, JSON.stringify(data))

            const result = FileUtil.readJsonFile(filePath)

            expect(result).toEqual(data)
        })

        it('should throw error for non-existent file', () => {
            const filePath = path.join(tempDir, 'does-not-exist.json')

            expect(() => FileUtil.readJsonFile(filePath)).toThrow(
                `Failed to read JSON file: ${filePath}`
            )
        })

        it('should throw error for invalid JSON', () => {
            const filePath = path.join(tempDir, 'invalid.json')
            fs.writeFileSync(filePath, '{invalid json content}')

            expect(() => FileUtil.readJsonFile(filePath)).toThrow(
                `Failed to read JSON file: ${filePath}`
            )
        })

        it('should throw error for empty file', () => {
            const filePath = path.join(tempDir, 'empty.json')
            fs.writeFileSync(filePath, '')

            expect(() => FileUtil.readJsonFile(filePath)).toThrow(
                `Failed to read JSON file: ${filePath}`
            )
        })

        it('should parse JSON array', () => {
            const filePath = path.join(tempDir, 'array.json')
            const data = [1, 2, 3, 'test', {key: 'value'}]
            fs.writeFileSync(filePath, JSON.stringify(data))

            const result = FileUtil.readJsonFile(filePath)

            expect(result).toEqual(data)
        })

        it('should handle unicode characters', () => {
            const filePath = path.join(tempDir, 'unicode.json')
            const data = {message: 'Hello 世界 🌍', emoji: '🚀'}
            fs.writeFileSync(filePath, JSON.stringify(data))

            const result = FileUtil.readJsonFile(filePath)

            expect(result).toEqual(data)
        })
    })

    describe('convertToRelativeUrl', () => {
        it('should convert absolute path to relative URL', () => {
            const absolutePath = '/home/user/projects/test-project/test-results/file.txt'

            const result = FileUtil.convertToRelativeUrl(absolutePath)

            expect(result).toBe('test-results/file.txt')
        })

        it('should remove leading slash', () => {
            const absolutePath = '/home/user/projects/test-project/file.txt'

            const result = FileUtil.convertToRelativeUrl(absolutePath)

            expect(result).toBe('file.txt')
        })

        it('should convert Windows backslashes to forward slashes', () => {
            const absolutePath = '/home/user/projects/test-project/test-results\\file.txt'

            const result = FileUtil.convertToRelativeUrl(absolutePath)

            expect(result).toBe('test-results/file.txt')
        })

        it('should handle nested directories', () => {
            const absolutePath = '/home/user/projects/test-project/a/b/c/d/file.txt'

            const result = FileUtil.convertToRelativeUrl(absolutePath)

            expect(result).toBe('a/b/c/d/file.txt')
        })

        it('should handle file in project root', () => {
            const absolutePath = '/home/user/projects/test-project/root-file.txt'

            const result = FileUtil.convertToRelativeUrl(absolutePath)

            expect(result).toBe('root-file.txt')
        })

        it('should handle path with special characters', () => {
            const absolutePath = '/home/user/projects/test-project/test (copy)/file-name_v2.txt'

            const result = FileUtil.convertToRelativeUrl(absolutePath)

            expect(result).toBe('test (copy)/file-name_v2.txt')
        })

        it('should handle path with spaces', () => {
            const absolutePath = '/home/user/projects/test-project/My Test Results/test file.txt'

            const result = FileUtil.convertToRelativeUrl(absolutePath)

            expect(result).toBe('My Test Results/test file.txt')
        })
    })

    describe('mapContentTypeToDbType', () => {
        describe('video detection', () => {
            it('should detect video by content type', () => {
                const result = FileUtil.mapContentTypeToDbType('video/webm', 'file')
                expect(result).toBe('video')
            })

            it('should detect video by .webm extension', () => {
                const result = FileUtil.mapContentTypeToDbType(
                    'application/octet-stream',
                    'test.webm'
                )
                expect(result).toBe('video')
            })

            it('should detect video by .mp4 extension', () => {
                const result = FileUtil.mapContentTypeToDbType(
                    'application/octet-stream',
                    'test.mp4'
                )
                expect(result).toBe('video')
            })

            it('should detect video by filename "video"', () => {
                const result = FileUtil.mapContentTypeToDbType('application/octet-stream', 'video')
                expect(result).toBe('video')
            })

            it('should detect various video MIME types', () => {
                const mimeTypes = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo']

                mimeTypes.forEach((mime) => {
                    expect(FileUtil.mapContentTypeToDbType(mime, 'file')).toBe('video')
                })
            })
        })

        describe('screenshot detection', () => {
            it('should detect screenshot by content type', () => {
                const result = FileUtil.mapContentTypeToDbType('image/png', 'file')
                expect(result).toBe('screenshot')
            })

            it('should detect screenshot by .png extension', () => {
                const result = FileUtil.mapContentTypeToDbType(
                    'application/octet-stream',
                    'test.png'
                )
                expect(result).toBe('screenshot')
            })

            it('should detect screenshot by .jpg extension', () => {
                const result = FileUtil.mapContentTypeToDbType(
                    'application/octet-stream',
                    'test.jpg'
                )
                expect(result).toBe('screenshot')
            })

            it('should detect screenshot by .jpeg extension', () => {
                const result = FileUtil.mapContentTypeToDbType(
                    'application/octet-stream',
                    'test.jpeg'
                )
                expect(result).toBe('screenshot')
            })

            it('should detect screenshot by filename "screenshot"', () => {
                const result = FileUtil.mapContentTypeToDbType(
                    'application/octet-stream',
                    'screenshot'
                )
                expect(result).toBe('screenshot')
            })

            it('should detect various image MIME types', () => {
                const mimeTypes = ['image/jpeg', 'image/gif', 'image/bmp', 'image/webp']

                mimeTypes.forEach((mime) => {
                    expect(FileUtil.mapContentTypeToDbType(mime, 'file')).toBe('screenshot')
                })
            })
        })

        describe('trace detection', () => {
            it('should detect trace by zip content type', () => {
                const result = FileUtil.mapContentTypeToDbType('application/zip', 'file')
                expect(result).toBe('trace')
            })

            it('should detect trace by content type containing zip', () => {
                const result = FileUtil.mapContentTypeToDbType(
                    'application/x-zip-compressed',
                    'file'
                )
                expect(result).toBe('trace')
            })

            it('should detect trace by .zip extension', () => {
                const result = FileUtil.mapContentTypeToDbType(
                    'application/octet-stream',
                    'test.zip'
                )
                expect(result).toBe('trace')
            })

            it('should detect trace by filename "trace"', () => {
                const result = FileUtil.mapContentTypeToDbType('application/octet-stream', 'trace')
                expect(result).toBe('trace')
            })
        })

        describe('log detection', () => {
            it('should detect log by text content type', () => {
                const result = FileUtil.mapContentTypeToDbType('text/plain', 'file')
                expect(result).toBe('log')
            })

            it('should detect log by .log extension', () => {
                const result = FileUtil.mapContentTypeToDbType(
                    'application/octet-stream',
                    'test.log'
                )
                expect(result).toBe('log')
            })

            it('should detect log by .txt extension', () => {
                const result = FileUtil.mapContentTypeToDbType(
                    'application/octet-stream',
                    'test.txt'
                )
                expect(result).toBe('log')
            })

            it('should detect various text MIME types', () => {
                const mimeTypes = ['text/html', 'text/csv', 'text/xml', 'text/javascript']

                mimeTypes.forEach((mime) => {
                    expect(FileUtil.mapContentTypeToDbType(mime, 'file')).toBe('log')
                })
            })
        })

        describe('fallback behavior', () => {
            it('should default to log for unknown content type', () => {
                const result = FileUtil.mapContentTypeToDbType(
                    'application/octet-stream',
                    'unknown.xyz'
                )
                expect(result).toBe('log')
            })

            it('should default to log for empty content type', () => {
                const result = FileUtil.mapContentTypeToDbType('', 'unknown')
                expect(result).toBe('log')
            })

            it('should prioritize content type over filename', () => {
                // Video content type should win over .txt extension
                const result = FileUtil.mapContentTypeToDbType('video/webm', 'file.txt')
                expect(result).toBe('video')
            })

            it('should use filename when content type is generic', () => {
                // When content type is generic, extension should determine type
                const result = FileUtil.mapContentTypeToDbType(
                    'application/octet-stream',
                    'screenshot.png'
                )
                expect(result).toBe('screenshot')
            })
        })

        describe('edge cases', () => {
            it('should handle uppercase extensions', () => {
                expect(
                    FileUtil.mapContentTypeToDbType('application/octet-stream', 'file.PNG')
                ).toBe('log') // Note: implementation is case-sensitive
            })

            it('should handle multiple dots in filename', () => {
                const result = FileUtil.mapContentTypeToDbType(
                    'application/octet-stream',
                    'test.backup.png'
                )
                expect(result).toBe('screenshot')
            })

            it('should handle filename with no extension', () => {
                const result = FileUtil.mapContentTypeToDbType(
                    'application/octet-stream',
                    'filename'
                )
                expect(result).toBe('log')
            })

            it('should handle path-like filenames', () => {
                const result = FileUtil.mapContentTypeToDbType(
                    'image/png',
                    '/path/to/screenshot.png'
                )
                expect(result).toBe('screenshot')
            })

            it('should handle special characters in filename', () => {
                const result = FileUtil.mapContentTypeToDbType(
                    'video/webm',
                    'test (copy) [final].webm'
                )
                expect(result).toBe('video')
            })

            it('should handle unicode in filename', () => {
                const result = FileUtil.mapContentTypeToDbType(
                    'image/png',
                    '测试-スクリーンショット.png'
                )
                expect(result).toBe('screenshot')
            })

            it('should handle very long filenames', () => {
                const longName = 'a'.repeat(255) + '.mp4'
                const result = FileUtil.mapContentTypeToDbType('application/octet-stream', longName)
                expect(result).toBe('video')
            })
        })

        describe('Playwright-specific names', () => {
            it('should handle Playwright video attachment', () => {
                const result = FileUtil.mapContentTypeToDbType('video/webm', 'video')
                expect(result).toBe('video')
            })

            it('should handle Playwright screenshot attachment', () => {
                const result = FileUtil.mapContentTypeToDbType('image/png', 'screenshot')
                expect(result).toBe('screenshot')
            })

            it('should handle Playwright trace attachment', () => {
                const result = FileUtil.mapContentTypeToDbType('application/zip', 'trace')
                expect(result).toBe('trace')
            })

            it('should use special names as fallback when content type is generic', () => {
                expect(FileUtil.mapContentTypeToDbType('application/octet-stream', 'video')).toBe(
                    'video'
                )
                expect(
                    FileUtil.mapContentTypeToDbType('application/octet-stream', 'screenshot')
                ).toBe('screenshot')
                expect(FileUtil.mapContentTypeToDbType('application/octet-stream', 'trace')).toBe(
                    'trace'
                )
            })
        })

        describe('real-world scenarios', () => {
            it('should handle typical Playwright video attachment', () => {
                const result = FileUtil.mapContentTypeToDbType('video/webm', 'video-test-1234.webm')
                expect(result).toBe('video')
            })

            it('should handle typical screenshot from test', () => {
                const result = FileUtil.mapContentTypeToDbType(
                    'image/png',
                    'test-login-page-screenshot.png'
                )
                expect(result).toBe('screenshot')
            })

            it('should handle trace.zip download', () => {
                const result = FileUtil.mapContentTypeToDbType('application/zip', 'trace.zip')
                expect(result).toBe('trace')
            })

            it('should handle console logs', () => {
                const result = FileUtil.mapContentTypeToDbType('text/plain', 'console-output.log')
                expect(result).toBe('log')
            })

            it('should handle test output files', () => {
                const result = FileUtil.mapContentTypeToDbType('text/plain', 'test-results.txt')
                expect(result).toBe('log')
            })
        })
    })

    describe('integration scenarios', () => {
        it('should work with full file lifecycle', () => {
            const testDir = path.join(tempDir, 'integration')
            const filePath = path.join(testDir, 'test.json')

            // Ensure directory exists
            FileUtil.ensureDirectoryExists(testDir)
            expect(FileUtil.fileExists(testDir)).toBe(true)

            // Create file
            const data = {test: 'data', value: 123}
            fs.writeFileSync(filePath, JSON.stringify(data))

            // Check file exists
            expect(FileUtil.fileExists(filePath)).toBe(true)

            // Get file size
            const size = FileUtil.getFileSize(filePath)
            expect(size).toBeGreaterThan(0)

            // Read JSON
            const content = FileUtil.readJsonFile(filePath)
            expect(content).toEqual(data)

            // Cleanup
            fs.unlinkSync(filePath)
            expect(FileUtil.fileExists(filePath)).toBe(false)
        })

        it('should handle multiple operations on same directory', () => {
            const dir = path.join(tempDir, 'multi-ops')

            // Create directory
            FileUtil.ensureDirectoryExists(dir)

            // Create multiple files
            const file1 = path.join(dir, 'file1.txt')
            const file2 = path.join(dir, 'file2.json')

            fs.writeFileSync(file1, 'content1')
            fs.writeFileSync(file2, JSON.stringify({key: 'value'}))

            // Verify all operations
            expect(FileUtil.fileExists(file1)).toBe(true)
            expect(FileUtil.fileExists(file2)).toBe(true)
            expect(FileUtil.getFileSize(file1)).toBe(8) // "content1"
            expect(FileUtil.getFileSize(file2)).toBeGreaterThan(0)
            expect(FileUtil.readJsonFile(file2)).toEqual({key: 'value'})
        })

        it('should handle attachment type detection workflow', () => {
            // Simulate Playwright attachment processing
            const attachments = [
                {contentType: 'video/webm', name: 'video-1.webm'},
                {contentType: 'image/png', name: 'screenshot-1.png'},
                {contentType: 'application/zip', name: 'trace.zip'},
                {contentType: 'text/plain', name: 'output.log'},
            ]

            const types = attachments.map((att) =>
                FileUtil.mapContentTypeToDbType(att.contentType, att.name)
            )

            expect(types).toEqual(['video', 'screenshot', 'trace', 'log'])
        })
    })
})
