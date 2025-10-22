/**
 * Tests for tokenValidator utility
 *
 * Tests token validation functionality with API integration
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {verifyToken, type TokenValidationResult} from '../tokenValidator'
import * as authFetch from '../authFetch'

// Mock dependencies
vi.mock('../authFetch', () => ({
    getAuthToken: vi.fn(),
}))

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('tokenValidator', () => {
    const mockToken = 'valid-jwt-token-123'
    const mockUser = {
        email: 'test@example.com',
        role: 'admin',
    }

    beforeEach(() => {
        vi.clearAllMocks()
        // Reset fetch mock to default success behavior
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                success: true,
                data: {
                    valid: true,
                    user: mockUser,
                },
            }),
        })
    })

    afterEach(() => {
        vi.resetAllMocks()
    })

    describe('verifyToken', () => {
        describe('Valid Token Scenarios', () => {
            it('should return valid result with user data when token is valid', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const result = await verifyToken()

                expect(result).toEqual({
                    valid: true,
                    user: mockUser,
                })

                expect(mockFetch).toHaveBeenCalledTimes(1)
                expect(mockFetch).toHaveBeenCalledWith(
                    expect.stringContaining('/auth/verify'),
                    expect.objectContaining({
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${mockToken}`,
                        },
                    })
                )
            })

            it('should include correct Authorization header with Bearer token', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                await verifyToken()

                expect(mockFetch).toHaveBeenCalledWith(
                    expect.any(String),
                    expect.objectContaining({
                        headers: expect.objectContaining({
                            Authorization: `Bearer ${mockToken}`,
                        }),
                    })
                )
            })

            it('should call correct API endpoint', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                await verifyToken()

                expect(mockFetch).toHaveBeenCalledWith(
                    expect.stringMatching(/\/auth\/verify$/),
                    expect.any(Object)
                )
            })

            it('should handle user with different roles', async () => {
                const viewerUser = {email: 'viewer@example.com', role: 'viewer'}
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                mockFetch.mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        success: true,
                        data: {
                            valid: true,
                            user: viewerUser,
                        },
                    }),
                })

                const result = await verifyToken()

                expect(result).toEqual({
                    valid: true,
                    user: viewerUser,
                })
            })
        })

        describe('No Token Scenarios', () => {
            it('should return invalid result when no token found', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(null)

                const result = await verifyToken()

                expect(result).toEqual({
                    valid: false,
                    message: 'No token found',
                })

                // Should not make API call if no token
                expect(mockFetch).not.toHaveBeenCalled()
            })

            it('should not make API request when token is null', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(null)

                await verifyToken()

                expect(mockFetch).not.toHaveBeenCalled()
            })

            it('should handle empty string token as no token', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue('')

                const result = await verifyToken()

                // Empty string is falsy, should be treated as no token
                expect(result.valid).toBe(false)
            })
        })

        describe('Invalid Token Scenarios', () => {
            it('should return invalid result for 401 Unauthorized response', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                mockFetch.mockResolvedValue({
                    ok: false,
                    status: 401,
                    json: async () => ({
                        success: false,
                        message: 'Token expired',
                    }),
                })

                const result = await verifyToken()

                expect(result).toEqual({
                    valid: false,
                    message: 'Token expired or invalid',
                })
            })

            it('should handle expired tokens with 401 status', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue('expired-token')
                mockFetch.mockResolvedValue({
                    ok: false,
                    status: 401,
                    json: async () => ({
                        success: false,
                        message: 'Token expired',
                    }),
                })

                const result = await verifyToken()

                expect(result.valid).toBe(false)
                expect(result.message).toBe('Token expired or invalid')
            })

            it('should handle malformed tokens with 401 status', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue('malformed-token')
                mockFetch.mockResolvedValue({
                    ok: false,
                    status: 401,
                })

                const result = await verifyToken()

                expect(result.valid).toBe(false)
                expect(result.message).toBe('Token expired or invalid')
            })
        })

        describe('API Response Validation', () => {
            it('should return invalid when response is not ok but not 401', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                mockFetch.mockResolvedValue({
                    ok: false,
                    status: 500,
                })

                const result = await verifyToken()

                expect(result).toEqual({
                    valid: false,
                    message: 'Token verification failed',
                })
            })

            it('should return invalid when success flag is false', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                mockFetch.mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        success: false,
                        data: {
                            valid: false,
                        },
                    }),
                })

                const result = await verifyToken()

                expect(result).toEqual({
                    valid: false,
                    message: 'Token verification failed',
                })
            })

            it('should return invalid when data.valid is false', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                mockFetch.mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        success: true,
                        data: {
                            valid: false,
                        },
                    }),
                })

                const result = await verifyToken()

                expect(result.valid).toBe(false)
                expect(result.message).toBe('Token verification failed')
            })

            it('should handle missing data field in response', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                mockFetch.mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        success: true,
                        // data field missing
                    }),
                })

                const result = await verifyToken()

                expect(result.valid).toBe(false)
            })

            it('should handle missing user field in valid response', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                mockFetch.mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        success: true,
                        data: {
                            valid: true,
                            // user field missing
                        },
                    }),
                })

                const result = await verifyToken()

                expect(result).toEqual({
                    valid: true,
                    user: undefined,
                })
            })
        })

        describe('Network Error Scenarios', () => {
            it('should handle network errors gracefully', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                mockFetch.mockRejectedValue(new Error('Network error'))

                const result = await verifyToken()

                expect(result).toEqual({
                    valid: false,
                    message: 'Network error',
                })
            })

            it('should handle fetch timeout errors', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                mockFetch.mockRejectedValue(new Error('Request timeout'))

                const result = await verifyToken()

                expect(result.valid).toBe(false)
                expect(result.message).toBe('Request timeout')
            })

            it('should handle connection refused errors', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

                const result = await verifyToken()

                expect(result.valid).toBe(false)
                expect(result.message).toContain('ECONNREFUSED')
            })

            it('should handle non-Error exceptions', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                mockFetch.mockRejectedValue('String error')

                const result = await verifyToken()

                expect(result).toEqual({
                    valid: false,
                    message: 'Verification error',
                })
            })

            it('should handle JSON parsing errors', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                mockFetch.mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => {
                        throw new Error('Invalid JSON')
                    },
                })

                const result = await verifyToken()

                expect(result.valid).toBe(false)
                expect(result.message).toBe('Invalid JSON')
            })
        })

        describe('HTTP Status Codes', () => {
            it('should handle 400 Bad Request', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                mockFetch.mockResolvedValue({
                    ok: false,
                    status: 400,
                })

                const result = await verifyToken()

                expect(result).toEqual({
                    valid: false,
                    message: 'Token verification failed',
                })
            })

            it('should handle 403 Forbidden', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                mockFetch.mockResolvedValue({
                    ok: false,
                    status: 403,
                })

                const result = await verifyToken()

                expect(result).toEqual({
                    valid: false,
                    message: 'Token verification failed',
                })
            })

            it('should handle 404 Not Found', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                mockFetch.mockResolvedValue({
                    ok: false,
                    status: 404,
                })

                const result = await verifyToken()

                expect(result).toEqual({
                    valid: false,
                    message: 'Token verification failed',
                })
            })

            it('should handle 500 Internal Server Error', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                mockFetch.mockResolvedValue({
                    ok: false,
                    status: 500,
                })

                const result = await verifyToken()

                expect(result).toEqual({
                    valid: false,
                    message: 'Token verification failed',
                })
            })

            it('should handle 503 Service Unavailable', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                mockFetch.mockResolvedValue({
                    ok: false,
                    status: 503,
                })

                const result = await verifyToken()

                expect(result).toEqual({
                    valid: false,
                    message: 'Token verification failed',
                })
            })
        })

        describe('Edge Cases', () => {
            it('should handle very long tokens', async () => {
                const longToken = 'a'.repeat(10000)
                vi.mocked(authFetch.getAuthToken).mockReturnValue(longToken)

                await verifyToken()

                expect(mockFetch).toHaveBeenCalledWith(
                    expect.any(String),
                    expect.objectContaining({
                        headers: expect.objectContaining({
                            Authorization: `Bearer ${longToken}`,
                        }),
                    })
                )
            })

            it('should handle tokens with special characters', async () => {
                const specialToken = 'token-with-special-chars-!@#$%^&*()'
                vi.mocked(authFetch.getAuthToken).mockReturnValue(specialToken)

                await verifyToken()

                expect(mockFetch).toHaveBeenCalledWith(
                    expect.any(String),
                    expect.objectContaining({
                        headers: expect.objectContaining({
                            Authorization: `Bearer ${specialToken}`,
                        }),
                    })
                )
            })

            it('should handle tokens with unicode characters', async () => {
                const unicodeToken = 'token-with-unicode-™®©'
                vi.mocked(authFetch.getAuthToken).mockReturnValue(unicodeToken)

                await verifyToken()

                expect(mockFetch).toHaveBeenCalled()
            })

            it('should handle response with extra fields', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                mockFetch.mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        success: true,
                        data: {
                            valid: true,
                            user: mockUser,
                            extraField: 'extra',
                            anotherField: 123,
                        },
                    }),
                })

                const result = await verifyToken()

                expect(result.valid).toBe(true)
                expect(result.user).toEqual(mockUser)
            })

            it('should handle response with null user', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                mockFetch.mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        success: true,
                        data: {
                            valid: true,
                            user: null,
                        },
                    }),
                })

                const result = await verifyToken()

                expect(result.valid).toBe(true)
                expect(result.user).toBeNull()
            })

            it('should handle concurrent verification requests', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const results = await Promise.all([verifyToken(), verifyToken(), verifyToken()])

                expect(results).toHaveLength(3)
                expect(results.every((r) => r.valid === true)).toBe(true)
                expect(mockFetch).toHaveBeenCalledTimes(3)
            })
        })

        describe('Type Safety', () => {
            it('should return TokenValidationResult type', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const _result: TokenValidationResult = await verifyToken()

                expect(_result).toHaveProperty('valid')
                expect(typeof _result.valid).toBe('boolean')
            })

            it('should include optional user field when valid', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const result = await verifyToken()

                if (result.valid && result.user) {
                    expect(result.user).toHaveProperty('email')
                    expect(result.user).toHaveProperty('role')
                }
            })

            it('should include optional message field when invalid', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(null)

                const result = await verifyToken()

                if (!result.valid) {
                    expect(result).toHaveProperty('message')
                    expect(typeof result.message).toBe('string')
                }
            })
        })

        describe('Integration Scenarios', () => {
            it('should handle complete valid authentication flow', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const result = await verifyToken()

                expect(result.valid).toBe(true)
                expect(result.user).toBeDefined()
                expect(result.user?.email).toBe(mockUser.email)
                expect(result.user?.role).toBe(mockUser.role)
                expect(result.message).toBeUndefined()
            })

            it('should handle complete invalid authentication flow', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)
                mockFetch.mockResolvedValue({
                    ok: false,
                    status: 401,
                })

                const result = await verifyToken()

                expect(result.valid).toBe(false)
                expect(result.user).toBeUndefined()
                expect(result.message).toBeDefined()
                expect(result.message).toBe('Token expired or invalid')
            })

            it('should handle authentication check before protected action', async () => {
                vi.mocked(authFetch.getAuthToken).mockReturnValue(mockToken)

                const result = await verifyToken()

                // Simulate checking auth before action
                if (result.valid && result.user) {
                    expect(result.user.role).toBeDefined()
                    // Can proceed with protected action
                } else {
                    throw new Error('Authentication required')
                }

                expect(result.valid).toBe(true)
            })

            it('should handle session refresh scenario', async () => {
                // First call: token expired
                vi.mocked(authFetch.getAuthToken).mockReturnValue('old-token')
                mockFetch.mockResolvedValueOnce({
                    ok: false,
                    status: 401,
                })

                const result1 = await verifyToken()
                expect(result1.valid).toBe(false)

                // Second call: new token valid
                vi.mocked(authFetch.getAuthToken).mockReturnValue('new-token')
                mockFetch.mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        success: true,
                        data: {
                            valid: true,
                            user: mockUser,
                        },
                    }),
                })

                const result2 = await verifyToken()
                expect(result2.valid).toBe(true)
            })
        })
    })
})
