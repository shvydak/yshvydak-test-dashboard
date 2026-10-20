import {BaseRepository} from './base.repository'
import {TestRunData} from '../types/database.types'
import {IRunRepository} from '../types/service.types'

export class RunRepository extends BaseRepository implements IRunRepository {
    async createTestRun(runData: TestRunData): Promise<string> {
        await this.dbManager.createTestRun(runData)
        return runData.id
    }

    async updateTestRun(runId: string, updates: Partial<TestRunData>): Promise<void> {
        return this.dbManager.updateTestRun(runId, updates)
    }

    async getTestRun(runId: string): Promise<TestRunData | null> {
        const row = await this.queryOne<any>('SELECT * FROM test_runs WHERE id = ?', [runId])

        if (!row) return null

        return {
            id: row.id,
            status: row.status,
            totalTests: row.total_tests,
            passedTests: row.passed_tests,
            failedTests: row.failed_tests,
            skippedTests: row.skipped_tests,
            duration: row.duration,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        }
    }

    /** Stop: removes the run rows (their results go with them via ON DELETE CASCADE). */
    async deleteTestRuns(runIds: string[]): Promise<number> {
        let deleted = 0
        for (let i = 0; i < runIds.length; i += 900) {
            const batch = runIds.slice(i, i + 900)
            const result = await this.dbManager.execute(
                `DELETE FROM test_runs WHERE id IN (${batch.map(() => '?').join(',')})`,
                batch
            )
            deleted += result.changes || 0
        }
        return deleted
    }

    async getStats(): Promise<any> {
        return this.dbManager.getStats()
    }

    async getAllTestRuns(limit: number = 50): Promise<TestRunData[]> {
        const rows = await this.queryAll<any>(
            'SELECT * FROM test_runs ORDER BY created_at DESC LIMIT ?',
            [limit]
        )

        return rows.map((row) => ({
            id: row.id,
            status: row.status,
            totalTests: row.total_tests,
            passedTests: row.passed_tests,
            failedTests: row.failed_tests,
            skippedTests: row.skipped_tests,
            duration: row.duration,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        }))
    }
}
