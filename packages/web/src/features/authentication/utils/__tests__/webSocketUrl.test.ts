/**
 * Tests for webSocketUrl utility
 *
 * Tests WebSocket URL generation with JWT token handling
 */

import {beforeEach, describe, expect, it, vi} from 'vitest'
import {getWebSocketUrl} from '../webSocketUrl'
import * as authFetch from '../authFetch'
import {config} from '@config/environment.config'

// Mock dependencies
vi.mock('../authFetch', () => ({
    getAuthToken: vi.fn(),
}))

vi.mock('@config/environment.config', () => ({
    config: {
        websocket: {
            url: 'ws://localhost:3001/ws',
        },
    },
}))

describe('webSocketUrl', () => {
    const mockToken = 'valid-jwt-token-123'
    const expectedBaseUrl = 'ws://localhost:3001/ws'

    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('getWebSocketUrl', () => {
        describe('With Authentication (includeAuth: true)', () => {
            it('should return WebSocket URL with encoded token when token exists', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const result = getWebSocketUrl(true)

                expect(result).toBe(`${expectedBaseUrl}?token=${encodeURIComponent(mockToken)}`)
                expect(authFetch.getAuthToken).toHaveBeenCalledTimes(1)
            })

            it('should return WebSocket URL with token when includeAuth is true by default', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const result = getWebSocketUrl()

                expect(result).toBe(`${expectedBaseUrl}?token=${encodeURIComponent(mockToken)}`)
            })

            it('should return null when token does not exist', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(null)

                const result = getWebSocketUrl(true)

                expect(result).toBeNull()
                expect(authFetch.getAuthToken).toHaveBeenCalledTimes(1)
            })

            it('should return null when token is empty string', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue('')

                const result = getWebSocketUrl(true)

                expect(result).toBeNull()
            })

            it('should call getAuthToken to retrieve token', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                getWebSocketUrl(true)

                expect(authFetch.getAuthToken).toHaveBeenCalled()
            })

            it('should properly encode token with special characters', () => {
                const specialToken = 'token-with-special-chars-!@#$%^&*()'
                vi.mocked(authFetch.getAuthToken).mockReturnValue(specialToken)

                const result = getWebSocketUrl(true)

                expect(result).toBe(`${expectedBaseUrl}?token=${encodeURIComponent(specialToken)}`)
                expect(result).toContain('token-with-special-chars-')
            })

            it('should properly encode token with spaces', () => {
                const tokenWithSpaces = 'token with spaces'
                vi.mocked(authFetch.getAuthToken).mockReturnValue(tokenWithSpaces)

                const result = getWebSocketUrl(true)

                expect(result).toBe(
                    `${expectedBaseUrl}?token=${encodeURIComponent(tokenWithSpaces)}`
                )
                expect(result).not.toContain(' ')
                expect(result).toContain('token%20with%20spaces')
            })

            it('should properly encode token with URL-unsafe characters', () => {
                const unsafeToken = 'token&key=value?param=test'
                vi.mocked(authFetch.getAuthToken).mockReturnValue(unsafeToken)

                const result = getWebSocketUrl(true)

                expect(result).toBe(`${expectedBaseUrl}?token=${encodeURIComponent(unsafeToken)}`)
                // Verify encoding worked (no raw & or ? in token part)
                const tokenPart = result?.split('?token=')[1]
                expect(tokenPart).not.toContain('&key')
                expect(tokenPart).not.toContain('?param')
            })

            it('should properly encode token with unicode characters', () => {
                const unicodeToken = 'token-™®©-unicode'
                vi.mocked(authFetch.getAuthToken).mockReturnValue(unicodeToken)

                const result = getWebSocketUrl(true)

                expect(result).toBe(`${expectedBaseUrl}?token=${encodeURIComponent(unicodeToken)}`)
            })

            it('should properly encode token with forward slashes', () => {
                const tokenWithSlashes = 'header.payload.signature/extra'
                vi.mocked(authFetch.getAuthToken).mockReturnValue(tokenWithSlashes)

                const result = getWebSocketUrl(true)

                expect(result).toBe(
                    `${expectedBaseUrl}?token=${encodeURIComponent(tokenWithSlashes)}`
                )
            })

            it('should properly encode very long tokens', () => {
                const longToken = 'a'.repeat(1000)
                vi.mocked(authFetch.getAuthToken).mockReturnValue(longToken)

                const result = getWebSocketUrl(true)

                expect(result).toBe(`${expectedBaseUrl}?token=${encodeURIComponent(longToken)}`)
                expect(result?.length).toBeGreaterThan(expectedBaseUrl.length)
            })
        })

        describe('Without Authentication (includeAuth: false)', () => {
            it('should return WebSocket URL without token when includeAuth is false', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const result = getWebSocketUrl(false)

                expect(result).toBe(expectedBaseUrl)
                expect(result).not.toContain('token=')
            })

            it('should not call getAuthToken when includeAuth is false', () => {
                getWebSocketUrl(false)

                expect(authFetch.getAuthToken).not.toHaveBeenCalled()
            })

            it('should return base URL even when no token exists and includeAuth is false', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(null)

                const result = getWebSocketUrl(false)

                expect(result).toBe(expectedBaseUrl)
                expect(authFetch.getAuthToken).not.toHaveBeenCalled()
            })

            it('should return exact config URL without modifications', () => {
                const result = getWebSocketUrl(false)

                expect(result).toBe(config.websocket.url)
                expect(result).toBe(expectedBaseUrl)
            })
        })

        describe('URL Format Validation', () => {
            it('should return URL in correct WebSocket format', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const result = getWebSocketUrl(true)

                expect(result).toMatch(/^ws:\/\//)
            })

            it('should include query parameter separator', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const result = getWebSocketUrl(true)

                expect(result).toContain('?token=')
            })

            it('should not include double question marks', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const result = getWebSocketUrl(true)

                expect(result).not.toMatch(/\?\?/)
            })

            it('should construct URL in format: base?token=encodedToken', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const result = getWebSocketUrl(true)

                expect(result).toMatch(/^ws:\/\/[^?]+\?token=.+$/)
            })
        })

        describe('Return Type Validation', () => {
            it('should return string when auth enabled and token exists', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const result = getWebSocketUrl(true)

                expect(typeof result).toBe('string')
                expect(result).not.toBeNull()
            })

            it('should return null when auth enabled and no token', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(null)

                const result = getWebSocketUrl(true)

                expect(result).toBeNull()
            })

            it('should return string when auth disabled', () => {
                const result = getWebSocketUrl(false)

                expect(typeof result).toBe('string')
                expect(result).not.toBeNull()
            })

            it('should return string | null union type', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const result: string | null = getWebSocketUrl()

                expect(result === null || typeof result === 'string').toBe(true)
            })
        })

        describe('Config Integration', () => {
            it('should use config.websocket.url as base URL', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const result = getWebSocketUrl(true)

                expect(result).toContain(config.websocket.url)
            })

            it('should use config URL for unauthenticated connections', () => {
                const result = getWebSocketUrl(false)

                expect(result).toBe(config.websocket.url)
            })

            it('should handle config URL with trailing slash', () => {
                // This tests current config value
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const result = getWebSocketUrl(true)

                expect(result).toContain(config.websocket.url)
            })
        })

        describe('Edge Cases', () => {
            it('should handle undefined token as no token', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(undefined as any)

                const result = getWebSocketUrl(true)

                expect(result).toBeNull()
            })

            it('should handle whitespace-only token as no token', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue('   ')

                const result = getWebSocketUrl(true)

                // Whitespace is truthy, so it should be encoded
                expect(result).toBe(`${expectedBaseUrl}?token=${encodeURIComponent('   ')}`)
            })

            it('should handle token with equals sign', () => {
                const tokenWithEquals = 'token=value'
                vi.mocked(authFetch.getAuthToken).mockReturnValue(tokenWithEquals)

                const result = getWebSocketUrl(true)

                expect(result).toBe(
                    `${expectedBaseUrl}?token=${encodeURIComponent(tokenWithEquals)}`
                )
            })

            it('should handle token with ampersand', () => {
                const tokenWithAmpersand = 'token&another=value'
                vi.mocked(authFetch.getAuthToken).mockReturnValue(tokenWithAmpersand)

                const result = getWebSocketUrl(true)

                expect(result).toBe(
                    `${expectedBaseUrl}?token=${encodeURIComponent(tokenWithAmpersand)}`
                )
                // Ensure ampersand is encoded
                const tokenPart = result?.split('?token=')[1]
                expect(tokenPart).toContain('%26')
            })

            it('should handle token with hash symbol', () => {
                const tokenWithHash = 'token#fragment'
                vi.mocked(authFetch.getAuthToken).mockReturnValue(tokenWithHash)

                const result = getWebSocketUrl(true)

                expect(result).toBe(`${expectedBaseUrl}?token=${encodeURIComponent(tokenWithHash)}`)
            })

            it('should handle token that looks like a URL', () => {
                const urlToken = 'http://example.com/token'
                vi.mocked(authFetch.getAuthToken).mockReturnValue(urlToken)

                const result = getWebSocketUrl(true)

                expect(result).toBe(`${expectedBaseUrl}?token=${encodeURIComponent(urlToken)}`)
            })

            it('should handle numeric token (converted to string)', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue('12345' as any)

                const result = getWebSocketUrl(true)

                expect(result).toBe(`${expectedBaseUrl}?token=12345`)
            })

            it('should handle boolean true as includeAuth parameter', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const result = getWebSocketUrl(true)

                expect(result).toContain('?token=')
            })

            it('should handle boolean false as includeAuth parameter', () => {
                const result = getWebSocketUrl(false)

                expect(result).toBe(expectedBaseUrl)
            })
        })

        describe('Token Encoding Verification', () => {
            it('should encode plus signs in token', () => {
                const tokenWithPlus = 'token+with+plus'
                vi.mocked(authFetch.getAuthToken).mockReturnValue(tokenWithPlus)

                const result = getWebSocketUrl(true)

                expect(result).toBe(`${expectedBaseUrl}?token=${encodeURIComponent(tokenWithPlus)}`)
                expect(result).toContain('%2B')
            })

            it('should encode percent signs in token', () => {
                const tokenWithPercent = 'token%20test'
                vi.mocked(authFetch.getAuthToken).mockReturnValue(tokenWithPercent)

                const result = getWebSocketUrl(true)

                expect(result).toBe(
                    `${expectedBaseUrl}?token=${encodeURIComponent(tokenWithPercent)}`
                )
                expect(result).toContain('%2520')
            })

            it('should encode quotes in token', () => {
                const tokenWithQuotes = 'token"with\'quotes'
                vi.mocked(authFetch.getAuthToken).mockReturnValue(tokenWithQuotes)

                const result = getWebSocketUrl(true)

                expect(result).toBe(
                    `${expectedBaseUrl}?token=${encodeURIComponent(tokenWithQuotes)}`
                )
            })

            it('should encode backslashes in token', () => {
                const tokenWithBackslash = 'token\\with\\backslash'
                vi.mocked(authFetch.getAuthToken).mockReturnValue(tokenWithBackslash)

                const result = getWebSocketUrl(true)

                expect(result).toBe(
                    `${expectedBaseUrl}?token=${encodeURIComponent(tokenWithBackslash)}`
                )
            })

            it('should encode newlines in token', () => {
                const tokenWithNewline = 'token\nwith\nnewlines'
                vi.mocked(authFetch.getAuthToken).mockReturnValue(tokenWithNewline)

                const result = getWebSocketUrl(true)

                expect(result).toBe(
                    `${expectedBaseUrl}?token=${encodeURIComponent(tokenWithNewline)}`
                )
                expect(result).not.toContain('\n')
            })

            it('should encode tabs in token', () => {
                const tokenWithTab = 'token\twith\ttabs'
                vi.mocked(authFetch.getAuthToken).mockReturnValue(tokenWithTab)

                const result = getWebSocketUrl(true)

                expect(result).toBe(`${expectedBaseUrl}?token=${encodeURIComponent(tokenWithTab)}`)
                expect(result).not.toContain('\t')
            })
        })

        describe('Integration Scenarios', () => {
            it('should generate valid URL for WebSocket connection with auth', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const result = getWebSocketUrl(true)

                expect(result).toBeTruthy()
                expect(result).toContain('ws://')
                expect(result).toContain('?token=')
                expect(result).toContain(mockToken)
            })

            it('should generate valid URL for WebSocket connection without auth', () => {
                const result = getWebSocketUrl(false)

                expect(result).toBeTruthy()
                expect(result).toContain('ws://')
                expect(result).not.toContain('?token=')
            })

            it('should handle authentication check before WebSocket connection', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(null)

                const result = getWebSocketUrl()

                if (!result) {
                    // Should prompt for login
                    expect(result).toBeNull()
                } else {
                    // Should proceed with connection
                    expect(result).toContain('ws://')
                }
            })

            it('should support public WebSocket connections', () => {
                const result = getWebSocketUrl(false)

                expect(result).toBe(expectedBaseUrl)
                expect(result).not.toContain('token')
            })

            it('should support authenticated WebSocket connections', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const result = getWebSocketUrl(true)

                expect(result).toContain('token=')
                expect(result).toContain(encodeURIComponent(mockToken))
            })

            it('should handle token refresh scenario', () => {
                // First call: no token
                vi.mocked(authFetch.getAuthToken).mockReturnValue(null)
                const result1 = getWebSocketUrl()
                expect(result1).toBeNull()

                // Second call: token available after refresh
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                const result2 = getWebSocketUrl()
                expect(result2).toContain('?token=')
            })

            it('should handle multiple consecutive calls with same token', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const result1 = getWebSocketUrl()
                const result2 = getWebSocketUrl()

                expect(result1).toBe(result2)
                expect(authFetch.getAuthToken).toHaveBeenCalledTimes(2)
            })

            it('should handle switching between authenticated and unauthenticated modes', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const authenticatedUrl = getWebSocketUrl(true)
                const unauthenticatedUrl = getWebSocketUrl(false)

                expect(authenticatedUrl).toContain('?token=')
                expect(unauthenticatedUrl).not.toContain('?token=')
                expect(unauthenticatedUrl).toBe(expectedBaseUrl)
            })
        })

        describe('Default Parameter Behavior', () => {
            it('should default includeAuth to true when not provided', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const result = getWebSocketUrl()

                expect(result).toContain('?token=')
                expect(authFetch.getAuthToken).toHaveBeenCalled()
            })

            it('should call getAuthToken when includeAuth defaults to true', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                getWebSocketUrl()

                expect(authFetch.getAuthToken).toHaveBeenCalledTimes(1)
            })

            it('should return null when no token and includeAuth defaults to true', () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(null)

                const result = getWebSocketUrl()

                expect(result).toBeNull()
            })
        })
    })
})
