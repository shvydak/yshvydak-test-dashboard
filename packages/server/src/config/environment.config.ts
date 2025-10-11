import path from 'path'

export interface EnvironmentConfig {
    server: {
        port: number
        environment: string
    }
    playwright: {
        projectDir: string
        reporterPath: string
    }
    storage: {
        outputDir: string
        attachmentsDir: string
        reportsDir: string
    }
    api: {
        baseUrl: string
        requestLimit: string
    }
    auth: {
        enableAuth: boolean
        jwtSecret: string
        expiresIn: string
        adminEmail: string
        adminPassword: string
    }
}

export const config: EnvironmentConfig = {
    server: {
        get port() {
            return parseInt(process.env.PORT || '3001')
        },
        environment: process.env.NODE_ENV || 'development',
    },
    playwright: {
        get projectDir() {
            return process.env.PLAYWRIGHT_PROJECT_DIR || process.cwd()
        },
        get reporterPath() {
            return 'playwright-dashboard-reporter'
        },
    },
    storage: {
        // Derive OUTPUT_DIR from current working directory if not specified
        outputDir: process.env.OUTPUT_DIR || path.join(process.cwd(), 'test-results'),
        attachmentsDir: 'attachments',
        reportsDir: 'reports',
    },
    api: {
        // Derive API base URL from BASE_URL or PORT, with fallback override support
        get baseUrl() {
            if (process.env.DASHBOARD_API_URL) {
                return process.env.DASHBOARD_API_URL
            }
            if (process.env.BASE_URL) {
                return process.env.BASE_URL
            }
            return `http://localhost:${config.server.port}`
        },
        requestLimit: '50mb',
    },
    auth: {
        get enableAuth() {
            return process.env.ENABLE_AUTH === 'true'
        },
        get jwtSecret() {
            return (
                process.env.JWT_SECRET ||
                (() => {
                    if (config.auth.enableAuth) {
                        throw new Error(
                            'JWT_SECRET environment variable is required when authentication is enabled'
                        )
                    }
                    return 'dev-secret-not-for-production'
                })()
            )
        },
        get expiresIn() {
            return process.env.JWT_EXPIRES_IN || '24h'
        },
        get adminEmail() {
            const email = process.env.ADMIN_EMAIL
            if (!email && config.auth.enableAuth) {
                throw new Error(
                    'ADMIN_EMAIL environment variable is required when authentication is enabled'
                )
            }
            return email || ''
        },
        get adminPassword() {
            const password = process.env.ADMIN_PASSWORD
            if (!password && config.auth.enableAuth) {
                throw new Error(
                    'ADMIN_PASSWORD environment variable is required when authentication is enabled'
                )
            }
            return password || ''
        },
    },
}
