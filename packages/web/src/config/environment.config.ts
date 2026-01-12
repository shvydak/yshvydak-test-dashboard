export interface WebEnvironmentConfig {
    api: {
        baseUrl: string
        serverUrl: string
    }
    websocket: {
        url: string
    }
}

type ViteEnv = Record<string, any>

// Helper function to derive base URL from environment
export function getBaseUrlFromEnv(env: ViteEnv): string {
    const viteServerUrl = env.VITE_SERVER_URL
    const viteBaseUrl = env.VITE_BASE_URL

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

export function createWebEnvironmentConfig(env: ViteEnv): WebEnvironmentConfig {
    const baseUrl = getBaseUrlFromEnv(env)
    const viteApiBaseUrl = env.VITE_API_BASE_URL
    const viteWebsocketUrl = env.VITE_WEBSOCKET_URL

    return {
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
}

export const config: WebEnvironmentConfig = createWebEnvironmentConfig(import.meta.env)

// (intentionally no runtime logging)
