import {describe, expect, it} from 'vitest'
import {MAX_PAYLOAD_CHARS} from '../constants'
import {
    EXEC_1,
    EXEC_2,
    ID_A,
    makeStack,
    row,
    shot,
    textOf,
    ticket,
    world,
    type World,
} from './helpers/fakeDashboard'

const stack = (w: World) => makeStack(world(w))
const tags = (...t: string[]) => ({metadata: {tags: t}})
const ids = (r: {tests: Array<{testId: string}>}) => r.tests.map((t) => t.testId).sort()

describe('invalid ids never reach the network', () => {
    it.each([
        ['get_test', {executionId: 'projects'}],
        ['get_test', {executionId: 'diagnostics'}],
        ['get_test', {testId: 'projects'}],
        ['get_test', {testId: '../tests/projects'}],
        ['get_test_history', {testId: 'projects'}],
        ['get_test_history', {testId: 'diagnostics'}],
        ['get_screenshots', {executionId: 'projects'}],
        ['get_screenshots', {testId: 'diagnostics'}],
    ])('%s %j', async (name, args) => {
        const {tool, calls} = stack({rows: [row()]})
        const res = await tool(name)(args)
        expect(res.isError).toBe(true)
        expect(calls).toHaveLength(0)
    })

    it('needs exactly one of testId / executionId', async () => {
        const {tool} = stack({rows: [row()]})
        expect((await tool('get_test')({})).isError).toBe(true)
        expect((await tool('get_test')({testId: ID_A, executionId: EXEC_1})).isError).toBe(true)
    })
})

describe('list_tests', () => {
    const rows = [
        row({testId: 'test-a1', name: 'Alpha', status: 'failed', ...tags('@to-fix')}),
        row({testId: 'test-b1', name: 'Beta', status: 'timedOut', ...tags('@to-fix', '@ABC-1')}),
        row({testId: 'test-c1', name: 'Gamma', status: 'passed', filePath: 'tests/zeta.spec.ts'}),
        row({testId: 'test-d1', name: 'Delta', notInCode: true, project: 'Sanity'}),
    ]

    it('resolves a tab by display name, case-insensitively', async () => {
        const {tool, calls} = stack({
            rows,
            tabs: [{project: 'Sanity', displayName: 'Quick Checks'}, {project: 'All_Tests'}],
            summary: [{project: 'Sanity', total: 1, passed: 1, failed: 0}],
        })
        const r = textOf(await tool('list_tests')({tab: 'quick checks', includeNotInCode: true}))
        expect(ids(r)).toEqual(['test-d1'])
        expect(calls.find((c) => c.path === '/api/tests')?.search).toContain('project=Sanity')
    })

    it('an unknown tab lists the known ones', async () => {
        const {tool} = stack({rows, summary: [{project: 'Sanity', total: 1, passed: 1, failed: 0}]})
        const res = await tool('list_tests')({tab: 'nope'})
        expect(res.isError).toBe(true)
        expect(JSON.stringify(res)).toContain('Known tabs: Sanity')
    })

    it('unknown-tab error shows project and display name together', async () => {
        const {tool} = stack({
            rows,
            tabs: [{project: 'To_Fix', displayName: 'Open Bugs'}, {project: 'Sanity'}],
            summary: [{project: 'Sanity', total: 1, passed: 1, failed: 0}],
        })
        const res = await tool('list_tests')({tab: 'To Fix'})
        expect(res.isError).toBe(true)
        const text = JSON.stringify(res)
        expect(text).toContain('To_Fix (\\"Open Bugs\\")')
        expect(text).toContain('Sanity')
    })

    it('status "failed" includes timedOut; "timedOut" is exact', async () => {
        const {tool} = stack({rows})
        expect(ids(textOf(await tool('list_tests')({status: 'failed'})))).toEqual([
            'test-a1',
            'test-b1',
        ])
        expect(ids(textOf(await tool('list_tests')({status: 'timedOut'})))).toEqual(['test-b1'])
    })

    it('filters by tag (with or without @), search, and hides notInCode by default', async () => {
        const {tool} = stack({rows})
        expect(ids(textOf(await tool('list_tests')({tag: 'to-fix'})))).toEqual([
            'test-a1',
            'test-b1',
        ])
        expect(ids(textOf(await tool('list_tests')({search: 'ZETA'})))).toEqual(['test-c1'])
        expect(ids(textOf(await tool('list_tests')({})))).not.toContain('test-d1')
        expect(ids(textOf(await tool('list_tests')({includeNotInCode: true})))).toContain('test-d1')
    })

    it('pages with limit/offset and reports truncation', async () => {
        const many = Array.from({length: 120}, (_, i) => row({testId: `test-n${i}`, name: `T${i}`}))
        const {tool} = stack({rows: many})
        const first = textOf(await tool('list_tests')({}))
        expect(first).toMatchObject({total: 120, returned: 50, truncated: true})
        const last = textOf(await tool('list_tests')({offset: 100, limit: 50}))
        expect(last).toMatchObject({total: 120, returned: 20, truncated: false})
    })

    it('keeps the payload under the cap even for 200 heavy rows', async () => {
        const heavy = Array.from({length: 300}, (_, i) =>
            row({
                testId: `test-h${i}`,
                name: 'x'.repeat(300),
                errorMessage: 'e'.repeat(5000),
                note: {content: 'n'.repeat(5000)},
            })
        )
        const {tool} = stack({rows: heavy})
        const res = await tool('list_tests')({limit: 200})
        const text = (res.content[0] as {text: string}).text
        expect(text.length).toBeLessThanOrEqual(MAX_PAYLOAD_CHARS)
        expect(JSON.parse(text)).toMatchObject({total: 300, truncated: true})
    })

    it('does not leak the server file path or the Jira summary', async () => {
        const {tool} = stack({
            rows: [
                row({
                    ...tags('@ABC-1'),
                    attachments: [{...shot(), filePath: '/srv/secret/p.png'} as never],
                }),
            ],
            jira: {enabled: true, tickets: [ticket('ABC-1', 'done')]},
        })
        const text = JSON.stringify(await tool('list_tests')({}))
        expect(text).not.toContain('/srv/secret')
        expect(text).not.toContain('secret summary')
    })
})

