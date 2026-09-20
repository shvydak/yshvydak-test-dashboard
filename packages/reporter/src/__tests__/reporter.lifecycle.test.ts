import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import * as path from 'path'
import YShvydakReporter from '../index'
import type {TestCase, TestResult} from '@playwright/test/reporter'

vi.mock('fs')

const mockFetch = vi.fn()
global.fetch = mockFetch as any

const testAt = (relativeFile: string, title = 'a test'): TestCase =>
    ({
        title,
        location: {file: path.join(process.cwd(), relativeFile), line: 1, column: 1},
    }) as unknown as TestCase

const resultOf = (overrides: Record<string, unknown> = {}): TestResult =>
    ({status: 'passed', duration: 1, attachments: [], ...overrides}) as unknown as TestResult

describe('YShvydakReporter - lifecycle details', () => {
    let reporter: YShvydakReporter
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        vi.spyOn(console, 'log').mockImplementation(() => {})
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
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

    const posted = (suffix: string) =>
        mockFetch.mock.calls.filter(([url]) => String(url).endsWith(suffix))

    describe('onTestBegin', () => {
        it('notifies the dashboard with runId, testId, name and normalised file path', () => {
            reporter.onTestBegin(testAt('e2e/tests/login.spec.ts', 'logs in'))

            const [[, init]] = posted('/api/tests/test-start')
            expect(JSON.parse(init.body)).toMatchObject({
                name: 'logs in',
                filePath: 'login.spec.ts',
                testId: expect.stringMatching(/^test-/),
                runId: expect.any(String),
            })
        })

        it('never throws when the notification is rejected or the API is down', async () => {
            mockFetch.mockResolvedValueOnce({ok: false, status: 500, text: async () => 'boom'})
            expect(() => reporter.onTestBegin(testAt('a.spec.ts'))).not.toThrow()
            await new Promise((resolve) => setTimeout(resolve, 5))
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to notify test start')
            )

            mockFetch.mockRejectedValueOnce(new Error('offline'))
            expect(() => reporter.onTestBegin(testAt('a.spec.ts'))).not.toThrow()
            await new Promise((resolve) => setTimeout(resolve, 5))
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Test start notification failed')
            )
        })
    })

    describe('file path normalisation', () => {
        it.each([
            ['e2e/tests/a.spec.ts', 'a.spec.ts'],
            ['tests/a.spec.ts', 'a.spec.ts'],
            ['e2e/a.spec.ts', 'a.spec.ts'],
            ['src/a.spec.ts', 'src/a.spec.ts'],
        ])('%s -> %s', (relative, expected) => {
            reporter.onTestEnd(testAt(relative), resultOf())

            const [[, init]] = posted('/api/tests')
            expect(JSON.parse(init.body).filePath).toBe(expected)
        })
    })

    describe('steps and status mapping', () => {
        it('sends Playwright steps in metadata.steps, and none when there are no steps', () => {
            reporter.onTestEnd(
                testAt('a.spec.ts'),
                resultOf({
                    steps: [
                        {title: 'open', category: 'test.step', duration: 5, startTime: new Date(0)},
                        {
                            title: 'click',
                            category: 'pw:api',
                            duration: 2,
                            startTime: new Date(0),
                            error: {message: 'not found'},
                        },
                    ],
                })
            )
            reporter.onTestEnd(testAt('b.spec.ts'), resultOf({steps: []}))

            const [[, withSteps], [, withoutSteps]] = posted('/api/tests')
            const steps = JSON.parse(withSteps.body).metadata.steps
            expect(steps.map((s: any) => s.title)).toEqual(['open', 'click'])
            expect(steps[1].error).toBe('not found')
            expect(JSON.parse(withoutSteps.body).metadata.steps).toBeUndefined()
        })

        it.each([
            ['timedOut', 'timedOut'],
            ['interrupted', 'failed'],
            ['skipped', 'skipped'],
        ])('maps Playwright status %s to %s', (playwrightStatus, expected) => {
            reporter.onTestEnd(testAt('a.spec.ts'), resultOf({status: playwrightStatus}))

            const [[, init]] = posted('/api/tests')
            expect(JSON.parse(init.body).status).toBe(expected)
        })
    })

    describe('console capture caps', () => {
        it('keeps the last 500 lines and flags truncation', () => {
            const test = testAt('a.spec.ts')
            const result = resultOf()
            for (let i = 0; i < 650; i++) reporter.onStdOut(`line ${i}\n`, test, result)

            reporter.onTestEnd(test, result)

            const [[, init]] = posted('/api/tests')
            const consoleData = JSON.parse(init.body).metadata.console
            expect(consoleData.entries).toHaveLength(500)
            expect(consoleData.entries[499].text).toBe('line 649\n')
            expect(consoleData.truncated).toBe(true)
        })

        it('drops the oldest entries once total size exceeds 200k chars', () => {
            const test = testAt('a.spec.ts')
            const result = resultOf()
            for (let i = 0; i < 6; i++) reporter.onStdErr(`${'x'.repeat(50_000)}\n`, test, result)

            reporter.onTestEnd(test, result)

            const [[, init]] = posted('/api/tests')
            const consoleData = JSON.parse(init.body).metadata.console
            const total = consoleData.entries.reduce((n: number, e: any) => n + e.text.length, 0)
            expect(total).toBeLessThanOrEqual(200_000)
            expect(consoleData.truncated).toBe(true)
        })

        it('ignores global output that has no TestResult', () => {
            reporter.onStdOut('global noise\n')
            reporter.onTestEnd(testAt('a.spec.ts'), resultOf())

            const [[, init]] = posted('/api/tests')
            expect(JSON.parse(init.body).metadata.console).toBeUndefined()
        })
    })
})
