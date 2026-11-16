import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import * as path from 'path'
import YShvydakReporter from '../index'
import type {FullConfig, FullResult, Suite, TestCase, TestResult} from '@playwright/test/reporter'

vi.mock('fs')

const mockFetch = vi.fn()
global.fetch = mockFetch as any

const ok = () => Promise.resolve({ok: true, status: 200, json: async () => ({})})
const failing = (status: number) => Promise.resolve({ok: false, status, text: async () => 'boom'})

// Like fetch: never answers, rejects when aborted
const hang = (_url: string, init: any) =>
    new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')))
    })

const testAt = (title = 'a test'): TestCase =>
    ({
        title,
        location: {file: path.join(process.cwd(), 'a.spec.ts'), line: 1, column: 1},
    }) as unknown as TestCase

const resultOf = (overrides: Record<string, unknown> = {}): TestResult =>
    ({status: 'passed', duration: 1, attachments: [], ...overrides}) as unknown as TestResult

const suiteOf = (count: number) =>
    ({allTests: () => new Array(count).fill(null)}) as unknown as Suite

describe('YShvydakReporter - stop-safe sending', () => {
    let reporter: YShvydakReporter
    let logSpy: ReturnType<typeof vi.spyOn>
    let warnSpy: ReturnType<typeof vi.spyOn>

    const calls = (suffix: string, method?: string) =>
        mockFetch.mock.calls.filter(
            ([url, init]) =>
                (suffix.endsWith('/')
                    ? String(url).includes(suffix)
                    : String(url).endsWith(suffix)) &&
                (method === undefined || init.method === method)
        )
    const bodyOf = (call: any[]) => JSON.parse(call[1].body)
    const logged = () => logSpy.mock.calls.map((call) => String(call[0]))

    beforeEach(() => {
        vi.clearAllMocks()
        mockFetch.mockReset()
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        delete process.env.RUN_ID
        delete process.env.RERUN_ID
        mockFetch.mockImplementation(ok)
    })

    afterEach(() => {
        vi.useRealTimers()
        process.removeAllListeners('SIGINT')
        process.removeAllListeners('SIGTERM')
    })

    describe('interrupted tests', () => {
        it('never posts an interrupted result, even with an error, and logs one line', () => {
            reporter = new YShvydakReporter()
            reporter.onTestEnd(
                testAt('cut by stop'),
                resultOf({
                    status: 'interrupted',
                    error: {message: 'page.click: Test ended.', stack: 'Error: Test ended.'},
                    errors: [{message: 'page.click: Test ended.'}],
                })
            )

            expect(calls('/api/tests', 'POST')).toHaveLength(0)
            expect(
                logged().filter((line) => line.includes('Interrupted: cut by stop'))
            ).toHaveLength(1)
        })

        it('counts it as interrupted in the summary, not failed, and still ends the run as failed', async () => {
            reporter = new YShvydakReporter()
            reporter.onBegin({} as FullConfig, suiteOf(3))
            reporter.onTestEnd(testAt('done'), resultOf({status: 'passed'}))
            reporter.onTestEnd(testAt('cut'), resultOf({status: 'interrupted'}))
            await reporter.onEnd({status: 'interrupted'} as FullResult)

            const [put] = calls('/api/runs/', 'PUT')
            expect(bodyOf(put)).toMatchObject({
                status: 'failed',
                totalTests: 1,
                passedTests: 1,
                failedTests: 0,
            })
            const [end] = calls('/api/tests/process-end', 'POST')
            expect(bodyOf(end)).toMatchObject({
                status: 'failed',
                results: {passed: 1, failed: 0},
            })
            expect(logged()).toContainEqual(expect.stringContaining('Interrupted: 1'))
        })

        it('does not print an interrupted line when nothing was interrupted', async () => {
            reporter = new YShvydakReporter()
            reporter.onBegin({} as FullConfig, suiteOf(1))
            reporter.onTestEnd(testAt(), resultOf())
            await reporter.onEnd({status: 'passed'} as FullResult)

            expect(logged().some((line) => line.includes('Interrupted:'))).toBe(false)
        })
    })

    describe('metadata.rawStatus', () => {
        it.each(['passed', 'failed', 'timedOut', 'skipped'])(
            'sends the Playwright status %s',
            (status) => {
                reporter = new YShvydakReporter()
                reporter.onTestEnd(testAt(), resultOf({status}))

                const [post] = calls('/api/tests', 'POST')
                expect(bodyOf(post).metadata.rawStatus).toBe(status)
            }
        )
    })

    describe('awaiting in-flight sends', () => {
        it('holds the run PUT and process-end until every result POST has settled', async () => {
            let release: () => void = () => {}
            mockFetch.mockImplementation((url: string) =>
                String(url).endsWith('/api/tests')
                    ? new Promise((resolve) => {
                          release = () => resolve({ok: true, status: 200})
                      })
                    : ok()
            )
            reporter = new YShvydakReporter()
            reporter.onBegin({} as FullConfig, suiteOf(1))
            reporter.onTestEnd(testAt(), resultOf())

            let ended = false
            const done = reporter.onEnd({status: 'passed'} as FullResult).then(() => {
                ended = true
            })
            await new Promise((resolve) => setTimeout(resolve, 1200))

            expect(calls('/api/runs/', 'PUT')).toHaveLength(0)
            expect(calls('/api/tests/process-end')).toHaveLength(0)
            expect(ended).toBe(false)

            release()
            await done

            const order = mockFetch.mock.calls.map(([url]) => String(url))
            const post = order.findIndex((url) => url.endsWith('/api/tests'))
            const put = order.findIndex((url) => url.includes('/api/runs/'))
            const end = order.findIndex((url) => url.endsWith('/process-end'))
            expect(post).toBeLessThan(put)
            expect(put).toBeLessThan(end)
        })

        it('stops waiting after the cap so a hung dashboard cannot block Playwright', async () => {
            vi.useFakeTimers()
            mockFetch.mockImplementation((url: string) =>
                String(url).endsWith('/api/tests') ? new Promise(() => {}) : ok()
            )
            reporter = new YShvydakReporter()
            reporter.onBegin({} as FullConfig, suiteOf(1))
            reporter.onTestEnd(testAt(), resultOf())

            let ended = false
            const done = reporter.onEnd({status: 'passed'} as FullResult).then(() => {
                ended = true
            })
            await vi.advanceTimersByTimeAsync(7000)
            expect(ended).toBe(false)

            await vi.advanceTimersByTimeAsync(2000)
            await done

            expect(calls('/api/runs/', 'PUT')).toHaveLength(1)
            expect(calls('/api/tests/process-end', 'POST')).toHaveLength(1)
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('still being sent'))
        })
    })

    describe('retries and timeout', () => {
        it('retries a 5xx twice and succeeds without a warning', async () => {
            vi.useFakeTimers()
            mockFetch.mockReturnValueOnce(failing(503)).mockReturnValueOnce(failing(500))
            reporter = new YShvydakReporter()
            reporter.onTestEnd(testAt(), resultOf())
            await vi.advanceTimersByTimeAsync(3000)

            expect(calls('/api/tests', 'POST')).toHaveLength(3)
            expect(warnSpy).not.toHaveBeenCalled()
        })

        it('retries a network error', async () => {
            vi.useFakeTimers()
            mockFetch.mockRejectedValueOnce(new Error('ECONNRESET'))
            reporter = new YShvydakReporter()
            reporter.onTestEnd(testAt(), resultOf())
            await vi.advanceTimersByTimeAsync(3000)

            expect(calls('/api/tests', 'POST')).toHaveLength(2)
            expect(warnSpy).not.toHaveBeenCalled()
        })

        it('gives up after three tries on a persistent 5xx and warns once', async () => {
            vi.useFakeTimers()
            mockFetch.mockImplementation(() => failing(502))
            reporter = new YShvydakReporter()
            reporter.onTestEnd(testAt(), resultOf())
            await vi.advanceTimersByTimeAsync(3000)

            expect(calls('/api/tests', 'POST')).toHaveLength(3)
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to send test result')
            )
        })

        it('does not retry a 4xx', async () => {
            vi.useFakeTimers()
            mockFetch.mockImplementation(() => failing(400))
            reporter = new YShvydakReporter()
            reporter.onTestEnd(testAt(), resultOf())
            await vi.advanceTimersByTimeAsync(3000)

            expect(calls('/api/tests', 'POST')).toHaveLength(1)
        })

        it('retries the run PUT and process-end the same way', async () => {
            vi.useFakeTimers()
            mockFetch.mockImplementation((url: string, init: any) =>
                init.method === 'PUT' || String(url).endsWith('/process-end') ? failing(500) : ok()
            )
            reporter = new YShvydakReporter()
            reporter.onBegin({} as FullConfig, suiteOf(0))
            const done = reporter.onEnd({status: 'passed'} as FullResult)
            await vi.advanceTimersByTimeAsync(10_000)
            await done

            expect(calls('/api/runs/', 'PUT')).toHaveLength(3)
            expect(calls('/api/tests/process-end', 'POST')).toHaveLength(3)
        })

        it('aborts a hung result POST after its 25 s timeout and retries it', async () => {
            vi.useFakeTimers()
            const signals: AbortSignal[] = []
            mockFetch.mockImplementationOnce(
                (_url: string, init: any) =>
                    new Promise((_resolve, reject) => {
                        signals.push(init.signal)
                        init.signal.addEventListener('abort', () => reject(new Error('aborted')))
                    })
            )
            reporter = new YShvydakReporter()
            reporter.onTestEnd(testAt(), resultOf())

            await vi.advanceTimersByTimeAsync(24_900)
            expect(signals[0].aborted).toBe(false)
            await vi.advanceTimersByTimeAsync(200)
            expect(signals[0].aborted).toBe(true)

            await vi.advanceTimersByTimeAsync(1000)
            expect(calls('/api/tests', 'POST')).toHaveLength(2)
            expect(warnSpy).not.toHaveBeenCalled()
        })
    })

    describe('end-of-run deadline', () => {
        it('after a stop, with a dashboard that never answers, ends within 15 s and sends PUT and process-end once', async () => {
            vi.useFakeTimers()
            mockFetch.mockImplementation(hang)
            reporter = new YShvydakReporter()
            reporter.onBegin({} as FullConfig, suiteOf(1))
            reporter.onTestEnd(testAt(), resultOf())

            const started = Date.now()
            let endedAt = Infinity
            const done = reporter.onEnd({status: 'interrupted'} as FullResult).then(() => {
                endedAt = Date.now()
            })
            await vi.advanceTimersByTimeAsync(20_000)
            await done

            expect(endedAt - started).toBeLessThanOrEqual(15_000)
            expect(calls('/api/runs/', 'PUT')).toHaveLength(1)
            expect(calls('/api/tests/process-end', 'POST')).toHaveLength(1)
        })

        it('also bounds a normal end with a dashboard that never answers', async () => {
            vi.useFakeTimers()
            mockFetch.mockImplementation(hang)
            reporter = new YShvydakReporter()
            reporter.onBegin({} as FullConfig, suiteOf(1))
            reporter.onTestEnd(testAt(), resultOf())

            const started = Date.now()
            let endedAt = Infinity
            const done = reporter.onEnd({status: 'passed'} as FullResult).then(() => {
                endedAt = Date.now()
            })
            await vi.advanceTimersByTimeAsync(20_000)
            await done

            expect(endedAt - started).toBeLessThanOrEqual(15_000)
        })

        it('counts the 15 s from the stop signal, not from onEnd', async () => {
            vi.useFakeTimers()
            mockFetch.mockImplementation(hang)
            reporter = new YShvydakReporter()
            reporter.onBegin({} as FullConfig, suiteOf(1))
            reporter.onTestEnd(testAt(), resultOf())

            const signalledAt = Date.now()
            ;(process.listeners('SIGINT').pop() as () => void)()
            await vi.advanceTimersByTimeAsync(10_000)

            let endedAt = Infinity
            const done = reporter.onEnd({status: 'interrupted'} as FullResult).then(() => {
                endedAt = Date.now()
            })
            await vi.advanceTimersByTimeAsync(20_000)
            await done

            expect(endedAt - signalledAt).toBeLessThanOrEqual(15_000)
        })

        it('sends the run PUT once after a stop signal, even on a 5xx', async () => {
            vi.useFakeTimers()
            mockFetch.mockImplementation((url: string, init: any) =>
                init.method === 'PUT' ? failing(500) : ok()
            )
            reporter = new YShvydakReporter()
            ;(process.listeners('SIGINT').pop() as () => void)()
            await vi.advanceTimersByTimeAsync(10)
            const done = reporter.onEnd({status: 'failed'} as FullResult)
            await vi.advanceTimersByTimeAsync(5000)
            await done

            expect(calls('/api/runs/', 'PUT')).toHaveLength(1)
        })

        it('keeps retrying the run PUT on a normal end', async () => {
            vi.useFakeTimers()
            mockFetch.mockImplementation((url: string, init: any) =>
                init.method === 'PUT' ? failing(500) : ok()
            )
            reporter = new YShvydakReporter()
            const done = reporter.onEnd({status: 'failed'} as FullResult)
            await vi.advanceTimersByTimeAsync(5000)
            await done

            expect(calls('/api/runs/', 'PUT')).toHaveLength(3)
        })
    })

    describe('backoff and counts', () => {
        it('pauses 250 ms before the first retry and 750 ms before the second', async () => {
            vi.useFakeTimers()
            const times: number[] = []
            mockFetch.mockImplementation(() => {
                times.push(Date.now())
                return failing(503)
            })
            reporter = new YShvydakReporter()
            reporter.onTestEnd(testAt(), resultOf())
            await vi.advanceTimersByTimeAsync(3000)

            expect(times.map((t) => t - times[0])).toEqual([0, 250, 1000])
        })

        it('counts a timedOut test as failed in the summary, the run PUT and process-end', async () => {
            reporter = new YShvydakReporter()
            reporter.onBegin({} as FullConfig, suiteOf(2))
            reporter.onTestEnd(testAt('ok'), resultOf())
            reporter.onTestEnd(testAt('slow'), resultOf({status: 'timedOut'}))
            await reporter.onEnd({status: 'failed'} as FullResult)

            expect(bodyOf(calls('/api/runs/', 'PUT')[0])).toMatchObject({
                totalTests: 2,
                passedTests: 1,
                failedTests: 1,
            })
            expect(bodyOf(calls('/api/tests/process-end', 'POST')[0]).results).toMatchObject({
                passed: 1,
                failed: 1,
            })
            expect(logged()).toContainEqual(expect.stringContaining('Failed: 1'))
        })
    })

    describe('process listeners', () => {
        it('adds SIGINT/SIGTERM handlers but no uncaughtException/unhandledRejection ones', () => {
            const before = {
                uncaught: process.listenerCount('uncaughtException'),
                rejection: process.listenerCount('unhandledRejection'),
                sigint: process.listenerCount('SIGINT'),
                sigterm: process.listenerCount('SIGTERM'),
            }
            reporter = new YShvydakReporter()

            expect(process.listenerCount('uncaughtException')).toBe(before.uncaught)
            expect(process.listenerCount('unhandledRejection')).toBe(before.rejection)
            expect(process.listenerCount('SIGINT')).toBe(before.sigint + 1)
            expect(process.listenerCount('SIGTERM')).toBe(before.sigterm + 1)
        })
    })
})
