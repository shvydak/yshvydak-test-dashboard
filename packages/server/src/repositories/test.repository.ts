import {BaseRepository} from './base.repository'
import {TestResultData, TestResultRow, DatabaseStats} from '../types/database.types'
import {TestResult, TestFilters, ITestRepository} from '../types/service.types'
import {DEFAULT_LIMITS} from '../config/constants'

export class TestRepository extends BaseRepository implements ITestRepository {
    async saveTestResult(testData: TestResultData): Promise<string> {
        return this.dbManager.saveTestResult(testData)
    }

    async getTestResult(id: string): Promise<TestResult | null> {
        const row = await this.queryOne<TestResultRow>(`SELECT * FROM test_results WHERE id = ?`, [
            id,
        ])

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

    async getTestResultsByTestId(
        testId: string,
        limit = DEFAULT_LIMITS.TEST_HISTORY
    ): Promise<TestResult[]> {
        const rows = await this.queryAll<TestResultRow>(
            `SELECT tr.*,
                a.id as attachment_id, a.type as attachment_type, a.url as attachment_url
             FROM (
                SELECT * FROM test_results
                WHERE test_id = ? AND status NOT IN ('pending', 'skipped')
                ORDER BY created_at DESC
                LIMIT ?
             ) tr
             LEFT JOIN attachments a ON tr.id = a.test_result_id
             ORDER BY tr.created_at DESC`,
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
            // Get latest test results grouped by test_id - use updated_at to get most recent execution
            sql = `
                SELECT DISTINCT tr.*, 
                       a.id as attachment_id, a.type as attachment_type, a.url as attachment_url
                FROM test_results tr
                LEFT JOIN attachments a ON tr.id = a.test_result_id
                WHERE tr.id IN (
                    SELECT id FROM test_results tr2 
                    WHERE tr2.test_id = tr.test_id 
                    ORDER BY tr2.updated_at DESC 
                    LIMIT 1
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

    async deleteByTestId(testId: string): Promise<number> {
        const result = await this.dbManager.execute(`DELETE FROM test_results WHERE test_id = ?`, [
            testId,
        ])
        return result.changes || 0
    }

    async deleteByExecutionId(executionId: string): Promise<number> {
        const result = await this.dbManager.execute(`DELETE FROM test_results WHERE id = ?`, [
            executionId,
        ])
        return result.changes || 0
    }

    async clearAllTests(): Promise<void> {
        return this.dbManager.clearAllData()
    }

    async getTestStats(): Promise<DatabaseStats> {
        return this.dbManager.getDataStats()
    }

    async getFlakyTests(days: number = 30, thresholdPercent: number = 10): Promise<any[]> {
        const sql = `
            SELECT
                tr.test_id as testId,
                tr.name,
                tr.file_path as filePath,
                COUNT(*) as totalRuns,
                SUM(CASE WHEN tr.status = 'failed' THEN 1 ELSE 0 END) as failedRuns,
                SUM(CASE WHEN tr.status = 'passed' THEN 1 ELSE 0 END) as passedRuns,
                CAST(SUM(CASE WHEN tr.status = 'failed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS INTEGER) as flakyPercentage,
                GROUP_CONCAT(
                    CASE
                        WHEN tr.status = 'passed' THEN 'passed'
                        WHEN tr.status = 'failed' THEN 'failed'
                        ELSE 'other'
                    END
                ) as history,
                MAX(tr.updated_at) as lastRun
            FROM test_results tr
            WHERE tr.created_at >= datetime('now', '-' || ? || ' days')
                AND tr.status IN ('passed', 'failed')
            GROUP BY tr.test_id, tr.name, tr.file_path
            HAVING totalRuns > 1
                AND flakyPercentage >= ?
                AND flakyPercentage < 100
            ORDER BY flakyPercentage DESC, totalRuns DESC
            LIMIT 50
        `

        const rows = await this.queryAll<any>(sql, [days, thresholdPercent])

        return rows.map((row) => ({
            testId: row.testId,
            name: row.name,
            filePath: row.filePath,
            totalRuns: row.totalRuns,
            failedRuns: row.failedRuns,
            passedRuns: row.passedRuns,
            flakyPercentage: row.flakyPercentage,
            history: row.history ? row.history.split(',') : [],
            lastRun: row.lastRun,
        }))
    }

    async getTestTimeline(days: number = 30): Promise<any[]> {
        const sql = `
            SELECT
                DATE(tr.created_at) as date,
                COUNT(*) as total,
                SUM(CASE WHEN tr.status = 'passed' THEN 1 ELSE 0 END) as passed,
                SUM(CASE WHEN tr.status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN tr.status = 'skipped' THEN 1 ELSE 0 END) as skipped,
                SUM(CASE WHEN tr.status = 'timedOut' THEN 1 ELSE 0 END) as timedOut
            FROM test_results tr
            WHERE tr.created_at >= datetime('now', '-' || ? || ' days')
                AND tr.status IN ('passed', 'failed', 'skipped', 'timedOut')
            GROUP BY DATE(tr.created_at)
            ORDER BY date ASC
        `

        const rows = await this.queryAll<any>(sql, [days])

        return rows.map((row) => ({
            date: row.date,
            total: row.total,
            passed: row.passed,
            failed: row.failed,
            skipped: row.skipped,
            timedOut: row.timedOut,
        }))
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
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            attachments: [],
        }
    }

    private mapRowsToTestResults(rows: TestResultRow[]): TestResult[] {
        const testsMap = new Map<string, TestResult>()

        rows.forEach((row) => {
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
                    url: row.attachment_url!,
                })
            }
        })

        return Array.from(testsMap.values())
    }
}
