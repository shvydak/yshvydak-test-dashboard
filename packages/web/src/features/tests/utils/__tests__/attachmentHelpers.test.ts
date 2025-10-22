import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {
    getAttachmentIcon,
    formatFileSize,
    downloadAttachment,
    openTraceViewer,
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
})
