import type {AddressInfo} from 'node:net'
import type {Server} from 'node:http'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {Session} from '../auth'
import {DashboardClient} from '../client'
import {createHttp} from '../http'
import {createTools} from '../tools'
import {
    setupTestServer,
    teardownTestServer,
    type TestServerInstance,
} from '../../../server/src/__tests__/integration/helpers/testServer'
import {seedTestRuns} from '../../../server/src/__tests__/integration/helpers/database'
import {textOf} from './helpers/fakeDashboard'

// Real server (temp DB from the harness) + the MCP tool handlers over real HTTP: catches
// response-shape drift the fake dashboard cannot.
describe('MCP against the real server', () => {
    let server: TestServerInstance
    let http: Server
    let root: string
    const prevAuth = process.env.ENABLE_AUTH

    const post = (body: Record<string, unknown>) =>
        fetch(`${root}/api/tests`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${server.authToken}`,
            },
            body: JSON.stringify(body),
        })
    const base = {runId: 'run-1', filePath: 'tests/a.spec.ts', duration: 10, project: 'All_Tests'}

    const make = (config = {}) => {
        const client = new DashboardClient(new Session({root, ...config}, createHttp(root)))
        const tools = createTools(client, 'test')
        const tool = (name: string) => {
            const def = tools.find((t) => t.name === name)!
            return (args: Record<string, unknown> = {}) =>
                def.handler(def.input.parse(args) as never)
        }
        return {tool, client}
    }

    beforeAll(async () => {
        process.env.ENABLE_AUTH = 'false'
        server = await setupTestServer()
        await new Promise<void>((resolve) => {
            http = server.app.listen(0, '127.0.0.1', resolve)
        })
        root = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
        const seeds = [
            {
                id: '11111111-1111-4111-8111-111111111111',
                testId: 'test-aaa',
                name: 'A passes',
                status: 'passed',
                createdAt: '2026-10-01T10:00:00.000Z',
            },
            {
                id: '22222222-2222-4222-8222-222222222222',
                testId: 'test-aaa',
                name: 'A passes',
                status: 'failed',
                errorMessage: 'boom',
                errorStack: 'at x',
                createdAt: '2026-10-02T10:00:00.000Z',
                metadata: {tags: ['@to-fix', '@ABC-1']},
            },
            {
                id: '33333333-3333-4333-8333-333333333333',
                testId: 'test-bbb',
                name: 'B times out',
                status: 'timedOut',
                createdAt: '2026-10-02T11:00:00.000Z',
            },
        ]
        await seedTestRuns(server.testRepository.dbManager, [{id: 'run-1'}])
        for (const s of seeds) {
            const res = await post({...base, ...s})
            expect(res.status).toBe(200)
            // created_at has 1s resolution: keep executions of one test strictly ordered
            await new Promise((r) => setTimeout(r, 1100))
        }
    })

    afterAll(async () => {
        await new Promise((resolve) => http.close(resolve))
        if (prevAuth === undefined) delete process.env.ENABLE_AUTH
        else process.env.ENABLE_AUTH = prevAuth
        await teardownTestServer(server)
    })

    it('list_tests / get_test / get_test_history read real rows', async () => {
        const {tool} = make()
        const list = textOf(await tool('list_tests')({status: 'failed'}))
        expect(list.tests.map((t: {testId: string}) => t.testId).sort()).toEqual([
            'test-aaa',
            'test-bbb',
        ])
        expect(list.tests.find((t: {testId: string}) => t.testId === 'test-aaa')).toMatchObject({
            status: 'failed',
            tags: ['@to-fix', '@ABC-1'],
        })

        const one = textOf(await tool('get_test')({testId: 'test-aaa'}))
        expect(one).toMatchObject({status: 'failed', error: {message: 'boom', stack: 'at x'}})

        const byExec = textOf(
            await tool('get_test')({executionId: '11111111-1111-4111-8111-111111111111'})
        )
        expect(byExec.status).toBe('passed')

        const hist = textOf(await tool('get_test_history')({testId: 'test-aaa'}))
        expect(hist).toMatchObject({
            totalExecutions: 2,
            window: {passed: 1, failed: 1, timedOut: 0},
        })
        expect(hist.failingSince).toBeDefined()
    })

    it('overview and Jira degrade cleanly on a dashboard with login off', async () => {
        const {tool} = make()
        const ov = textOf(await tool('dashboard_overview')())
        expect(ov.authEnabled).toBe(false)
        expect(ov.tabs).toEqual([expect.objectContaining({project: 'All_Tests', total: 2})])
        expect(ov.jira).toBe('Jira unavailable: login is off')
        const filtered = await tool('list_tests')({ticketStatusCategory: 'done'})
        expect(filtered.isError).toBeUndefined()
        expect(textOf(filtered).jira).toBe('Jira unavailable: login is off')
    })

    it('logs in against a dashboard with login on and reads Jira status', async () => {
        process.env.ENABLE_AUTH = 'true'
        try {
            const {tool} = make({
                email: process.env.ADMIN_EMAIL,
                password: process.env.ADMIN_PASSWORD,
            })
            const ov = textOf(await tool('dashboard_overview')())
            expect(ov.authEnabled).toBe(true)
            expect(ov.jira).toMatchObject({enabled: false})
            const list = textOf(await tool('list_tests')({}))
            expect(list.total).toBe(2)
            // wrong password -> clean tool error, no secret in it
            const bad = make({email: process.env.ADMIN_EMAIL, password: 'nope-nope'})
            const res = await bad.tool('list_tests')({})
            expect(res.isError).toBe(true)
            expect(JSON.stringify(res)).not.toContain('nope-nope')
        } finally {
            process.env.ENABLE_AUTH = 'false'
        }
    })
})
