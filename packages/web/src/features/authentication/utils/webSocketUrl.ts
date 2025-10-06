/**
 * WebSocket URL utility with automatic JWT token inclusion
 */

import {config} from '@config/environment.config'
import {getAuthToken} from './authFetch'

/**
 * Generate WebSocket URL with JWT token for authenticated connections
 * @param includeAuth - Whether to include authentication token (default: true)
 * @returns WebSocket URL with token query parameter, or null if auth required but no token found
 */
export function getWebSocketUrl(includeAuth: boolean = true): string | null {
    if (!includeAuth) {
        return config.websocket.url
    }

    const token = getAuthToken()

    if (!token) {
        return null
    }

    return `${config.websocket.url}?token=${encodeURIComponent(token)}`
}
