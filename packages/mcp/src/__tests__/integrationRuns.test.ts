import {EventEmitter} from 'node:events'
import type {Server} from 'node:http'
import type {AddressInfo} from 'node:net'
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest'
import {Session} from '../auth'
import {DashboardClient} from '../client'
import {createHttp} from '../http'
import {createTools} from '../tools'
import {seedTestRuns} from '../../../server/src/__tests__/integration/helpers/database'
import {
    setupTestServer,
    teardownTestServer,
    type TestServerInstance,
} from '../../../server/src/__tests__/integration/helpers/testServer'
import {activeProcessesTracker} from '../../../server/src/services/activeProcesses.service'
import {textOf} from './helpers/fakeDashboard'

const RUN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const RUN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const EXEC = '11111111-1111-4111-8111-111111111111'

// The real server (temp DB) with Playwright spawn faked: the run tools over real HTTP, so the
// request shapes (rerun id, run-group body, 409 busy, run status) are checked against the
// server's own routes, never against a live dashboard.
describe('run tools against the real server (spawn faked)', () => {
    let server: TestServerInstance
    let http: Server
    let root: string
    const prevAuth = process.env.ENABLE_AUTH

    const make = (allowRuns: boolean) => {
        const client = new DashboardClient(
            new Session({root, allowRuns}, createHttp(root, fetch, {allowRuns}))
        )
        const tools = createTools(client, 'test')
        return (name: string) => {
            const def = tools.find((t) => t.name === name)!
            return (args: Record<string, unknown> = {}) =>
                def.handler(def.input.parse(args) as never)
        }
    }

    const fakeStart = (method: 'rerunSingleTest' | 'runTestGroup', runId: string) => {
        const child = new EventEmitter()
        const spy = vi
            .spyOn(server.serviceContainer.playwrightService as never, method)
            .mockResolvedValue({
                runId,
                message: 'started',
                timestamp: new Date().toISOString(),
                process: child,
            } as never)
        return {child, spy}
    }

    beforeAll(async () => {
        process.env.ENABLE_AUTH = 'false'
        server = await setupTestServer()
        await new Promise<void>((resolve) => {
            http = server.app.listen(0, '127.0.0.1', resolve)
        })
        root = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
        await seedTestRuns(server.testRepository.dbManager, [{id: 'run-seed'}])
        const res = await fetch(`${root}/api/tests`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${server.authToken}`,
            },
            body: JSON.stringify({
                id: EXEC,
                runId: 'run-seed',
                testId: 'test-aaa',
                name: 'A fails',
                filePath: 'tests/a.spec.ts',
                status: 'failed',
                duration: 10,
                project: 'All_Tests',
            }),
        })
        expect(res.status).toBe(200)
    })

    afterAll(async () => {
        vi.restoreAllMocks()
        activeProcessesTracker.forceReset()
        await new Promise((resolve) => http.close(resolve))
        if (prevAuth === undefined) delete process.env.ENABLE_AUTH
        else process.env.ENABLE_AUTH = prevAuth
        await teardownTestServer(server)
    })

    it('runs off: the real server never sees a start request', async () => {
        const {spy} = fakeStart('rerunSingleTest', RUN_A)
        const res = await make(false)('rerun_test')({testId: 'test-aaa'})
        expect(res.isError).toBe(true)
        expect(spy).not.toHaveBeenCalled()
        spy.mockRestore()
    })

    it('rerun -> status -> busy refusal -> file group, in one story', async () => {
        const tool = make(true)

        const first = fakeStart('rerunSingleTest', RUN_A)
        const started = textOf(await tool('rerun_test')({testId: 'test-aaa'}))
        expect(started).toMatchObject({started: true, runId: RUN_A, type: 'rerun'})
        expect(first.spy).toHaveBeenCalledWith('tests/a.spec.ts', 'A fails', 2, 'All_Tests')

        const status = textOf(await tool('get_run_status')({runId: RUN_A}))
        expect(status).toMatchObject({
            runId: RUN_A,
            status: 'running',
            type: 'rerun',
            counters: {total: 1},
        })

        // the first child is still alive: the server answers 409, the tool does not retry
        const second = fakeStart('runTestGroup', RUN_B)
        const busy = await tool('run_test_file')({filePath: 'tests/a.spec.ts'})
        expect(busy.isError).toBe(true)
        expect(JSON.stringify(busy)).toMatch(/Not started: a run is already active/)
        expect(second.spy).not.toHaveBeenCalled()

        first.child.emit('close', 0)
        await new Promise((r) => setTimeout(r, 100))
        activeProcessesTracker.forceReset()

        const group = textOf(
            await tool('run_test_file')({
                filePath: 'tests/a.spec.ts:7',
                testNames: ['A fails'],
                maxWorkers: 1,
            })
        )
        expect(group).toMatchObject({started: true, runId: RUN_B, type: 'run-group'})
        expect(second.spy).toHaveBeenCalledWith('tests/a.spec.ts', 1, ['A fails'], 'All_Tests')
        expect(textOf(await tool('get_run_status')({runId: RUN_B}))).toMatchObject({
            status: 'running',
            type: 'run-group',
        })
        second.child.emit('close', 0)
        await new Promise((r) => setTimeout(r, 100))
    })

    it('a path outside the project is refused by the guard before the server', async () => {
        const {spy} = fakeStart('runTestGroup', RUN_B)
        const res = await make(true)('run_test_file')({filePath: '../outside.spec.ts'})
        expect(res.isError).toBe(true)
        expect(spy).not.toHaveBeenCalled()
        spy.mockRestore()
    })

    it('an unknown run id answers a clear 404 message', async () => {
        const res = await make(true)('get_run_status')({runId: RUN_A.replace(/a/g, 'c')})
        expect(res.isError).toBe(true)
        expect(JSON.stringify(res)).toMatch(/Run not found/)
    })
})
