import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {TestRepository} from '../test.repository'
import {RunRepository} from '../run.repository'
import {AttachmentRepository} from '../attachment.repository'
import {DatabaseManager} from '../../database/database.manager'

// Stop removes everything a run wrote; each test must show its previous latest result again.
describe('Stop: removing a run and the discovery rows that hide older results', () => {
    let dbManager: DatabaseManager
    let tests: TestRepository
    let runs: RunRepository

    const createRun = (id: string) =>
        runs.createTestRun({
            id,
            status: 'completed',
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            skippedTests: 0,
            duration: 0,
        })

    // created_at comes from `timestamp`, like the reporter's and discovery's rows
    const insert = (
        id: string,
        testId: string,
        status: 'passed' | 'failed' | 'pending',
        timestamp: string,
        runId: string | null,
        project = 'API'
    ) =>
        tests.saveTestResult({
            id,
            runId: runId as any,
            testId,
            name: testId,
            filePath: `${testId}.spec.ts`,
            status,
            duration: 1,
            project,
            timestamp,
        } as any)

    const latest = async (testId: string) =>
        (await tests.getAllTests({limit: 100})).find((t) => t.testId === testId)

    beforeEach(async () => {
        dbManager = new DatabaseManager(':memory:')
        await dbManager.initialize()
        tests = new TestRepository(dbManager)
        runs = new RunRepository(dbManager)
        await createRun('old-run')
        await createRun('stopped-run')
    })

    afterEach(async () => {
        await dbManager.close()
    })

    describe('deleteDiscoveryRowsHidingResults', () => {
        it('removes the pending row that hides an older real result, so the result shows again', async () => {
            await insert('old-1', 't1', 'passed', '2026-01-01T10:00:00.000Z', 'old-run')
            await insert('pend-1', 't1', 'pending', '2026-01-01T11:00:00.000Z', null)
            expect((await latest('t1'))?.status).toBe('pending')

            const deleted = await tests.deleteDiscoveryRowsHidingResults(
                'API',
                '2026-01-01T10:30:00.000Z'
            )

            expect(deleted).toBe(1)
            expect((await latest('t1'))?.status).toBe('passed')
        })

        it('keeps the pending row of a test that never ran (nothing older to show)', async () => {
            await insert('pend-2', 't2', 'pending', '2026-01-01T11:00:00.000Z', null)

            const deleted = await tests.deleteDiscoveryRowsHidingResults(
                'API',
                '2026-01-01T10:30:00.000Z'
            )

            expect(deleted).toBe(0)
            expect((await latest('t2'))?.status).toBe('pending')
        })

        it('does not count a pending row as an older result', async () => {
            await insert('pend-old', 't3', 'pending', '2026-01-01T09:00:00.000Z', null)
            await insert('pend-new', 't3', 'pending', '2026-01-01T11:00:00.000Z', null)

            expect(
                await tests.deleteDiscoveryRowsHidingResults('API', '2026-01-01T10:30:00.000Z')
            ).toBe(0)
        })

        it('only touches rows written since the run began', async () => {
            await insert('old-4', 't4', 'passed', '2026-01-01T08:00:00.000Z', 'old-run')
            await insert('pend-4', 't4', 'pending', '2026-01-01T09:00:00.000Z', null)

            expect(
                await tests.deleteDiscoveryRowsHidingResults('API', '2026-01-01T10:30:00.000Z')
            ).toBe(0)
            expect((await latest('t4'))?.status).toBe('pending')
        })

        it('is scoped to the given project; without a project every project is covered', async () => {
            await insert('old-5', 't5', 'passed', '2026-01-01T08:00:00.000Z', 'old-run', 'WEB')
            await insert('pend-5', 't5', 'pending', '2026-01-01T11:00:00.000Z', null, 'WEB')

            expect(
                await tests.deleteDiscoveryRowsHidingResults('API', '2026-01-01T10:30:00.000Z')
            ).toBe(0)
            expect(
                await tests.deleteDiscoveryRowsHidingResults(undefined, '2026-01-01T10:30:00.000Z')
            ).toBe(1)
            expect((await latest('t5'))?.status).toBe('passed')
        })

        it('never deletes real results, only run-less pending rows', async () => {
            await insert('old-6', 't6', 'passed', '2026-01-01T08:00:00.000Z', 'old-run')
            await insert('new-6', 't6', 'failed', '2026-01-01T11:00:00.000Z', 'stopped-run')

            expect(
                await tests.deleteDiscoveryRowsHidingResults('API', '2026-01-01T10:30:00.000Z')
            ).toBe(0)
            expect(await tests.getResultIdsByRunIds(['stopped-run'])).toEqual(['new-6'])
        })
    })

    describe('removing the run itself', () => {
        it('getResultIdsByRunIds lists every result of the given runs and nothing else', async () => {
            await insert('a', 't1', 'passed', '2026-01-01T10:00:00.000Z', 'old-run')
            await insert('b', 't2', 'failed', '2026-01-01T11:00:00.000Z', 'stopped-run')
            await insert('c', 't3', 'passed', '2026-01-01T11:00:00.000Z', 'stopped-run')

            expect((await tests.getResultIdsByRunIds(['stopped-run'])).sort()).toEqual(['b', 'c'])
            expect(await tests.getResultIdsByRunIds([])).toEqual([])
        })

        it('deleteByRunIds + deleteTestRuns remove the results, their attachment rows (FK cascade) and the run', async () => {
            const attachments = new AttachmentRepository(dbManager)
            await insert('old-1', 't1', 'passed', '2026-01-01T10:00:00.000Z', 'old-run')
            await insert('new-1', 't1', 'failed', '2026-01-01T11:00:00.000Z', 'stopped-run')
            await attachments.saveAttachment({
                id: 'att-1',
                testResultId: 'new-1',
                type: 'screenshot',
                fileName: 's.png',
                filePath: '/tmp/s.png',
                fileSize: 1,
                mimeType: 'image/png',
                url: '/u',
            })

            expect(await tests.deleteByRunIds(['stopped-run'])).toBe(1)
            expect(await runs.deleteTestRuns(['stopped-run'])).toBe(1)

            expect(await runs.getTestRun('stopped-run')).toBeNull()
            expect(await tests.getTestResult('new-1')).toBeNull()
            expect(await attachments.getAttachmentById('att-1')).toBeNull()
            // the previous run is untouched and shows again
            expect((await latest('t1'))?.id).toBe('old-1')
        })

        it('deleting only the run row also removes its results through the cascade', async () => {
            await insert('new-1', 't1', 'failed', '2026-01-01T11:00:00.000Z', 'stopped-run')

            await runs.deleteTestRuns(['stopped-run'])

            expect(await tests.getTestResult('new-1')).toBeNull()
        })

        it('handles more ids than one SQL statement takes', async () => {
            const ids = Array.from({length: 2000}, (_, i) => `ghost-${i}`)

            expect(await tests.deleteByRunIds(ids)).toBe(0)
            expect(await runs.deleteTestRuns(ids)).toBe(0)
            expect(await tests.getResultIdsByRunIds(ids)).toEqual([])
        })
    })
})