describe('list_tests Jira ticket filter', () => {
    const rows = [
        row({testId: 'test-r1', ...tags('@to-fix', '@ABC-1')}),
        row({testId: 'test-r2', ...tags('@to-fix', '@ABC-2', '@ABC-3')}),
        row({testId: 'test-r3', ...tags('@to-fix', '@ABC-4')}),
        row({testId: 'test-r4', ...tags('@to-fix')}),
        row({testId: 'test-r5', ...tags('@to-fix', '@ABC-5', '@abc-1')}),
        row({testId: 'test-r7', ...tags('@to-fix', '@ABC-1', '@ABC-9')}),
    ]
    const jira = {
        enabled: true,
        tickets: [
            ticket('ABC-1', 'done'),
            ticket('ABC-2', 'done'),
            ticket('ABC-3', 'new', 'Story'),
            ticket('ABC-5', 'indeterminate'),
        ],
    }

    it('all tickets must match (default): partial, unknown and ticketless tests are dropped', async () => {
        const {tool} = stack({rows, jira})
        const r = textOf(await tool('list_tests')({ticketStatusCategory: 'done'}))
        expect(ids(r)).toEqual(['test-r1'])
        expect(r.tests[0].tickets).toEqual([
            {key: 'ABC-1', issueType: 'Bug', statusName: 'Done', statusCategory: 'done'},
        ])
        expect(r.jira.asOf).toBe('2026-10-28T08:00:00.000Z')
    })

    it('allTicketsMustMatch=false keeps tests with at least one matching ticket', async () => {
        const {tool} = stack({rows, jira})
        const r = textOf(
            await tool('list_tests')({ticketStatusCategory: 'done', allTicketsMustMatch: false})
        )
        expect(ids(r)).toEqual(['test-r1', 'test-r2', 'test-r7'])
    })

    it('other categories work too, and unknown keys are flagged on the row', async () => {
        const {tool} = stack({rows, jira})
        const r = textOf(await tool('list_tests')({ticketStatusCategory: 'indeterminate'}))
        expect(ids(r)).toEqual(['test-r5'])
        const all = textOf(await tool('list_tests')({}))
        expect(
            all.tests.find((t: {testId: string}) => t.testId === 'test-r3').ticketsWithoutJiraData
        ).toEqual(['ABC-4'])
    })

    it('combines with the tab and tag filters', async () => {
        const {tool} = stack({rows: [...rows, row({testId: 'test-r6', ...tags('@ABC-1')})], jira})
        const r = textOf(await tool('list_tests')({tag: '@to-fix', ticketStatusCategory: 'done'}))
        expect(ids(r)).toEqual(['test-r1'])
    })

    it('asks Jira in batches of 200 keys', async () => {
        const many = Array.from({length: 250}, (_, i) =>
            row({testId: `test-k${i}`, ...tags(`@ABC-${i + 1}`)})
        )
        const {tool, calls} = stack({rows: many, jira: {enabled: true, tickets: []}})
        await tool('list_tests')({ticketStatusCategory: 'done', limit: 200})
        expect(calls.filter((c) => c.path === '/api/jira/tickets')).toHaveLength(2)
    })

    it('login off (403): says so, applies no filter result, is not an error', async () => {
        const {tool} = stack({rows, jira: 403})
        const res = await tool('list_tests')({ticketStatusCategory: 'done'})
        expect(res.isError).toBeUndefined()
        const r = textOf(res)
        expect(r.jira).toBe('Jira unavailable: login is off')
        expect(r.tests).toEqual([])
        expect(r.note).toMatch(/could not be applied/)
        // Without the filter the list still works and carries the same notice
        const plain = textOf(await tool('list_tests')({}))
        expect(plain.tests).toHaveLength(6)
        expect(plain.jira).toBe('Jira unavailable: login is off')
    })

    it('integration disabled: no ticket calls, clear reason', async () => {
        const {tool, calls} = stack({
            rows,
            jira: {enabled: false, tickets: [ticket('ABC-1', 'done')]},
        })
        const r = textOf(await tool('list_tests')({ticketStatusCategory: 'done'}))
        expect(r.jira).toBe('Jira unavailable: Jira integration is off')
        expect(calls.some((c) => c.path === '/api/jira/tickets')).toBe(false)
    })
})

