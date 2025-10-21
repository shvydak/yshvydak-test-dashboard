import {defineWorkspace} from 'vitest/config'

/**
 * Vitest Workspace Configuration for yshvydak-test-dashboard Monorepo
 *
 * This workspace configuration enables running tests across all packages
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
 */
export default defineWorkspace([
    'packages/core',
    'packages/reporter',
    'packages/server',
    'packages/web',
])
