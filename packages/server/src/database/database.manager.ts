import sqlite3 from 'sqlite3'
import fs from 'fs'
import path from 'path'
import {Logger} from '../utils/logger.util'

export interface TestRunData {
    id: string
    status: 'running' | 'completed' | 'failed'
    totalTests: number
    passedTests: number
    failedTests: number
    skippedTests: number
    duration: number
    metadata?: any
}

export interface TestResultData {
    id: string
    runId: string
    testId: string
    name: string
    filePath: string
    status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'pending'
    duration: number
    errorMessage?: string
    errorStack?: string
    retryCount?: number
    metadata?: any
}

export interface AttachmentData {
    id: string
    testResultId: string
    type: 'video' | 'screenshot' | 'trace' | 'log'
    fileName: string
    filePath: string
    fileSize: number
    mimeType?: string
    url: string
}

export interface TestNoteData {
    testId: string
    content: string
}

export interface NoteImageData {
    id: string
    testId: string
    fileName: string
    filePath: string
    fileSize: number
    mimeType: string
    url: string
}

export class DatabaseManager {
    private db!: sqlite3.Database
    private dbPath: string
    private initializationPromise: Promise<void>

    constructor(outputDir: string) {
        // Handle in-memory database
        if (outputDir === ':memory:') {
            this.dbPath = ':memory:'
        } else {
            // Ensure output directory exists
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, {recursive: true})
                // Set directory permissions to be writable
                fs.chmodSync(outputDir, 0o755)
            }