describe('get_test', () => {
    it('cuts long errors, strips colour codes, keeps failed steps', async () => {
        const r = row({
            status: 'failed',
            errorMessage: '\u001b[31mExpected\u001b[39m ' + 'x'.repeat(5000),
            errorStack: 's'.repeat(9000),
            metadata: {
                tags: ['@ABC-1'],
                steps: [
                    ...Array.from({length: 30}, (_, i) => ({title: `step ${i}`, duration: 1})),
                    {title: 'boom', duration: 1, error: 'bad'},
                ],
            },
            attachments: [shot()],
        })
        const {tool} = stack({byTestId: r})
        const out = textOf(await tool('get_test')({testId: ID_A}))
        expect(out.error.message.startsWith('Expected ')).toBe(true)
        expect(out.error.message).toMatch(/…\[\+\d+ chars\]$/)
        expect(out.error.stack).toMatch(/…\[\+\d+ chars\]$/)
        expect(out.failedAndLastSteps.map((s: {title: string}) => s.title)).toContain('boom')
        expect(out.failedAndLastSteps.length).toBeLessThanOrEqual(11)
        expect(out.attachments).toEqual([
            {
                id: 'att-1',
                type: 'screenshot',
                fileName: 'shot.png',
                sizeKB: 2,
                mimeType: 'image/png',
            },
        ])
    })

    it('stays under the payload cap in "full" mode for a heavy row', async () => {
        const heavy = row({
            status: 'failed',
            errorMessage: 'm'.repeat(20_000),
            errorStack: 's'.repeat(20_000),
            metadata: {
                tags: [],
                errors: Array.from({length: 8}, () => ({
                    message: 'a'.repeat(9000),
                    stack: 'b'.repeat(9000),
                })),
                steps: Array.from({length: 60}, (_, i) => ({
                    title: 't'.repeat(200) + i,
                    duration: 1,
                    error: 'e'.repeat(2000),
                })),
                console: {
                    entries: Array.from({length: 100}, () => ({
                        type: 'log',
                        text: 'c'.repeat(500),
                    })),
                },
            },
        })
        const {tool} = stack({byTestId: heavy})
        for (const detail of ['normal', 'full']) {
            const res = await tool('get_test')({testId: ID_A, detail})
            const text = (res.content[0] as {text: string}).text
            expect(text.length, detail).toBeLessThanOrEqual(MAX_PAYLOAD_CHARS)
        }
        const full = textOf(await tool('get_test')({testId: ID_A, detail: 'full'}))
        expect(full.truncated).toBe(true)
        expect(full.fullDetailReduced).toBe(true)
        expect(full.error).toBeDefined()
        // even when nothing fits, full keeps at least what normal keeps
        const normal = textOf(await tool('get_test')({testId: ID_A}))
        expect(JSON.stringify(full).length).toBeGreaterThanOrEqual(JSON.stringify(normal).length)
        expect(Object.keys(full.error)).toEqual(expect.arrayContaining(Object.keys(normal.error)))
    })

    it('caps the not-returned list of a row with hundreds of screenshots', async () => {
        const many = Array.from({length: 600}, (_, i) =>
            shot({id: `a${i}`, fileName: `s${i}.webm`, mimeType: 'video/webm'})
        )
        const {tool} = stack({byTestId: row({attachments: many})})
        const res = await tool('get_screenshots')({testId: ID_A})
        expect((res.content[0] as {text: string}).text.length).toBeLessThanOrEqual(
            MAX_PAYLOAD_CHARS
        )
        const meta = textOf(res as never)
        expect(meta.notReturned).toHaveLength(20)
        expect(meta.notReturnedCount).toBe(600)
        expect(meta.truncated).toBe(true)
    })

    it('never returns server file paths', async () => {
        const r = row({
            attachments: [
                {...shot(), filePath: '/srv/secret/p.png'} as never,
                {...shot({id: 'a2', fileName: 'two.png'}), filePath: '/srv/secret/q.png'} as never,
                {...shot({id: 'a3', fileName: 'gone.png'}), filePath: '/srv/secret/r.png'} as never,
            ],
        })
        const {tool} = stack({byTestId: r, files: {'shot.png': Buffer.from('x')}})
        for (const name of ['get_test', 'get_screenshots']) {
            const text = JSON.stringify(await tool(name)({testId: ID_A}))
            expect(text, name).not.toContain('/srv/secret')
            expect(text, name).not.toContain('filePath')
        }
    })

    // Realistic over-cap row: 3 soft-assertion errors with big diffs, 25 steps, 30 console lines
    const realistic = () =>
        row({
            status: 'failed',
            errorMessage: 'm'.repeat(8000),
            errorStack: 's'.repeat(3000),
            metadata: {
                tags: ['@ABC-1'],
                errors: Array.from({length: 8}, () => ({
                    message: 'd'.repeat(9000),
                    stack: 'k'.repeat(9000),
                })),
                steps: Array.from({length: 25}, (_, i) => ({
                    title: `step ${i}`,
                    duration: 1,
                    error: i === 3 ? 'bad' : undefined,
                })),
                console: {
                    entries: Array.from({length: 30}, () => ({type: 'log', text: 'c'.repeat(700)})),
                },
            },
        })
    const present = (v: unknown): boolean =>
        Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null

    it('"full" never returns a section that "normal" has, and never less of it', async () => {
        const {tool} = stack({byTestId: realistic()})
        const normal = textOf(await tool('get_test')({testId: ID_A}))
        const full = textOf(await tool('get_test')({testId: ID_A, detail: 'full'}))
        // the scenario must really be over the cap at full detail
        expect(full.fullDetailReduced).toBe(true)
        for (const key of Object.keys(normal)) {
            if (key === 'truncated') continue
            expect(present(full[key]), key).toBe(present(normal[key]))
        }
        expect(Object.keys(full.error)).toEqual(expect.arrayContaining(Object.keys(normal.error)))
        expect(full.console.length).toBeGreaterThanOrEqual(normal.console.length)
        expect(full.failedAndLastSteps.length).toBeGreaterThanOrEqual(
            normal.failedAndLastSteps.length
        )
        expect(JSON.stringify(full).length).toBeGreaterThanOrEqual(JSON.stringify(normal).length)
    })

    // console: newest lines win, and "full" only ever adds lines to what "normal" shows
    const consoleRow = (texts: string[]) =>
        row({
            status: 'failed',
            metadata: {tags: [], console: {entries: texts.map((text) => ({type: 'log', text}))}},
        })

    it('console: one huge early line does not hide anything; the last line is always present', async () => {
        const texts = ['H'.repeat(10_000), ...Array.from({length: 89}, (_, i) => `line ${i}`)]
        const {tool} = stack({byTestId: consoleRow(texts)})
        const normal = textOf(await tool('get_test')({testId: ID_A}))
        const full = textOf(await tool('get_test')({testId: ID_A, detail: 'full'}))
        expect(normal.console.length).toBeGreaterThan(0)
        expect(normal.console.at(-1)).toBe('[log] line 88')
        expect(full.console.at(-1)).toBe('[log] line 88')
        for (const line of normal.console) expect(full.console).toContain(line)
        expect(full.console.length).toBeGreaterThan(normal.console.length)
    })

    it('console: stops at the first line that no longer fits, leaving no gap', async () => {
        const texts = ['tiny', 'q'.repeat(400), ...Array.from({length: 6}, () => 'm'.repeat(450))]
        const {tool} = stack({byTestId: consoleRow(texts)})
        const normal = textOf(await tool('get_test')({testId: ID_A}))
        expect(normal.console).toHaveLength(6)
        expect(normal.console).not.toContain('[log] tiny')
    })

    it('console: a long line is cut and still leaves room for the lines around it', async () => {
        const texts = [...Array.from({length: 10}, (_, i) => `a${i}`), 'H'.repeat(10_000), 'last']
        const {tool} = stack({byTestId: consoleRow(texts)})
        const normal = textOf(await tool('get_test')({testId: ID_A}))
        expect(normal.console).toHaveLength(12)
        expect(normal.console[10]).toMatch(/…\[\+\d+ chars\]$/)
        expect(normal.console.at(-1)).toBe('[log] last')
    })

    it('console: with a full window of long lines the newest ones are kept', async () => {
        const texts = Array.from({length: 90}, (_, i) => `${i}:${'x'.repeat(200)}`)
        const {tool} = stack({byTestId: consoleRow(texts)})
        const normal = textOf(await tool('get_test')({testId: ID_A}))
        const full = textOf(await tool('get_test')({testId: ID_A, detail: 'full'}))
        expect(normal.console.at(-1)).toMatch(/^\[log\] 89:/)
        expect(full.console.at(-1)).toMatch(/^\[log\] 89:/)
        for (const line of normal.console) expect(full.console).toContain(line)
    })

    it('list_tests rows carry at most 20 tags, each cut', async () => {
        const tags = Array.from({length: 3000}, (_, i) => `@t${i}${'x'.repeat(400)}`)
        const {tool} = stack({rows: [row({metadata: {tags}})]})
        const out = textOf(await tool('list_tests')({}))
        expect(out.tests[0].tags).toHaveLength(20)
        expect(Math.max(...out.tests[0].tags.map((t: string) => t.length))).toBeLessThanOrEqual(130)
    })

    it('lists at most 50 attachments with the total, and still keeps the error', async () => {
        const many = Array.from({length: 120}, (_, i) => shot({id: `a${i}`, fileName: `f${i}.png`}))
        const {tool} = stack({
            byTestId: row({status: 'failed', errorMessage: 'real', attachments: many}),
        })
        const out = textOf(await tool('get_test')({testId: ID_A}))
        expect(out.attachments).toHaveLength(50)
        expect(out.attachmentsTotal).toBe(120)
        expect(out.error.message).toBe('real')
    })

    it('keeps the error message when there are very many attachments', async () => {
        const many = Array.from({length: 600}, (_, i) =>
            shot({id: `a${i}`, fileName: `f${i}-${'x'.repeat(80)}.png`})
        )
        const {tool} = stack({
            byTestId: row({status: 'failed', errorMessage: 'real failure', attachments: many}),
        })
        const out = textOf(await tool('get_test')({testId: ID_A}))
        expect(out.error.message).toBe('real failure')
    })

    it('caps failed steps (normal mode stays complete and under the cap)', async () => {
        const steps = Array.from({length: 400}, (_, i) => ({
            title: `s${i}`,
            duration: 1,
            error: 'e'.repeat(1500),
        }))
        const {tool} = stack({
            byTestId: row({
                status: 'failed',
                errorMessage: 'x',
                metadata: {steps, console: {entries: [{type: 'log', text: 'hi'}]}},
            }),
        })
        const res = await tool('get_test')({testId: ID_A})
        const out = textOf(res)
        expect(out.failedAndLastSteps.length).toBeLessThanOrEqual(10)
        expect(out.console).toEqual(['[log] hi'])
    })

    it.each([
        ['name', {name: 'n'.repeat(60_000)}],
        ['file', {filePath: 'f'.repeat(60_000)}],
        ['project', {project: 'p'.repeat(60_000)}],
        ['tags', {metadata: {tags: Array.from({length: 9000}, (_, i) => `@tag${i}`)}}],
        [
            'describe',
            {metadata: {tags: [], describe: Array.from({length: 100}, () => 'd'.repeat(2000))}},
        ],
    ])('stays under the cap for a huge %s alone', async (_f, over) => {
        const {tool} = stack({byTestId: row(over as never)})
        const res = await tool('get_test')({testId: ID_A})
        expect((res.content[0] as {text: string}).text.length).toBeLessThanOrEqual(
            MAX_PAYLOAD_CHARS
        )
    })

    it('stays under the cap even for huge name/describe/tags', async () => {
        const r = row({
            name: 'n'.repeat(30_000),
            metadata: {
                tags: Array.from({length: 3000}, (_, i) => `@t${i}`),
                describe: Array.from({length: 200}, () => 'd'.repeat(2000)),
            },
        })
        const {tool} = stack({byTestId: r})
        const res = await tool('get_test')({testId: ID_A})
        expect((res.content[0] as {text: string}).text.length).toBeLessThanOrEqual(
            MAX_PAYLOAD_CHARS
        )
    })

    it('"full" gives more room than "normal"', async () => {
        const r = row({status: 'failed', errorStack: 's'.repeat(9000)})
        const {tool} = stack({byTestId: r})
        const normal = textOf(await tool('get_test')({testId: ID_A}))
        const full = textOf(await tool('get_test')({testId: ID_A, detail: 'full'}))
        expect(full.error.stack.length).toBeGreaterThan(normal.error.stack.length)
    })

    it('reads one execution by UUID', async () => {
        const {tool, calls} = stack({byExecution: row({id: EXEC_2})})
        const out = textOf(await tool('get_test')({executionId: EXEC_2}))
        expect(out.executionId).toBe(EXEC_2)
        expect(calls.at(-1)?.path).toBe(`/api/tests/${EXEC_2}`)
    })
})

