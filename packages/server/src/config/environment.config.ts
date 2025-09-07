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
        port: parseInt(process.env.PORT || '3001'),
        environment: process.env.NODE_ENV || 'development'
    },
    playwright: {
        projectDir: process.env.PLAYWRIGHT_PROJECT_DIR || process.cwd(),
        reporterPath: process.env.USE_NPM_REPORTER === 'true' 
            ? '@yshvydak/playwright-reporter' 
            : './e2e/testUtils/yshvydakReporter.ts',
        useNpmPackage: process.env.USE_NPM_REPORTER === 'true'
    },
    storage: {
        outputDir: process.env.OUTPUT_DIR || path.join(process.cwd(), 'test-results'),
        attachmentsDir: 'attachments',
        reportsDir: 'reports'
    },
    api: {
        baseUrl: process.env.DASHBOARD_API_URL || 'http://localhost:3001',
        requestLimit: '50mb'
    }
}