import type {DatabaseManager} from '../../../database/database.manager'

/**
 * Database helpers for integration tests
 */

/**
 * Seeds database with test runs
 */
export async function seedTestRuns(
    db: DatabaseManager,
    testRuns: Array<{
        id: string
        status?: string
        totalTests?: number
        passedTests?: number
        failedTests?: number
        skippedTests?: number
        duration?: number
        metadata?: any
    }>
): Promise<void> {
    for (const run of testRuns) {
        await db.execute(
            `INSERT INTO test_runs (
                id, status, total_tests, passed_tests, failed_tests,
                skipped_tests, duration, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                run.id,
                run.status || 'running',
                run.totalTests || 0,
                run.passedTests || 0,
                run.failedTests || 0,
                run.skippedTests || 0,
                run.duration || 0,
                run.metadata ? JSON.stringify(run.metadata) : null,
            ]
        )
    }
}

/**
 * Seeds database with test data
 */
export async function seedTestResults(
    db: DatabaseManager,
    testResults: Array<{
        id: string
        testId: string
        runId: string
        name: string
        filePath?: string
        status?: string
        duration?: number
        errorMessage?: string | null
        errorStack?: string | null
        retryCount?: number
        createdAt?: string
    }>
): Promise<void> {
    for (const result of testResults) {
        await db.execute(
            `INSERT INTO test_results (
                id, test_id, run_id, name, file_path, status,
                duration, error_message, error_stack, retry_count, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                result.id,
                result.testId,
                result.runId,
                result.name,
                result.filePath || '',
                result.status || 'passed',
                result.duration || 0,
                result.errorMessage || null,
                result.errorStack || null,
                result.retryCount || 0,
                result.createdAt || new Date().toISOString().replace('T', ' ').substring(0, 19),
            ]
        )
    }
}

/**
 * Seeds database with attachments
 */
export async function seedAttachments(
    db: DatabaseManager,
    attachments: Array<{
        id?: string
        testResultId: string
        type: string
        fileName: string
        filePath: string
        fileSize?: number
        mimeType?: string
    }>
): Promise<void> {
    for (const attachment of attachments) {
        await db.execute(
            `INSERT INTO attachments (
                id, test_result_id, type, file_name, file_path, file_size, mime_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                attachment.id || `att-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                attachment.testResultId,
                attachment.type,
                attachment.fileName,
                attachment.filePath,
                attachment.fileSize || 0,
                attachment.mimeType || 'application/octet-stream',
            ]
        )
    }
}

/**
 * Gets all test results from database
 */
export async function getAllTestResults(db: DatabaseManager): Promise<any[]> {
    return await db.queryAll('SELECT * FROM test_results ORDER BY created_at DESC')
}

/**
 * Gets test results by testId
 */
export async function getTestResultsByTestId(db: DatabaseManager, testId: string): Promise<any[]> {
    return await db.queryAll(
        'SELECT * FROM test_results WHERE test_id = ? ORDER BY created_at DESC',
        [testId]
    )
}

/**
 * Gets attachments by test result id
 */
export async function getAttachmentsByResultId(
    db: DatabaseManager,
    resultId: string
): Promise<any[]> {
    return await db.queryAll('SELECT * FROM attachments WHERE test_result_id = ?', [resultId])
}

/**
 * Gets test result count
 */
export async function getTestResultCount(db: DatabaseManager): Promise<number> {
    const result = await db.queryOne<{count: number}>('SELECT COUNT(*) as count FROM test_results')
    return result?.count || 0
}

/**
 * Gets attachment count
 */
export async function getAttachmentCount(db: DatabaseManager): Promise<number> {
    const result = await db.queryOne<{count: number}>('SELECT COUNT(*) as count FROM attachments')
    return result?.count || 0
}
