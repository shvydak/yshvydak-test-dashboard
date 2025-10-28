import {defineConfig, mergeConfig} from 'vitest/config'
import rootConfig from '../../vitest.config'

/**
 * Vitest Configuration for Server Package
 *
 * Backend testing setup for Express API, services, repositories, and controllers.
 *
 * Test Types:
 * - Unit tests: Services, repositories, utilities
 * - Integration tests: API endpoints with Supertest
 * - Database tests: SQLite in-memory database
 */
export default mergeConfig(
    rootConfig,
    defineConfig({
        test: {
            name: 'server',
            environment: 'node',

            // Include test files
            include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],

            // Setup files
            setupFiles: ['./vitest.setup.ts'],

            // Run integration tests sequentially to avoid database conflicts
            sequence: {
                concurrent: false, // Run test files sequentially for integration tests
            },

            // Isolate integration tests to avoid database sharing between files
            isolate: true,

            // Force single thread execution for integration tests (avoid env variable conflicts)
            pool: 'forks', // Use forks instead of threads for better isolation
            poolOptions: {
                forks: {
                    singleFork: true, // Run all tests in single fork for env isolation
                },
            },
            // Note: This makes tests slower but ensures proper database isolation
            // Each test file gets its own temporary database via setupTestServer()

            // Coverage thresholds (aspirational)
            coverage: {
                thresholds: {
                    lines: 80,
                    functions: 80,
                    branches: 75,
                    statements: 80,
                },
                include: ['src/**/*.ts'],
                exclude: [
                    'src/**/__tests__/**',
                    'src/types/**',
                    'src/index.ts',
                    'src/server.ts',
                    'src/app.ts',
                ],
            },
        },
    })
)
