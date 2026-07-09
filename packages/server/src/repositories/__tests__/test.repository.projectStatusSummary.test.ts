import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {TestRepository} from '../test.repository'
import {DatabaseManager} from '../../database/database.manager'
import {TestResultData} from '../../types/database.types'

describe('TestRepository.getProjectStatusSummary()', () => {
    let repository: TestRepository
    let dbManager: DatabaseManager
    let runId: string

    const insertResult = async (
        testId: string,
        project: string,
        status: 'passed' | 'failed' | 'skipped' | 'pending',
        createdAt: string
    ): Promise<void> => {
        const data: TestResultData = {
            id: `result-${testId}-${createdAt}`,
            runId,
            testId,
            name: testId,
            filePath: 'test/file.spec.ts',
            status,
            duration: 100,
            project,
            timestamp: createdAt,
        }
        await repository.saveTestResult(data)
        // saveTestResult uses CURRENT_TIMESTAMP internally for created_at via the DB
        // manager, so backdate created_at explicitly to control "latest" ordering.
        await (repository as any).execute('UPDATE test_results SET created_at = ? WHERE id = ?', [
            createdAt,
            data.id,
        ])
    }

    beforeEach(async () => {
        dbManager = new DatabaseManager(':memory:')
        await dbManager.initialize()
        repository = new TestRepository(dbManager)

        runId = `run-${Date.now()}`
        await dbManager.createTestRun({
            id: runId,
            status: 'completed',
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            skippedTests: 0,
            duration: 0,
        })
    })

    afterEach(async () => {
        await dbManager.close()
    })

    it('returns empty array when there are no test results', async () => {
        const summary = await repository.getProjectStatusSummary()
        expect(summary).toEqual([])
    })

    it('counts only the latest result per test_id, grouped by project', async () => {
        // test-1: failed then passed later (flaky, fixed on rerun) -> should count as passed
        await insertResult('test-1', 'API_Tests', 'failed', '2026-01-01T10:00:00.000Z')
        await insertResult('test-1', 'API_Tests', 'passed', '2026-01-01T10:05:00.000Z')
        // test-2: still failing (latest)
        await insertResult('test-2', 'API_Tests', 'passed', '2026-01-01T09:00:00.000Z')
        await insertResult('test-2', 'API_Tests', 'failed', '2026-01-01T09:05:00.000Z')
        // test-3: only ever passed, different project
        await insertResult('test-3', 'All_Tests', 'passed', '2026-01-01T08:00:00.000Z')

        const summary = await repository.getProjectStatusSummary()

        const apiTests = summary.find((s) => s.project === 'API_Tests')
        const allTests = summary.find((s) => s.project === 'All_Tests')

        expect(apiTests).toEqual({project: 'API_Tests', total: 2, passed: 1, failed: 1})
        expect(allTests).toEqual({project: 'All_Tests', total: 1, passed: 1, failed: 0})
    })

    it('excludes rows with an empty project', async () => {
        await insertResult('test-4', '', 'passed', '2026-01-01T10:00:00.000Z')
        await insertResult('test-5', 'API_Tests', 'passed', '2026-01-01T10:00:00.000Z')

        const summary = await repository.getProjectStatusSummary()

        expect(summary).toEqual([{project: 'API_Tests', total: 1, passed: 1, failed: 0}])
    })

    it('does not count a pending (not-yet-run) latest row as passed or failed', async () => {
        await insertResult('test-6', 'API_Tests', 'passed', '2026-01-01T10:00:00.000Z')
        // Simulates re-discovery inserting a fresh pending row after the passed result
        await insertResult('test-6', 'API_Tests', 'pending', '2026-01-01T11:00:00.000Z')

        const summary = await repository.getProjectStatusSummary()

        expect(summary).toEqual([{project: 'API_Tests', total: 1, passed: 0, failed: 0}])
    })
})
