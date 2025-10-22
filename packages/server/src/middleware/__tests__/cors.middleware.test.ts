import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {corsOptions, corsMiddleware} from '../cors.middleware'

// Mock the config module
vi.mock('../../config/environment.config', () => ({
    config: {
        server: {
            environment: 'development',
        },
    },
}))

describe('CORS Middleware', () => {
    let originalEnv: NodeJS.ProcessEnv
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        originalEnv = process.env
        process.env = {...originalEnv}
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        process.env = originalEnv
        vi.restoreAllMocks()
        vi.resetModules()
    })

    describe('corsOptions', () => {
        it('should have correct basic options', () => {
            expect(corsOptions).toHaveProperty('origin')
            expect(corsOptions).toHaveProperty('credentials', false)
            expect(corsOptions).toHaveProperty('optionsSuccessStatus', 200)
        })

        it('should set credentials to false for JWT authentication', () => {
            // credentials: false because we use JWT in Authorization headers
            expect(corsOptions.credentials).toBe(false)
        })

        it('should set optionsSuccessStatus to 200 for legacy browser support', () => {
            // Some legacy browsers (IE11, various SmartTVs) choke on 204
            expect(corsOptions.optionsSuccessStatus).toBe(200)
        })
    })

    describe('getAllowedOrigins - Development', () => {
        it('should allow all origins in development environment', async () => {
            // Re-import to get fresh config
            vi.doMock('../../config/environment.config', () => ({
                config: {
                    server: {
                        environment: 'development',
                    },
                },
            }))

            // Dynamic import to get fresh module
            const {corsOptions: devOptions} = await import('../cors.middleware?t=' + Date.now())
            expect(devOptions.origin).toBe(true)
        })

        it('should not check ALLOWED_ORIGINS in development', async () => {
            process.env.ALLOWED_ORIGINS = 'https://example.com'

            vi.doMock('../../config/environment.config', () => ({
                config: {
                    server: {
                        environment: 'development',
                    },
                },
            }))

            const {corsOptions: devOptions} = await import('../cors.middleware?t=' + Date.now())
            expect(devOptions.origin).toBe(true)
        })
    })

    describe('getAllowedOrigins - Production', () => {
        it('should use ALLOWED_ORIGINS from environment in production', async () => {
            process.env.ALLOWED_ORIGINS = 'https://app1.com,https://app2.com'

            vi.doMock('../../config/environment.config', () => ({
                config: {
                    server: {
                        environment: 'production',
                    },
                },
            }))

            const {corsOptions: prodOptions} = await import('../cors.middleware?t=' + Date.now())
            expect(prodOptions.origin).toEqual(['https://app1.com', 'https://app2.com'])
        })

        it('should trim whitespace from origins', async () => {
            process.env.ALLOWED_ORIGINS = '  https://app1.com  ,  https://app2.com  '

            vi.doMock('../../config/environment.config', () => ({
                config: {
                    server: {
                        environment: 'production',
                    },
                },
            }))

            const {corsOptions: prodOptions} = await import('../cors.middleware?t=' + Date.now())
            expect(prodOptions.origin).toEqual(['https://app1.com', 'https://app2.com'])
        })

        it('should handle single origin in production', async () => {
            process.env.ALLOWED_ORIGINS = 'https://example.com'

            vi.doMock('../../config/environment.config', () => ({
                config: {
                    server: {
                        environment: 'production',
                    },
                },
            }))

            const {corsOptions: prodOptions} = await import('../cors.middleware?t=' + Date.now())
            expect(prodOptions.origin).toEqual(['https://example.com'])
        })

        it('should allow all origins and warn if ALLOWED_ORIGINS not set in production', async () => {
            delete process.env.ALLOWED_ORIGINS

            vi.doMock('../../config/environment.config', () => ({
                config: {
                    server: {
                        environment: 'production',
                    },
                },
            }))

            // Clear previous warn spy
            consoleWarnSpy.mockClear()

            const {corsOptions: prodOptions} = await import('../cors.middleware?t=' + Date.now())
            expect(prodOptions.origin).toBe(true)
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('ALLOWED_ORIGINS not set in production')
            )
        })

        it('should allow all origins if ALLOWED_ORIGINS is empty string in production', async () => {
            process.env.ALLOWED_ORIGINS = ''

            vi.doMock('../../config/environment.config', () => ({
                config: {
                    server: {
                        environment: 'production',
                    },
                },
            }))

            consoleWarnSpy.mockClear()

            const {corsOptions: prodOptions} = await import('../cors.middleware?t=' + Date.now())
            expect(prodOptions.origin).toBe(true)
            expect(consoleWarnSpy).toHaveBeenCalled()
        })
    })

    describe('corsMiddleware', () => {
        it('should be a function', () => {
            expect(typeof corsMiddleware).toBe('function')
        })

        it('should accept Express middleware parameters', () => {
            // CORS middleware should accept (req, res, next)
            expect(corsMiddleware.length).toBeGreaterThanOrEqual(3)
        })
    })

    describe('Edge Cases', () => {
        it('should handle multiple commas in ALLOWED_ORIGINS', async () => {
            process.env.ALLOWED_ORIGINS = 'https://app1.com,,https://app2.com'

            vi.doMock('../../config/environment.config', () => ({
                config: {
                    server: {
                        environment: 'production',
                    },
                },
            }))

            const {corsOptions: prodOptions} = await import('../cors.middleware?t=' + Date.now())
            // Empty strings should be trimmed, resulting in ['https://app1.com', '', 'https://app2.com']
            expect(Array.isArray(prodOptions.origin)).toBe(true)
        })

        it('should handle origins with ports', async () => {
            process.env.ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:5173'

            vi.doMock('../../config/environment.config', () => ({
                config: {
                    server: {
                        environment: 'production',
                    },
                },
            }))

            const {corsOptions: prodOptions} = await import('../cors.middleware?t=' + Date.now())
            expect(prodOptions.origin).toEqual(['http://localhost:3000', 'http://localhost:5173'])
        })

        it('should handle origins with paths (though not recommended)', async () => {
            process.env.ALLOWED_ORIGINS = 'https://example.com/app1,https://example.com/app2'

            vi.doMock('../../config/environment.config', () => ({
                config: {
                    server: {
                        environment: 'production',
                    },
                },
            }))

            const {corsOptions: prodOptions} = await import('../cors.middleware?t=' + Date.now())
            expect(prodOptions.origin).toEqual([
                'https://example.com/app1',
                'https://example.com/app2',
            ])
        })

        it('should handle very long origin lists', async () => {
            const origins = Array.from({length: 50}, (_, i) => `https://app${i}.com`)
            process.env.ALLOWED_ORIGINS = origins.join(',')

            vi.doMock('../../config/environment.config', () => ({
                config: {
                    server: {
                        environment: 'production',
                    },
                },
            }))

            const {corsOptions: prodOptions} = await import('../cors.middleware?t=' + Date.now())
            expect(Array.isArray(prodOptions.origin)).toBe(true)
            expect((prodOptions.origin as string[]).length).toBe(50)
        })
    })

    describe('Integration Scenarios', () => {
        it('should create valid CORS middleware for development', async () => {
            vi.doMock('../../config/environment.config', () => ({
                config: {
                    server: {
                        environment: 'development',
                    },
                },
            }))

            const {corsMiddleware: devMiddleware} = await import(
                '../cors.middleware?t=' + Date.now()
            )
            expect(typeof devMiddleware).toBe('function')
        })

        it('should create valid CORS middleware for production with allowed origins', async () => {
            process.env.ALLOWED_ORIGINS = 'https://example.com'

            vi.doMock('../../config/environment.config', () => ({
                config: {
                    server: {
                        environment: 'production',
                    },
                },
            }))

            const {corsMiddleware: prodMiddleware} = await import(
                '../cors.middleware?t=' + Date.now()
            )
            expect(typeof prodMiddleware).toBe('function')
        })

        it('should maintain consistent options structure across environments', async () => {
            vi.doMock('../../config/environment.config', () => ({
                config: {
                    server: {
                        environment: 'development',
                    },
                },
            }))

            const {corsOptions: options1} = await import('../cors.middleware?t=' + Date.now())

            vi.doMock('../../config/environment.config', () => ({
                config: {
                    server: {
                        environment: 'production',
                    },
                },
            }))

            process.env.ALLOWED_ORIGINS = 'https://example.com'
            const {corsOptions: options2} = await import('../cors.middleware?t=' + Date.now())

            // Both should have the same keys
            expect(Object.keys(options1).sort()).toEqual(Object.keys(options2).sort())
        })
    })

    describe('Security Considerations', () => {
        it('should disable credentials to avoid CORS issues with wildcard origins', () => {
            // When credentials: true, browsers require specific origins (not '*')
            // We use JWT in Authorization headers, so credentials: false is correct
            expect(corsOptions.credentials).toBe(false)
        })

        it('should allow configuration of allowed origins in production', async () => {
            process.env.ALLOWED_ORIGINS = 'https://trusted-app.com'

            vi.doMock('../../config/environment.config', () => ({
                config: {
                    server: {
                        environment: 'production',
                    },
                },
            }))

            const {corsOptions: prodOptions} = await import('../cors.middleware?t=' + Date.now())
            expect(Array.isArray(prodOptions.origin)).toBe(true)
            expect((prodOptions.origin as string[]).includes('https://trusted-app.com')).toBe(true)
        })

        it('should warn when production runs without explicit allowed origins', async () => {
            delete process.env.ALLOWED_ORIGINS

            vi.doMock('../../config/environment.config', () => ({
                config: {
                    server: {
                        environment: 'production',
                    },
                },
            }))

            consoleWarnSpy.mockClear()

            await import('../cors.middleware?t=' + Date.now())

            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('not recommended'))
        })
    })
})
