export interface WebEnvironmentConfig {
    api: {
        baseUrl: string
        serverUrl: string
    }
    websocket: {
        url: string
    }
}

export const config: WebEnvironmentConfig = {
    api: {
        baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api',
        serverUrl: import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'
    },
    websocket: {
        url: import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:3001/ws'
    }
}