/**
 * Authentication Middleware Tests (SECURITY CRITICAL)
 *
 * These tests verify the security and correctness of authentication middleware.
 * This is CRITICAL because:
 * 1. Middleware protects all API endpoints
 * 2. JWT validation must be bulletproof
 * 3. Role-based access control (RBAC) depends on this
 * 4. Security vulnerabilities here affect entire system
 *
 * Coverage target: 85%+
 */

import {describe, it, expect, beforeEach, vi, Mock} from 'vitest'
import {Request, Response, NextFunction} from 'express'
import {createAuthMiddleware, requireJWT, requireAdmin, logAuth} from '../auth.middleware'
import {VerifyResult} from '../../services/auth.service'
import {config} from '../../config/environment.config'

// Mock the config
vi.mock('../../config/environment.config', () => ({
    config: {
        auth: {
            enableAuth: true,
        },
    },
}))

// Mock Logger
vi.mock('../../utils/logger.util', () => ({
    Logger: {
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}))

// Helper function to create mock Express request
function createMockRequest(overrides?: Partial<Request>): Request {
    return {
        path: '/api/tests',
        method: 'GET',
        headers: {},
        ...overrides,
    } as Request
}

// Helper function to create mock Express response
function createMockResponse(): Partial<Response> {
    const res: Partial<Response> = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    }
    return res
}

// Helper function to create mock NextFunction
function createMockNext(): NextFunction {
    return vi.fn()
}

