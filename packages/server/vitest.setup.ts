/**
 * Vitest Setup for Server Package
 *
 * This file runs before all tests in the server package.
 * Use it for global test setup, mocks, and environment configuration.
 */

import {beforeAll, afterAll, afterEach} from 'vitest'

// Environment setup
beforeAll(() => {
    // Set test environment variables
    process.env.NODE_ENV = 'test'
    process.env.JWT_SECRET = 'test-secret-key-for-testing-only'
    process.env.JWT_EXPIRES_IN = '1h'
})

// Cleanup after each test
afterEach(() => {
    // Clear any test-specific state
    // This ensures test isolation
})

// Global cleanup
afterAll(() => {
    // Clean up resources
})
