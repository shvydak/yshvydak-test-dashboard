import { createSigner, createVerifier, JWTPayload } from 'fast-jwt'
import { config } from '../config/environment.config'
import { Logger } from '../utils/logger.util'

export interface AuthUser {
    email: string
    role: string
}

export interface AuthTokenData {
    user: AuthUser
    iat?: number
    exp?: number
}

export interface LoginCredentials {
    email: string
    password: string
}

export interface LoginResult {
    success: boolean
    token?: string
    user?: AuthUser
    expiresIn?: string
    message?: string
}

export interface VerifyResult {
    valid: boolean
    user?: AuthUser
    message?: string
}

export class AuthService {
    private jwtSigner: any
    private jwtVerifier: any
    private apiKeys: Set<string>
    private users: Map<string, { password: string; role: string }>

    constructor() {
        this.initializeJWT()
        this.initializeUsers()
        this.initializeApiKeys()
    }

    private initializeJWT() {
        const jwtSecret = config.auth.jwtSecret
        const expiresIn = config.auth.expiresIn

        if (!jwtSecret) {
            throw new Error('JWT_SECRET environment variable is required')
        }

        try {
            this.jwtSigner = createSigner({
                key: jwtSecret,
                expiresIn: expiresIn
            })

            this.jwtVerifier = createVerifier({
                key: jwtSecret
            })

            Logger.info('JWT authentication initialized successfully')
        } catch (error) {
            Logger.error('Failed to initialize JWT authentication', error)
            throw error
        }
    }

    private initializeUsers() {
        this.users = new Map()

        try {
            // Check for multi-user configuration first
            const adminUsersEnv = process.env.ADMIN_USERS
            if (adminUsersEnv) {
                const adminUsers = JSON.parse(adminUsersEnv)
                for (const user of adminUsers) {
                    this.users.set(user.email, {
                        password: user.password,
                        role: user.role || 'admin'
                    })
                }
                Logger.info(`Loaded ${adminUsers.length} users from ADMIN_USERS configuration`)
            } else {
                // Single user configuration
                const adminEmail = config.auth.adminEmail
                const adminPassword = config.auth.adminPassword

                if (!adminEmail || !adminPassword) {
                    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required')
                }

                this.users.set(adminEmail, {
                    password: adminPassword,
                    role: 'admin'
                })
                Logger.info('Loaded single user from ADMIN_EMAIL/ADMIN_PASSWORD configuration')
            }
        } catch (error) {
            Logger.error('Failed to initialize user configuration', error)
            throw error
        }
    }

    private initializeApiKeys() {
        this.apiKeys = new Set()

        const reporterApiKey = config.auth.reporterApiKey
        if (reporterApiKey) {
            this.apiKeys.add(reporterApiKey)
            Logger.info('Reporter API key configured successfully')
        } else {
            Logger.warn('No REPORTER_API_KEY configured - reporter authentication will fail')
        }

        // Additional API keys can be added here in the future
        // Example: ADDITIONAL_API_KEYS environment variable
    }

    async login(credentials: LoginCredentials): Promise<LoginResult> {
        try {
            const { email, password } = credentials

            // Validate user credentials
            const userConfig = this.users.get(email)
            if (!userConfig || userConfig.password !== password) {
                Logger.warn(`Failed login attempt for email: ${email}`)
                return {
                    success: false,
                    message: 'Invalid email or password'
                }
            }

            // Create user object
            const user: AuthUser = {
                email,
                role: userConfig.role
            }

            // Generate JWT token
            const tokenPayload: AuthTokenData = { user }
            const token = await this.jwtSigner(tokenPayload)

            Logger.info(`Successful login for user: ${email}`)

            return {
                success: true,
                token,
                user,
                expiresIn: config.auth.expiresIn
            }
        } catch (error) {
            Logger.error('Login process failed', error)
            return {
                success: false,
                message: 'Authentication failed'
            }
        }
    }

    async verifyJWT(token: string): Promise<VerifyResult> {
        try {
            if (!token) {
                return {
                    valid: false,
                    message: 'No token provided'
                }
            }

            // Remove 'Bearer ' prefix if present
            const cleanToken = token.startsWith('Bearer ') ? token.substring(7) : token

            // Verify JWT token
            const decoded = await this.jwtVerifier(cleanToken) as AuthTokenData

            if (!decoded || !decoded.user) {
                return {
                    valid: false,
                    message: 'Invalid token structure'
                }
            }

            // Validate that user still exists in configuration
            if (!this.users.has(decoded.user.email)) {
                Logger.warn(`Token valid but user no longer exists: ${decoded.user.email}`)
                return {
                    valid: false,
                    message: 'User no longer exists'
                }
            }

            return {
                valid: true,
                user: decoded.user
            }
        } catch (error) {
            Logger.warn('JWT verification failed', error)
            return {
                valid: false,
                message: 'Invalid or expired token'
            }
        }
    }

    async verifyApiKey(apiKey: string): Promise<boolean> {
        try {
            if (!apiKey) {
                return false
            }

            const isValid = this.apiKeys.has(apiKey)

            if (!isValid) {
                Logger.warn('Invalid API key provided')
            }

            return isValid
        } catch (error) {
            Logger.error('API key verification failed', error)
            return false
        }
    }

    async logout(token?: string): Promise<{ success: boolean; message: string }> {
        try {
            // For JWT tokens, we don't need to do anything server-side
            // The client should remove the token from storage
            // In a future implementation, we could add token blacklisting

            Logger.info('User logged out')
            return {
                success: true,
                message: 'Successfully logged out'
            }
        } catch (error) {
            Logger.error('Logout process failed', error)
            return {
                success: false,
                message: 'Logout failed'
            }
        }
    }

    // Utility method to check if authentication is enabled
    isAuthEnabled(): boolean {
        return config.auth.enableAuth
    }

    // Utility method to get configured users (for debugging/admin purposes)
    getConfiguredUsers(): string[] {
        return Array.from(this.users.keys())
    }

    // Utility method to regenerate API keys (for future implementation)
    regenerateApiKey(oldKey?: string): string {
        // Implementation for API key rotation
        // This would be used for security maintenance
        throw new Error('API key regeneration not implemented yet')
    }
}