import {defineConfig} from 'vitest/config'

/**
 * Vitest Root Configuration for yshvydak-test-dashboard Monorepo
 *
 * Migration from deprecated vitest.workspace.ts (Vitest 3.x)
 * Uses test.projects to enable running tests across all packages
 * with a single command while maintaining package-specific configurations.
 *
 * Benefits:
 * - Unified test execution across monorepo
 * - Merged coverage reports
 * - Consistent test environment
 *
 * Usage:
 * - npm test              # Run all tests
 * - npm run test:ui       # Open Vitest UI
 * - npm run test:coverage # Generate coverage report
 *
 * @see https://vitest.dev/guide/workspace.html
 */
export default defineConfig({
    test: {
        // Global test settings
        globals: true,

        // Clear mocks between tests for isolation
        clearMocks: true,
        restoreMocks: true,

        // Coverage configuration (v8 provider)
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html', 'lcov'],
            exclude: [
                'node_modules/',
                'dist/',
                '**/*.config.{ts,js}',
                '**/*.d.ts',
                '**/types/',
                '**/__tests__/',
            ],
        },

        // Timeout settings
        testTimeout: 10000,
        hookTimeout: 10000,

        // Projects replace deprecated workspace files
        // Each package can have its own vitest.config.ts for specific overrides
        projects: [
            'packages/core',
            'packages/reporter',
            'packages/server',
            'packages/web',
        ],
    },
})

