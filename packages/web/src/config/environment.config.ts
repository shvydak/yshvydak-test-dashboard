export interface WebEnvironmentConfig {
    api: {
        baseUrl: string
        serverUrl: string
    }
    websocket: {
        url: string
    }
}

// Helper function to derive base URL from environment
function getBaseUrl(): string {
    // Explicitly read VITE env vars to ensure they are properly accessed
    // This ensures Vite properly embeds the values at build time
    const viteServerUrl = import.meta.env.VITE_SERVER_URL
    const viteBaseUrl = import.meta.env.VITE_BASE_URL

    // If VITE_SERVER_URL is explicitly set, use it (for override support)
    if (viteServerUrl) {
        return viteServerUrl
    }

    // If VITE_BASE_URL is set, use it (this will be set from BASE_URL via .env)
    if (viteBaseUrl) {
        return viteBaseUrl
    }

    // Fallback to default server port (matches current .env PORT value)
    return 'http://localhost:3001'
}

// Explicitly read VITE_API_BASE_URL to ensure it's properly accessed
// CRITICAL: These must be read at module level for Vite to embed them in build
// Vite only embeds variables that are explicitly referenced in the code
const viteApiBaseUrl = import.meta.env.VITE_API_BASE_URL
const viteWebsocketUrl = import.meta.env.VITE_WEBSOCKET_URL

// Compute base URL once to avoid multiple function calls
const baseUrl = getBaseUrl()

export const config: WebEnvironmentConfig = {
    api: {
        // Derive API base URL from the base URL, with override support
        baseUrl: viteApiBaseUrl || `${baseUrl}/api`,
        serverUrl: baseUrl,
    },
    websocket: {
        // Derive WebSocket URL from the base URL, with override support
        url:
            viteWebsocketUrl ||
            baseUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws',
    },
}

// (intentionally no runtime logging)
