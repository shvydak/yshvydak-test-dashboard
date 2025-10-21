import {defineConfig, mergeConfig} from 'vitest/config'
import {sharedConfig} from '../../vitest.shared'

/**
 * Vitest Configuration for Core Package
 *
 * Testing setup for shared types and utilities.
 * This package mainly contains TypeScript types, so tests are minimal.
 */
export default mergeConfig(
    sharedConfig,
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
