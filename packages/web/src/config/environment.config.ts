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
    // If VITE_SERVER_URL is explicitly set, use it (for override support)
    if (import.meta.env.VITE_SERVER_URL) {
        return import.meta.env.VITE_SERVER_URL
    }
    
    // If VITE_BASE_URL is set, use it (this will be set from BASE_URL via .env)
    if (import.meta.env.VITE_BASE_URL) {
        return import.meta.env.VITE_BASE_URL
    }
    
    // Fallback to default server port (matches current .env PORT value)
    return 'http://localhost:3001'
}

export const config: WebEnvironmentConfig = {
    api: {
        // Derive API base URL from the base URL, with override support
        baseUrl: import.meta.env.VITE_API_BASE_URL || `${getBaseUrl()}/api`,
        serverUrl: getBaseUrl()
    },
    websocket: {
        // Derive WebSocket URL from the base URL, with override support  
        url: import.meta.env.VITE_WEBSOCKET_URL || getBaseUrl().replace('http://', 'ws://').replace('https://', 'wss://') + '/ws'
    }
}