describe('Authentication Middleware', () => {
    let mockAuthService: {verifyJWT: Mock}
    let req: Request
    let res: Partial<Response>
    let next: NextFunction

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks()

        // Create mock AuthService
        mockAuthService = {
            verifyJWT: vi.fn(),
        }

        // Create fresh request, response, next for each test
        req = createMockRequest()
        res = createMockResponse()
        next = createMockNext()

        // Reset config to default
        config.auth.enableAuth = true
    })

    describe('createAuthMiddleware', () => {
        describe('Authentication Disabled', () => {
            it('should bypass authentication when ENABLE_AUTH is false', async () => {
                config.auth.enableAuth = false

                const middleware = createAuthMiddleware(mockAuthService as any)
                await middleware(req, res as Response, next)

                expect(req.authType).toBe('none')
                expect(next).toHaveBeenCalledOnce()
                expect(mockAuthService.verifyJWT).not.toHaveBeenCalled()
            })
        })

        describe('Public Endpoints', () => {
            it('should allow /api/health without authentication', async () => {
                req = createMockRequest({path: '/api/health'})

                const middleware = createAuthMiddleware(mockAuthService as any)
                await middleware(req, res as Response, next)

                expect(req.authType).toBe('none')
                expect(next).toHaveBeenCalledOnce()
                expect(mockAuthService.verifyJWT).not.toHaveBeenCalled()
            })

            it('should allow /api/tests/diagnostics without authentication', async () => {
                req = createMockRequest({path: '/api/tests/diagnostics'})

                const middleware = createAuthMiddleware(mockAuthService as any)
                await middleware(req, res as Response, next)

                expect(req.authType).toBe('none')
                expect(next).toHaveBeenCalledOnce()
                expect(mockAuthService.verifyJWT).not.toHaveBeenCalled()
            })

            it('should allow /api/auth/login without authentication', async () => {
                req = createMockRequest({path: '/api/auth/login'})

                const middleware = createAuthMiddleware(mockAuthService as any)
                await middleware(req, res as Response, next)

                expect(req.authType).toBe('none')
                expect(next).toHaveBeenCalledOnce()
                expect(mockAuthService.verifyJWT).not.toHaveBeenCalled()
            })

            it('should allow /api/auth/config without authentication', async () => {
                req = createMockRequest({path: '/api/auth/config'})

                const middleware = createAuthMiddleware(mockAuthService as any)
                await middleware(req, res as Response, next)

                expect(req.authType).toBe('none')
                expect(next).toHaveBeenCalledOnce()
                expect(mockAuthService.verifyJWT).not.toHaveBeenCalled()
            })

            it('should use startsWith for public endpoint matching', async () => {
                req = createMockRequest({path: '/api/health/detailed'})

                const middleware = createAuthMiddleware(mockAuthService as any)
                await middleware(req, res as Response, next)

                expect(req.authType).toBe('none')
                expect(next).toHaveBeenCalledOnce()
            })
        })

        describe('JWT Authentication - Valid Token', () => {
            it('should authenticate with valid JWT token', async () => {
                req.headers = {
                    authorization: 'Bearer valid-token',
                }

                const verifyResult: VerifyResult = {
                    valid: true,
                    user: {
                        email: 'admin@example.com',
                        role: 'admin',
                    },
                }

                mockAuthService.verifyJWT.mockResolvedValue(verifyResult)

                const middleware = createAuthMiddleware(mockAuthService as any)
                await middleware(req, res as Response, next)

                expect(mockAuthService.verifyJWT).toHaveBeenCalledWith('Bearer valid-token')
                expect(req.authType).toBe('jwt')
                expect(req.user).toEqual({
                    email: 'admin@example.com',
                    role: 'admin',
                })
                expect(next).toHaveBeenCalledOnce()
                expect(res.status).not.toHaveBeenCalled()
            })

            it('should authenticate with token without Bearer prefix', async () => {
                req.headers = {
                    authorization: 'valid-token-no-bearer',
                }

                const verifyResult: VerifyResult = {
                    valid: true,
                    user: {
                        email: 'user@example.com',
                        role: 'viewer',
                    },
                }

                mockAuthService.verifyJWT.mockResolvedValue(verifyResult)

                const middleware = createAuthMiddleware(mockAuthService as any)
                await middleware(req, res as Response, next)

                expect(mockAuthService.verifyJWT).toHaveBeenCalledWith('valid-token-no-bearer')
                expect(req.authType).toBe('jwt')
                expect(req.user).toEqual({
                    email: 'user@example.com',
                    role: 'viewer',
                })
                expect(next).toHaveBeenCalledOnce()
            })
        })

        describe('JWT Authentication - Invalid Token', () => {
            it('should reject invalid JWT token', async () => {
                req.headers = {
                    authorization: 'Bearer invalid-token',
                }

                const verifyResult: VerifyResult = {
                    valid: false,
                    message: 'Invalid or expired token',
                }

                mockAuthService.verifyJWT.mockResolvedValue(verifyResult)

                const middleware = createAuthMiddleware(mockAuthService as any)
                await middleware(req, res as Response, next)

                expect(mockAuthService.verifyJWT).toHaveBeenCalledWith('Bearer invalid-token')
                expect(res.status).toHaveBeenCalledWith(401)
                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        success: false,
                        error: 'Unauthorized',
                        message: 'Invalid or expired token',
                    })
                )
                expect(next).not.toHaveBeenCalled()
            })

            it('should reject expired JWT token', async () => {
                req.headers = {
                    authorization: 'Bearer expired-token',
                }

                const verifyResult: VerifyResult = {
                    valid: false,
                    message: 'Token has expired',
                }

                mockAuthService.verifyJWT.mockResolvedValue(verifyResult)

                const middleware = createAuthMiddleware(mockAuthService as any)
                await middleware(req, res as Response, next)

                expect(res.status).toHaveBeenCalledWith(401)
                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        success: false,
                        error: 'Unauthorized',
                        message: 'Token has expired',
                    })
                )
                expect(next).not.toHaveBeenCalled()
            })

            it('should reject malformed JWT token', async () => {
                req.headers = {
                    authorization: 'Bearer malformed.token.here',
                }

                const verifyResult: VerifyResult = {
                    valid: false,
                    message: 'Invalid token structure',
                }

                mockAuthService.verifyJWT.mockResolvedValue(verifyResult)

                const middleware = createAuthMiddleware(mockAuthService as any)
                await middleware(req, res as Response, next)

                expect(res.status).toHaveBeenCalledWith(401)
                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        success: false,
                        error: 'Unauthorized',
                        message: 'Invalid token structure',
                    })
                )
                expect(next).not.toHaveBeenCalled()
            })

            it('should handle token verification returning valid but no user', async () => {
                req.headers = {
                    authorization: 'Bearer token-without-user',
                }

                const verifyResult: VerifyResult = {
                    valid: false,
                    message: 'User no longer exists',
                }

                mockAuthService.verifyJWT.mockResolvedValue(verifyResult)

                const middleware = createAuthMiddleware(mockAuthService as any)
                await middleware(req, res as Response, next)

                expect(res.status).toHaveBeenCalledWith(401)
                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        success: false,
                        error: 'Unauthorized',
                        message: 'User no longer exists',
                    })
                )
                expect(next).not.toHaveBeenCalled()
            })
        })

        describe('No Authentication Provided', () => {
            it('should reject request with no authorization header', async () => {
                req.headers = {}

                const middleware = createAuthMiddleware(mockAuthService as any)
                await middleware(req, res as Response, next)

                expect(mockAuthService.verifyJWT).not.toHaveBeenCalled()
                expect(res.status).toHaveBeenCalledWith(401)
                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        success: false,
                        error: 'Unauthorized',
                        message: 'Authentication required',
                    })
                )
                expect(next).not.toHaveBeenCalled()
            })

            it('should reject protected endpoint without token', async () => {
                req = createMockRequest({path: '/api/tests/123', headers: {}})

                const middleware = createAuthMiddleware(mockAuthService as any)
                await middleware(req, res as Response, next)

                expect(res.status).toHaveBeenCalledWith(401)
                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        success: false,
                        error: 'Unauthorized',
                        message: 'Authentication required',
                    })
                )
                expect(next).not.toHaveBeenCalled()
            })
        })

        describe('Error Handling', () => {
            it('should handle authentication service errors gracefully', async () => {
                req.headers = {
                    authorization: 'Bearer valid-token',
                }

                mockAuthService.verifyJWT.mockRejectedValue(new Error('Service error'))

                const middleware = createAuthMiddleware(mockAuthService as any)
                await middleware(req, res as Response, next)

                expect(res.status).toHaveBeenCalledWith(500)
                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        success: false,
                        error: 'Internal server error',
                        message: 'Authentication service error',
                    })
                )
                expect(next).not.toHaveBeenCalled()
            })

            it('should handle unexpected errors during verification', async () => {
                req.headers = {
                    authorization: 'Bearer token',
                }

                mockAuthService.verifyJWT.mockRejectedValue(new TypeError('Unexpected error'))

                const middleware = createAuthMiddleware(mockAuthService as any)
                await middleware(req, res as Response, next)

                expect(res.status).toHaveBeenCalledWith(500)
                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        success: false,
                        error: 'Internal server error',
                        message: 'Authentication service error',
                    })
                )
            })
        })

        describe('authType Tracking', () => {
            it('should set authType to "none" when auth disabled', async () => {
                config.auth.enableAuth = false

                const middleware = createAuthMiddleware(mockAuthService as any)
                await middleware(req, res as Response, next)

                expect(req.authType).toBe('none')
            })

            it('should set authType to "none" for public endpoints', async () => {
                req = createMockRequest({path: '/api/health'})

                const middleware = createAuthMiddleware(mockAuthService as any)
                await middleware(req, res as Response, next)

                expect(req.authType).toBe('none')
            })

            it('should set authType to "jwt" for valid JWT authentication', async () => {
                req.headers = {
                    authorization: 'Bearer valid-token',
                }

                mockAuthService.verifyJWT.mockResolvedValue({
                    valid: true,
                    user: {email: 'admin@example.com', role: 'admin'},
                })

                const middleware = createAuthMiddleware(mockAuthService as any)
                await middleware(req, res as Response, next)

                expect(req.authType).toBe('jwt')
            })

            it('should not set authType when authentication fails', async () => {
                req.headers = {}

                const middleware = createAuthMiddleware(mockAuthService as any)
                await middleware(req, res as Response, next)

                expect(req.authType).toBeUndefined()
            })
        })
    })

    describe('requireJWT()', () => {
        it('should allow request with JWT authentication', () => {
            req.authType = 'jwt'

            const middleware = requireJWT()
            middleware(req, res as Response, next)

            expect(next).toHaveBeenCalledOnce()
            expect(res.status).not.toHaveBeenCalled()
        })

        it('should block request without JWT authentication (authType none)', () => {
            req.authType = 'none'

            const middleware = requireJWT()
            middleware(req, res as Response, next)

            expect(res.status).toHaveBeenCalledWith(403)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Forbidden',
                    message: 'JWT authentication required for this endpoint',
                })
            )
            expect(next).not.toHaveBeenCalled()
        })

        it('should block request with undefined authType', () => {
            req.authType = undefined

            const middleware = requireJWT()
            middleware(req, res as Response, next)

            expect(res.status).toHaveBeenCalledWith(403)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Forbidden',
                    message: 'JWT authentication required for this endpoint',
                })
            )
            expect(next).not.toHaveBeenCalled()
        })
    })

    describe('requireAdmin()', () => {
        it('should allow request with admin role', () => {
            req.user = {
                email: 'admin@example.com',
                role: 'admin',
            }

            const middleware = requireAdmin()
            middleware(req, res as Response, next)

            expect(next).toHaveBeenCalledOnce()
            expect(res.status).not.toHaveBeenCalled()
        })

        it('should block request without admin role (viewer role)', () => {
            req.user = {
                email: 'viewer@example.com',
                role: 'viewer',
            }

            const middleware = requireAdmin()
            middleware(req, res as Response, next)

            expect(res.status).toHaveBeenCalledWith(403)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Forbidden',
                    message: 'Admin access required',
                })
            )
            expect(next).not.toHaveBeenCalled()
        })

        it('should block request without user object', () => {
            req.user = undefined

            const middleware = requireAdmin()
            middleware(req, res as Response, next)

            expect(res.status).toHaveBeenCalledWith(403)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Forbidden',
                    message: 'Admin access required',
                })
            )
            expect(next).not.toHaveBeenCalled()
        })

        it('should block request with user but no role', () => {
            req.user = {
                email: 'user@example.com',
                role: '',
            }

            const middleware = requireAdmin()
            middleware(req, res as Response, next)

            expect(res.status).toHaveBeenCalledWith(403)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Forbidden',
                    message: 'Admin access required',
                })
            )
            expect(next).not.toHaveBeenCalled()
        })

        it('should block request with custom role (not admin)', () => {
            req.user = {
                email: 'developer@example.com',
                role: 'developer',
            }

            const middleware = requireAdmin()
            middleware(req, res as Response, next)

            expect(res.status).toHaveBeenCalledWith(403)
            expect(next).not.toHaveBeenCalled()
        })
    })

    describe('logAuth()', () => {
        it('should log authentication info and call next', () => {
            req = createMockRequest({
                authType: 'jwt',
                user: {email: 'admin@example.com', role: 'admin'},
                headers: {'user-agent': 'Mozilla/5.0'},
                ip: '127.0.0.1',
            })

            const middleware = logAuth()
            middleware(req, res as Response, next)

            expect(next).toHaveBeenCalledOnce()
        })

        it('should log anonymous when no user', () => {
            req.authType = 'none'
            req.user = undefined
            req.headers = {}

            const middleware = logAuth()
            middleware(req, res as Response, next)

            expect(next).toHaveBeenCalledOnce()
        })

        it('should handle missing headers gracefully', () => {
            req = createMockRequest({
                authType: 'jwt',
                user: {email: 'admin@example.com', role: 'admin'},
                headers: {},
                ip: undefined,
            })

            const middleware = logAuth()
            middleware(req, res as Response, next)

            expect(next).toHaveBeenCalledOnce()
        })
    })

    describe('Integration Scenarios', () => {
        it('should handle full authentication flow for protected endpoint', async () => {
            req = createMockRequest({
                path: '/api/tests',
                headers: {
                    authorization: 'Bearer valid-token',
                },
            })

            mockAuthService.verifyJWT.mockResolvedValue({
                valid: true,
                user: {email: 'admin@example.com', role: 'admin'},
            })

            const authMiddleware = createAuthMiddleware(mockAuthService as any)
            await authMiddleware(req, res as Response, next)

            expect(req.authType).toBe('jwt')
            expect(req.user).toBeDefined()
            expect(next).toHaveBeenCalledOnce()

            // Continue with requireJWT
            const jwtMiddleware = requireJWT()
            const next2 = vi.fn()
            jwtMiddleware(req, res as Response, next2)

            expect(next2).toHaveBeenCalledOnce()

            // Continue with requireAdmin
            const adminMiddleware = requireAdmin()
            const next3 = vi.fn()
            adminMiddleware(req, res as Response, next3)

            expect(next3).toHaveBeenCalledOnce()
        })

        it('should block non-admin user from admin-only endpoint', async () => {
            req = createMockRequest({
                path: '/api/admin/settings',
                headers: {
                    authorization: 'Bearer viewer-token',
                },
            })

            mockAuthService.verifyJWT.mockResolvedValue({
                valid: true,
                user: {email: 'viewer@example.com', role: 'viewer'},
            })

            const authMiddleware = createAuthMiddleware(mockAuthService as any)
            await authMiddleware(req, res as Response, next)

            expect(req.authType).toBe('jwt')
            expect(next).toHaveBeenCalledOnce()

            // requireAdmin should block
            const adminMiddleware = requireAdmin()
            const next2 = vi.fn()
            const res2 = createMockResponse()
            adminMiddleware(req, res2 as Response, next2)

            expect(res2.status).toHaveBeenCalledWith(403)
            expect(next2).not.toHaveBeenCalled()
        })

        it('should allow public endpoint without any authentication', async () => {
            req = createMockRequest({path: '/api/health', headers: {}})

            const authMiddleware = createAuthMiddleware(mockAuthService as any)
            await authMiddleware(req, res as Response, next)

            expect(req.authType).toBe('none')
            expect(next).toHaveBeenCalledOnce()
            expect(mockAuthService.verifyJWT).not.toHaveBeenCalled()
        })
    })
})
