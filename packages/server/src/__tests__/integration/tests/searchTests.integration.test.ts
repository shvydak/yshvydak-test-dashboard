import {describe, it, expect, beforeAll, afterAll, beforeEach} from 'vitest'
import request from 'supertest'
import type {TestServerInstance} from '../helpers/testServer'
import {setupTestServer, teardownTestServer, cleanDatabase} from '../helpers/testServer'
import {seedTestRuns} from '../helpers/database'

interface Row {
    id: string
    testId: string
    name: string
    filePath?: string
    project?: string | null
    status?: string
    createdAt: string
    tags?: string[]
}

describe('GET /api/tests/search - command palette search (Integration)', () => {
    let server: TestServerInstance

    const insert = async (r: Row) => {
        await server.testRepository.dbManager.execute(
            `INSERT INTO test_results (id, test_id, run_id, name, file_path, status, duration, project, metadata, created_at)
             VALUES (?, ?, 'run-1', ?, ?, ?, 0, ?, ?, ?)`,
            [
                r.id,
                r.testId,
                r.name,
                r.filePath ?? 'tests/a.spec.ts',
                r.status ?? 'passed',
                r.project === undefined ? 'web' : r.project,
                r.tags ? JSON.stringify({tags: r.tags}) : null,
                r.createdAt,
            ]
        )
    }

    const search = (q: string, extra = '') =>
        request(server.app)
            .get(`/api/tests/search?q=${encodeURIComponent(q)}${extra}`)
            .set('Authorization', `Bearer ${server.authToken}`)

    beforeAll(async () => {
        server = await setupTestServer()
    })

    afterAll(async () => {
        await teardownTestServer(server)
    })

    beforeEach(async () => {
        await cleanDatabase(server.testRepository)
        await seedTestRuns(server.testRepository.dbManager, [{id: 'run-1'}])
    })

    it('requires a JWT', async () => {
        const original = process.env.ENABLE_AUTH
        process.env.ENABLE_AUTH = 'true'
        try {
            const res = await request(server.app).get('/api/tests/search?q=order')
            expect(res.status).toBe(401)
        } finally {
            if (original === undefined) delete process.env.ENABLE_AUTH
            else process.env.ENABLE_AUTH = original
        }
    })

    it('is not swallowed by /api/tests/:id', async () => {
        const res = await search('zz')
        expect(res.status).toBe(200)
        expect(res.body.data).toEqual([])
    })

    it('rejects a query shorter than 2 characters', async () => {
        expect((await search('a')).status).toBe(400)
        expect((await search('  ')).status).toBe(400)
        const missing = await request(server.app)
            .get('/api/tests/search')
            .set('Authorization', `Bearer ${server.authToken}`)
        expect(missing.status).toBe(400)
    })

    it('returns the latest row of a test across projects, case-insensitively', async () => {
        await insert({
            id: 'r1',
            testId: 't1',
            name: 'Create Order',
            project: 'web',
            status: 'failed',
            createdAt: '2025-01-01T10:00:00.000Z',
        })
        await insert({
            id: 'r2',
            testId: 't1',
            name: 'Create Order',
            project: 'To_Fix',
            status: 'passed',
            createdAt: '2025-01-02T10:00:00.000Z',
        })
        await insert({
            id: 'r3',
            testId: 't2',
            name: 'Other',
            project: 'api',
            createdAt: '2025-01-03T10:00:00.000Z',
        })

        const res = await search('create ORDER')
        expect(res.body.data).toHaveLength(1)
        expect(res.body.data[0]).toMatchObject({
            testId: 't1',
            name: 'Create Order',
            project: 'To_Fix',
            status: 'passed',
        })
        expect(res.body.data[0].errorMessage).toBeUndefined()
        expect(res.body.data[0].attachments).toBeUndefined()
    })

    it('matches the file path', async () => {
        await insert({
            id: 'r1',
            testId: 't1',
            name: 'Something',
            filePath: 'orders/checkout.spec.ts',
            createdAt: '2025-01-01T10:00:00.000Z',
        })
        const res = await search('checkout.spec')
        expect(res.body.data.map((t: any) => t.testId)).toEqual(['t1'])
    })

    it('treats % _ and \\ as literal characters', async () => {
        await insert({
            id: 'r1',
            testId: 't1',
            name: '100% done',
            createdAt: '2025-01-01T10:00:00.000Z',
        })
        await insert({
            id: 'r2',
            testId: 't2',
            name: 'snake_case name',
            createdAt: '2025-01-01T10:00:01.000Z',
        })
        await insert({
            id: 'r3',
            testId: 't3',
            name: 'snakeXcase name',
            createdAt: '2025-01-01T10:00:02.000Z',
        })
        await insert({
            id: 'r4',
            testId: 't4',
            name: 'path a\\b',
            createdAt: '2025-01-01T10:00:03.000Z',
        })
        await insert({
            id: 'r5',
            testId: 't5',
            name: 'anything else',
            createdAt: '2025-01-01T10:00:04.000Z',
        })

        // More wrong rows than the overfetch margin, all newer than the real match
        for (let i = 0; i < 12; i++) {
            await insert({
                id: `w${i}`,
                testId: `w${i}`,
                name: `snakeXcase filler ${i}`,
                createdAt: `2025-01-02T10:00:${String(i).padStart(2, '0')}.000Z`,
            })
        }

        expect((await search('%')).status).toBe(400)
        expect((await search('0% ')).body.data.map((t: any) => t.testId)).toEqual(['t1'])
        // limit=1: an unescaped `_` lets the newer snakeXcase rows take every slot
        expect((await search('e_c', '&limit=1')).body.data.map((t: any) => t.testId)).toEqual([
            't2',
        ])
        expect((await search('a\\b')).body.data.map((t: any) => t.testId)).toEqual(['t4'])
        expect((await search('%%')).body.data).toEqual([])
    })

    it('matches a ticket tag with or without @ and returns tickets', async () => {
        await insert({
            id: 'r1',
            testId: 't1',
            name: 'Unrelated title',
            tags: ['@ABC-12', '@smoke'],
            createdAt: '2025-01-01T10:00:00.000Z',
        })
        await insert({
            id: 'r2',
            testId: 't2',
            name: 'Another',
            tags: ['@XYZ-9'],
            createdAt: '2025-01-01T10:00:01.000Z',
        })

        for (const q of ['ABC-12', '@abc-12', 'abc-1']) {
            const res = await search(q)
            expect(res.body.data.map((t: any) => t.testId)).toEqual(['t1'])
            expect(res.body.data[0].tickets).toEqual(['ABC-12'])
        }
    })

    it('matches a ticket by number only, right after the dash', async () => {
        await insert({
            id: 'r1',
            testId: 't1',
            name: 'First',
            tags: ['@ABC-1922'],
            createdAt: '2025-01-01T10:00:00.000Z',
        })
        await insert({
            id: 'r2',
            testId: 't2',
            name: 'Second',
            tags: ['@XYZ-1922'],
            createdAt: '2025-01-01T10:00:01.000Z',
        })
        await insert({
            id: 'r3',
            testId: 't3',
            name: 'Order 1922 in the title',
            createdAt: '2025-01-01T10:00:02.000Z',
        })
        await insert({
            id: 'r4',
            testId: 't4',
            name: 'Other',
            tags: ['@ABC-77'],
            createdAt: '2025-01-01T10:00:03.000Z',
        })

        const ids = async (q: string) =>
            (await search(q)).body.data.map((t: any) => t.testId).sort()
        expect(await ids('1922')).toEqual(['t1', 't2', 't3'])
        expect(await ids('192')).toEqual(['t1', 't2', 't3'])
        expect(await ids('922')).toEqual(['t3'])
        expect(
            (await search('1922')).body.data.find((t: any) => t.testId === 't1').tickets
        ).toEqual(['ABC-1922'])
    })

    it('number-only match also reads catalog tags and still fills the page', async () => {
        await insert({
            id: 'r1',
            testId: 'stale',
            name: 'Stale',
            tags: ['@OLD-1922'],
            createdAt: '2025-01-02T00:00:00.000Z',
        })
        await server.testRepository.dbManager.execute(
            `INSERT INTO test_catalog (project, test_id, name, file_path, metadata, discovered_at)
             VALUES ('web', 'stale', 'Stale', 'tests/a.spec.ts', ?, '2025-02-01T00:00:00.000Z')`,
            [JSON.stringify({tags: ['@NEW-5']})]
        )
        await insert({
            id: 'r2',
            testId: 'real',
            name: 'Real',
            tags: ['@OLD-1922'],
            createdAt: '2025-01-01T00:00:00.000Z',
        })
        await insert({
            id: 'r3',
            testId: 'cat',
            name: 'Catalog tagged',
            createdAt: '2024-12-01T00:00:00.000Z',
        })
        await server.testRepository.dbManager.execute(
            `INSERT INTO test_catalog (project, test_id, name, file_path, metadata, discovered_at)
             VALUES ('web', 'cat', 'Catalog tagged', 'tests/a.spec.ts', ?, '2025-02-01T00:00:00.000Z')`,
            [JSON.stringify({tags: ['@NEW-1922']})]
        )
        expect((await search('1922', '&limit=1')).body.data.map((t: any) => t.testId)).toEqual([
            'real',
        ])
        expect((await search('1922')).body.data.map((t: any) => t.testId).sort()).toEqual([
            'cat',
            'real',
        ])
    })

    it('number match: SQL keeps the dash anchor, so the page is not short', async () => {
        await insert({
            id: 'r0',
            testId: 'real',
            name: 'Real',
            tags: ['@ABC-922'],
            createdAt: '2025-01-01T00:00:00.000Z',
        })
        for (let i = 0; i < 12; i++) {
            await insert({
                id: `w${i}`,
                testId: `w${i}`,
                name: `Filler ${i}`,
                tags: ['@ABC-1922'],
                createdAt: `2025-01-02T10:00:${String(i).padStart(2, '0')}.000Z`,
            })
        }
        expect((await search('922', '&limit=1')).body.data.map((t: any) => t.testId)).toEqual([
            'real',
        ])
    })

    it('number match: JS keeps the dash anchor on overlaid tags', async () => {
        await insert({
            id: 'r1',
            testId: 'stale',
            name: 'Stale',
            tags: ['@OLD-1922'],
            createdAt: '2025-01-02T00:00:00.000Z',
        })
        await server.testRepository.dbManager.execute(
            `INSERT INTO test_catalog (project, test_id, name, file_path, metadata, discovered_at)
             VALUES ('web', 'stale', 'Stale', 'tests/a.spec.ts', ?, '2025-02-01T00:00:00.000Z')`,
            [JSON.stringify({tags: ['@NEW-11922']})]
        )
        expect((await search('1922')).body.data).toEqual([])
    })

    it('a non-digit query does not match after the dash', async () => {
        await insert({
            id: 'r1',
            testId: 't1',
            name: 'Plain',
            tags: ['@regression-smoke', '@ABC-12x'],
            createdAt: '2025-01-01T00:00:00.000Z',
        })
        expect((await search('smoke')).body.data).toEqual([])
        expect((await search('12x')).body.data).toEqual([])
    })

    it('uses fresher catalog tags and drops a stale-tag candidate', async () => {
        await insert({
            id: 'r1',
            testId: 't1',
            name: 'Tagged in catalog',
            tags: ['@OLD-1'],
            createdAt: '2025-01-01T10:00:00.000Z',
        })
        await server.testRepository.dbManager.execute(
            `INSERT INTO test_catalog (project, test_id, name, file_path, metadata, discovered_at)
             VALUES ('web', 't1', 'Tagged in catalog', 'tests/a.spec.ts', ?, '2025-02-01T00:00:00.000Z')`,
            [JSON.stringify({tags: ['@NEW-2']})]
        )

        expect((await search('NEW-2')).body.data[0].tickets).toEqual(['NEW-2'])
        expect((await search('OLD-1')).body.data).toEqual([])
    })

    it('fills the page even when stale-tag candidates are dropped', async () => {
        await insert({
            id: 'r1',
            testId: 'stale',
            name: 'Stale',
            tags: ['@OLD-1'],
            createdAt: '2025-01-02T00:00:00.000Z',
        })
        await server.testRepository.dbManager.execute(
            `INSERT INTO test_catalog (project, test_id, name, file_path, metadata, discovered_at)
             VALUES ('web', 'stale', 'Stale', 'tests/a.spec.ts', ?, '2025-02-01T00:00:00.000Z')`,
            [JSON.stringify({tags: ['@NEW-2']})]
        )
        await insert({
            id: 'r2',
            testId: 'real',
            name: 'Real',
            tags: ['@OLD-1'],
            createdAt: '2025-01-01T00:00:00.000Z',
        })
        const res = await search('OLD-1', '&limit=1')
        expect(res.body.data.map((t: any) => t.testId)).toEqual(['real'])
    })

    it('ranks title prefix, then title contains, then path/tag; ties newest first', async () => {
        await insert({
            id: 'r1',
            testId: 'path',
            name: 'Nothing',
            filePath: 'orders/x.spec.ts',
            createdAt: '2025-01-09T00:00:00.000Z',
        })
        await insert({
            id: 'r2',
            testId: 'contains-old',
            name: 'A new orders flow',
            createdAt: '2025-01-01T00:00:00.000Z',
        })
        await insert({
            id: 'r3',
            testId: 'contains-new',
            name: 'B new orders flow',
            createdAt: '2025-01-05T00:00:00.000Z',
        })
        await insert({
            id: 'r4',
            testId: 'prefix',
            name: 'Orders list',
            createdAt: '2025-01-02T00:00:00.000Z',
        })

        const res = await search('orders')
        expect(res.body.data.map((t: any) => t.testId)).toEqual([
            'prefix',
            'contains-new',
            'contains-old',
            'path',
        ])
    })

    it('defaults to 20, caps at 50 and floors at 1', async () => {
        for (let i = 0; i < 60; i++) {
            await insert({
                id: `r${i}`,
                testId: `t${i}`,
                name: `Bulk test ${i}`,
                createdAt: `2025-01-01T10:00:${String(i).padStart(2, '0')}.000Z`,
            })
        }
        expect((await search('bulk')).body.data).toHaveLength(20)
        expect((await search('bulk', '&limit=500')).body.data).toHaveLength(50)
        expect((await search('bulk', '&limit=5')).body.data).toHaveLength(5)
        expect((await search('bulk', '&limit=0')).body.data).toHaveLength(1)
        expect((await search('bulk', '&limit=abc')).body.data).toHaveLength(20)
    })

    it('hides empty-project latest rows only when a named project exists', async () => {
        await insert({
            id: 'r1',
            testId: 't1',
            name: 'Legacy checkout',
            project: '',
            createdAt: '2025-01-01T00:00:00.000Z',
        })
        await insert({
            id: 'r2',
            testId: 't2',
            name: 'Null checkout',
            project: null,
            createdAt: '2025-01-01T00:00:01.000Z',
        })

        // No named project anywhere: nothing is hidden
        expect((await search('checkout')).body.data).toHaveLength(2)

        await insert({
            id: 'r3',
            testId: 't3',
            name: 'Named checkout',
            project: 'web',
            createdAt: '2025-01-01T00:00:02.000Z',
        })
        expect((await search('checkout')).body.data.map((t: any) => t.testId)).toEqual(['t3'])
    })

    it('flags notInCode like the list', async () => {
        await insert({
            id: 'r1',
            testId: 't1',
            name: 'Removed test',
            createdAt: '2025-01-01T00:00:00.000Z',
        })
        await server.testRepository.dbManager.execute(
            `INSERT INTO test_catalog (project, test_id, name, file_path, metadata, discovered_at)
             VALUES ('web', 'other', 'Other', 'x.spec.ts', NULL, '2025-03-01T00:00:00.000Z')`
        )
        await server.testRepository.dbManager.execute(
            `INSERT INTO app_settings (key, value) VALUES ('catalog_last_full_scan', '2025-03-01T00:00:00.000Z')`
        )
        const res = await search('removed')
        expect(res.body.data[0].notInCode).toBe(true)
    })
})
