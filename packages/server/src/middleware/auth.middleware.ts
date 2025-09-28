import { Request, Response, NextFunction } from 'express'
import { AuthService } from '../services/auth.service'
import { ResponseHelper } from '../utils/response.helper'
import { Logger } from '../utils/logger.util'
import { config } from '../config/environment.config'

// Extend Request type to include user and auth info
declare global {
    namespace Express {
        interface Request {
            user?: {
                email: string
                role: string
            }
            authType?: 'jwt' | 'none'
        }
    }
}

// Public endpoints that don't require authentication
const PUBLIC_ENDPOINTS = [
    '/api/health',
    '/api/tests/diagnostics',
    '/api/auth/login',
    '/api/auth/config'
]

// Check if endpoint should be public
function isPublicEndpoint(path: string): boolean {
    return PUBLIC_ENDPOINTS.some(endpoint => path.startsWith(endpoint))
}

// Create authentication middleware factory
export function createAuthMiddleware(authService: AuthService) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            // Skip authentication if disabled
            if (!config.auth.enableAuth) {
                req.authType = 'none'
                next()
                return
            }

            // Skip authentication for public endpoints
            if (isPublicEndpoint(req.path)) {
                req.authType = 'none'
                next()
                return
            }

            const authHeader = req.headers.authorization as string

            // JWT authentication (for browser users)
            if (authHeader) {
                const tokenResult = await authService.verifyJWT(authHeader)

                if (tokenResult.valid && tokenResult.user) {
                    req.authType = 'jwt'
                    req.user = tokenResult.user
                    Logger.debug(`JWT authentication successful for user ${tokenResult.user.email}`)
                    next()
                    return
                } else {
                    Logger.warn(`Invalid JWT token provided for ${req.method} ${req.path}`)
                    ResponseHelper.unauthorized(res, tokenResult.message || 'Invalid or expired token')
                    return
                }
            }

            // No authentication provided
            Logger.warn(`No authentication provided for protected endpoint: ${req.method} ${req.path}`)
            ResponseHelper.unauthorized(res, 'Authentication required')

        } catch (error) {
            Logger.error('Authentication middleware error', error)
            ResponseHelper.serverError(res, 'Authentication service error')
        }
    }
}

// Optional middleware for endpoints that require specific authentication types
export function requireJWT() {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (req.authType !== 'jwt') {
            ResponseHelper.forbidden(res, 'JWT authentication required for this endpoint')
            return
        }
        next()
    }
}


// Middleware for endpoints that require admin role
export function requireAdmin() {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user || req.user.role !== 'admin') {
            ResponseHelper.forbidden(res, 'Admin access required')
            return
        }
        next()
    }
}

// Utility middleware to log authentication info
export function logAuth() {
    return (req: Request, res: Response, next: NextFunction): void => {
        const authInfo = {
            method: req.method,
            path: req.path,
            authType: req.authType,
            user: req.user?.email || 'anonymous',
            userAgent: req.headers['user-agent'],
            ip: req.ip
        }

        Logger.debug('Request authentication info', authInfo)
        next()
    }
}