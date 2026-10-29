import {describe, expect, it} from 'vitest'
import {isAllowedGet, isAllowedRunPost} from '../http'
import {EXEC_1, ID_A, RUN_1, makeStack, row, shot, ticket, world} from './helpers/fakeDashboard'

const rows = [
    row({
        status: 'failed',
        errorMessage: 'boom',
        metadata: {tags: ['@to-fix', '@ABC-1']},
        attachments: [shot()],
    }),
]

const runRow = {
    id: RUN_1,
    status: 'running',
    totalTests: 1,
    passedTests: 0,
    failedTests: 0,
    skippedTests: 0,
    duration: 0,
}

// One representative call per tool, in every auth mode and with run tools off and on: whatever a
// tool does, each request it makes must be an allowlisted GET, the login POST, or (runs on only)
// a validated run-start POST. With runs off no POST other than login can happen.
describe.each([
    ['login off', {authEnabled: false}],
    ['login on', {authEnabled: true}],
])('guard sweep (%s)', (_name, auth) => {
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
        get_run_status: [{runId: RUN_1}],
        rerun_test: [{testId: ID_A}, {testId: ID_A, maxWorkers: 4}],
        run_test_file: [
            {filePath: 'tests/checkout.spec.ts'},
            {filePath: 'tests/checkout.spec.ts:12', testNames: ['one', 'two'], maxWorkers: 1},
            // refused by the guard, never sent
            {filePath: '../escape.spec.ts'},
            {filePath: '.*'},
            {filePath: 'tests/unknown.spec.ts'},
        ],
    }
    const RUN_TOOLS = ['rerun_test', 'run_test_file']

    it('registers exactly the eight tools, and the sweep covers each of them', () => {
        for (const allowRuns of [false, true]) {
            const {tools} = makeStack(world({}), {allowRuns})
            expect(tools.map((t) => t.name).sort()).toEqual(Object.keys(calls).sort())
        }
    })

    const run = async (allowRuns: boolean) => {
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
                    run: runRow,
                    runRows: rows,
                })(m, url, h)
            },
            {email: 'qa@example.com', password: 'pw', allowRuns}
        )
        const results: Array<{name: string; args: Record<string, unknown>; isError?: boolean}> = []
        for (const [name, argSets] of Object.entries(calls)) {
            for (const args of argSets) {
                const res = await stack.tool(name)(args)
                results.push({name, args, isError: res.isError})
            }
        }
        return {stack, results}
    }

    it('runs off: no POST except login, run tools answer "disabled"', async () => {
        const {stack, results} = await run(false)
        for (const r of results) {
            const isRunTool = RUN_TOOLS.includes(r.name)
            expect(r.isError === true, `${r.name} ${JSON.stringify(r.args)}`).toBe(isRunTool)
        }
        for (const c of stack.calls) {
            const login = c.method === 'POST' && c.path === '/api/auth/login'
            const get = c.method === 'GET' && isAllowedGet(c.path)
            expect(login || get, `${c.method} ${c.path}`).toBe(true)
        }
        expect(stack.calls.filter((c) => c.method !== 'GET' && !c.path.endsWith('/login'))).toEqual(
            []
        )
        const disabled = await stack.tool('rerun_test')({testId: ID_A})
        expect(JSON.stringify(disabled)).toContain('Runs are disabled for this dashboard')
        expect(JSON.stringify(disabled)).toContain('DASHBOARD_ALLOW_RUNS=true')
    })

    it('runs on: every request is an allowlisted GET, login, or a validated run-start POST', async () => {
        const {stack, results} = await run(true)
        // only the traversal, pattern and unknown-file paths are refused
        const failed = results.filter((r) => r.isError)
        expect(failed.map((r) => r.args.filePath)).toEqual([
            '../escape.spec.ts',
            '.*',
            'tests/unknown.spec.ts',
        ])
        expect(stack.calls.length).toBeGreaterThan(10)
        for (const c of stack.calls) {
            const login = c.method === 'POST' && c.path === '/api/auth/login'
            const get = c.method === 'GET' && isAllowedGet(c.path)
            const post = c.method === 'POST' && isAllowedRunPost(c.path, c.body)
            expect(login || get || post, `${c.method} ${c.path}`).toBe(true)
        }
        const posts = stack.calls.filter((c) => c.method === 'POST' && !c.path.endsWith('/login'))
        expect(posts.map((c) => c.path)).toEqual([
            `/api/tests/${EXEC_1}/rerun`,
            `/api/tests/${EXEC_1}/rerun`,
            '/api/tests/run-group',
            '/api/tests/run-group',
        ])
        // never the endpoints that spawn playwright --list, nor stop / run-all / pipeline routes
        expect(stack.calls.some((c) => /\/(projects|diagnostics)$/.test(c.path))).toBe(false)
        expect(
            stack.calls.some((c) =>
                /run-all|force-reset|\/pipeline\/|\/settings\/(?!project-tabs)/.test(c.path)
            )
        ).toBe(false)
    })
})
