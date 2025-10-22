import {defineConfig, mergeConfig} from 'vitest/config'
import react from '@vitejs/plugin-react'
import rootConfig from '../../vitest.config'
import path from 'path'

/**
 * Vitest Configuration for Web Package
 *
 * Frontend testing setup for React components, hooks, and utilities.
 *
 * Test Types:
 * - Unit tests: Hooks, utilities, formatters
 * - Component tests: React Testing Library
 * - Integration tests: User flows with MSW for API mocking
 */
export default mergeConfig(
    rootConfig,
    defineConfig({
        plugins: [
            react({
                // Force development mode for tests to enable React.act() support
                jsxRuntime: 'automatic',
            }),
        ],

        // Force define NODE_ENV and DEV mode for React
        define: {
            'process.env.NODE_ENV': JSON.stringify('test'),
            __DEV__: true,
        },

        test: {
            name: 'web',
            environment: 'jsdom',

            // Override root projects config for package-specific runs
            projects: undefined,

            // Include test files
            include: ['src/**/__tests__/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],

            // Setup files
            setupFiles: ['./vitest.setup.ts'],

            // Coverage thresholds (aspirational)
            coverage: {
                thresholds: {
                    lines: 70,
                    functions: 70,
                    branches: 65,
                    statements: 70,
                },
                include: ['src/**/*.{ts,tsx}'],
                exclude: [
                    'src/**/__tests__/**',
                    'src/types/**',
                    'src/main.tsx',
                    'src/App.tsx',
                    'src/**/*.d.ts',
                ],
            },
        },

        // Resolve path aliases (matching tsconfig.json)
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
                '@features': path.resolve(__dirname, './src/features'),
                '@shared': path.resolve(__dirname, './src/shared'),
                '@config': path.resolve(__dirname, './src/config'),
                '@hooks': path.resolve(__dirname, './src/hooks'),
            },
        },
    })
)
