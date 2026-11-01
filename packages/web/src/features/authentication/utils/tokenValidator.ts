import {config} from '@config/environment.config'
import {getAuthToken} from './authFetch'

export interface TokenValidationResult {
    valid: boolean
    /** True when the server could not answer (network error, 5xx): the token is neither valid nor rejected. */
    unknown?: boolean
    user?: {
        email: string
        role: string
    }
    message?: string
}

const VERIFY_TIMEOUT_MS = 10_000

export async function verifyToken(): Promise<TokenValidationResult> {
    // A server that accepts the connection but never answers must not hang startup
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS)
    try {
        const token = getAuthToken()

        if (!token) {
            return {
                valid: false,
                message: 'No token found',
            }
        }

        const response = await fetch(`${config.api.baseUrl}/auth/verify`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
        })

        if (response.ok) {
            const data = await response.json()

            if (data.success && data.data?.valid) {
                return {
                    valid: true,
                    user: data.data.user,
                }
            }
        }

        if (response.status === 401) {
            return {
                valid: false,
                message: 'Token expired or invalid',
            }
        }

        // A 200 that says invalid, or 403, is a rejection; 5xx and anything else is "unknown"
        if (response.ok || response.status === 403) {
            return {
                valid: false,
                message: 'Token verification failed',
            }
        }

        return {
            valid: false,
            unknown: true,
            message: 'Token verification failed',
        }
    } catch (error) {
        return {
            valid: false,
            unknown: true,
            message: error instanceof Error ? error.message : 'Verification error',
        }
    } finally {
        clearTimeout(timer)
    }
}
