import {describe, expect, it} from 'vitest'
import {isAllowedGet} from '../http'
import {EXEC_1, ID_A, makeStack, row, shot, ticket, world} from './helpers/fakeDashboard'

const rows = [
    row({
        status: 'failed',
        errorMessage: 'boom',
        metadata: {tags: ['@to-fix', '@ABC-1']},
        attachments: [shot()],
    }),
]

// One representative call per tool, in every auth mode: whatever a tool does, each request it
// makes must be an allowlisted GET (or the login POST).
describe.each([
    ['login off', {authEnabled: false}],
    ['login on', {authEnabled: true}],
])('read-only sweep (%s)', (_name, auth) => {
    const calls: Record<string, Record<string, unknown>[]> = {
        dashboard_overview: [{}],
        list_tests: [
            {},
            {tab: 'All_Tests', status: 'failed', tag: '@to-fix', search: 'x'},
            {ticketStatusCategory: 'done', allTicketsMustMatch: false},
        ],
        get_test: [{testId: ID_A}, {executionId: EXEC_1}, {testId: ID_A, detail: 'full'}],
        get_test_history: [{testId: ID_A}, {testId: ID_A, before: '2026-10-01T00:00:00Z'}],
        get_screenshots: [{testId: ID_A, max: 3}, {executionId: EXEC_1}],
    }

    it('registers exactly the five tools, and the sweep covers each of them', () => {
        const {tools} = makeStack(world({}))
        expect(tools.map((t) => t.name).sort()).toEqual(Object.keys(calls).sort())
    })

    it('every request is an allowlisted GET or the login POST', async () => {
        const stack = makeStack(
            (m, url, h) => {
                if (url.pathname === '/api/auth/login')
                    return {json: {success: true, data: {token: 't'}}}
                return world({
                    ...auth,
                    rows,
                    tabs: [{project: 'All_Tests'}],
                    summary: [{project: 'All_Tests', total: 1, passed: 0, failed: 1}],
                    jira: {enabled: true, tickets: [ticket('ABC-1', 'done')]},
                    history: rows,
                    files: {'shot.png': Buffer.from('x')},
                })(m, url, h)
            },
            {email: 'qa@example.com', password: 'pw'}
        )
        for (const [name, argSets] of Object.entries(calls)) {
            for (const args of argSets) {
                const res = await stack.tool(name)(args)
                expect(res.isError, `${name} ${JSON.stringify(args)}`).toBeUndefined()
            }
        }
        expect(stack.calls.length).toBeGreaterThan(10)
        for (const c of stack.calls) {
            const login = c.method === 'POST' && c.path === '/api/auth/login'
            const get = c.method === 'GET' && isAllowedGet(c.path)
            expect(login || get, `${c.method} ${c.path}`).toBe(true)
        }
        // never the endpoints that spawn playwright on the server
        expect(stack.calls.some((c) => /\/(projects|diagnostics)$/.test(c.path))).toBe(false)
    })
})
