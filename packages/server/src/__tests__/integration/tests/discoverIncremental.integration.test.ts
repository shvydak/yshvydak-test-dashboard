import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import request from 'supertest'
import type {TestServerInstance} from '../helpers/testServer'
import {setupTestServer, teardownTestServer, cleanDatabase} from '../helpers/testServer'

interface Spec {
    title: string
    projects: string[]
    tags?: string[]
    file?: string
}

const listOutput = (specs: Spec[]) => ({
    suites: [
        {
            title: 'e2e/a.spec.ts',
            file: 'e2e/a.spec.ts',
            specs: specs.map((s, i) => ({
                title: s.title,
                ok: true,
                tags: s.tags ?? [],
                tests: s.projects.map((p) => ({projectId: p, projectName: p, results: []})),
                id: `pw-${i}`,
                file: s.file ?? 'e2e/a.spec.ts',
                line: i + 1,
                column: 1,
            })),
            suites: [],
        },
    ],
})

const HOUR = 3_600_000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

describe('POST /api/tests/discovery - incremental mode + test catalog (Integration)', () => {
    let server: TestServerInstance
    let listSpy: ReturnType<typeof vi.spyOn>

    const tid = (title: string, file = 'e2e/a.spec.ts') =>
        (server.serviceContainer.playwrightService as any).generateStableTestId(file, title)

    // Like `playwright test --list --project=X`: only that project's specs come back (all when unscoped)
    const mockList = (specs: Spec[]) =>
        listSpy.mockImplementation(async (...args: unknown[]) => {
            const project = args[0] as string | undefined
            return listOutput(
                specs
                    .filter((s) => !project || s.projects.includes(project))
                    .map((s) => ({...s, projects: project ? [project] : s.projects}))
            ) as any
        })

    const discover = (body: Record<string, unknown> = {}) =>
        request(server.app).post('/api/tests/discovery').send(body)

    const seed = async (
        title: string,
        project: string,
        status: string,
        createdAt: string,
        metadata?: unknown
    ) => {
        await server.testRepository.saveTestResult({
            id: `seed-${title}-${project}-${createdAt}`,
            testId: tid(title),
            runId: null,
            name: title,
            filePath: 'e2e/a.spec.ts',
            status,
            duration: 5,
            project,
            metadata,
            timestamp: createdAt,
        } as any)
    }

    const list = async (project?: string) => {
        const res = await request(server.app)
            .get('/api/tests')
            .query(project ? {project, limit: 5000} : {limit: 5000})
            .set('Authorization', `Bearer ${server.authToken}`)
            .expect(200)
        return res.body.data as any[]
    }
    const byName = (rows: any[], title: string) => rows.find((r) => r.name === title)

    // No table reads as an empty catalog, so the assertions (not an SQL error) decide the test
    const catalogRows = () =>
        server.testRepository.dbManager
            .queryAll('SELECT * FROM test_catalog ORDER BY project, name')
            .catch(() => []) as Promise<any[]>

    beforeAll(async () => {
        server = await setupTestServer()
    })
    afterAll(async () => {
        await teardownTestServer(server)
    })
    beforeEach(async () => {
        await cleanDatabase(server.testRepository)
        vi.restoreAllMocks()
        listSpy = vi.spyOn(
            server.serviceContainer.playwrightService as any,
            'executePlaywrightListCommand'
        )
    })

    it('keeps statuses and adds a pending row only for the new test', async () => {
        await seed('a', 'P', 'failed', ago(2 * HOUR))
        await seed('b', 'P', 'passed', ago(2 * HOUR))
        mockList([
            {title: 'a', projects: ['P']},
            {title: 'b', projects: ['P']},
            {title: 'c', projects: ['P']},
        ])

        const res = await discover({project: 'P', mode: 'incremental'}).expect(200)
        expect(res.body.data).toMatchObject({discovered: 3, saved: 1, mode: 'incremental'})

        const rows = await list('P')
        expect(byName(rows, 'a').status).toBe('failed')
        expect(byName(rows, 'b').status).toBe('passed')
        expect(byName(rows, 'c').status).toBe('pending')

        // A repeat adds no second pending row for c
        const again = await discover({project: 'P', mode: 'incremental'}).expect(200)
        expect(again.body.data.saved).toBe(0)
        const pending = (await server.testRepository.dbManager.queryAll(
            `SELECT id FROM test_results WHERE test_id = ? AND status = 'pending'`,
            [tid('c')]
        )) as any[]
        expect(pending).toHaveLength(1)
    })

    it('shows a tag added in code right after Discover, status kept', async () => {
        await seed('a', 'P', 'passed', ago(2 * HOUR), {line: 1, tags: ['@PB-1'], playwrightId: 'x'})
        mockList([{title: 'a', projects: ['P'], tags: ['PB-1', 'PB-2']}])

        await discover({project: 'P', mode: 'incremental'}).expect(200)

        const a = byName(await list('P'), 'a')
        expect(a.status).toBe('passed')
        expect(a.metadata.tags).toEqual(['@PB-1', '@PB-2'])
    })

    it('a newer run beats an older catalog', async () => {
        mockList([{title: 'a', projects: ['P'], tags: ['PB-1']}])
        await discover({project: 'P', mode: 'incremental'}).expect(200)
        // run after the scan reports its own tags
        await seed('a', 'P', 'passed', new Date(Date.now() + 1000).toISOString(), {
            line: 1,
            tags: ['@PB-3'],
            playwrightId: 'x',
        })

        expect(byName(await list('P'), 'a').metadata.tags).toEqual(['@PB-3'])
    })

    it('flags only the test the latest scan no longer lists', async () => {
        await seed('a', 'P', 'passed', ago(2 * HOUR))
        await seed('b', 'P', 'passed', ago(2 * HOUR))
        mockList([{title: 'a', projects: ['P']}])

        await discover({project: 'P', mode: 'incremental'}).expect(200)

        const rows = await list('P')
        expect(byName(rows, 'b').notInCode).toBe(true)
        expect(byName(rows, 'b').status).toBe('passed')
        expect(byName(rows, 'a').notInCode).toBeUndefined()
    })

    it('does not flag a test first run after the scan (run-group style, no discovery)', async () => {
        mockList([{title: 'a', projects: ['P']}])
        await discover({project: 'P', mode: 'incremental'}).expect(200)
        await seed('d', 'P', 'passed', new Date(Date.now() + 1000).toISOString())

        expect(byName(await list('P'), 'd').notInCode).toBeUndefined()
    })

    it('moves a test to its new project on @to-fix add/remove and does not flag it anywhere', async () => {
        await seed('x', 'To_Fix', 'failed', ago(2 * HOUR))
        mockList([{title: 'x', projects: ['UI_Tests']}])

        await discover({project: 'UI_Tests', mode: 'incremental'}).expect(200)

        const ui = byName(await list('UI_Tests'), 'x')
        expect(ui.status).toBe('pending')
        expect(ui.notInCode).toBeUndefined()

        // To_Fix scanned without x: x's latest row is the UI_Tests one, so it is not an orphan
        mockList([{title: 'other', projects: ['To_Fix']}])
        await discover({project: 'To_Fix', mode: 'incremental'}).expect(200)
        for (const rows of [await list('UI_Tests'), await list('To_Fix'), await list()]) {
            expect(rows.filter((r) => r.name === 'x').every((r) => !r.notInCode)).toBe(true)
        }
    })

    it('a test listed only in another project catalog is not flagged in its old project (condition c)', async () => {
        // e.g. a Stop removed the move-pending row: x's latest row is back in To_Fix, the new project lists it
        await seed('x', 'To_Fix', 'failed', ago(2 * HOUR))
        await server.testRepository.dbManager.execute(
            `INSERT INTO test_catalog (project, test_id, name, file_path, metadata, discovered_at)
             VALUES ('UI_Tests', ?, 'x', 'e2e/a.spec.ts', NULL, ?)`,
            [tid('x'), ago(HOUR)]
        )
        await server.testRepository.dbManager.execute(
            `INSERT INTO app_settings (key, value) VALUES ('catalog_last_full_scan', ?)`,
            [ago(HOUR / 2)]
        )
        mockList([{title: 'other', projects: ['To_Fix']}])

        await discover({project: 'To_Fix'}).expect(200)

        expect(byName(await list('To_Fix'), 'x').notInCode).toBeUndefined()
    })

    it('a project given with incremental is ignored: every project is scanned and a new test in another project is pending', async () => {
        await seed('a', 'UI_Tests', 'passed', ago(2 * HOUR))
        await seed('b', 'API_Tests', 'passed', ago(2 * HOUR))
        mockList([
            {title: 'a', projects: ['UI_Tests']},
            {title: 'b', projects: ['API_Tests']},
            {title: 'new-api', projects: ['API_Tests']},
        ])

        const res = await discover({project: 'UI_Tests', mode: 'incremental'}).expect(200)

        expect(listSpy).toHaveBeenCalledWith(undefined)
        expect(res.body.data.saved).toBe(1)
        expect(byName(await list('API_Tests'), 'new-api').status).toBe('pending')
        expect(byName(await list('API_Tests'), 'b').status).toBe('passed')
        expect(byName(await list('UI_Tests'), 'a').status).toBe('passed')
    })

    it('@to-fix added in code: Discover from the UI_Tests tab shows x pending in To_Fix and flags nothing', async () => {
        await seed('x', 'UI_Tests', 'passed', ago(2 * HOUR))
        mockList([
            {title: 'x', projects: ['To_Fix']},
            {title: 'other', projects: ['UI_Tests']},
        ])

        await discover({project: 'UI_Tests', mode: 'incremental'}).expect(200)

        const toFix = byName(await list('To_Fix'), 'x')
        expect(toFix.status).toBe('pending')
        expect(toFix.notInCode).toBeUndefined()
        expect(byName(await list('UI_Tests'), 'x')).toBeUndefined()
    })

    it('tab Run All (scoped reset) after @to-fix moved a test does not flag it as not in code', async () => {
        await seed('x', 'UI_Tests', 'passed', ago(2 * HOUR))
        // x was in the UI_Tests catalog before the tag was added
        mockList([{title: 'x', projects: ['UI_Tests']}])
        await discover({mode: 'incremental'}).expect(200)
        await seed('x', 'UI_Tests', 'passed', ago(HOUR))

        // code now: x carries @to-fix (To_Fix project); the client presses Run All on the UI_Tests tab
        mockList([
            {title: 'x', projects: ['To_Fix']},
            {title: 'other', projects: ['UI_Tests']},
        ])
        await discover({project: 'UI_Tests'}).expect(200)

        const x = byName(await list('UI_Tests'), 'x')
        expect(x.status).toBe('passed') // as on main: a scoped reset does not see the move
        expect(x.notInCode).toBeUndefined()
    })

    it('tab Run All on an empty catalog (first start after deploy) flags nothing, even for a moved test', async () => {
        await seed('x', 'UI_Tests', 'passed', ago(2 * HOUR))
        mockList([
            {title: 'x', projects: ['To_Fix']},
            {title: 'other', projects: ['UI_Tests']},
        ])

        await discover({project: 'UI_Tests'}).expect(200)

        expect(byName(await list('UI_Tests'), 'x').notInCode).toBeUndefined()
    })

    it('a test first run after the last full scan, then moved, is not flagged by a tab Run All', async () => {
        mockList([{title: 'a', projects: ['UI_Tests']}])
        await discover({mode: 'incremental'}).expect(200)
        await new Promise((r) => setTimeout(r, 5))
        await seed('y', 'UI_Tests', 'passed', new Date().toISOString()) // run outside any discovery
        await new Promise((r) => setTimeout(r, 5))

        mockList([
            {title: 'a', projects: ['UI_Tests']},
            {title: 'y', projects: ['To_Fix']},
        ])
        await discover({project: 'UI_Tests'}).expect(200)

        expect(byName(await list('UI_Tests'), 'y').notInCode).toBeUndefined()
    })

    it('reset with a project stays scoped to that project', async () => {
        mockList([{title: 'a', projects: ['P']}])

        await discover({project: 'P', mode: 'reset'}).expect(200)

        expect(listSpy).toHaveBeenCalledWith('P')
    })

    it('a shared spec whose latest row is in one of its projects keeps its status', async () => {
        await seed('s', 'Q', 'passed', ago(2 * HOUR))
        mockList([{title: 's', projects: ['P', 'Q']}])

        const res = await discover({mode: 'incremental'}).expect(200)
        expect(res.body.data.saved).toBe(0)
        expect(byName(await list('Q'), 's').status).toBe('passed')
    })

    it('overlays the catalog on a double-encoded latest row as an object', async () => {
        await seed(
            'a',
            'P',
            'passed',
            ago(2 * HOUR),
            // a JSON string inside the JSON column: stored double-encoded
            JSON.stringify({line: 1, tags: ['@old'], playwrightId: 'x', duration: 9})
        )
        mockList([{title: 'a', projects: ['P'], tags: ['PB-9']}])

        await discover({project: 'P', mode: 'incremental'}).expect(200)

        const a = byName(await list('P'), 'a')
        expect(typeof a.metadata).toBe('object')
        expect(a.metadata.tags).toEqual(['@PB-9'])
        expect(a.metadata.duration).toBe(9)
    })

    it('a failed or empty --list marks nothing and changes nothing', async () => {
        await seed('a', 'P', 'passed', ago(2 * HOUR))
        await seed('b', 'P', 'passed', ago(2 * HOUR))
        mockList([
            {title: 'a', projects: ['P']},
            {title: 'b', projects: ['P']},
        ])
        await discover({project: 'P', mode: 'incremental'}).expect(200)
        const catalogBefore = await catalogRows()
        const pendingBefore = await server.testRepository.dbManager.queryAll(
            `SELECT id FROM test_results WHERE status = 'pending'`
        )

        for (const mode of ['incremental', 'reset']) {
            listSpy.mockRejectedValue(new Error('Playwright command failed with code 1: boom'))
            await discover({project: 'P', mode}).expect(500)
            expect(await catalogRows()).toEqual(catalogBefore)
            expect(
                await server.testRepository.dbManager.queryAll(
                    `SELECT id FROM test_results WHERE status = 'pending'`
                )
            ).toEqual(pendingBefore)
        }

        // 0 specs: deletes nothing in the catalog, flags nothing
        listSpy.mockResolvedValue({suites: []} as any)
        await discover({project: 'P', mode: 'incremental'}).expect(200)
        expect(await catalogRows()).toEqual(catalogBefore)
        expect((await list('P')).some((r) => r.notInCode)).toBe(false)
    })

    it('reset scoped to a project never prunes the catalog; dependency specs are upserted', async () => {
        await seed('q-only', 'Q', 'passed', ago(2 * HOUR))
        mockList([{title: 'q-only', projects: ['Q']}])
        await discover({mode: 'incremental'}).expect(200)

        // An older catalog row of the dependency project: a P scan must not stale-delete it
        await server.testRepository.dbManager.execute(
            `INSERT INTO test_catalog (project, test_id, name, file_path, metadata, discovered_at)
             VALUES ('setup', 'setup-old', 'setup-old', 'e2e/s.spec.ts', NULL, ?)`,
            [ago(HOUR)]
        )

        // P scan: returns a P spec plus a dependency project's spec (as Playwright does)
        listSpy.mockResolvedValue(
            listOutput([
                {title: 'p1', projects: ['P']},
                {title: 'setup', projects: ['setup']},
            ]) as any
        )
        await discover({project: 'P'}).expect(200)

        const projects = (await catalogRows()).map((r) => `${r.project}:${r.name}`)
        expect(projects).toEqual(['P:p1', 'Q:q-only', 'setup:setup', 'setup:setup-old'])
        // Q's test is never flagged by P's scan
        expect(byName(await list('Q'), 'q-only').notInCode).toBeUndefined()

        // A scoped scan prunes nothing, even a P test that left the code
        listSpy.mockResolvedValue(listOutput([{title: 'p2', projects: ['P']}]) as any)
        await discover({project: 'P'}).expect(200)
        expect((await catalogRows()).map((r) => `${r.project}:${r.name}`)).toEqual([
            'P:p1',
            'P:p2',
            'Q:q-only',
            'setup:setup',
            'setup:setup-old',
        ])
        // ...and the full scan afterwards drops p1 (projects it did not list are left alone)
        mockList([{title: 'p2', projects: ['P']}])
        await discover({mode: 'incremental'}).expect(200)
        expect((await catalogRows()).map((r) => `${r.project}:${r.name}`)).toEqual([
            'P:p2',
            'Q:q-only',
            'setup:setup',
            'setup:setup-old',
        ])
    })

    it("reset (default) keeps today's behaviour and still fills the catalog", async () => {
        await seed('a', 'P', 'failed', ago(2 * HOUR))
        mockList([
            {title: 'a', projects: ['P']},
            {title: 'b', projects: ['P']},
            {title: 'c', projects: ['P']},
        ])

        const res = await discover({project: 'P'}).expect(200)
        expect(res.body.data).toMatchObject({discovered: 3, saved: 3, mode: 'reset'})
        expect(byName(await list('P'), 'a').status).toBe('pending')
        expect(await catalogRows()).toHaveLength(3)
    })

    it('only a reset Discover counts as "the run\'s own discovery" (recent-discovery window)', async () => {
        const recent = () =>
            (server.serviceContainer.testService as any).recentDiscoveryStart('Recent_P')
        mockList([{title: 'a', projects: ['Recent_P']}])

        await discover({project: 'Recent_P', mode: 'incremental'}).expect(200)
        expect(recent()).toBeUndefined()

        await discover({project: 'Recent_P'}).expect(200)
        expect(recent()).toEqual(expect.any(String))
    })

    it('rejects an unknown mode with 400', async () => {
        mockList([])
        await discover({mode: 'wipe'}).expect(400)
        expect(listSpy).not.toHaveBeenCalled()
    })

    describe('Jira sync', () => {
        const spyJira = () => {
            const jira = server.serviceContainer.jiraService
            vi.spyOn(jira, 'isEnabled').mockReturnValue(true)
            const refresh = vi
                .spyOn(jira, 'refreshAllKnownKeys')
                .mockResolvedValue({checked: 0, updated: 0, failed: 0})
            const synced = vi.fn()
            ;(server.serviceContainer.websocketService as any).broadcastJiraSynced = synced
            return {refresh, synced}
        }

        it('runs after an incremental Discover and broadcasts jira:synced', async () => {
            const {refresh, synced} = spyJira()
            mockList([{title: 'a', projects: ['P']}])

            await discover({project: 'P', mode: 'incremental'}).expect(200)
            await vi.waitFor(() => expect(synced).toHaveBeenCalledTimes(1))
            expect(refresh).toHaveBeenCalledTimes(1)
        })

        it('makes no Jira call on a reset Discover', async () => {
            const {refresh, synced} = spyJira()
            mockList([{title: 'a', projects: ['P']}])

            await discover({project: 'P'}).expect(200)
            await discover({project: 'P', mode: 'reset'}).expect(200)
            expect(refresh).not.toHaveBeenCalled()
            expect(synced).not.toHaveBeenCalled()
        })
    })

    describe('cleanup', () => {
        it('DELETE /api/tests/:testId removes its catalog rows and its Jira key source', async () => {
            mockList([{title: 'a', projects: ['P'], tags: ['PB-77']}])
            await discover({project: 'P', mode: 'incremental'}).expect(200)
            const id = tid('a')
            expect(await catalogRows()).toHaveLength(1)
            expect(JSON.stringify(await server.testRepository.getAllLatestMetadata())).toContain(
                '@PB-77'
            )

            await request(server.app)
                .delete(`/api/tests/${id}`)
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)

            expect(await catalogRows()).toHaveLength(0)
            expect(
                JSON.stringify(await server.testRepository.getAllLatestMetadata())
            ).not.toContain('@PB-77')
        })

        it('DELETE /api/tests/all empties the catalog', async () => {
            mockList([{title: 'a', projects: ['P']}])
            await discover({project: 'P', mode: 'incremental'}).expect(200)
            expect(await catalogRows()).toHaveLength(1)

            await request(server.app)
                .delete('/api/tests/all')
                .set('Authorization', `Bearer ${server.authToken}`)
                .expect(200)

            expect(await catalogRows()).toHaveLength(0)
        })
    })
})
