import {Request, Response} from 'express'
import {AuthService, LoginCredentials} from '../services/auth.service'
import {ResponseHelper} from '../utils/response.helper'
import {Logger} from '../utils/logger.util'

export class AuthController {
    constructor(private authService: AuthService) {}

    // POST /api/auth/login - User login
    login = async (req: Request, res: Response): Promise<void> => {
        try {
            const credentials: LoginCredentials = req.body

            // Validate request body
            if (!credentials.email || !credentials.password) {
                ResponseHelper.badRequest(res, 'Email and password are required')
                return
            }

            // Attempt login
            const result = await this.authService.login(credentials)

            if (result.success) {
                ResponseHelper.success(res, {
                    token: result.token,
                    user: result.user,
                    expiresIn: result.expiresIn,
                })
            } else {
                // Return unauthorized for failed login attempts
                ResponseHelper.unauthorized(res, result.message || 'Authentication failed')
            }
        } catch (error) {
            Logger.error('Login endpoint error', error)
            ResponseHelper.serverError(res, 'Authentication service error')
        }
    }

    // POST /api/auth/logout - User logout
    logout = async (req: Request, res: Response): Promise<void> => {
        try {
            // Extract token from authorization header
            const authHeader = req.headers.authorization
            const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined

            const result = await this.authService.logout(token)

            if (result.success) {
                ResponseHelper.success(res, {
                    message: result.message,
                })
            } else {
                ResponseHelper.serverError(res, result.message)
            }
        } catch (error) {
            Logger.error('Logout endpoint error', error)
            ResponseHelper.serverError(res, 'Logout service error')
        }
    }

    // GET /api/auth/verify - Verify JWT token
    verify = async (req: Request, res: Response): Promise<void> => {
        try {
            const authHeader = req.headers.authorization

            if (!authHeader) {
                ResponseHelper.unauthorized(res, 'No authorization header provided')
                return
            }

            const result = await this.authService.verifyJWT(authHeader)

            if (result.valid) {
                ResponseHelper.success(res, {
                    valid: true,
                    user: result.user,
                })
            } else {
                ResponseHelper.unauthorized(res, result.message || 'Invalid token')
            }
        } catch (error) {
            Logger.error('Token verification endpoint error', error)
            ResponseHelper.serverError(res, 'Token verification service error')
        }
    }

    // GET /api/auth/me - Get current user info
    me = async (req: Request, res: Response): Promise<void> => {
        try {
            // This endpoint will be called after auth middleware validation
            // The user info should be available in req.user (set by auth middleware)
            const user = (req as any).user

            if (user) {
                ResponseHelper.success(res, {
                    user: user,
                })
            } else {
                ResponseHelper.unauthorized(res, 'User information not available')
            }
        } catch (error) {
            Logger.error('Get current user endpoint error', error)
            ResponseHelper.serverError(res, 'User service error')
        }
    }

    // GET /api/auth/config - Get authentication configuration (for frontend)
    config = async (req: Request, res: Response): Promise<void> => {
        try {
            const isEnabled = this.authService.isAuthEnabled()

            ResponseHelper.success(res, {
                authEnabled: isEnabled,
                // Only include safe configuration info
                requiresAuth: isEnabled,
                // Don't expose sensitive configuration details
            })
        } catch (error) {
            Logger.error('Auth config endpoint error', error)
            ResponseHelper.serverError(res, 'Configuration service error')
        }
    }
}
