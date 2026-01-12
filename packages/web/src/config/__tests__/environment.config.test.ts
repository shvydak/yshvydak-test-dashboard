import {describe, it, expect} from 'vitest'
import {createWebEnvironmentConfig, getBaseUrlFromEnv} from '../environment.config'

describe('web environment config', () => {
    it('getBaseUrlFromEnv prefers VITE_SERVER_URL over VITE_BASE_URL', () => {
        const baseUrl = getBaseUrlFromEnv({
            VITE_SERVER_URL: 'http://localhost:9999',
            VITE_BASE_URL: 'http://localhost:3001',
        })

        expect(baseUrl).toBe('http://localhost:9999')
    })

    it('getBaseUrlFromEnv uses VITE_BASE_URL when VITE_SERVER_URL is not set', () => {
        const baseUrl = getBaseUrlFromEnv({
            VITE_BASE_URL: 'http://localhost:8200',
        })

        expect(baseUrl).toBe('http://localhost:8200')
    })

    it('getBaseUrlFromEnv falls back to localhost:3001 when neither VITE_SERVER_URL nor VITE_BASE_URL is set', () => {
        const baseUrl = getBaseUrlFromEnv({})
        expect(baseUrl).toBe('http://localhost:3001')
    })

    it('createWebEnvironmentConfig derives api.baseUrl as `${baseUrl}/api` by default', () => {
        const cfg = createWebEnvironmentConfig({
            VITE_BASE_URL: 'http://localhost:8200',
        })

        expect(cfg.api.serverUrl).toBe('http://localhost:8200')
        expect(cfg.api.baseUrl).toBe('http://localhost:8200/api')
    })

    it('createWebEnvironmentConfig uses VITE_API_BASE_URL override when provided', () => {
        const cfg = createWebEnvironmentConfig({
            VITE_BASE_URL: 'http://localhost:8200',
            VITE_API_BASE_URL: 'http://localhost:3001/api',
        })

        expect(cfg.api.serverUrl).toBe('http://localhost:8200')
        expect(cfg.api.baseUrl).toBe('http://localhost:3001/api')
    })

    it('createWebEnvironmentConfig derives websocket.url from baseUrl when VITE_WEBSOCKET_URL is not provided', () => {
        const cfg = createWebEnvironmentConfig({
            VITE_BASE_URL: 'https://example.com',
        })

        expect(cfg.websocket.url).toBe('wss://example.com/ws')
    })

    it('createWebEnvironmentConfig uses VITE_WEBSOCKET_URL override when provided', () => {
        const cfg = createWebEnvironmentConfig({
            VITE_BASE_URL: 'http://localhost:8200',
            VITE_WEBSOCKET_URL: 'ws://localhost:9999/ws',
        })

        expect(cfg.websocket.url).toBe('ws://localhost:9999/ws')
    })
})
