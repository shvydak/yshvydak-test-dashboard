import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {DatabaseManager} from '../../database/database.manager'
import {TestRepository} from '../test.repository'
import {TestCatalogRepository} from '../testCatalog.repository'

describe('TestRepository - catalog reads and Discover helpers', () => {
    let db: DatabaseManager
    let repo: TestRepository
    let catalog: TestCatalogRepository
    let n = 0

    const save = (
        testId: string,
        project: string,
        status: string,
        createdAt: string,
        extra: {runId?: string | null; metadata?: unknown} = {}
    ) =>
        repo.saveTestResult({
            id: `r-${++n}`,
            runId: extra.runId ?? null,
            testId,
            name: testId,
            filePath: 'a.spec.ts',
            status,
            duration: 1,
            project,
            metadata: extra.metadata,
            timestamp: createdAt,
        } as any)

    beforeEach(async () => {
        n = 0
        db = new DatabaseManager(':memory:')
        await db.initialize()
        repo = new TestRepository(db)
        catalog = new TestCatalogRepository(db)
    })
    afterEach(async () => {
        await db.close()
    })

    it("getLatestProjects returns the project of each test's latest row, and skips unknown ids", async () => {
        await save('t-1', 'To_Fix', 'failed', '2026-10-26T09:00:00.000Z')
        await save('t-1', 'UI', 'passed', '2026-10-26T10:00:00.000Z')
        await save('t-2', 'API', 'passed', '2026-10-26T10:00:00.000Z')

        const map = await repo.getLatestProjects(['t-1', 't-2', 't-none'])
        expect([...map.entries()].sort()).toEqual([
            ['t-1', 'UI'],
            ['t-2', 'API'],
        ])
    })

    it('getLatestProjects handles more ids than one statement holds', async () => {
        const ids = Array.from({length: 1000}, (_, i) => `bulk-${i}`)
        await save('bulk-0', 'P', 'passed', '2026-10-26T10:00:00.000Z')
        await save('bulk-999', 'Q', 'passed', '2026-10-26T10:00:00.000Z')
        const map = await repo.getLatestProjects(ids)
        expect(map.get('bulk-0')).toBe('P')
        expect(map.get('bulk-999')).toBe('Q')
    })

    it('deletePendingRows is scoped to the project when given', async () => {
        await save('t-1', 'P', 'pending', '2026-10-26T10:00:00.000Z')
        await save('t-2', 'Q', 'pending', '2026-10-26T10:00:00.000Z')
        await save('t-3', 'P', 'passed', '2026-10-26T10:00:00.000Z')

        expect(await repo.deletePendingRows('P')).toBe(1)
        expect(await repo.deletePendingRows()).toBe(1)
        expect((await repo.getAllTests({})).map((t) => t.testId)).toEqual(['t-3'])
    })

    it('the latest-row list carries the overlay and notInCode; a runId list does not', async () => {
        await db.createTestRun({
            id: 'run-1',
            status: 'completed',
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            skippedTests: 0,
            duration: 0,
        })
        await save('t-1', 'P', 'passed', '2026-10-26T09:00:00.000Z', {
            runId: 'run-1',
            metadata: {line: 1, tags: ['@old']},
        })
        await save('t-gone', 'P', 'passed', '2026-10-26T09:00:00.000Z', {runId: 'run-1'})
        await catalog.upsertMany([
            {
                project: 'P',
                testId: 't-1',
                name: 't-1',
                filePath: 'a.spec.ts',
                metadata: {line: 2, tags: ['@new']},
                discoveredAt: '2026-10-26T10:00:00.000Z',
            },
        ])

        // No all-projects scan recorded yet: nothing is flagged, the overlay still applies
        let latest = await repo.getAllTests({project: 'P'})
        expect(latest.find((t) => t.testId === 't-1')?.metadata).toMatchObject({tags: ['@new']})
        expect(latest.find((t) => t.testId === 't-gone')?.notInCode).toBeUndefined()

        await catalog.markFullScan('2026-10-26T10:00:00.000Z')
        latest = await repo.getAllTests({project: 'P'})
        expect(latest.find((t) => t.testId === 't-gone')?.notInCode).toBe(true)

        const run = await repo.getAllTests({runId: 'run-1'})
        expect(run.find((t) => t.testId === 't-1')?.metadata).toMatchObject({tags: ['@old']})
        expect(run.every((t) => t.notInCode === undefined)).toBe(true)
    })

    it('getAllLatestMetadata also returns catalog metadata', async () => {
        await save('t-1', 'P', 'passed', '2026-10-26T09:00:00.000Z', {metadata: {tags: ['@PB-1']}})
        await catalog.upsertMany([
            {
                project: 'P',
                testId: 't-2',
                name: 't-2',
                filePath: 'a.spec.ts',
                metadata: {tags: ['@PB-2']},
                discoveredAt: '2026-10-26T10:00:00.000Z',
            },
        ])
        const text = JSON.stringify(await repo.getAllLatestMetadata())
        expect(text).toContain('@PB-1')
        expect(text).toContain('@PB-2')
    })
})
