import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import YShvydakReporter from '../index'
import type {TestCase, TestResult} from '@playwright/test/reporter'

vi.mock('fs')

const mockFetch = vi.fn()
global.fetch = mockFetch as any

interface SuiteMock {
    title: string
    type?: string
    parent?: SuiteMock
}

// Real Playwright layout: root('') > project(name) > file(relative path) > describe... > test
function buildParent(describes: string[], withType = true): SuiteMock {
    const type = (t: string) => (withType ? {type: t} : {})
    const root: SuiteMock = {title: '', ...type('root')}
    const project: SuiteMock = {title: 'chromium', ...type('project'), parent: root}
    const file: SuiteMock = {title: 'e2e/login.spec.ts', ...type('file'), parent: project}
    return describes.reduce<SuiteMock>(
        (parent, title) => ({title, ...type('describe'), parent}),
        file
    )
}

function makeTest(overrides: Record<string, unknown> = {}, describes: string[] = []): TestCase {
    return {
        title: 'logs in',
        location: {file: '/repo/e2e/login.spec.ts', line: 12, column: 5},
        parent: buildParent(describes),
        tags: ['@ABC-123'],
        annotations: [],
        expectedStatus: 'passed',
        retries: 2,
        timeout: 30000,
        outcome: () => 'expected',
        ...overrides,
    } as unknown as TestCase
}

function makeResult(overrides: Record<string, unknown> = {}): TestResult {
    return {
        status: 'passed',
        duration: 100,
        attachments: [],
        errors: [],
        annotations: [],
        retry: 0,
        workerIndex: 1,
        parallelIndex: 0,
        startTime: new Date('2026-01-02T03:04:05.000Z'),
        ...overrides,
    } as unknown as TestResult
}

