import cors from 'cors'
import {config} from '../config/environment.config'

/**
 * CORS Configuration
 *
 * Development: Allow all origins (origin: true) since we use JWT in headers, not cookies
 * Production: Allow specific origins from ALLOWED_ORIGINS environment variable
 *
 * credentials: false because we use JWT tokens in Authorization headers,
 * not cookies or HTTP authentication. This avoids CORS issues with wildcard origins.
 */

function getAllowedOrigins(): string[] | boolean {
    // In production, use specific allowed origins from environment
    if (config.server.environment === 'production') {
        const origins = process.env.ALLOWED_ORIGINS

        if (origins) {
            // Split comma-separated origins: "https://app1.com,https://app2.com"
            return origins.split(',').map((origin) => origin.trim())
        }

        // If ALLOWED_ORIGINS not set in production, log warning and allow all
        console.warn(
            '⚠️ ALLOWED_ORIGINS not set in production - allowing all origins (not recommended)'
        )
        return true
    }

    // In development, allow all origins
    return true
}

export const corsOptions = {
    origin: getAllowedOrigins(), // Allow all origins for development
    credentials: false,
    optionsSuccessStatus: 200,
}

export const corsMiddleware = cors(corsOptions)
