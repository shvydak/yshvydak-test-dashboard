import { BaseRepository } from './base.repository'
import { TestResultData, TestResultRow, DatabaseStats } from '../types/database.types'
import { TestResult, TestFilters, ITestRepository } from '../types/service.types'
import { DEFAULT_LIMITS } from '../config/constants'

export class TestRepository extends BaseRepository implements ITestRepository {
    async saveTestResult(testData: TestResultData): Promise<string> {
        return this.dbManager.saveTestResult(testData)
    }

    async getTestResult(id: string): Promise<TestResult | null> {
        const row = await this.queryOne<TestResultRow>(
            `SELECT * FROM test_results WHERE id = ?`,
            [id]
        )

        if (!row) return null

        return this.mapRowToTestResult(row)
    }

    async getTestResultsByRun(runId: string): Promise<TestResult[]> {
        const rows = await this.queryAll<TestResultRow>(
            `SELECT tr.*, 
                    a.id as attachment_id, a.type as attachment_type, a.url as attachment_url
             FROM test_results tr
             LEFT JOIN attachments a ON tr.id = a.test_result_id
             WHERE tr.run_id = ?
             ORDER BY tr.created_at DESC`,
            [runId]
        )

        return this.mapRowsToTestResults(rows)
    }

    async getTestResultsByTestId(testId: string, limit = DEFAULT_LIMITS.TEST_HISTORY): Promise<TestResult[]> {
        const rows = await this.queryAll<TestResultRow>(
            `SELECT tr.*, 
                    a.id as attachment_id, a.type as attachment_type, a.url as attachment_url
             FROM test_results tr
             LEFT JOIN attachments a ON tr.id = a.test_result_id
             WHERE tr.test_id = ?
             ORDER BY tr.created_at DESC
             LIMIT ?`,
            [testId, limit]
        )

        return this.mapRowsToTestResults(rows)
    }

    async getAllTests(filters: TestFilters): Promise<TestResult[]> {
        let sql = `
            SELECT tr.*, 
                   a.id as attachment_id, a.type as attachment_type, a.url as attachment_url
            FROM test_results tr
            LEFT JOIN attachments a ON tr.id = a.test_result_id
        `
        const params: any[] = []

        if (filters.runId) {
            sql += ` WHERE tr.run_id = ?`
            params.push(filters.runId)
        } else {
            // Get latest test results grouped by test_id - simple and reliable approach
            sql = `
                SELECT DISTINCT tr.*, 
                       a.id as attachment_id, a.type as attachment_type, a.url as attachment_url
                FROM test_results tr
                LEFT JOIN attachments a ON tr.id = a.test_result_id
                WHERE tr.id IN (
                    SELECT MAX(id) as latest_id 
                    FROM test_results 
                    GROUP BY test_id
                    HAVING latest_id IS NOT NULL
                )
            `
        }

        if (filters.status) {
            sql += filters.runId ? ` AND` : ` AND`
            sql += ` tr.status = ?`
            params.push(filters.status)
        }

        sql += ` ORDER BY tr.updated_at DESC LIMIT ?`
        params.push(filters.limit || DEFAULT_LIMITS.TESTS_PER_PAGE)

        const rows = await this.queryAll<TestResultRow>(sql, params)
        return this.mapRowsToTestResults(rows)
    }

    async clearAllTests(): Promise<void> {
        return this.dbManager.clearAllData()
    }

    async getTestStats(): Promise<DatabaseStats> {
        return this.dbManager.getDataStats()
    }

    private mapRowToTestResult(row: TestResultRow): TestResult {
        return {
            id: row.id,
            runId: row.run_id,
            testId: row.test_id,
            name: row.name,
            filePath: row.file_path,
            status: row.status as any,
            duration: row.duration,
            errorMessage: row.error_message,
            errorStack: row.error_stack,
            retryCount: row.retry_count,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
            timestamp: row.created_at,
            attachments: []
        }
    }

    private mapRowsToTestResults(rows: TestResultRow[]): TestResult[] {
        const testsMap = new Map<string, TestResult>()

        rows.forEach(row => {
            if (!testsMap.has(row.id)) {
                const testResult = this.mapRowToTestResult(row)
                testsMap.set(row.id, testResult)
            }

            // Add attachment if present
            if (row.attachment_id) {
                const test = testsMap.get(row.id)!
                test.attachments = test.attachments || []
                test.attachments.push({
                    id: row.attachment_id,
                    testResultId: row.id,
                    type: row.attachment_type as any,
                    fileName: '',
                    filePath: '',
                    fileSize: 0,
                    url: row.attachment_url!
                })
            }
        })

        return Array.from(testsMap.values())
    }
}