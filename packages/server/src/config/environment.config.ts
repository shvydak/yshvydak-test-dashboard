import path from 'path'

export interface EnvironmentConfig {
    server: {
        port: number
        environment: string
    }
    playwright: {
        projectDir: string
        reporterPath: string
        useNpmPackage: boolean
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
}

export const config: EnvironmentConfig = {
    server: {
        get port() {
            return parseInt(process.env.PORT || '3001')
        },
        environment: process.env.NODE_ENV || 'development'
    },
    playwright: {
        get projectDir() {
            return process.env.PLAYWRIGHT_PROJECT_DIR || process.cwd()
        },
        reporterPath: process.env.USE_NPM_REPORTER === 'true' 
            ? '@yshvydak/playwright-reporter' 
            : './e2e/testUtils/yshvydakReporter.ts',
        useNpmPackage: process.env.USE_NPM_REPORTER === 'true'
    },
    storage: {
        // Derive OUTPUT_DIR from current working directory if not specified
        outputDir: process.env.OUTPUT_DIR || path.join(process.cwd(), 'test-results'),
        attachmentsDir: 'attachments',
        reportsDir: 'reports'
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
        requestLimit: '50mb'
    }
}