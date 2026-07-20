import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {TestRepository} from '../test.repository'
import {DatabaseManager} from '../../database/database.manager'
import {TestResultData} from '../../types/database.types'

describe('TestRepository.getTestStatusCounts()', () => {
    let repository: TestRepository
    let dbManager: DatabaseManager
    let runId: string

    const insertResult = async (
        testId: string,
        project: string,
        status: 'passed' | 'failed' | 'skipped' | 'pending',
        updatedAt: string
    ): Promise<string> => {
        const id = `result-${testId}-${updatedAt}`
        const data: TestResultData = {
            id,
            runId,
            testId,
            name: testId,
            filePath: 'test/file.spec.ts',
            status,
            duration: 100,
            project,
            timestamp: updatedAt,
        }
        await repository.saveTestResult(data)
        // saveTestResult uses CURRENT_TIMESTAMP internally, so backdate explicitly to
        // control "latest" ordering (mirrors getAllTests' ORDER BY updated_at DESC).
        await (repository as any).execute(
            'UPDATE test_results SET created_at = ?, updated_at = ? WHERE id = ?',
            [updatedAt, updatedAt, id]
        )
        return id
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

    it('returns all-zero counts when there are no test results', async () => {
        const counts = await repository.getTestStatusCounts()
        expect(counts).toEqual({total: 0, passed: 0, failed: 0, skipped: 0, pending: 0, noted: 0})
    })

    it('counts only the latest result per test_id, across all projects when no project is given', async () => {
        // test-1: failed then passed later (flaky, fixed on rerun) -> counts as passed
        await insertResult('test-1', 'API_Tests', 'failed', '2026-01-01T10:00:00.000Z')
        await insertResult('test-1', 'API_Tests', 'passed', '2026-01-01T10:05:00.000Z')
        // test-2: still failing (latest)
        await insertResult('test-2', 'API_Tests', 'passed', '2026-01-01T09:00:00.000Z')
        await insertResult('test-2', 'API_Tests', 'failed', '2026-01-01T09:05:00.000Z')
        // test-3: only ever passed, different project
        await insertResult('test-3', 'All_Tests', 'passed', '2026-01-01T08:00:00.000Z')
        await insertResult('test-4', 'All_Tests', 'skipped', '2026-01-01T08:00:00.000Z')
        await insertResult('test-5', 'All_Tests', 'pending', '2026-01-01T08:00:00.000Z')

        const counts = await repository.getTestStatusCounts()

        expect(counts).toEqual({total: 5, passed: 2, failed: 1, skipped: 1, pending: 1, noted: 0})
    })

    it('scopes counts to a single project when given', async () => {
        await insertResult('test-1', 'API_Tests', 'passed', '2026-01-01T10:00:00.000Z')
        await insertResult('test-2', 'API_Tests', 'failed', '2026-01-01T10:00:00.000Z')
        await insertResult('test-3', 'All_Tests', 'passed', '2026-01-01T10:00:00.000Z')

        const counts = await repository.getTestStatusCounts('API_Tests')

        expect(counts).toEqual({total: 2, passed: 1, failed: 1, skipped: 0, pending: 0, noted: 0})
    })

    it('counts a non-empty note on the latest row as noted', async () => {
        await insertResult('test-1', 'API_Tests', 'passed', '2026-01-01T10:00:00.000Z')
        await insertResult('test-2', 'API_Tests', 'passed', '2026-01-01T10:00:00.000Z')

        await (repository as any).execute(
            `INSERT INTO test_notes (test_id, content) VALUES (?, ?)`,
            ['test-1', 'Investigated — known flake']
        )
        await (repository as any).execute(
            `INSERT INTO test_notes (test_id, content) VALUES (?, ?)`,
            ['test-2', '   ']
        )

        const counts = await repository.getTestStatusCounts()

        expect(counts.noted).toBe(1)
    })

    it('is not capped by any page-size limit (unlike getAllTests)', async () => {
        for (let i = 0; i < 250; i++) {
            await insertResult(`test-${i}`, 'API_Tests', 'passed', '2026-01-01T10:00:00.000Z')
        }

        const counts = await repository.getTestStatusCounts()

        expect(counts.total).toBe(250)
    })
})
