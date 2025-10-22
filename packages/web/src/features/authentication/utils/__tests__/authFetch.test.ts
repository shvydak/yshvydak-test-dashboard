/**
 * Tests for authFetch utility
 *
 * Critical authentication and security layer for all authenticated API requests.
 *
 * Test Coverage:
 * - getAuthToken() - JWT token extraction from localStorage/sessionStorage
 * - createAuthHeaders() - Authorization header creation
 * - authFetch() - Authenticated HTTP requests with 401 handling
 * - authGet/Post/Put/Delete() - HTTP method convenience wrappers
 * - downloadProtectedFile() - Protected file download with blob URLs
 * - createProtectedFileURL() - Protected static file URL generation
 * - useAuthFetch() - React hook wrapper
 * - Error handling and edge cases
 *
 * Target Coverage: 85%+
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {
    getAuthToken,
    authFetch,
    authGet,
    authPost,
    authPut,
    authDelete,
    downloadProtectedFile,
    createProtectedFileURL,
    useAuthFetch,
} from '../authFetch'
import * as AuthContext from '../../context/AuthContext'

describe('authFetch utility', () => {
    beforeEach(() => {
        // Clear storage before each test
        localStorage.clear()
        sessionStorage.clear()

        // Reset mocks
        vi.clearAllMocks()

        // Mock window.location
        delete (window as any).location
        window.location = {href: ''} as any

        // Mock global fetch
        global.fetch = vi.fn()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('getAuthToken()', () => {
        it('should return null when no auth data exists', () => {
            const token = getAuthToken()
            expect(token).toBeNull()
        })

        it('should extract token from localStorage with auth.token structure', () => {
            const mockAuthData = {auth: {token: 'test-token-123'}}
            localStorage.setItem('_auth', JSON.stringify(mockAuthData))

            const token = getAuthToken()
            expect(token).toBe('test-token-123')
        })

        it('should extract token from sessionStorage with auth.token structure', () => {
            const mockAuthData = {auth: {token: 'session-token-456'}}
            sessionStorage.setItem('_auth', JSON.stringify(mockAuthData))

            const token = getAuthToken()
            expect(token).toBe('session-token-456')
        })

        it('should extract token from flat token structure', () => {
            const mockAuthData = {token: 'flat-token-789'}
            localStorage.setItem('_auth', JSON.stringify(mockAuthData))

            const token = getAuthToken()
            expect(token).toBe('flat-token-789')
        })

        it('should extract token when value is just a string', () => {
            localStorage.setItem('_auth', JSON.stringify('string-token-abc'))

            const token = getAuthToken()
            expect(token).toBe('string-token-abc')
        })

        it('should prioritize localStorage over sessionStorage', () => {
            localStorage.setItem('_auth', JSON.stringify({token: 'local-token'}))
            sessionStorage.setItem('_auth', JSON.stringify({token: 'session-token'}))

            const token = getAuthToken()
            expect(token).toBe('local-token')
        })

        it('should return null for invalid JSON', () => {
            localStorage.setItem('_auth', 'invalid-json{')

            const token = getAuthToken()
            expect(token).toBeNull()
        })

        it('should return null for empty object', () => {
            localStorage.setItem('_auth', JSON.stringify({}))

            const token = getAuthToken()
            expect(token).toBeNull()
        })

        it('should return null for null auth data', () => {
            localStorage.setItem('_auth', JSON.stringify(null))

            const token = getAuthToken()
            expect(token).toBeNull()
        })

        it('should return null for undefined token value', () => {
            localStorage.setItem('_auth', JSON.stringify({auth: {token: undefined}}))

            const token = getAuthToken()
            expect(token).toBeNull()
        })

        it('should handle numeric values gracefully', () => {
            localStorage.setItem('_auth', JSON.stringify(12345))

            const token = getAuthToken()
            expect(token).toBeNull()
        })

        it('should handle boolean values gracefully', () => {
            localStorage.setItem('_auth', JSON.stringify(true))

            const token = getAuthToken()
            expect(token).toBeNull()
        })
    })

    describe('authFetch()', () => {
        it('should make fetch request with Authorization header when token exists', async () => {
            localStorage.setItem('_auth', JSON.stringify({token: 'test-token'}))

            const mockResponse = {
                ok: true,
                status: 200,
                json: async () => ({data: 'test'}),
            } as Response

            vi.mocked(global.fetch).mockResolvedValue(mockResponse)

            await authFetch('https://api.example.com/test')

            expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/test', {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer test-token',
                },
            })
        })

        it('should make fetch request without Authorization header when no token', async () => {
            const mockResponse = {
                ok: true,
                status: 200,
                json: async () => ({data: 'test'}),
            } as Response

            vi.mocked(global.fetch).mockResolvedValue(mockResponse)

            await authFetch('https://api.example.com/test')

            expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/test', {
                headers: {
                    'Content-Type': 'application/json',
                },
            })
        })

        it('should merge additional headers with auth headers', async () => {
            localStorage.setItem('_auth', JSON.stringify({token: 'test-token'}))

            const mockResponse = {ok: true, status: 200} as Response
            vi.mocked(global.fetch).mockResolvedValue(mockResponse)

            await authFetch('https://api.example.com/test', {
                headers: {
                    'X-Custom-Header': 'custom-value',
                },
            })

            expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/test', {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer test-token',
                    'X-Custom-Header': 'custom-value',
                },
            })
        })

        it('should allow overriding Content-Type header', async () => {
            localStorage.setItem('_auth', JSON.stringify({token: 'test-token'}))

            const mockResponse = {ok: true, status: 200} as Response
            vi.mocked(global.fetch).mockResolvedValue(mockResponse)

            await authFetch('https://api.example.com/test', {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            })

            expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/test', {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    Authorization: 'Bearer test-token',
                },
            })
        })

        it('should return response when status is not 401', async () => {
            const mockResponse = {ok: true, status: 200, data: 'test'} as any
            vi.mocked(global.fetch).mockResolvedValue(mockResponse)

            const response = await authFetch('https://api.example.com/test')

            expect(response).toBe(mockResponse)
        })

        it('should call globalLogout on 401 response when available', async () => {
            const mockLogout = vi.fn()
            vi.spyOn(AuthContext, 'getGlobalLogout').mockReturnValue(mockLogout)

            const mockResponse = {status: 401} as Response
            vi.mocked(global.fetch).mockResolvedValue(mockResponse)

            await expect(authFetch('https://api.example.com/test')).rejects.toThrow(
                'Authentication required'
            )

            expect(mockLogout).toHaveBeenCalled()
        })

        it('should clear storage and redirect on 401 when globalLogout not available', async () => {
            vi.spyOn(AuthContext, 'getGlobalLogout').mockReturnValue(null)

            localStorage.setItem('_auth', 'test-data')
            sessionStorage.setItem('_auth', 'test-data')

            const mockResponse = {status: 401} as Response
            vi.mocked(global.fetch).mockResolvedValue(mockResponse)

            await expect(authFetch('https://api.example.com/test')).rejects.toThrow(
                'Authentication required'
            )

            expect(localStorage.getItem('_auth')).toBeNull()
            expect(sessionStorage.getItem('_auth')).toBeNull()
            expect(window.location.href).toBe('/')
        })

        it('should preserve request options (method, body, etc.)', async () => {
            const mockResponse = {ok: true, status: 200} as Response
            vi.mocked(global.fetch).mockResolvedValue(mockResponse)

            await authFetch('https://api.example.com/test', {
                method: 'POST',
                body: JSON.stringify({test: 'data'}),
            })

            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.example.com/test',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({test: 'data'}),
                })
            )
        })
    })

    describe('HTTP Method Wrappers', () => {
        beforeEach(() => {
            const mockResponse = {ok: true, status: 200} as Response
            vi.mocked(global.fetch).mockResolvedValue(mockResponse)
        })

        describe('authGet()', () => {
            it('should make GET request', async () => {
                await authGet('https://api.example.com/test')

                expect(global.fetch).toHaveBeenCalledWith(
                    'https://api.example.com/test',
                    expect.objectContaining({
                        method: 'GET',
                    })
                )
            })

            it('should merge options with GET method', async () => {
                await authGet('https://api.example.com/test', {
                    headers: {'X-Custom': 'value'},
                })

                expect(global.fetch).toHaveBeenCalledWith(
                    'https://api.example.com/test',
                    expect.objectContaining({
                        method: 'GET',
                        headers: expect.objectContaining({
                            'X-Custom': 'value',
                        }),
                    })
                )
            })
        })

        describe('authPost()', () => {
            it('should make POST request with data', async () => {
                const data = {name: 'test', value: 123}
                await authPost('https://api.example.com/test', data)

                expect(global.fetch).toHaveBeenCalledWith(
                    'https://api.example.com/test',
                    expect.objectContaining({
                        method: 'POST',
                        body: JSON.stringify(data),
                    })
                )
            })

            it('should make POST request without body when data is undefined', async () => {
                await authPost('https://api.example.com/test')

                expect(global.fetch).toHaveBeenCalledWith(
                    'https://api.example.com/test',
                    expect.objectContaining({
                        method: 'POST',
                        body: undefined,
                    })
                )
            })

            it('should make POST request without body when data is null', async () => {
                await authPost('https://api.example.com/test', null)

                expect(global.fetch).toHaveBeenCalledWith(
                    'https://api.example.com/test',
                    expect.objectContaining({
                        method: 'POST',
                        body: undefined,
                    })
                )
            })

            it('should merge options with POST method', async () => {
                await authPost(
                    'https://api.example.com/test',
                    {test: 'data'},
                    {
                        headers: {'X-Custom': 'value'},
                    }
                )

                expect(global.fetch).toHaveBeenCalledWith(
                    'https://api.example.com/test',
                    expect.objectContaining({
                        method: 'POST',
                        headers: expect.objectContaining({
                            'X-Custom': 'value',
                        }),
                    })
                )
            })
        })

        describe('authPut()', () => {
            it('should make PUT request with data', async () => {
                const data = {id: 1, name: 'updated'}
                await authPut('https://api.example.com/test/1', data)

                expect(global.fetch).toHaveBeenCalledWith(
                    'https://api.example.com/test/1',
                    expect.objectContaining({
                        method: 'PUT',
                        body: JSON.stringify(data),
                    })
                )
            })

            it('should make PUT request without body when data is undefined', async () => {
                await authPut('https://api.example.com/test/1')

                expect(global.fetch).toHaveBeenCalledWith(
                    'https://api.example.com/test/1',
                    expect.objectContaining({
                        method: 'PUT',
                        body: undefined,
                    })
                )
            })

            it('should merge options with PUT method', async () => {
                await authPut(
                    'https://api.example.com/test/1',
                    {test: 'data'},
                    {
                        headers: {'X-Custom': 'value'},
                    }
                )

                expect(global.fetch).toHaveBeenCalledWith(
                    'https://api.example.com/test/1',
                    expect.objectContaining({
                        method: 'PUT',
                        headers: expect.objectContaining({
                            'X-Custom': 'value',
                        }),
                    })
                )
            })
        })

        describe('authDelete()', () => {
            it('should make DELETE request', async () => {
                await authDelete('https://api.example.com/test/1')

                expect(global.fetch).toHaveBeenCalledWith(
                    'https://api.example.com/test/1',
                    expect.objectContaining({
                        method: 'DELETE',
                    })
                )
            })

            it('should merge options with DELETE method', async () => {
                await authDelete('https://api.example.com/test/1', {
                    headers: {'X-Custom': 'value'},
                })

                expect(global.fetch).toHaveBeenCalledWith(
                    'https://api.example.com/test/1',
                    expect.objectContaining({
                        method: 'DELETE',
                        headers: expect.objectContaining({
                            'X-Custom': 'value',
                        }),
                    })
                )
            })
        })
    })

    describe('downloadProtectedFile()', () => {
        it('should download file and create blob URL', async () => {
            const mockBlob = new Blob(['test file content'], {type: 'application/pdf'})
            const mockResponse = {
                ok: true,
                status: 200,
                blob: async () => mockBlob,
            } as Response

            vi.mocked(global.fetch).mockResolvedValue(mockResponse)

            // Mock URL.createObjectURL
            const mockBlobURL = 'blob:http://localhost:3000/test-blob-id'
            global.URL.createObjectURL = vi.fn(() => mockBlobURL)

            const blobUrl = await downloadProtectedFile('https://api.example.com/files/test.pdf')

            expect(blobUrl).toBe(mockBlobURL)
            expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockBlob)
        })

        it('should throw error when response is not ok', async () => {
            const mockResponse = {
                ok: false,
                status: 404,
            } as Response

            vi.mocked(global.fetch).mockResolvedValue(mockResponse)

            await expect(
                downloadProtectedFile('https://api.example.com/files/missing.pdf')
            ).rejects.toThrow('Failed to download file: 404')
        })

        it('should use authFetch for authentication', async () => {
            localStorage.setItem('_auth', JSON.stringify({token: 'test-token'}))

            const mockBlob = new Blob(['content'])
            const mockResponse = {
                ok: true,
                status: 200,
                blob: async () => mockBlob,
            } as Response

            vi.mocked(global.fetch).mockResolvedValue(mockResponse)
            global.URL.createObjectURL = vi.fn(() => 'blob:url')

            await downloadProtectedFile('https://api.example.com/files/test.pdf')

            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.example.com/files/test.pdf',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: 'Bearer test-token',
                    }),
                })
            )
        })

        it('should handle 401 errors from authFetch', async () => {
            const mockLogout = vi.fn()
            vi.spyOn(AuthContext, 'getGlobalLogout').mockReturnValue(mockLogout)

            const mockResponse = {status: 401} as Response
            vi.mocked(global.fetch).mockResolvedValue(mockResponse)

            await expect(
                downloadProtectedFile('https://api.example.com/files/test.pdf')
            ).rejects.toThrow('Authentication required')

            expect(mockLogout).toHaveBeenCalled()
        })

        it('should handle different file types (video)', async () => {
            const mockBlob = new Blob(['video data'], {type: 'video/webm'})
            const mockResponse = {
                ok: true,
                status: 200,
                blob: async () => mockBlob,
            } as Response

            vi.mocked(global.fetch).mockResolvedValue(mockResponse)
            global.URL.createObjectURL = vi.fn(() => 'blob:video-url')

            const blobUrl = await downloadProtectedFile('https://api.example.com/files/video.webm')

            expect(blobUrl).toBe('blob:video-url')
        })

        it('should handle different file types (image)', async () => {
            const mockBlob = new Blob(['image data'], {type: 'image/png'})
            const mockResponse = {
                ok: true,
                status: 200,
                blob: async () => mockBlob,
            } as Response

            vi.mocked(global.fetch).mockResolvedValue(mockResponse)
            global.URL.createObjectURL = vi.fn(() => 'blob:image-url')

            const blobUrl = await downloadProtectedFile('https://api.example.com/files/image.png')

            expect(blobUrl).toBe('blob:image-url')
        })
    })

    describe('createProtectedFileURL()', () => {
        beforeEach(() => {
            const mockBlob = new Blob(['test content'])
            const mockResponse = {
                ok: true,
                status: 200,
                blob: async () => mockBlob,
            } as Response

            vi.mocked(global.fetch).mockResolvedValue(mockResponse)
            global.URL.createObjectURL = vi.fn(() => 'blob:test-url')
        })

        it('should create URL from relative path and base URL', async () => {
            const blobUrl = await createProtectedFileURL(
                '/files/test.pdf',
                'https://api.example.com'
            )

            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.example.com/files/test.pdf',
                expect.any(Object)
            )
            expect(blobUrl).toBe('blob:test-url')
        })

        it('should handle relative path without leading slash', async () => {
            await createProtectedFileURL('files/test.pdf', 'https://api.example.com')

            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.example.com/files/test.pdf',
                expect.any(Object)
            )
        })

        it('should handle base URL with trailing slash', async () => {
            await createProtectedFileURL('/files/test.pdf', 'https://api.example.com/')

            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.example.com/files/test.pdf',
                expect.any(Object)
            )
        })

        it('should handle both base URL trailing slash and relative path without slash', async () => {
            await createProtectedFileURL('files/test.pdf', 'https://api.example.com/')

            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.example.com/files/test.pdf',
                expect.any(Object)
            )
        })

        it('should handle nested paths', async () => {
            await createProtectedFileURL('/attachments/123/video.webm', 'https://api.example.com')

            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.example.com/attachments/123/video.webm',
                expect.any(Object)
            )
        })

        it('should use downloadProtectedFile internally', async () => {
            const mockBlob = new Blob(['test'])
            const mockResponse = {
                ok: true,
                status: 200,
                blob: async () => mockBlob,
            } as Response

            vi.mocked(global.fetch).mockResolvedValue(mockResponse)

            const mockBlobURL = 'blob:specific-url'
            global.URL.createObjectURL = vi.fn(() => mockBlobURL)

            const result = await createProtectedFileURL('/test.pdf', 'https://api.example.com')

            expect(result).toBe(mockBlobURL)
        })
    })

    describe('useAuthFetch() hook', () => {
        it('should return all utility functions', () => {
            const hook = useAuthFetch()

            expect(hook).toHaveProperty('authFetch')
            expect(hook).toHaveProperty('authGet')
            expect(hook).toHaveProperty('authPost')
            expect(hook).toHaveProperty('authPut')
            expect(hook).toHaveProperty('authDelete')
            expect(hook).toHaveProperty('getAuthToken')
            expect(hook).toHaveProperty('createAuthHeaders')
            expect(hook).toHaveProperty('downloadProtectedFile')
            expect(hook).toHaveProperty('createProtectedFileURL')
        })

        it('should return functions that work correctly', async () => {
            const hook = useAuthFetch()

            localStorage.setItem('_auth', JSON.stringify({token: 'hook-token'}))

            const mockResponse = {ok: true, status: 200} as Response
            vi.mocked(global.fetch).mockResolvedValue(mockResponse)

            await hook.authGet('https://api.example.com/test')

            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.example.com/test',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: 'Bearer hook-token',
                    }),
                })
            )
        })

        it('should return getAuthToken that extracts token correctly', () => {
            const hook = useAuthFetch()

            localStorage.setItem('_auth', JSON.stringify({token: 'test-token'}))

            const token = hook.getAuthToken()
            expect(token).toBe('test-token')
        })
    })

    describe('Edge Cases and Error Handling', () => {
        it('should handle network errors', async () => {
            vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

            await expect(authFetch('https://api.example.com/test')).rejects.toThrow('Network error')
        })

        it('should handle empty URLs', async () => {
            const mockResponse = {ok: true, status: 200} as Response
            vi.mocked(global.fetch).mockResolvedValue(mockResponse)

            await authFetch('')

            expect(global.fetch).toHaveBeenCalledWith('', expect.any(Object))
        })

        it('should handle very long tokens', async () => {
            const longToken = 'a'.repeat(10000)
            localStorage.setItem('_auth', JSON.stringify({token: longToken}))

            const mockResponse = {ok: true, status: 200} as Response
            vi.mocked(global.fetch).mockResolvedValue(mockResponse)

            await authFetch('https://api.example.com/test')

            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.example.com/test',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: `Bearer ${longToken}`,
                    }),
                })
            )
        })

        it('should handle special characters in tokens', async () => {
            const specialToken = 'token-with-special-chars-!@#$%^&*()'
            localStorage.setItem('_auth', JSON.stringify({token: specialToken}))

            const mockResponse = {ok: true, status: 200} as Response
            vi.mocked(global.fetch).mockResolvedValue(mockResponse)

            await authFetch('https://api.example.com/test')

            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.example.com/test',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: `Bearer ${specialToken}`,
                    }),
                })
            )
        })

        it('should handle concurrent requests', async () => {
            localStorage.setItem('_auth', JSON.stringify({token: 'test-token'}))

            const mockResponse = {ok: true, status: 200} as Response
            vi.mocked(global.fetch).mockResolvedValue(mockResponse)

            // Make 5 concurrent requests
            const promises = [
                authGet('https://api.example.com/1'),
                authGet('https://api.example.com/2'),
                authGet('https://api.example.com/3'),
                authGet('https://api.example.com/4'),
                authGet('https://api.example.com/5'),
            ]

            await Promise.all(promises)

            expect(global.fetch).toHaveBeenCalledTimes(5)
        })

        it('should handle 401 during downloadProtectedFile', async () => {
            const mockLogout = vi.fn()
            vi.spyOn(AuthContext, 'getGlobalLogout').mockReturnValue(mockLogout)

            const mockResponse = {status: 401} as Response
            vi.mocked(global.fetch).mockResolvedValue(mockResponse)

            await expect(downloadProtectedFile('https://api.example.com/file.pdf')).rejects.toThrow(
                'Authentication required'
            )

            expect(mockLogout).toHaveBeenCalled()
        })

        it('should handle blob creation errors', async () => {
            const mockResponse = {
                ok: true,
                status: 200,
                blob: async () => {
                    throw new Error('Blob creation failed')
                },
            } as unknown as Response

            vi.mocked(global.fetch).mockResolvedValue(mockResponse)

            await expect(downloadProtectedFile('https://api.example.com/file.pdf')).rejects.toThrow(
                'Blob creation failed'
            )
        })
    })
})
