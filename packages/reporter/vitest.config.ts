import {defineConfig, mergeConfig} from 'vitest/config'
import rootConfig from '../../vitest.config'

/**
 * Vitest Configuration for Reporter Package
 *
 * Testing setup for playwright-dashboard-reporter npm package.
 *
 * Critical Areas:
 * - Test ID generation algorithm (MUST be deterministic)
 * - Reporter API communication
 * - Error handling and reporting
 */
export default mergeConfig(
    rootConfig,
    defineConfig({
        test: {
            name: 'reporter',
            environment: 'node',

            // Include test files
            include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],

            // Coverage thresholds (high for critical logic)
            coverage: {
                thresholds: {
                    lines: 90,
                    functions: 90,
                    branches: 85,
                    statements: 90,
                },
                include: ['src/**/*.ts'],
                exclude: ['src/**/__tests__/**', 'src/**/*.d.ts'],
            },
        },
    })
)
