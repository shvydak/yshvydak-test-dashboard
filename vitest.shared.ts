import {defineConfig} from 'vitest/config'

/**
 * Shared Vitest Configuration
 *
 * This configuration is imported by individual package configs
 * to ensure consistent test behavior across the monorepo.
 */
export const sharedConfig = defineConfig({
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
	},
})
