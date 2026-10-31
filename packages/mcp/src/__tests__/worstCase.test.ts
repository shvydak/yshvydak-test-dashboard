import {describe, expect, it} from 'vitest'
import {MAX_PAYLOAD_CHARS} from '../constants'
import {EXEC_1, ID_A, RUN_1, makeStack, row, shot, ticket, world} from './helpers/fakeDashboard'

const big = (c: string, n: number) => c.repeat(n)

// Every field an attacker or a broken reporter could inflate, at a size far above any cap
const worstRow = (i = 0, light = false) =>
    row({
        testId: `test-w${i}`,
        name: big('n', 60_000),
        filePath: big('f', 60_000),
        project: big('p', 60_000),
        runId: big('r', 60_000),
        status: 'failed',
        errorMessage: big('m', 60_000),
        errorStack: big('s', 60_000),
        note: {content: big('x', 60_000)},
        attachmentsClearedAt: big('c', 60_000),
        attachments: Array.from({length: light ? 5 : 700}, (_, k) =>
            shot({
                id: `a${k}`,
                fileName: `${big('z', 300)}${k}.png`,
                url: `/attachments/${EXEC_1}/s${k}.png`,
            })
        ),
        metadata: {
            tags: Array.from(
                {length: light ? 5 : 4000},
                (_, k) => `@ABC-${k + 1}${big('t', 500)}`
            ).concat(Array.from({length: light ? 5 : 4000}, (_, k) => `@ABC-${k + 1}`)),
            describe: Array.from({length: light ? 3 : 300}, () => big('d', 5000)),
            annotations: Array.from({length: 300}, () => ({
                type: big('a', 500),
                description: big('b', 5000),
            })),
            line: 1,
            errors: light
                ? []
                : Array.from({length: 50}, () => ({
                      message: big('e', 60_000),
                      stack: big('k', 60_000),
                  })),
            steps: light
                ? []
                : Array.from({length: 3000}, (_, k) => ({
                      title: big('t', 5000),
                      duration: k,
                      error: big('e', 5000),
                  })),
            console: {
                entries: Array.from({length: 200}, () => ({type: 'log', text: big('c', 5000)})),
            },
        },
    })

describe('worst-case fixture: no tool exceeds the payload cap', () => {
    const heavy = worstRow(0)
    const rows = Array.from({length: 60}, (_, i) => worstRow(i, true))
    const stack = () =>
        makeStack(
            world({
                run: {
                    id: RUN_1,
                    status: 'running',
                    totalTests: 60,
                    passedTests: 0,
                    failedTests: 0,
                    skippedTests: 0,
                    duration: 0,
                    metadata: {type: big('t', 5000), project: big('p', 5000)},
                },
                runRows: rows,
                rows: [...rows, row()],
                byTestId: heavy,
                byExecution: heavy,
                history: rows.slice(0, 100),
                historyTotal: 500,
                tabs: Array.from({length: 100}, (_, i) => ({
                    project: `${big('p', 5000)}${i}`,
                    displayName: big('d', 5000),
                })),
                summary: Array.from({length: 100}, (_, i) => ({
                    project: `${big('p', 5000)}${i}`,
                    total: 1,
                    passed: 0,
                    failed: 1,
                })),
                jira: {
                    enabled: true,
                    tickets: [ticket('ABC-1', 'done')],
                    lastSyncError: big('j', 60_000),
                },
                files: {},
            }),
            {allowRuns: true}
        )

    const calls: Array<[string, Record<string, unknown>]> = [
        ['dashboard_overview', {}],
        ['list_tests', {}],
        ['list_tests', {limit: 200}],
        ['list_tests', {ticketStatusCategory: 'done', limit: 200}],
        ['get_test', {testId: ID_A}],
        ['get_test', {testId: ID_A, detail: 'full'}],
        ['get_test', {executionId: EXEC_1}],
        ['get_test_history', {testId: ID_A, limit: 100}],
        ['get_screenshots', {testId: ID_A, max: 3}],
        ['get_run_status', {runId: RUN_1}],
        ['rerun_test', {testId: ID_A}],
        ['run_test_file', {filePath: 'tests/checkout.spec.ts', testNames: ['x']}],
    ]

    it.each(calls)('%s %j', async (name, args) => {
        const res = await stack().tool(name)(args)
        expect(res.isError, JSON.stringify(res).slice(0, 200)).toBeUndefined()
        for (const part of res.content) {
            if (part.type === 'text')
                expect(part.text.length).toBeLessThanOrEqual(MAX_PAYLOAD_CHARS)
        }
    })

    it('covers every registered tool', () => {
        const names = new Set(calls.map(([n]) => n))
        expect(
            stack()
                .tools.map((t) => t.name)
                .filter((n) => !names.has(n))
        ).toEqual([])
    })
})