describe('YShvydakReporter - per-test metadata', () => {
    let reporter: YShvydakReporter

    beforeEach(() => {
        vi.clearAllMocks()
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        delete process.env.RUN_ID
        delete process.env.RERUN_ID
        mockFetch.mockResolvedValue({ok: true, json: async () => ({})})
        reporter = new YShvydakReporter()
    })

    afterEach(() => {
        process.removeAllListeners('SIGINT')
        process.removeAllListeners('SIGTERM')
        process.removeAllListeners('uncaughtException')
        process.removeAllListeners('unhandledRejection')
    })

    const send = (test: TestCase, result: TestResult = makeResult()) => {
        mockFetch.mockClear()
        reporter.onTestEnd(test, result)
        const call = mockFetch.mock.calls.find(([url]) => String(url).endsWith('/api/tests'))
        expect(call).toBeDefined()
        return JSON.parse(call![1].body)
    }
    const metaOf = (test: TestCase, result?: TestResult) => send(test, result).metadata

    describe('describe chain', () => {
        it('is omitted for a test without describes', () => {
            expect(metaOf(makeTest()).describe).toBeUndefined()
        })

        it('holds one describe title, without root/project/file/test title', () => {
            expect(metaOf(makeTest({}, ['Login'])).describe).toEqual(['Login'])
        })

        it('keeps nested describes outermost first', () => {
            expect(metaOf(makeTest({}, ['Auth', 'Login', 'Errors'])).describe).toEqual([
                'Auth',
                'Login',
                'Errors',
            ])
        })

        it('skips anonymous (empty-title) describes', () => {
            expect(metaOf(makeTest({}, ['Auth', '', 'Errors'])).describe).toEqual([
                'Auth',
                'Errors',
            ])
        })

        it('falls back to dropping root/project/file when suites have no type (Playwright < 1.44)', () => {
            const test = makeTest({parent: buildParent(['Auth', 'Login'], false)})

            expect(metaOf(test).describe).toEqual(['Auth', 'Login'])
        })

        it('is omitted for a test without describes on an older Playwright without suite types', () => {
            expect(metaOf(makeTest({parent: buildParent([], false)})).describe).toBeUndefined()
        })

        it('is omitted when the test has no parent chain at all', () => {
            expect(metaOf(makeTest({parent: undefined})).describe).toBeUndefined()
        })
    })

    describe('annotations', () => {
        it('are omitted when there are none', () => {
            expect(metaOf(makeTest()).annotations).toBeUndefined()
        })

        it('include skip/fixme/fail reasons and custom ones from the test', () => {
            const test = makeTest({
                annotations: [
                    {type: 'skip', description: 'flaky on CI'},
                    {type: 'issue', description: 'https://tracker.example/1'},
                    {type: 'slow'},
                ],
            })

            expect(metaOf(test).annotations).toEqual([
                {type: 'skip', description: 'flaky on CI'},
                {type: 'issue', description: 'https://tracker.example/1'},
                {type: 'slow'},
            ])
        })

        it('merge result.annotations and de-duplicate by type + description', () => {
            const test = makeTest({annotations: [{type: 'fixme', description: 'a'}]})
            const result = makeResult({
                annotations: [
                    {type: 'fixme', description: 'a'},
                    {type: 'runtime', description: 'added during the test'},
                ],
            })

            expect(metaOf(test, result).annotations).toEqual([
                {type: 'fixme', description: 'a'},
                {type: 'runtime', description: 'added during the test'},
            ])
        })

        it('keeps the same type with different descriptions', () => {
            const test = makeTest({
                annotations: [
                    {type: 'issue', description: 'A'},
                    {type: 'issue', description: 'B'},
                ],
            })

            expect(metaOf(test).annotations).toHaveLength(2)
        })

        it('cap at 10 entries', () => {
            const many = Array.from({length: 25}, (_, i) => ({type: `t${i}`}))

            const annotations = metaOf(makeTest({annotations: many})).annotations

            expect(annotations).toHaveLength(10)
            expect(annotations[9]).toEqual({type: 't9'})
        })

        it('cut descriptions at 300 chars and types at 100', () => {
            const test = makeTest({
                annotations: [{type: 'x'.repeat(500), description: 'd'.repeat(1000)}],
            })

            const [annotation] = metaOf(test).annotations
            expect(annotation.type).toHaveLength(100)
            expect(annotation.description).toHaveLength(300)
        })

        it('ignore malformed items and non-array input', () => {
            const test = makeTest({
                annotations: [null, undefined, {}, {type: 5}, 'skip', {type: 'ok', description: 7}],
            })

            expect(metaOf(test, makeResult({annotations: 'nope'})).annotations).toEqual([
                {type: 'ok'},
            ])
        })
    })

    describe('location', () => {
        it('has line and column', () => {
            const meta = metaOf(makeTest())

            expect(meta.line).toBe(12)
            expect(meta.column).toBe(5)
        })

        it('omits non-numeric line/column', () => {
            const meta = metaOf(
                makeTest({location: {file: '/repo/e2e/login.spec.ts', line: '12', column: NaN}})
            )

            expect(meta.line).toBeUndefined()
            expect(meta.column).toBeUndefined()
        })
    })

    describe('errors', () => {
        it('are omitted for a passing test', () => {
            const meta = metaOf(makeTest())

            expect(meta.errors).toBeUndefined()
            expect(meta.errorsTruncated).toBeUndefined()
        })

        it('include every error (soft assertions), keeping errorMessage/errorStack as before', () => {
            const first = {message: 'expect 1 failed', stack: 'stack 1'}
            const errors = [first, {message: 'expect 2 failed', stack: 'stack 2'}, {message: 'm3'}]
            const body = send(makeTest(), makeResult({status: 'failed', error: first, errors}))

            expect(body.metadata.errors).toEqual([
                {message: 'expect 1 failed', stack: 'stack 1'},
                {message: 'expect 2 failed', stack: 'stack 2'},
                {message: 'm3'},
            ])
            expect(body.metadata.errorsTruncated).toBeUndefined()
            // unchanged existing behaviour
            expect(body.errorStack).toBe('stack 1')
            expect(typeof body.errorMessage).toBe('string')
        })

        it('cap at 5 errors and flag errorsTruncated', () => {
            const errors = Array.from({length: 8}, (_, i) => ({message: `m${i}`}))

            const meta = metaOf(makeTest(), makeResult({status: 'failed', errors}))

            expect(meta.errors).toHaveLength(5)
            expect(meta.errors[4].message).toBe('m4')
            expect(meta.errorsTruncated).toBe(true)
        })

        it('cut messages at 2000 and stacks at 4000 chars and mark those errors truncated', () => {
            const errors = [
                {message: 'm'.repeat(2500), stack: 's'.repeat(5000)},
                {message: 'short', stack: 'short stack'},
            ]

            const meta = metaOf(makeTest(), makeResult({status: 'failed', errors}))

            expect(meta.errors[0].message).toHaveLength(2000)
            expect(meta.errors[0].stack).toHaveLength(4000)
            expect(meta.errors[0].truncated).toBe(true)
            expect(meta.errors[1].truncated).toBeUndefined()
            expect(meta.errorsTruncated).toBeUndefined()
        })

        it('mark truncation when only the stack is over the cap', () => {
            const meta = metaOf(
                makeTest(),
                makeResult({status: 'failed', errors: [{message: 'ok', stack: 's'.repeat(4001)}]})
            )

            expect(meta.errors[0].truncated).toBe(true)
            expect(meta.errors[0].message).toBe('ok')
        })

        it('skip errors that carry neither message nor stack, and ignore non-array input', () => {
            expect(
                metaOf(makeTest(), makeResult({errors: [{}, {value: 1}, null, {message: 'kept'}]}))
                    .errors
            ).toEqual([{message: 'kept'}])
            expect(metaOf(makeTest(), makeResult({errors: 'boom'})).errors).toBeUndefined()
        })
    })

    describe('outcome and run details', () => {
        it('sends outcome, expectedStatus, retry, retries, timeout, worker indexes and ISO startTime', () => {
            const meta = metaOf(
                makeTest({outcome: () => 'flaky', expectedStatus: 'failed'}),
                makeResult({retry: 1, workerIndex: 3, parallelIndex: 2})
            )

            expect(meta).toMatchObject({
                outcome: 'flaky',
                expectedStatus: 'failed',
                retry: 1,
                retries: 2,
                timeout: 30000,
                startTime: '2026-01-02T03:04:05.000Z',
                workerIndex: 3,
                parallelIndex: 2,
            })
        })

        it.each(['skipped', 'expected', 'unexpected', 'flaky'])('accepts outcome %s', (outcome) => {
            expect(metaOf(makeTest({outcome: () => outcome})).outcome).toBe(outcome)
        })

        it('omits an outcome outside the known set', () => {
            expect(metaOf(makeTest({outcome: () => 'weird'})).outcome).toBeUndefined()
        })

        it('passes an already-ISO string startTime through and omits an invalid date', () => {
            expect(
                metaOf(makeTest(), makeResult({startTime: '2026-05-06T07:08:09.000Z'})).startTime
            ).toBe('2026-05-06T07:08:09.000Z')
            expect(
                metaOf(makeTest(), makeResult({startTime: new Date('nope')})).startTime
            ).toBeUndefined()
            expect(metaOf(makeTest(), makeResult({startTime: 12345})).startTime).toBeUndefined()
        })

        it('omits non-finite numbers', () => {
            const meta = metaOf(
                makeTest({timeout: Infinity, retries: 'x'}),
                makeResult({retry: NaN, workerIndex: undefined})
            )

            expect(meta.timeout).toBeUndefined()
            expect(meta.retries).toBeUndefined()
            expect(meta.retry).toBeUndefined()
            expect(meta.workerIndex).toBeUndefined()
        })

        it('does not send a non-string expectedStatus', () => {
            expect(metaOf(makeTest({expectedStatus: 3})).expectedStatus).toBeUndefined()
        })
    })

    describe('robustness (older Playwright / throwing getters)', () => {
        it('an older-API test with none of the new members still posts the basic result', () => {
            const oldTest = {
                title: 'legacy',
                location: {file: '/repo/e2e/legacy.spec.ts', line: 1, column: 1},
            } as unknown as TestCase
            const oldResult = {
                status: 'passed',
                duration: 5,
                attachments: [],
            } as unknown as TestResult

            const body = send(oldTest, oldResult)

            expect(body).toMatchObject({name: 'legacy', status: 'passed', duration: 5})
            expect(body.metadata.tags).toEqual([])
            for (const key of [
                'describe',
                'annotations',
                'errors',
                'outcome',
                'expectedStatus',
                'retry',
                'retries',
                'timeout',
                'startTime',
                'workerIndex',
                'parallelIndex',
            ]) {
                expect(body.metadata[key]).toBeUndefined()
            }
            expect(body.metadata.line).toBe(1)
        })

        it('outcome() being absent or throwing never breaks onTestEnd', () => {
            expect(metaOf(makeTest({outcome: undefined})).outcome).toBeUndefined()

            const meta = metaOf(
                makeTest({
                    outcome: () => {
                        throw new Error('boom')
                    },
                })
            )

            expect(meta.outcome).toBeUndefined()
            expect(meta.line).toBe(12)
        })

        it('a throwing getter omits only that field; the rest is still sent and posted', () => {
            const throwing = () => {
                throw new Error('getter exploded')
            }
            const test = makeTest()
            Object.defineProperty(test, 'annotations', {get: throwing})
            Object.defineProperty(test, 'timeout', {get: throwing})
            Object.defineProperty(test, 'parent', {get: throwing})
            Object.defineProperty(test, 'location', {
                get: () => ({
                    file: '/repo/e2e/login.spec.ts',
                    get line(): number {
                        return throwing()
                    },
                    column: 7,
                }),
            })
            const result = makeResult()
            Object.defineProperty(result, 'errors', {get: throwing})
            Object.defineProperty(result, 'startTime', {get: throwing})

            expect(() => reporter.onTestEnd(test, result)).not.toThrow()

            const call = mockFetch.mock.calls.find(([url]) => String(url).endsWith('/api/tests'))
            const meta = JSON.parse(call![1].body).metadata
            for (const key of [
                'annotations',
                'timeout',
                'describe',
                'line',
                'errors',
                'startTime',
            ]) {
                expect(meta[key]).toBeUndefined()
            }
            expect(meta).toMatchObject({
                column: 7,
                outcome: 'expected',
                expectedStatus: 'passed',
                retries: 2,
                retry: 0,
                workerIndex: 1,
                parallelIndex: 0,
                tags: ['@ABC-123'],
            })
        })

        it('a throwing tags getter falls back to an empty list', () => {
            const test = makeTest()
            Object.defineProperty(test, 'tags', {
                get: () => {
                    throw new Error('no tags')
                },
            })

            expect(metaOf(test).tags).toEqual([])
        })
    })

    describe('worst-case size', () => {
        it('all added fields together stay under 40 KB even with maximal errors and annotations', () => {
            const huge = {message: 'm'.repeat(9000), stack: 's'.repeat(20000)}
            const test = makeTest(
                {
                    annotations: Array.from({length: 40}, (_, i) => ({
                        type: `${i}-${'t'.repeat(400)}`,
                        description: `${i}-${'d'.repeat(2000)}`,
                    })),
                },
                ['Outer', 'Inner']
            )
            const result = makeResult({
                status: 'failed',
                error: huge,
                errors: Array.from({length: 12}, () => huge),
            })

            const {tags: _tags, steps: _steps, console: _console, ...added} = metaOf(test, result)

            expect(added.errors).toHaveLength(5)
            expect(added.annotations).toHaveLength(10)
            // 5 x (2000 + 4000) + 10 x (100 + 300) + overhead; steps/console keep their own caps
            expect(JSON.stringify(added).length).toBeLessThan(40_000)
        })

        it('a typical passing test adds well under 500 bytes', () => {
            const {
                tags: _tags,
                steps: _steps,
                console: _console,
                ...added
            } = metaOf(makeTest({}, ['Auth', 'Login']))

            expect(JSON.stringify(added).length).toBeLessThan(500)
        })
    })
})
