import {defineConfig, mergeConfig} from 'vitest/config'
import {sharedConfig} from '../../vitest.shared'

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
	sharedConfig,
	defineConfig({
		test: {
			name: 'server',
			environment: 'node',

			// Include test files
			include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],

			// Setup files
			setupFiles: ['./vitest.setup.ts'],

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