describe('get_test_history', () => {
    const h = [
        row({
            id: EXEC_1,
            status: 'failed',
            createdAt: '2026-10-20T10:00:00Z',
            errorMessage: 'boom\nmore',
        }),
        row({id: EXEC_2, status: 'failed', createdAt: '2026-10-19T10:00:00Z'}),
        row({id: 'e3', status: 'passed', createdAt: '2026-10-18T10:00:00Z'}),
        row({id: 'e4', status: 'timedOut', createdAt: '2026-10-17T10:00:00Z'}),
    ]

    it('summarises the window and the failing streak', async () => {
        const {tool} = stack({history: [...h].reverse(), historyTotal: 4})
        const out = textOf(await tool('get_test_history')({testId: ID_A}))
        expect(out.window).toEqual({passed: 1, failed: 2, timedOut: 1})
        expect(out.lastPassedAt).toBe('2026-10-18T10:00:00Z')
        expect(out.failingSince).toBe('2026-10-19T10:00:00Z')
        expect(out.failingSinceIsWindowStart).toBe(false)
        expect(out.executions[0]).toMatchObject({executionId: EXEC_1, error: 'boom'})
        expect(out.window.skipped).toBeUndefined()
        expect(out.nextBefore).toBeUndefined()
    })

    it('gives nextBefore when more executions exist', async () => {
        const {tool} = stack({history: h.slice(0, 2), historyTotal: 9})
        const out = textOf(await tool('get_test_history')({testId: ID_A, limit: 2}))
        expect(out.nextBefore).toBe('2026-10-19T10:00:00Z')
    })

    it('rejects a non-date cursor', async () => {
        const {tools} = stack({})
        const t = tools.find((x) => x.name === 'get_test_history')!
        expect(t.input.safeParse({testId: ID_A, before: 'yesterday'}).success).toBe(false)
    })
})

