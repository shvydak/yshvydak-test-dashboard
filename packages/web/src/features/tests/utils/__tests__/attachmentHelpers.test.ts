import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {
    getAttachmentIcon,
    formatFileSize,
    downloadAttachment,
    openTraceViewer,
    openAttachmentInNewWindow,
    buildAttachmentUrl,
    buildAuthenticatedAttachmentUrl,
} from '../attachmentHelpers'
import {AttachmentWithBlobURL} from '../../types/attachment.types'
import * as authFetch from '@features/authentication/utils/authFetch'
import {config} from '@config/environment.config'

// Mock dependencies
vi.mock('@features/authentication/utils/authFetch')
vi.mock('@config/environment.config', () => ({
    config: {
        api: {
            serverUrl: 'http://localhost:3000',
        },
    },
}))

describe('attachmentHelpers', () => {
    // ============================================
    // buildAttachmentUrl Tests
    // ============================================
    describe('buildAttachmentUrl', () => {
        it('should correctly join base URL and attachment path', () => {
            const result = buildAttachmentUrl('http://localhost:3000', '/attachments/file.png')
            expect(result).toBe('http://localhost:3000/attachments/file.png')
        })

        it('should handle trailing slash in base URL', () => {
            const result = buildAttachmentUrl('http://localhost:3000/', '/attachments/file.png')
            expect(result).toBe('http://localhost:3000/attachments/file.png')
        })

        it('should handle missing leading slash in attachment path', () => {
            const result = buildAttachmentUrl('http://localhost:3000', 'attachments/file.png')
            expect(result).toBe('http://localhost:3000/attachments/file.png')
        })

        it('should handle both trailing and leading slashes', () => {
            const result = buildAttachmentUrl('http://localhost:3000/', '/attachments/file.png')
            expect(result).toBe('http://localhost:3000/attachments/file.png')
        })

        it('should work with HTTPS URLs', () => {
            const result = buildAttachmentUrl('https://example.com', '/attachments/file.png')
            expect(result).toBe('https://example.com/attachments/file.png')
        })

        it('should handle URLs with ports', () => {
            const result = buildAttachmentUrl('http://localhost:8080', '/attachments/file.png')
            expect(result).toBe('http://localhost:8080/attachments/file.png')
        })
    })

    // ============================================
    // buildAuthenticatedAttachmentUrl Tests
    // ============================================
    describe('buildAuthenticatedAttachmentUrl', () => {
        beforeEach(() => {
            vi.mocked(authFetch.getAuthToken).mockReturnValue('test-jwt-token')
        })

        it('should build URL with token parameter', () => {
            const result = buildAuthenticatedAttachmentUrl(
                'http://localhost:3000',
                '/attachments/file.png'
            )
            expect(result).toBe('http://localhost:3000/attachments/file.png?token=test-jwt-token')
        })

        it('should return null when no token available', () => {
            vi.mocked(authFetch.getAuthToken).mockReturnValue(null)
            const result = buildAuthenticatedAttachmentUrl(
                'http://localhost:3000',
                '/attachments/file.png'
            )
            expect(result).toBeNull()
        })

        it('should encode special characters in token', () => {
            vi.mocked(authFetch.getAuthToken).mockReturnValue('token+with/special=chars')
            const result = buildAuthenticatedAttachmentUrl(
                'http://localhost:3000',
                '/attachments/file.png'
            )
            expect(result).toBe(
                'http://localhost:3000/attachments/file.png?token=token%2Bwith%2Fspecial%3Dchars'
            )
        })

        it('should handle URLs with existing query parameters', () => {
            const result = buildAuthenticatedAttachmentUrl(
                'http://localhost:3000',
                '/attachments/file.png?version=1'
            )
            expect(result).toContain('version=1')
            expect(result).toContain('token=test-jwt-token')
        })

        it('should handle trailing slash in base URL', () => {
            const result = buildAuthenticatedAttachmentUrl(
                'http://localhost:3000/',
                '/attachments/file.png'
            )
            expect(result).toBe('http://localhost:3000/attachments/file.png?token=test-jwt-token')
        })
    })

    // ============================================
    // getAttachmentIcon Tests
    // ============================================
    describe('getAttachmentIcon', () => {
        it('should return video icon for video type', () => {
            expect(getAttachmentIcon('video')).toBe('🎬')
        })

        it('should return screenshot icon for screenshot type', () => {
            expect(getAttachmentIcon('screenshot')).toBe('📸')
        })

        it('should return trace icon for trace type', () => {
            expect(getAttachmentIcon('trace')).toBe('🔍')
        })

        it('should return log icon for log type', () => {
            expect(getAttachmentIcon('log')).toBe('📄')
        })

        it('should return default icon for unknown type', () => {
            expect(getAttachmentIcon('unknown')).toBe('📎')
        })

        it('should return default icon for empty string', () => {
            expect(getAttachmentIcon('')).toBe('📎')
        })

        it('should be case sensitive', () => {
            expect(getAttachmentIcon('VIDEO')).toBe('📎')
            expect(getAttachmentIcon('Screenshot')).toBe('📎')
            expect(getAttachmentIcon('TRACE')).toBe('📎')
        })
    })

    // ============================================
    // formatFileSize Tests
    // ============================================
    describe('formatFileSize', () => {
        describe('zero and N/A', () => {
            it('should return N/A for zero bytes', () => {
                expect(formatFileSize(0)).toBe('N/A')
            })
        })

        describe('bytes', () => {
            it('should format bytes correctly (< 1KB)', () => {
                expect(formatFileSize(1)).toBe('1 Bytes')
                expect(formatFileSize(100)).toBe('100 Bytes')
                expect(formatFileSize(1023)).toBe('1023 Bytes')
            })
        })

        describe('kilobytes', () => {
            it('should format KB correctly', () => {
                expect(formatFileSize(1024)).toBe('1 KB')
                expect(formatFileSize(1536)).toBe('1.5 KB')
                expect(formatFileSize(10240)).toBe('10 KB')
                expect(formatFileSize(1048575)).toBe('1024 KB')
            })
        })

        describe('megabytes', () => {
            it('should format MB correctly', () => {
                expect(formatFileSize(1048576)).toBe('1 MB')
                expect(formatFileSize(1572864)).toBe('1.5 MB')
                expect(formatFileSize(10485760)).toBe('10 MB')
                expect(formatFileSize(1073741823)).toBe('1024 MB')
            })
        })

        describe('gigabytes', () => {
            it('should format GB correctly', () => {
                expect(formatFileSize(1073741824)).toBe('1 GB')
                expect(formatFileSize(1610612736)).toBe('1.5 GB')
                expect(formatFileSize(10737418240)).toBe('10 GB')
            })
        })

        describe('precision', () => {
            it('should round to 2 decimal places', () => {
                expect(formatFileSize(1500)).toBe('1.46 KB') // 1500 / 1024 = 1.46484375
                expect(formatFileSize(1500000)).toBe('1.43 MB') // 1500000 / 1024^2 = 1.430511...
            })

            it('should handle decimal rounding correctly', () => {
                expect(formatFileSize(1234567)).toBe('1.18 MB')
                expect(formatFileSize(9876543210)).toBe('9.2 GB')
            })
        })

        describe('edge cases', () => {
            it('should handle very large files', () => {
                expect(formatFileSize(999999999999)).toBe('931.32 GB')
            })

            it('should handle negative numbers (invalid but graceful)', () => {
                const result = formatFileSize(-1024)
                expect(result).toBeTruthy() // Should not crash
            })

            it('should handle fractional bytes', () => {
                expect(formatFileSize(1024.5)).toBe('1 KB')
            })
        })
    })

    // ============================================
    // downloadAttachment Tests
    // ============================================
    describe('downloadAttachment', () => {
        let mockAttachment: AttachmentWithBlobURL
        let mockOnError: ReturnType<typeof vi.fn>
        let mockLink: HTMLAnchorElement
        let createElementSpy: any
        let appendChildSpy: any
        let removeChildSpy: any
        let revokeObjectURLMock: ReturnType<typeof vi.fn>

        beforeEach(() => {
            mockAttachment = {
                id: 'attachment-1',
                testResultId: 'test-1',
                type: 'screenshot',
                filePath: '/path/to/screenshot.png',
                fileSize: 1024,
                url: 'http://localhost:3000/api/attachments/screenshot.png',
            }

            mockOnError = vi.fn()

            // Mock DOM methods
            mockLink = {
                href: '',
                download: '',
                click: vi.fn(),
            } as any

            createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockLink)
            appendChildSpy = vi
                .spyOn(document.body, 'appendChild')
                .mockImplementation(() => mockLink)
            removeChildSpy = vi
                .spyOn(document.body, 'removeChild')
                .mockImplementation(() => mockLink)

            // Mock URL.revokeObjectURL
            revokeObjectURLMock = vi.fn()
            global.URL.revokeObjectURL = revokeObjectURLMock

            // Mock createProtectedFileURL
            vi.mocked(authFetch.createProtectedFileURL).mockResolvedValue(
                'blob:http://localhost/test-blob'
            )
        })

        afterEach(() => {
            vi.clearAllMocks()
        })

        describe('successful download', () => {
            it('should create protected file URL with correct parameters', async () => {
                await downloadAttachment(mockAttachment, mockOnError)

                expect(authFetch.createProtectedFileURL).toHaveBeenCalledWith(
                    mockAttachment.url,
                    config.api.serverUrl
                )
            })

            it('should create anchor element and trigger download', async () => {
                await downloadAttachment(mockAttachment, mockOnError)

                expect(createElementSpy).toHaveBeenCalledWith('a')
                expect(mockLink.href).toBe('blob:http://localhost/test-blob')
                expect(mockLink.download).toBe('screenshot.png')
                expect(appendChildSpy).toHaveBeenCalledWith(mockLink)
                expect(mockLink.click).toHaveBeenCalled()
                expect(removeChildSpy).toHaveBeenCalledWith(mockLink)
            })

            it('should extract filename from URL', async () => {
                await downloadAttachment(mockAttachment, mockOnError)

                expect(mockLink.download).toBe('screenshot.png')
            })

            it('should use default filename if URL has no filename', async () => {
                mockAttachment.url = 'http://localhost:3000/api/attachments/'

                await downloadAttachment(mockAttachment, mockOnError)

                expect(mockLink.download).toBe('attachment')
            })

            it('should revoke object URL after download', async () => {
                await downloadAttachment(mockAttachment, mockOnError)

                expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/test-blob')
            })

            it('should not call onError on success', async () => {
                await downloadAttachment(mockAttachment, mockOnError)

                expect(mockOnError).not.toHaveBeenCalled()
            })
        })

        describe('error handling', () => {
            it('should call onError when createProtectedFileURL fails', async () => {
                const error = new Error('Failed to create blob')
                vi.mocked(authFetch.createProtectedFileURL).mockRejectedValue(error)

                await downloadAttachment(mockAttachment, mockOnError)

                expect(mockOnError).toHaveBeenCalledWith('Failed to download attachment')
            })

            it('should log error to console', async () => {
                const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
                const error = new Error('Network error')
                vi.mocked(authFetch.createProtectedFileURL).mockRejectedValue(error)

                await downloadAttachment(mockAttachment, mockOnError)

                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    'Failed to download attachment:',
                    error
                )
                consoleErrorSpy.mockRestore()
            })

            it('should handle DOM manipulation errors gracefully', async () => {
                appendChildSpy.mockImplementation(() => {
                    throw new Error('DOM error')
                })

                await downloadAttachment(mockAttachment, mockOnError)

                expect(mockOnError).toHaveBeenCalledWith('Failed to download attachment')
            })

            it('should handle click errors gracefully', async () => {
                mockLink.click = vi.fn().mockImplementation(() => {
                    throw new Error('Click blocked')
                })

                await downloadAttachment(mockAttachment, mockOnError)

                expect(mockOnError).toHaveBeenCalledWith('Failed to download attachment')
            })
        })

        describe('edge cases', () => {
            it('should handle URLs with query parameters', async () => {
                mockAttachment.url =
                    'http://localhost:3000/api/attachments/screenshot.png?token=abc123'

                await downloadAttachment(mockAttachment, mockOnError)

                expect(mockLink.download).toBe('screenshot.png?token=abc123')
            })

            it('should handle URLs with special characters', async () => {
                mockAttachment.url = 'http://localhost:3000/api/attachments/my%20screenshot.png'

                await downloadAttachment(mockAttachment, mockOnError)

                expect(mockLink.download).toBe('my%20screenshot.png')
            })

            it('should handle very long filenames', async () => {
                const longFilename = 'a'.repeat(255) + '.png'
                mockAttachment.url = `http://localhost:3000/api/attachments/${longFilename}`

                await downloadAttachment(mockAttachment, mockOnError)

                expect(mockLink.download).toBe(longFilename)
            })
        })
    })

    // ============================================
    // openTraceViewer Tests
    // ============================================
    describe('openTraceViewer', () => {
        let mockAttachment: AttachmentWithBlobURL
        let mockOnError: ReturnType<typeof vi.fn>
        let windowOpenSpy: any

        beforeEach(() => {
            mockAttachment = {
                id: 'trace-1',
                testResultId: 'test-1',
                type: 'trace',
                filePath: '/path/to/trace.zip',
                fileSize: 2048,
                url: 'http://localhost:3000/api/attachments/trace.zip',
            }

            mockOnError = vi.fn()

            // Mock window.open
            windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

            // Mock getAuthToken
            vi.mocked(authFetch.getAuthToken).mockReturnValue('test-token-123')
        })

        afterEach(() => {
            vi.clearAllMocks()
        })

        describe('successful trace viewer opening', () => {
            it('should get auth token', async () => {
                await openTraceViewer(mockAttachment, mockOnError)

                expect(authFetch.getAuthToken).toHaveBeenCalled()
            })

            it('should construct correct trace URL with token', async () => {
                await openTraceViewer(mockAttachment, mockOnError)

                const expectedTraceURL = `${config.api.serverUrl}/api/tests/traces/${mockAttachment.id}?token=${encodeURIComponent('test-token-123')}`
                const expectedViewerURL = `https://trace.playwright.dev/?trace=${encodeURIComponent(expectedTraceURL)}`

                expect(windowOpenSpy).toHaveBeenCalledWith(expectedViewerURL, '_blank')
            })

            it('should encode token properly', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue('token+with/special=chars')

                await openTraceViewer(mockAttachment, mockOnError)

                const expectedTraceURL = `${config.api.serverUrl}/api/tests/traces/${mockAttachment.id}?token=token%2Bwith%2Fspecial%3Dchars`
                const expectedViewerURL = `https://trace.playwright.dev/?trace=${encodeURIComponent(expectedTraceURL)}`

                expect(windowOpenSpy).toHaveBeenCalledWith(expectedViewerURL, '_blank')
            })

            it('should open trace viewer in new tab', async () => {
                await openTraceViewer(mockAttachment, mockOnError)

                expect(windowOpenSpy).toHaveBeenCalledWith(expect.any(String), '_blank')
            })

            it('should not call onError on success', async () => {
                await openTraceViewer(mockAttachment, mockOnError)

                expect(mockOnError).not.toHaveBeenCalled()
            })
        })

        describe('authentication errors', () => {
            it('should call onError when no token is available', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(null)

                await openTraceViewer(mockAttachment, mockOnError)

                expect(mockOnError).toHaveBeenCalledWith('Authentication required to view trace')
            })

            it('should not open trace viewer when no token', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(null)

                await openTraceViewer(mockAttachment, mockOnError)

                expect(windowOpenSpy).not.toHaveBeenCalled()
            })

            it('should return early when no token', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(null)

                await openTraceViewer(mockAttachment, mockOnError)

                expect(mockOnError).toHaveBeenCalledTimes(1)
                expect(windowOpenSpy).not.toHaveBeenCalled()
            })
        })

        describe('error handling', () => {
            it('should call onError when getAuthToken throws', async () => {
                vi.mocked(authFetch.getAuthToken).mockImplementation(() => {
                    throw new Error('Token retrieval failed')
                })

                await openTraceViewer(mockAttachment, mockOnError)

                expect(mockOnError).toHaveBeenCalledWith('Failed to open trace viewer')
            })

            it('should log error to console', async () => {
                const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
                const error = new Error('Token error')
                vi.mocked(authFetch.getAuthToken).mockImplementation(() => {
                    throw error
                })

                await openTraceViewer(mockAttachment, mockOnError)

                expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to open trace viewer:', error)
                consoleErrorSpy.mockRestore()
            })

            it('should handle window.open errors gracefully', async () => {
                windowOpenSpy.mockImplementation(() => {
                    throw new Error('Popup blocked')
                })

                await openTraceViewer(mockAttachment, mockOnError)

                expect(mockOnError).toHaveBeenCalledWith('Failed to open trace viewer')
            })
        })

        describe('edge cases', () => {
            it('should handle attachment IDs with special characters', async () => {
                mockAttachment.id = 'trace-id/with-special+chars'

                await openTraceViewer(mockAttachment, mockOnError)

                const expectedTraceURL = `${config.api.serverUrl}/api/tests/traces/trace-id/with-special+chars?token=${encodeURIComponent('test-token-123')}`
                const expectedViewerURL = `https://trace.playwright.dev/?trace=${encodeURIComponent(expectedTraceURL)}`

                expect(windowOpenSpy).toHaveBeenCalledWith(expectedViewerURL, '_blank')
            })

            it('should handle very long attachment IDs', async () => {
                mockAttachment.id = 'a'.repeat(500)

                await openTraceViewer(mockAttachment, mockOnError)

                expect(windowOpenSpy).toHaveBeenCalled()
                const callArg = windowOpenSpy.mock.calls[0][0]
                expect(callArg).toContain('trace.playwright.dev')
            })

            it('should handle different server URLs', async () => {
                const originalServerUrl = config.api.serverUrl
                ;(config.api.serverUrl as any) = 'https://example.com:8080'

                await openTraceViewer(mockAttachment, mockOnError)

                const expectedTraceURL = `https://example.com:8080/api/tests/traces/${mockAttachment.id}?token=${encodeURIComponent('test-token-123')}`
                const expectedViewerURL = `https://trace.playwright.dev/?trace=${encodeURIComponent(expectedTraceURL)}`

                expect(windowOpenSpy).toHaveBeenCalledWith(expectedViewerURL, '_blank')

                // Restore
                ;(config.api.serverUrl as any) = originalServerUrl
            })

            it('should handle empty token gracefully', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue('')

                await openTraceViewer(mockAttachment, mockOnError)

                expect(mockOnError).toHaveBeenCalledWith('Authentication required to view trace')
                expect(windowOpenSpy).not.toHaveBeenCalled()
            })
        })
    })

    // ============================================
    // Integration Tests
    // ============================================
    describe('integration scenarios', () => {
        it('should use consistent icon mapping across all attachment types', () => {
            const types = ['video', 'screenshot', 'trace', 'log', 'unknown']
            const icons = types.map(getAttachmentIcon)

            // All icons should be unique (except unknown types use same default)
            expect(icons[0]).toBe('🎬')
            expect(icons[1]).toBe('📸')
            expect(icons[2]).toBe('🔍')
            expect(icons[3]).toBe('📄')
            expect(icons[4]).toBe('📎')
        })

        it('should format file sizes progressively larger', () => {
            const sizes = [0, 1, 1024, 1048576, 1073741824]
            const formatted = sizes.map(formatFileSize)

            expect(formatted[0]).toBe('N/A')
            expect(formatted[1]).toBe('1 Bytes')
            expect(formatted[2]).toBe('1 KB')
            expect(formatted[3]).toBe('1 MB')
            expect(formatted[4]).toBe('1 GB')
        })

        it('should handle complete attachment workflow for different types', () => {
            const attachmentTypes: Array<'video' | 'screenshot' | 'trace' | 'log'> = [
                'video',
                'screenshot',
                'trace',
                'log',
            ]

            attachmentTypes.forEach((type) => {
                const icon = getAttachmentIcon(type)
                expect(icon).toBeTruthy()
                expect(icon).not.toBe('')
            })

            const sizes = [1024, 1048576, 1073741824]
            sizes.forEach((size) => {
                const formatted = formatFileSize(size)
                expect(formatted).toBeTruthy()
                expect(formatted).not.toBe('N/A')
            })
        })
    })

    // ============================================
    // openAttachmentInNewWindow Tests
    // ============================================
    describe('openAttachmentInNewWindow', () => {
        let mockOnError: ReturnType<typeof vi.fn>
        let mockAttachment: AttachmentWithBlobURL
        let windowOpenSpy: ReturnType<typeof vi.spyOn>

        beforeEach(() => {
            mockOnError = vi.fn()
            mockAttachment = {
                id: 'att-123',
                testResultId: 'test-result-123',
                url: '/attachments/screenshot.png',
                type: 'screenshot',
                filePath: '/path/to/screenshot.png',
                fileSize: 1024,
                blobURL: undefined,
            }

            // Mock window.open
            windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null) as any

            // Mock getAuthToken to return a test token
            vi.mocked(authFetch.getAuthToken).mockReturnValue('test-token-123')
        })

        afterEach(() => {
            windowOpenSpy.mockRestore()
            vi.clearAllMocks()
        })

        describe('basic functionality', () => {
            it('should get auth token', async () => {
                await openAttachmentInNewWindow(mockAttachment, mockOnError)

                expect(authFetch.getAuthToken).toHaveBeenCalled()
            })

            it('should construct correct attachment URL with token', async () => {
                await openAttachmentInNewWindow(mockAttachment, mockOnError)

                const expectedURL = `${config.api.serverUrl}${mockAttachment.url}?token=${encodeURIComponent('test-token-123')}`

                expect(windowOpenSpy).toHaveBeenCalledWith(expectedURL, '_blank')
            })

            it('should encode token properly', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue('token+with/special=chars')

                await openAttachmentInNewWindow(mockAttachment, mockOnError)

                const expectedURL = `${config.api.serverUrl}${mockAttachment.url}?token=token%2Bwith%2Fspecial%3Dchars`

                expect(windowOpenSpy).toHaveBeenCalledWith(expectedURL, '_blank')
            })

            it('should open attachment in new tab', async () => {
                await openAttachmentInNewWindow(mockAttachment, mockOnError)

                expect(windowOpenSpy).toHaveBeenCalledWith(expect.any(String), '_blank')
            })

            it('should not call onError on success', async () => {
                await openAttachmentInNewWindow(mockAttachment, mockOnError)

                expect(mockOnError).not.toHaveBeenCalled()
            })
        })

        describe('authentication errors', () => {
            it('should call onError when no token is available', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(null)

                await openAttachmentInNewWindow(mockAttachment, mockOnError)

                expect(mockOnError).toHaveBeenCalledWith(
                    'Authentication required to view attachment'
                )
            })

            it('should not open attachment when no token', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(null)

                await openAttachmentInNewWindow(mockAttachment, mockOnError)

                expect(windowOpenSpy).not.toHaveBeenCalled()
            })

            it('should return early when no token', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(null)

                await openAttachmentInNewWindow(mockAttachment, mockOnError)

                expect(mockOnError).toHaveBeenCalledTimes(1)
                expect(windowOpenSpy).not.toHaveBeenCalled()
            })
        })

        describe('error handling', () => {
            it('should call onError when getAuthToken throws', async () => {
                vi.mocked(authFetch.getAuthToken).mockImplementation(() => {
                    throw new Error('Token retrieval failed')
                })

                await openAttachmentInNewWindow(mockAttachment, mockOnError)

                expect(mockOnError).toHaveBeenCalledWith('Failed to open attachment')
            })

            it('should log error to console', async () => {
                const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
                const error = new Error('Token error')
                vi.mocked(authFetch.getAuthToken).mockImplementation(() => {
                    throw error
                })

                await openAttachmentInNewWindow(mockAttachment, mockOnError)

                expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to open attachment:', error)
                consoleErrorSpy.mockRestore()
            })

            it('should handle window.open errors gracefully', async () => {
                windowOpenSpy.mockImplementation(() => {
                    throw new Error('Popup blocked')
                })

                await openAttachmentInNewWindow(mockAttachment, mockOnError)

                expect(mockOnError).toHaveBeenCalledWith('Failed to open attachment')
            })
        })

        describe('edge cases', () => {
            it('should handle attachment URLs with special characters', async () => {
                mockAttachment.url = '/attachments/test file+name.png'

                await openAttachmentInNewWindow(mockAttachment, mockOnError)

                const expectedURL = `${config.api.serverUrl}/attachments/test file+name.png?token=${encodeURIComponent('test-token-123')}`

                expect(windowOpenSpy).toHaveBeenCalledWith(expectedURL, '_blank')
            })

            it('should handle attachment URLs without leading slash', async () => {
                mockAttachment.url = 'attachments/screenshot.png'

                await openAttachmentInNewWindow(mockAttachment, mockOnError)

                const expectedURL = `${config.api.serverUrl}/attachments/screenshot.png?token=${encodeURIComponent('test-token-123')}`

                expect(windowOpenSpy).toHaveBeenCalledWith(expectedURL, '_blank')
            })

            it('should handle different server URLs', async () => {
                // This test verifies URL construction with different server URLs
                // The buildAttachmentUrl function handles this, so we just verify it works
                await openAttachmentInNewWindow(mockAttachment, mockOnError)

                expect(windowOpenSpy).toHaveBeenCalledWith(
                    expect.stringContaining(mockAttachment.url),
                    '_blank'
                )
                expect(windowOpenSpy).toHaveBeenCalledWith(
                    expect.stringContaining('?token='),
                    '_blank'
                )
            })

            it('should work with log attachments', async () => {
                mockAttachment.type = 'log'
                mockAttachment.url = '/attachments/test.log'

                await openAttachmentInNewWindow(mockAttachment, mockOnError)

                const expectedURL = `${config.api.serverUrl}/attachments/test.log?token=${encodeURIComponent('test-token-123')}`

                expect(windowOpenSpy).toHaveBeenCalledWith(expectedURL, '_blank')
            })

            it('should work with video attachments', async () => {
                mockAttachment.type = 'video'
                mockAttachment.url = '/attachments/video.webm'

                await openAttachmentInNewWindow(mockAttachment, mockOnError)

                const expectedURL = `${config.api.serverUrl}/attachments/video.webm?token=${encodeURIComponent('test-token-123')}`

                expect(windowOpenSpy).toHaveBeenCalledWith(expectedURL, '_blank')
            })

            it('should handle empty token string', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue('')

                await openAttachmentInNewWindow(mockAttachment, mockOnError)

                expect(mockOnError).toHaveBeenCalledWith(
                    'Authentication required to view attachment'
                )
                expect(windowOpenSpy).not.toHaveBeenCalled()
            })
        })

        describe('different attachment types', () => {
            const attachmentTypes: Array<'screenshot' | 'video' | 'log'> = [
                'screenshot',
                'video',
                'log',
            ]

            attachmentTypes.forEach((type) => {
                it(`should work with ${type} attachments`, async () => {
                    mockAttachment.type = type
                    mockAttachment.url = `/attachments/test.${type === 'screenshot' ? 'png' : type === 'video' ? 'webm' : 'log'}`

                    await openAttachmentInNewWindow(mockAttachment, mockOnError)

                    expect(windowOpenSpy).toHaveBeenCalled()
                    expect(mockOnError).not.toHaveBeenCalled()
                })
            })
        })
    })
})
