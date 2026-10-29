import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {DatabaseManager} from '../../database/database.manager'
import {TestCatalogRepository, CatalogEntry} from '../testCatalog.repository'

describe('TestCatalogRepository', () => {
    let db: DatabaseManager
    let repo: TestCatalogRepository

    const entry = (testId: string, project = 'P', discoveredAt = '2026-10-26T10:00:00.000Z') =>
        ({
            project,
            testId,
            name: testId,
            filePath: 'a.spec.ts',
            metadata: {tags: ['@x']},
            discoveredAt,
        }) as CatalogEntry
    const all = () => db.queryAll<any>('SELECT * FROM test_catalog ORDER BY project, test_id')

    beforeEach(async () => {
        db = new DatabaseManager(':memory:')
        await db.initialize()
        repo = new TestCatalogRepository(db)
    })
    afterEach(async () => {
        await db.close()
    })

    it('upserts more rows than one statement holds (batches of 150) and is idempotent', async () => {
        const entries = Array.from({length: 400}, (_, i) => entry(`t-${i}`))
        await repo.upsertMany(entries)
        await repo.upsertMany(entries)
        expect(await all()).toHaveLength(400)
    })

    it('an upsert refreshes name, metadata and discovered_at of an existing (project, test)', async () => {
        await repo.upsertMany([entry('t-1')])
        await repo.upsertMany([
            {...entry('t-1', 'P', '2026-10-26T11:00:00.000Z'), name: 'renamed', metadata: null},
        ])
        const [row] = await all()
        expect(row).toMatchObject({
            name: 'renamed',
            metadata: null,
            discovered_at: '2026-10-26T11:00:00.000Z',
        })
    })

    it('keeps one row per project for the same test', async () => {
        await repo.upsertMany([entry('t-1', 'P'), entry('t-1', 'Q')])
        expect((await all()).map((r) => r.project)).toEqual(['P', 'Q'])
    })

    it('deleteStale removes only older rows of the given project', async () => {
        await repo.upsertMany([
            entry('old', 'P', '2026-10-26T09:00:00.000Z'),
            entry('new', 'P', '2026-10-26T11:00:00.000Z'),
            entry('other', 'Q', '2026-10-26T09:00:00.000Z'),
        ])
        expect(await repo.deleteStale('P', '2026-10-26T11:00:00.000Z')).toBe(1)
        expect((await all()).map((r) => r.test_id)).toEqual(['new', 'other'])
    })

    it('deleteByTestId (all projects) and deleteByProject', async () => {
        await repo.upsertMany([entry('t-1', 'P'), entry('t-1', 'Q'), entry('t-2', 'P')])
        expect(await repo.deleteByTestId('t-1')).toBe(2)
        expect(await repo.deleteByProject('P')).toBe(1)
        expect(await all()).toHaveLength(0)
    })
})
