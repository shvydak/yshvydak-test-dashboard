import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {TestRepository} from '../test.repository'
import {DatabaseManager} from '../../database/database.manager'
import {TestResultData} from '../../types/database.types'

// The unscoped list (GET /api/tests without a project) must agree with the status counts: tests
// whose latest row has no project ('' or NULL: legacy rows, results without a project) are left
// out while at least one named project exists. With no named project at all (Playwright config
// without named projects) nothing is hidden. A specific run's results and an explicit project
// keep their behaviour.
describe('TestRepository.getAllTests() without a project', () => {
    let repository: TestRepository
    let dbManager: DatabaseManager
    let runId: string

    const insertResult = async (
        testId: string,
        project: string | null,
        status: 'passed' | 'failed' | 'skipped' | 'pending',
        createdAt: string,
        rowRunId: string = runId
    ): Promise<string> => {
        const id = `result-${testId}-${createdAt}`
        const data: TestResultData = {
            id,
            runId: rowRunId,
            testId,
            name: testId,
            filePath: 'test/file.spec.ts',
            status,
            duration: 100,
            project: project ?? undefined,
            timestamp: createdAt,
        }
        await repository.saveTestResult(data)
        // Backdate explicitly so "latest" ordering is deterministic
        await (repository as any).execute(
            'UPDATE test_results SET created_at = ?, updated_at = ?, project = ? WHERE id = ?',
            [createdAt, createdAt, project, id]
        )
        return id
    }

    beforeEach(async () => {
        dbManager = new DatabaseManager(':memory:')
        await dbManager.initialize()
        repository = new TestRepository(dbManager)
        runId = `run-${Date.now()}`
        for (const id of [runId, 'run-legacy']) {
            await dbManager.createTestRun({
                id,
                status: 'completed',
                totalTests: 0,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
            })
        }
    })

    afterEach(async () => {
        await dbManager.close()
    })

    it("does not return a test whose latest row has project '' (with and without a status filter)", async () => {
        await insertResult('test-1', 'UI_Tests', 'passed', '2026-09-10T10:00:00.000Z')
        await insertResult('legacy-fail', '', 'failed', '2026-06-25T10:00:00.000Z')
        await insertResult('legacy-pass', '', 'passed', '2026-06-25T10:00:00.000Z')

        const all = await repository.getAllTests({limit: 100})
        const failed = await repository.getAllTests({status: 'failed', limit: 100})

        expect(all.map((t) => t.testId)).toEqual(['test-1'])
        expect(failed).toEqual([])
    })

    it('does not return a test whose latest row has a NULL project (named project exists)', async () => {
        await insertResult('real', 'UI_Tests', 'passed', '2026-09-10T10:00:00.000Z')
        await insertResult('null-project', null, 'failed', '2026-06-25T10:00:00.000Z')

        expect((await repository.getAllTests({limit: 100})).map((t) => t.testId)).toEqual(['real'])
    })

    it('treats NULL like empty: a list with only NULL/empty projects is shown in full', async () => {
        await insertResult('null-project', null, 'failed', '2026-06-25T10:00:00.000Z')
        await insertResult('empty-project', '', 'passed', '2026-06-26T10:00:00.000Z')

        const list = await repository.getAllTests({limit: 100})

        expect(list.map((t) => t.testId).sort()).toEqual(['empty-project', 'null-project'])
    })

    it("returns once, with its project, a test whose older row has project '' but whose latest row has one", async () => {
        await insertResult('test-1', '', 'failed', '2026-06-25T10:00:00.000Z')
        await insertResult('test-1', 'UI_Tests', 'passed', '2026-09-10T10:00:00.000Z')

        const list = await repository.getAllTests({limit: 100})

        expect(list).toHaveLength(1)
        expect(list[0]).toMatchObject({testId: 'test-1', status: 'passed', project: 'UI_Tests'})
    })

    it("keeps hiding the '' row while another named-project row exists, after one project row is deleted", async () => {
        const projectRow = await insertResult(
            'test-1',
            'UI_Tests',
            'passed',
            '2026-09-10T10:00:00.000Z'
        )
        await insertResult('test-1', '', 'failed', '2026-06-25T10:00:00.000Z')
        await insertResult('other', 'API_Tests', 'passed', '2026-09-10T10:00:00.000Z')

        await (repository as any).execute('DELETE FROM test_results WHERE id = ?', [projectRow])

        expect((await repository.getAllTests({limit: 100})).map((t) => t.testId)).toEqual(['other'])
    })

    it("shows '' rows again once the LAST named-project row is gone (no named project exists)", async () => {
        const projectRow = await insertResult(
            'test-1',
            'UI_Tests',
            'passed',
            '2026-09-10T10:00:00.000Z'
        )
        await insertResult('test-1', '', 'failed', '2026-06-25T10:00:00.000Z')
        expect((await repository.getAllTests({limit: 100})).map((t) => t.status)).toEqual([
            'passed',
        ])

        await (repository as any).execute('DELETE FROM test_results WHERE id = ?', [projectRow])

        const after = await repository.getAllTests({limit: 100})
        expect(after.map((t) => [t.testId, t.status])).toEqual([['test-1', 'failed']])
    })

    it('returns every row when no row has a project (unnamed-project setup), with and without a status', async () => {
        await insertResult('a', '', 'passed', '2026-09-10T10:00:00.000Z')
        await insertResult('b', '', 'failed', '2026-09-10T10:00:00.000Z')
        await insertResult('c', '', 'skipped', '2026-09-10T10:00:00.000Z')

        expect(await repository.getAllTests({limit: 100})).toHaveLength(3)
        expect(
            (await repository.getAllTests({status: 'failed', limit: 100})).map((t) => t.testId)
        ).toEqual(['b'])
    })

    it('applies the limit after hiding project-less tests', async () => {
        for (let i = 0; i < 5; i++) {
            await insertResult(`legacy-${i}`, '', 'passed', '2026-09-20T10:00:00.000Z')
        }
        await insertResult('real', 'UI_Tests', 'passed', '2026-01-01T10:00:00.000Z')

        const list = await repository.getAllTests({limit: 2})

        expect(list.map((t) => t.testId)).toEqual(['real'])
    })

    it('leaves an explicit project filter unchanged', async () => {
        await insertResult('ui-1', 'UI_Tests', 'failed', '2026-09-10T10:00:00.000Z')
        await insertResult('api-1', 'API_Tests', 'passed', '2026-09-10T10:00:00.000Z')
        await insertResult('legacy-1', '', 'failed', '2026-06-25T10:00:00.000Z')

        const ui = await repository.getAllTests({project: 'UI_Tests', limit: 100})
        const uiFailed = await repository.getAllTests({
            project: 'UI_Tests',
            status: 'failed',
            limit: 100,
        })

        expect(ui.map((t) => t.testId)).toEqual(['ui-1'])
        expect(uiFailed.map((t) => t.testId)).toEqual(['ui-1'])
    })

    it("leaves the runId branch unchanged: a run's own results include project '' rows", async () => {
        await insertResult('legacy-1', '', 'failed', '2026-06-25T10:00:00.000Z', 'run-legacy')
        await insertResult('legacy-1', '', 'passed', '2026-06-26T10:00:00.000Z', 'run-legacy')
        await insertResult('real', 'UI_Tests', 'passed', '2026-09-10T10:00:00.000Z')

        const run = await repository.getAllTests({runId: 'run-legacy', limit: 100})

        expect(run.map((t) => t.status).sort()).toEqual(['failed', 'passed'])
        expect(run.every((t) => t.project === '')).toBe(true)
    })

    const expectListAgreesWithCounts = async () => {
        const counts = await repository.getTestStatusCounts()
        const list = await repository.getAllTests({limit: 100})

        expect(list.length).toBe(counts.total)
        for (const status of ['passed', 'failed', 'skipped', 'pending'] as const) {
            expect(list.filter((t) => t.status === status).length).toBe(counts[status])
            const filtered = await repository.getAllTests({status, limit: 100})
            expect(filtered.length).toBe(counts[status])
        }
        return counts
    }

    it('agrees with getTestStatusCounts for every status (named-project setup with legacy rows)', async () => {
        await insertResult('a', 'UI_Tests', 'passed', '2026-09-10T10:00:00.000Z')
        await insertResult('b', 'UI_Tests', 'failed', '2026-09-10T10:00:00.000Z')
        await insertResult('c', 'API_Tests', 'skipped', '2026-09-10T10:00:00.000Z')
        await insertResult('d', 'API_Tests', 'pending', '2026-09-10T10:00:00.000Z')
        // flaky: failed then passed later -> counts as passed
        await insertResult('e', 'API_Tests', 'failed', '2026-09-09T10:00:00.000Z')
        await insertResult('e', 'API_Tests', 'passed', '2026-09-10T10:00:00.000Z')
        // legacy noise that must be ignored by both
        await insertResult('legacy-1', '', 'failed', '2026-06-25T10:00:00.000Z')
        await insertResult('legacy-2', '', 'passed', '2026-06-25T10:00:00.000Z')
        await insertResult('legacy-3', '', 'pending', '2026-06-25T10:00:00.000Z')
        await insertResult('mixed', '', 'failed', '2026-06-25T10:00:00.000Z')
        await insertResult('mixed', 'UI_Tests', 'passed', '2026-09-10T10:00:00.000Z')

        const counts = await expectListAgreesWithCounts()

        expect(counts.total).toBe(6)
    })

    it('agrees with getTestStatusCounts for every status (unnamed-project setup)', async () => {
        await insertResult('a', '', 'passed', '2026-09-10T10:00:00.000Z')
        await insertResult('b', null, 'failed', '2026-09-10T10:00:00.000Z')
        await insertResult('c', '', 'skipped', '2026-09-10T10:00:00.000Z')
        await insertResult('d', '', 'pending', '2026-09-10T10:00:00.000Z')
        await insertResult('e', '', 'failed', '2026-09-09T10:00:00.000Z')
        await insertResult('e', '', 'passed', '2026-09-10T10:00:00.000Z')

        const counts = await expectListAgreesWithCounts()

        expect(counts).toMatchObject({total: 5, passed: 2, failed: 1, skipped: 1, pending: 1})
    })
})
