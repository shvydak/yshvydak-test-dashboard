import {type Express} from 'express'
import {DatabaseManager} from '../../../database/database.manager'
import type {ServiceContainer} from '../../../middleware/service-injection.middleware'
import {createApp} from '../../../app'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

/**
 * Test server setup for integration tests
 * Provides isolated Express app with unique database per test file
 */
export interface TestServerInstance {
    app: Express
    serviceContainer: ServiceContainer
    testRepository: any
    authToken: string
    dbPath: string // Path to isolated test database
    originalEnv: string | undefined // Original PLAYWRIGHT_PROJECT_DIR for restoration
}

/**
 * Creates a test server instance with isolated database
 * Use this in beforeAll() hook
 *
 * Best Practice: Each test file gets its own temporary database to ensure isolation
 */
export async function setupTestServer(): Promise<TestServerInstance> {
    // Create unique temporary directory for this test file
    const testId = crypto.randomBytes(8).toString('hex')
    const testDbDir = path.join(process.cwd(), 'test-results', `.test-${testId}`)

    // Create directory if it doesn't exist
    if (!fs.existsSync(testDbDir)) {
        fs.mkdirSync(testDbDir, {recursive: true})
    }

    // Save original environment variable for restoration
    const originalEnv = process.env.PLAYWRIGHT_PROJECT_DIR

    // Override environment to use isolated database
    process.env.PLAYWRIGHT_PROJECT_DIR = testDbDir

    // Use the existing createApp function (it will create DB in testDbDir)
    const {app, serviceContainer} = createApp()

    // Store for cleanup
    const dbPath = testDbDir

    // Generate test auth token by logging in
    const loginResult = await serviceContainer.authService.login({
        email: process.env.ADMIN_EMAIL || 'qa@codelovers.com',
        password: process.env.ADMIN_PASSWORD || 'qwerty',
    })

    if (!loginResult.success || !loginResult.token) {
        throw new Error(`Failed to generate test auth token: ${loginResult.message}`)
    }

    return {
        app,
        serviceContainer,
        testRepository: serviceContainer.testRepository,
        authToken: loginResult.token,
        dbPath,
        originalEnv,
    }
}

/**
 * Cleans up database and removes temporary files after tests
 * Use this in afterAll() hook
 *
 * Best Practice: Always clean up temporary test databases to avoid disk space issues
 */
export async function teardownTestServer(server: TestServerInstance): Promise<void> {
    try {
        // Restore original environment variable
        if (server.originalEnv !== undefined) {
            process.env.PLAYWRIGHT_PROJECT_DIR = server.originalEnv
        } else {
            delete process.env.PLAYWRIGHT_PROJECT_DIR
        }

        // Close database connections if needed
        // SQLite will auto-close, but we can be explicit

        // Remove temporary test database directory
        if (server.dbPath && fs.existsSync(server.dbPath)) {
            fs.rmSync(server.dbPath, {recursive: true, force: true})
        }
    } catch (error) {
        // Ignore cleanup errors - don't fail tests due to cleanup issues
        console.warn(`Warning: Failed to cleanup test database: ${error}`)
    }
}

/**
 * Cleans all test data from database using repository methods
 * Use this in beforeEach() hook for test isolation
 */
export async function cleanDatabase(testRepository: any): Promise<void> {
    // Use repository's database manager to clean data
    const db = testRepository.dbManager as DatabaseManager

    // Order matters due to foreign key constraints
    await db.execute('DELETE FROM attachments')
    await db.execute('DELETE FROM test_results')
    await db.execute('DELETE FROM test_runs')
}