            this.dbPath = path.join(outputDir, 'test-results.db')
        }

        // Enable verbose mode for debugging
        const sqlite = sqlite3.verbose()

        // Create initialization promise
        this.initializationPromise = new Promise<void>((resolve, reject) => {
            // Open database with explicit read-write mode
            this.db = new sqlite.Database(
                this.dbPath,
                sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
                (err) => {
                    if (err) {
                        Logger.error('Database connection error:', err.message)
                        reject(err)
                    } else {
                        Logger.critical('✅ Database connected successfully:', this.dbPath)

                        // Set file permissions after database is created (skip for in-memory)
                        if (this.dbPath !== ':memory:') {
                            try {
                                fs.chmodSync(this.dbPath, 0o644)
                                Logger.debug('✅ Database file permissions set to 644')
                            } catch (error) {
                                Logger.warn('⚠️ Could not set database file permissions:', error)
                            }
                        }

                        // Enable foreign keys and configure database
                        this.db.run('PRAGMA foreign_keys = ON')
                        this.db.run('PRAGMA journal_mode = WAL') // Write-Ahead Logging for better concurrency
                        this.db.run('PRAGMA synchronous = NORMAL') // Balance between safety and performance
                        this.db.run('PRAGMA cache_size = 1000') // Increase cache size
                        this.db.run('PRAGMA temp_store = MEMORY') // Store temp tables in memory

                        // Initialize schema and resolve after schema is created
                        this.initSchema(resolve, reject)
                    }
                }
            )
        })
    }

    /**
     * Wait for database initialization to complete.
     * This is useful in tests and scenarios where you need to ensure the database is ready.
     */
    async initialize(): Promise<void> {
        await this.initializationPromise
    }

    private initSchema(resolve: () => void, reject: (err: Error) => void): void {
        const schemaPath = path.join(__dirname, 'schema.sql')
        Logger.debug('Loading schema from:', schemaPath)

        if (!fs.existsSync(schemaPath)) {
            Logger.error('Schema file not found:', schemaPath)
            const alternativePath = path.join(process.cwd(), 'packages/server/src/db/schema.sql')
            Logger.debug('Trying alternative path:', alternativePath)

            if (fs.existsSync(alternativePath)) {
                const schema = fs.readFileSync(alternativePath, 'utf-8')
                this.db.exec(schema, (error) => {
                    if (error) {
                        Logger.error('Failed to initialize database schema:', error)
                        reject(error)
                    } else {
                        Logger.critical('Database schema initialized successfully')
                        resolve()
                    }
                })
                return
            }
            reject(new Error(`Schema file not found: ${schemaPath}`))
            return
        }

        const schema = fs.readFileSync(schemaPath, 'utf-8')

        this.db.exec(schema, (error) => {
            if (error) {
                Logger.error('Failed to initialize database schema:', error)
                reject(error)
            } else {
                Logger.critical('Database schema initialized successfully')
                resolve()
            }
        })
    }

    // Helper method to promisify database operations
    private run(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (error) {
                if (error) {
                    reject(error)
                } else {
                    resolve(this)
                }
            })
        })
    }

    private get(sql: string, params: any[] = []): Promise<any> {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (error, row) => {
                if (error) {
                    reject(error)
                } else {
                    resolve(row)
                }
            })
        })
    }

    private all(sql: string, params: any[] = []): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (error, rows) => {
                if (error) {
                    reject(error)
                } else {
                    resolve(rows)
                }
            })
        })
    }

    // Test Runs
    async createTestRun(runData: TestRunData): Promise<void> {
        const sql = `
            INSERT INTO test_runs (id, status, total_tests, passed_tests, failed_tests, skipped_tests, duration, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `

        await this.run(sql, [
            runData.id,
            runData.status,
            runData.totalTests,
            runData.passedTests,
            runData.failedTests,
            runData.skippedTests,
            runData.duration,
            runData.metadata ? JSON.stringify(runData.metadata) : null,
        ])
    }

    async updateTestRun(runId: string, updates: Partial<TestRunData>): Promise<void> {
        const setParts: string[] = []
        const values: any[] = []

        if (updates.status !== undefined) {
            setParts.push('status = ?')
            values.push(updates.status)
        }
        if (updates.totalTests !== undefined) {
            setParts.push('total_tests = ?')
            values.push(updates.totalTests)
        }
        if (updates.passedTests !== undefined) {
            setParts.push('passed_tests = ?')
            values.push(updates.passedTests)
        }
        if (updates.failedTests !== undefined) {
            setParts.push('failed_tests = ?')
            values.push(updates.failedTests)
        }
        if (updates.skippedTests !== undefined) {
            setParts.push('skipped_tests = ?')
            values.push(updates.skippedTests)
        }
        if (updates.duration !== undefined) {
            setParts.push('duration = ?')
            values.push(updates.duration)
        }
        if (updates.metadata !== undefined) {
            setParts.push('metadata = ?')
            values.push(JSON.stringify(updates.metadata))
        }

        if (setParts.length === 0) return

        values.push(runId)
        const sql = `UPDATE test_runs SET ${setParts.join(', ')} WHERE id = ?`

        await this.run(sql, values)
    }

    async getTestRun(runId: string): Promise<any> {
        const sql = 'SELECT * FROM test_runs WHERE id = ?'
        const row = await this.get(sql, [runId])

        if (row && row.metadata) {
            try {
                row.metadata = JSON.parse(row.metadata)
            } catch {
                row.metadata = null
            }
        }

        return row
    }

    async getAllTestRuns(limit: number = 50): Promise<any[]> {
        const sql = 'SELECT * FROM test_runs ORDER BY created_at DESC LIMIT ?'
        const rows = await this.all(sql, [limit])

        return rows.map((row) => {
            if (row.metadata) {
                try {
                    row.metadata = JSON.parse(row.metadata)
                } catch {
                    row.metadata = null
                }
            }
            return row
        })
    }

    // Test Results
    async saveTestResult(testData: TestResultData & {timestamp?: string}): Promise<string> {
        const timestamp = (testData as any).timestamp || new Date().toISOString()
        const insertSql = `
            INSERT INTO test_results
            (id, run_id, test_id, name, file_path, status, duration, error_message, error_stack, retry_count, metadata, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        await this.run(insertSql, [
            testData.id,
            testData.runId,
            testData.testId,
            testData.name,
            testData.filePath,
            testData.status,
            testData.duration,
            testData.errorMessage || null,
            testData.errorStack || null,
            testData.retryCount || 0,
            testData.metadata ? JSON.stringify(testData.metadata) : null,
            timestamp, // Use timestamp from reporter (already in UTC ISO format)
            timestamp, // Set both created_at and updated_at to the same value
        ])

        return testData.id
    }

    async getTestResult(testResultId: string): Promise<any> {
        const sql = 'SELECT * FROM test_results WHERE id = ?'
        const row = await this.get(sql, [testResultId])

        if (row && row.metadata) {
            try {
                row.metadata = JSON.parse(row.metadata)
            } catch {
                row.metadata = null
            }
        }

        return row
    }

    async getTestResultsByRun(runId: string): Promise<any[]> {
        const sql = 'SELECT * FROM test_results WHERE run_id = ? ORDER BY created_at'
        const rows = await this.all(sql, [runId])

        return rows.map((row) => {
            if (row.metadata) {
                try {
                    row.metadata = JSON.parse(row.metadata)
                } catch {
                    row.metadata = null
                }
            }
            return row
        })
    }

    async getTestResultsByTestId(testId: string, limit: number = 10): Promise<any[]> {
        const sql = 'SELECT * FROM test_results WHERE test_id = ? ORDER BY created_at DESC LIMIT ?'
        const rows = await this.all(sql, [testId, limit])

        return rows.map((row) => {
            if (row.metadata) {
                try {
                    row.metadata = JSON.parse(row.metadata)
                } catch {
                    row.metadata = null
                }
            }
            return row
        })
    }

    // Attachments
    async saveAttachment(attachmentData: AttachmentData): Promise<void> {
        const sql = `
            INSERT INTO attachments (id, test_result_id, type, file_name, file_path, file_size, mime_type, url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `

        await this.run(sql, [
            attachmentData.id,
            attachmentData.testResultId,
            attachmentData.type,
            attachmentData.fileName,
            attachmentData.filePath,
            attachmentData.fileSize,
            attachmentData.mimeType || null,
            attachmentData.url,
        ])
    }

    async getAttachmentsByTestResult(testResultId: string): Promise<any[]> {
        const sql = 'SELECT * FROM attachments WHERE test_result_id = ? ORDER BY created_at'
        return await this.all(sql, [testResultId])
    }

    async deleteAttachment(attachmentId: string): Promise<void> {
        const sql = 'DELETE FROM attachments WHERE id = ?'
        await this.run(sql, [attachmentId])
    }

    // Utility methods
    async getStats(): Promise<any> {
        const stats = await this.get(`
            SELECT 
                COUNT(*) as total_runs,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_runs,
                SUM(total_tests) as total_tests,
                SUM(passed_tests) as total_passed,
                SUM(failed_tests) as total_failed,
                SUM(skipped_tests) as total_skipped
            FROM test_runs
        `)

        return stats
    }

    async cleanup(daysToKeep: number = 30): Promise<void> {
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

        const sql = 'DELETE FROM test_runs WHERE created_at < ?'
        await this.run(sql, [cutoffDate.toISOString()])
    }

    async clearAllData(): Promise<void> {
        // Clear all data from all tables (cascading delete will handle related records)
        const tables = ['test_runs', 'test_results', 'attachments', 'test_notes', 'note_images']

        for (const table of tables) {
            await this.run(`DELETE FROM ${table}`)
        }

        // Compact database after clearing
        await this.compactDatabase()

        Logger.info('✅ All data cleared from database')
    }

    async compactDatabase(): Promise<void> {
        // Reclaim unused space and compact database file
        await this.run('VACUUM')

        // Checkpoint WAL file to physically shrink database files on disk
        // TRUNCATE mode applies changes and truncates WAL/SHM files to minimal size
        await this.run('PRAGMA wal_checkpoint(TRUNCATE)')
    }

    async getDataStats(): Promise<any> {
        const stats = await this.get(`
            SELECT
                (SELECT COUNT(*) FROM test_runs) as total_runs,
                (SELECT COUNT(*) FROM test_results) as total_results,
                (SELECT COUNT(*) FROM attachments) as total_attachments,
                (SELECT COUNT(*) FROM test_notes) as total_notes
        `)

        // Ensure all values are numbers (handle null/undefined from empty tables)
        // Return camelCase to match DatabaseStats interface
        return {
            totalRuns: stats?.total_runs || 0,
            totalTests: stats?.total_results || 0,
            totalAttachments: stats?.total_attachments || 0,
            totalNotes: stats?.total_notes || 0,
            databaseSize: 0, // TODO: Implement actual size calculation if needed
            lastUpdated: new Date().toISOString(),
        }
    }

    // Additional query methods for compatibility with repositories
    async query(sql: string, params: any[] = []): Promise<any> {
        return this.get(sql, params)
    }

    async queryOne<T>(sql: string, params: any[] = []): Promise<T | null> {
        return this.get(sql, params) as Promise<T | null>
    }

    async queryAll<T>(sql: string, params: any[] = []): Promise<T[]> {
        return this.all(sql, params) as Promise<T[]>
    }

    async execute(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
        return this.run(sql, params)
    }

    // Test Notes
    async saveTestNote(noteData: TestNoteData): Promise<void> {
        const sql = `
            INSERT INTO test_notes (test_id, content)
            VALUES (?, ?)
            ON CONFLICT(test_id) DO UPDATE SET
                content = excluded.content,
                updated_at = CURRENT_TIMESTAMP
        `
        await this.run(sql, [noteData.testId, noteData.content])
    }

    async getTestNote(testId: string): Promise<any> {
        const sql = 'SELECT * FROM test_notes WHERE test_id = ?'
        return this.get(sql, [testId])
    }

    async deleteTestNote(testId: string): Promise<void> {
        const sql = 'DELETE FROM test_notes WHERE test_id = ?'
        await this.run(sql, [testId])
    }

    // Note Images
    async saveNoteImage(imageData: NoteImageData): Promise<void> {
        const sql = `
            INSERT INTO note_images (id, test_id, file_name, file_path, file_size, mime_type, url)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `
        await this.run(sql, [
            imageData.id,
            imageData.testId,
            imageData.fileName,
            imageData.filePath,
            imageData.fileSize,
            imageData.mimeType,
            imageData.url,
        ])
    }

    async getNoteImages(testId: string): Promise<any[]> {
        const sql = 'SELECT * FROM note_images WHERE test_id = ? ORDER BY created_at'
        return await this.all(sql, [testId])
    }

    async getNoteImage(imageId: string): Promise<any> {
        const sql = 'SELECT * FROM note_images WHERE id = ?'
        return await this.get(sql, [imageId])
    }

    async deleteNoteImage(imageId: string): Promise<void> {
        const sql = 'DELETE FROM note_images WHERE id = ?'
        await this.run(sql, [imageId])
    }

    async deleteNoteImagesByTestId(testId: string): Promise<void> {
        const sql = 'DELETE FROM note_images WHERE test_id = ?'
        await this.run(sql, [testId])
    }

    close(): void {
        this.db.close((error) => {
            if (error) {
                Logger.error('Error closing database:', error)
            } else {
                Logger.critical('Database connection closed')
            }
        })
    }
}
