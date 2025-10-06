import {config} from '@config/environment.config'
import {getAuthToken} from './authFetch'

export interface TokenValidationResult {
    valid: boolean
    user?: {
        email: string
        role: string
    }
    message?: string
}

export async function verifyToken(): Promise<TokenValidationResult> {
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

        return {
            valid: false,
            message: 'Token verification failed',
        }
    } catch (error) {
        return {
            valid: false,
            message: error instanceof Error ? error.message : 'Verification error',
        }
    }
}
