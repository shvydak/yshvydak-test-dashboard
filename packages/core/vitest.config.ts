import {defineConfig, mergeConfig} from 'vitest/config'
import rootConfig from '../../vitest.config'

/**
 * Vitest Configuration for Core Package
 *
 * Testing setup for shared types and utilities.
 * This package mainly contains TypeScript types, so tests are minimal.
 */
export default mergeConfig(
    rootConfig,
    defineConfig({
        test: {
            name: 'core',
            environment: 'node',

            // Include test files
            include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],

            // Coverage configuration
            coverage: {
                include: ['src/**/*.ts'],
                exclude: ['src/**/__tests__/**', 'src/**/*.d.ts', 'src/types/**'],
            },
        },
    })
)