describe('get_screenshots', () => {
    const png = Buffer.from('fakepng')
    const base = (attachments: unknown[]) =>
        stack({
            byTestId: row({attachments: attachments as never}),
            files: {'shot.png': png, 'two.png': png, 'big.png': Buffer.alloc(200_000)},
        })

    it('returns an image block under the cap', async () => {
        const {tool, calls} = base([
            shot(),
            shot({id: 'a2', fileName: 'two.png', url: `/attachments/${EXEC_1}/two.png`}),
        ])
        const res = await tool('get_screenshots')({testId: ID_A})
        const img = res.content.filter((c) => c.type === 'image')
        expect(img).toHaveLength(1)
        expect(img[0]).toMatchObject({mimeType: 'image/png', data: png.toString('base64')})
        const meta = textOf(res as never)
        expect(meta.returned).toEqual(['shot.png'])
        expect(meta.notReturned[0].reason).toMatch(/per-call limit/)
        expect(calls.at(-1)?.path).toBe(`/attachments/${EXEC_1}/shot.png`)
    })

    it('skips over-cap, non-image and unrecognised-url attachments with a reason', async () => {
        const {tool} = base([
            shot({
                id: 'a1',
                fileName: 'big.png',
                fileSize: 5_000_000,
                url: `/attachments/${EXEC_1}/big.png`,
            }),
            shot({id: 'a2', fileName: 'x.webm', mimeType: 'video/webm', type: 'screenshot'}),
            shot({id: 'a3', fileName: 'legacy.png', url: 'screenshots/legacy.png'}),
            shot({id: 'a4', type: 'video', fileName: 'v.webm'}),
        ])
        const res = await tool('get_screenshots')({testId: ID_A, max: 3})
        expect(res.content.filter((c) => c.type === 'image')).toHaveLength(0)
        const reasons = textOf(res as never).notReturned.map((n: {reason: string}) => n.reason)
        expect(reasons).toEqual([
            'over size cap',
            'not png/jpeg',
            'not downloadable (unrecognised attachment URL)',
        ])
    })

    it('enforces the byte cap on the wire even when the row under-reports the size', async () => {
        const {tool} = base([
            shot({fileName: 'big.png', fileSize: 10, url: `/attachments/${EXEC_1}/big.png`}),
        ])
        const res = await tool('get_screenshots')({testId: ID_A, maxBytes: 10_000})
        expect(res.content.filter((c) => c.type === 'image')).toHaveLength(0)
        expect(textOf(res as never).notReturned[0].reason).toBe('over size cap')
    })

    it('one missing file does not lose the other screenshots', async () => {
        const {tool} = base([
            shot({id: 'a1', fileName: 'gone.png', url: `/attachments/${EXEC_1}/gone.png`}),
            shot({id: 'a2'}),
        ])
        const res = await tool('get_screenshots')({testId: ID_A, max: 3})
        expect(res.isError).toBeUndefined()
        expect(res.content.filter((c) => c.type === 'image')).toHaveLength(1)
        expect(textOf(res as never).notReturned).toEqual([
            expect.objectContaining({fileName: 'gone.png', reason: 'HTTP 404'}),
        ])
    })

    it("downloads names with !'()* (encoded by hand)", async () => {
        const {tool, calls} = stack({
            byTestId: row({
                attachments: [shot({fileName: 'a(1).png', url: `/attachments/${EXEC_1}/a(1).png`})],
            }),
            files: {'a(1).png': png},
        })
        const res = await tool('get_screenshots')({testId: ID_A})
        expect(res.content.filter((c) => c.type === 'image')).toHaveLength(1)
        expect(calls.at(-1)?.path).toBe(`/attachments/${EXEC_1}/a%281%29.png`)
    })

    it('a file name that cannot be encoded is skipped, not a failed call', async () => {
        const bad = 'a\uD800.png'
        const {tool} = stack({
            byTestId: row({
                attachments: [
                    shot({fileName: bad, url: `/attachments/${EXEC_1}/${bad}`}),
                    shot({id: 'a2'}),
                ],
            }),
            files: {'shot.png': png},
        })
        const res = await tool('get_screenshots')({testId: ID_A, max: 3})
        expect(res.isError).toBeUndefined()
        expect(res.content.filter((c) => c.type === 'image')).toHaveLength(1)
        expect(textOf(res as never).notReturned[0].reason).toMatch(/not downloadable/)
    })

    it('encodes the file name and never follows a foreign url', async () => {
        const {tool, calls} = stack({
            byTestId: row({
                attachments: [
                    shot({fileName: 'a b.png', url: `/attachments/${EXEC_1}/a b.png`}),
                    shot({id: 'a2', fileName: 'e.png', url: 'https://evil.example.com/x.png'}),
                ],
            }),
            files: {'a b.png': png},
        })
        const res = await tool('get_screenshots')({testId: ID_A, max: 3})
        expect(res.content.filter((c) => c.type === 'image')).toHaveLength(1)
        expect(calls.at(-1)?.path).toBe(`/attachments/${EXEC_1}/a%20b.png`)
        expect(calls.some((c) => c.path.includes('evil'))).toBe(false)
    })
})

describe('dashboard_overview', () => {
    it('merges tabs and counts, and notes missing display names', async () => {
        const {tool} = stack({
            summary: [{project: 'All_Tests', total: 10, passed: 8, failed: 2}],
            tabs: [{project: 'All_Tests', displayName: 'Everything'}],
            jira: {enabled: true, tickets: []},
        })
        const out = textOf(await tool('dashboard_overview')())
        expect(out.target).toBe('dashboard.example.com')
        expect(out.tabs).toEqual([
            {project: 'All_Tests', displayName: 'Everything', total: 10, passed: 8, failed: 2},
        ])
        expect(out.jira.enabled).toBe(true)
    })

    it('degrades (no error) when login is off', async () => {
        const {tool} = stack({summary: [{project: 'All_Tests', total: 1, passed: 1, failed: 0}]})
        const res = await tool('dashboard_overview')()
        expect(res.isError).toBeUndefined()
        const out = textOf(res)
        expect(out.jira).toBe('Jira unavailable: login is off')
        expect(out.tabNamesNote).toMatch(/login is off/)
        expect(out.tabs[0].project).toBe('All_Tests')
    })
})
