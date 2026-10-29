/**
 * Vitest Setup for Server Package
 *
 * This file runs before all tests in the server package.
 * Use it for global test setup, mocks, and environment configuration.
 */

import {beforeAll, afterAll, afterEach} from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// Own database directory per run, set before any config import reads OUTPUT_DIR: parallel runs no
// longer wipe each other's rows, and a run started inside packages/server can never touch the
// live dashboard DB at packages/server/test-results.
const testOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-test-'))
process.env.OUTPUT_DIR = testOutputDir

// A developer's .env may hold real Jira credentials (dotenv never overrides an existing key, even
// an empty one): blank them so no test can reach the real Jira. A test that needs Jira enabled
// mocks it (e.g. spies on JiraService.isEnabled).
process.env.JIRA_BASE_URL = ''
process.env.JIRA_EMAIL = ''
process.env.JIRA_API_TOKEN = ''

// Environment setup
beforeAll(() => {
    // Set test environment variables
    process.env.NODE_ENV = 'test'
    process.env.JWT_SECRET = 'test-secret-key-for-testing-only'
    process.env.JWT_EXPIRES_IN = '1h'
    process.env.ADMIN_EMAIL = 'test-admin@example.com'
    process.env.ADMIN_PASSWORD = 'test-password-123'
    // A developer's .env may enable auth; suites opt in explicitly
    process.env.ENABLE_AUTH = 'false'

    // Use temporary database for tests to avoid conflicts
    // Each test run gets a unique temp directory
    if (!process.env.PLAYWRIGHT_PROJECT_DIR) {
        process.env.PLAYWRIGHT_PROJECT_DIR = './test-results'
    }
})

// Cleanup after each test
afterEach(() => {
    // Clear any test-specific state
    // This ensures test isolation
})

// Global cleanup
afterAll(() => {
    fs.rmSync(testOutputDir, {recursive: true, force: true})
})
