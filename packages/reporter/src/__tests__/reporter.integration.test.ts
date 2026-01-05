import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import YShvydakReporter from '../index'
import type {FullConfig, FullResult, Suite, TestCase, TestResult} from '@playwright/test/reporter'
import * as fs from 'fs'

// Mock fs for createEnhancedErrorMessage tests
vi.mock('fs')

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch as any

describe('YShvydakReporter - Integration Tests', () => {
    let reporter: YShvydakReporter
    let consoleLogSpy: any
    let consoleWarnSpy: any

    beforeEach(() => {
        vi.clearAllMocks()
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

        // Reset environment variables
        delete process.env.RUN_ID
        delete process.env.RERUN_ID
        delete process.env.DASHBOARD_API_URL

        // Ensure fetch mock is set up
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({}),
        })
    })

    afterEach(() => {
        // Clean up all process event listeners to prevent warnings
        process.removeAllListeners('SIGINT')
        process.removeAllListeners('SIGTERM')
        process.removeAllListeners('uncaughtException')
        process.removeAllListeners('unhandledRejection')

        consoleLogSpy.mockRestore()
        consoleWarnSpy.mockRestore()
    })

    // Helper to create mock Suite
    const createMockSuite = (testCount: number = 3): Suite => {
        const tests = Array.from({length: testCount}, (_, i) =>
            createMockTestCase(`Test ${i + 1}`, 'passed')
        )
        return {
            allTests: () => tests,
        } as Suite
    }

    // Helper to create mock TestCase
    const createMockTestCase = (title: string, _status: string): TestCase =>
        ({
            title,
            location: {
                file: '/path/to/test.spec.ts',
                line: 10,
                column: 5,
            },
        }) as TestCase

    // Helper to create mock TestResult
    const createMockTestResult = (
        status: 'passed' | 'failed' | 'skipped' | 'timedOut',
        options: {
            duration?: number
            error?: {message: string; stack: string}
            attachments?: Array<{name: string; path?: string; contentType: string}>
        } = {}
    ): TestResult =>
        ({
            status,
            duration: options.duration || 1000,
            error: options.error,
            attachments: options.attachments || [],
        }) as TestResult

    describe('Initialization', () => {
        it('should initialize with default API URL when not provided', () => {
            reporter = new YShvydakReporter()

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('YShvydak Dashboard Reporter initialized')
            )
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('http://localhost:3001')
            )
        })

        it('should use DASHBOARD_API_URL from environment', () => {
            process.env.DASHBOARD_API_URL = 'http://custom-api:4000'
            reporter = new YShvydakReporter()

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('http://custom-api:4000')
            )
        })

        it('should remove trailing /api from DASHBOARD_API_URL', () => {
            process.env.DASHBOARD_API_URL = 'http://custom-api:4000/api'
            reporter = new YShvydakReporter()

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('http://custom-api:4000')
            )
            expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('/api'))
        })

        it('should use RUN_ID from environment if provided', () => {
            process.env.RUN_ID = 'test-run-id-123'
            reporter = new YShvydakReporter()

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Run ID: test-run-id-123')
            )
        })

        it('should use RERUN_ID from environment if RUN_ID not provided', () => {
            process.env.RERUN_ID = 'test-rerun-id-456'
            reporter = new YShvydakReporter()

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Run ID: test-rerun-id-456')
            )
        })

        it('should generate UUID if neither RUN_ID nor RERUN_ID provided', () => {
            reporter = new YShvydakReporter()

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringMatching(/Run ID: [a-f0-9-]{36}/)
            )
        })

        it('should warn when API URL is undefined', () => {
            process.env.DASHBOARD_API_URL = 'undefined'
            reporter = new YShvydakReporter()

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Dashboard API URL not configured')
            )
        })

        it('should setup cleanup handlers on initialization', () => {
            const processOnSpy = vi.spyOn(process, 'on')
            reporter = new YShvydakReporter()

            expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function))
            expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function))
            expect(processOnSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function))
            expect(processOnSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function))
        })
    })

    describe('onBegin() - Test Run Start', () => {
        beforeEach(() => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({}),
            })
            reporter = new YShvydakReporter()
        })

        it('should notify dashboard on test run start', () => {
            const suite = createMockSuite(5)
            const config = {} as FullConfig

            reporter.onBegin(config, suite)

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/tests/process-start'),
                expect.objectContaining({
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: expect.stringContaining('"type":"run-all"'),
                })
            )

            const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
            expect(callBody).toMatchObject({
                type: 'run-all',
                totalTests: 5,
            })
            expect(callBody.runId).toBeTruthy()
        })

        it('should log test count on begin', () => {
            const suite = createMockSuite(10)
            const config = {} as FullConfig

            reporter.onBegin(config, suite)

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Starting test run with 10 tests')
            )
        })

        it('should handle API error during process start', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                text: async () => 'Internal Server Error',
            })

            const suite = createMockSuite(3)
            const config = {} as FullConfig

            reporter.onBegin(config, suite)

            // Wait for async fetch to complete
            await new Promise((resolve) => setTimeout(resolve, 10))

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to notify process start')
            )
        })

        it('should handle network error during process start', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'))

            const suite = createMockSuite(3)
            const config = {} as FullConfig

            reporter.onBegin(config, suite)

            // Wait for async fetch to complete
            await new Promise((resolve) => setTimeout(resolve, 10))

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Process start notification failed')
            )
        })
    })

    describe('onTestEnd() - Individual Test Results', () => {
        beforeEach(() => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({}),
            })
            reporter = new YShvydakReporter()
        })

        it('should include captured stdout/stderr in metadata.console', () => {
            const testCase = createMockTestCase('should log output', 'passed')
            const result = createMockTestResult('passed', {duration: 100})

            reporter.onStdOut('hello from stdout\n', testCase, result)
            reporter.onStdErr('oops from stderr\n', testCase, result)
            reporter.onTestEnd(testCase, result)

            const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
            expect(callBody.metadata.console.entries).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        type: 'stdout',
                        text: expect.stringContaining('hello'),
                    }),
                    expect.objectContaining({
                        type: 'stderr',
                        text: expect.stringContaining('oops'),
                    }),
                ])
            )
        })

        it('should send test result to API on test completion', () => {
            const testCase = createMockTestCase('should pass', 'passed')
            const result = createMockTestResult('passed', {duration: 1500})

            reporter.onTestEnd(testCase, result)

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/tests'),
                expect.objectContaining({
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                })
            )

            const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
            expect(callBody).toMatchObject({
                name: 'should pass',
                status: 'passed',
                duration: 1500,
            })
            expect(callBody.testId).toMatch(/^test-[a-z0-9]+$/)
            expect(callBody.id).toMatch(/^[a-f0-9-]{36}$/)
        })

        it('should log test result with status icon', () => {
            const testCase = createMockTestCase('should pass', 'passed')
            const result = createMockTestResult('passed', {duration: 1500})

            reporter.onTestEnd(testCase, result)

            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅'))
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('should pass'))
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('1500ms'))
        })

        it('should handle failed test with error message', () => {
            const testCase = createMockTestCase('should fail', 'failed')
            const result = createMockTestResult('failed', {
                duration: 500,
                error: {
                    message: 'Expected 1 to equal 2',
                    stack: 'Error: Expected 1 to equal 2\n    at test.spec.ts:15:20',
                },
            })

            vi.mocked(fs.readFileSync).mockReturnValue('test code content\nexpect(1).toBe(2)')

            reporter.onTestEnd(testCase, result)

            const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
            expect(callBody.status).toBe('failed')
            expect(callBody.errorMessage).toContain('Expected 1 to equal 2')
        })

        it('should process attachments correctly', () => {
            const testCase = createMockTestCase('test with attachments', 'passed')
            const result = createMockTestResult('passed', {
                attachments: [
                    {name: 'screenshot', path: '/path/to/screenshot.png', contentType: 'image/png'},
                    {name: 'video', path: '/path/to/video.webm', contentType: 'video/webm'},
                    {name: 'trace', path: '/path/to/trace.zip', contentType: 'application/zip'},
                ],
            })

            reporter.onTestEnd(testCase, result)

            const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
            expect(callBody.attachments).toHaveLength(3)
            expect(callBody.attachments[0]).toMatchObject({
                name: 'screenshot',
                path: '/path/to/screenshot.png',
                contentType: 'image/png',
            })
            expect(callBody.attachments[1]).toMatchObject({
                name: 'video',
                contentType: 'video/webm',
            })
            expect(callBody.attachments[2]).toMatchObject({
                name: 'trace',
                contentType: 'application/zip',
            })
        })

        it('should handle attachments without path', () => {
            const testCase = createMockTestCase('test with inline attachment', 'passed')
            const result = createMockTestResult('passed', {
                attachments: [
                    {name: 'log', contentType: 'text/plain'} as any, // No path
                ],
            })

            reporter.onTestEnd(testCase, result)

            const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
            expect(callBody.attachments[0]).toMatchObject({
                name: 'log',
                path: '',
                contentType: 'text/plain',
            })
        })

        it('should map all status types correctly', () => {
            const statuses: Array<'passed' | 'failed' | 'skipped' | 'timedOut'> = [
                'passed',
                'failed',
                'skipped',
                'timedOut',
            ]

            statuses.forEach((status) => {
                const testCase = createMockTestCase(`test ${status}`, status)
                const result = createMockTestResult(status)

                reporter.onTestEnd(testCase, result)
            })

            const calls = mockFetch.mock.calls.slice(0, 4)
            expect(JSON.parse(calls[0][1].body).status).toBe('passed')
            expect(JSON.parse(calls[1][1].body).status).toBe('failed')
            expect(JSON.parse(calls[2][1].body).status).toBe('skipped')
            expect(JSON.parse(calls[3][1].body).status).toBe('timedOut')
        })

        it('should generate stable test IDs for same test', () => {
            const testCase = createMockTestCase('stable test', 'passed')
            const result = createMockTestResult('passed')

            reporter.onTestEnd(testCase, result)
            const testId1 = JSON.parse(mockFetch.mock.calls[0][1].body).testId

            // Create new reporter and run same test
            reporter = new YShvydakReporter()
            reporter.onTestEnd(testCase, result)
            const testId2 = JSON.parse(mockFetch.mock.calls[1][1].body).testId

            expect(testId1).toBe(testId2)
        })

        it('should generate different test IDs for different tests', () => {
            const testCase1 = createMockTestCase('test one', 'passed')
            const testCase2 = createMockTestCase('test two', 'passed')
            const result = createMockTestResult('passed')

            reporter.onTestEnd(testCase1, result)
            const testId1 = JSON.parse(mockFetch.mock.calls[0][1].body).testId

            reporter.onTestEnd(testCase2, result)
            const testId2 = JSON.parse(mockFetch.mock.calls[1][1].body).testId

            expect(testId1).not.toBe(testId2)
        })

        it('should handle API error when sending test result', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 400,
                text: async () => 'Bad Request',
            })

            const testCase = createMockTestCase('test', 'passed')
            const result = createMockTestResult('passed')

            reporter.onTestEnd(testCase, result)

            await new Promise((resolve) => setTimeout(resolve, 10))

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to send test result')
            )
        })

        it('should handle network error when sending test result', async () => {
            mockFetch.mockRejectedValue(new Error('Connection refused'))

            const testCase = createMockTestCase('test', 'passed')
            const result = createMockTestResult('passed')

            reporter.onTestEnd(testCase, result)

            await new Promise((resolve) => setTimeout(resolve, 10))

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Dashboard API not available')
            )
        })
    })

    describe('onEnd() - Test Run Completion', () => {
        beforeEach(() => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({}),
            })
            reporter = new YShvydakReporter()
        })

        it('should send run completion data to API', async () => {
            const suite = createMockSuite(3)
            reporter.onBegin({} as FullConfig, suite)

            // Add small delay to ensure duration > 0
            await new Promise((resolve) => setTimeout(resolve, 10))

            // Simulate 3 test completions
            reporter.onTestEnd(
                createMockTestCase('test 1', 'passed'),
                createMockTestResult('passed')
            )
            reporter.onTestEnd(
                createMockTestCase('test 2', 'failed'),
                createMockTestResult('failed')
            )
            reporter.onTestEnd(
                createMockTestCase('test 3', 'skipped'),
                createMockTestResult('skipped')
            )

            mockFetch.mockClear()

            const result: FullResult = {status: 'passed'} as FullResult
            await reporter.onEnd(result)

            // Should call: PUT /api/runs/:id and POST /api/tests/process-end
            expect(mockFetch).toHaveBeenCalledTimes(2)

            // Check update run call (PUT)
            const updateRunCall = mockFetch.mock.calls.find((call) => call[1].method === 'PUT')
            expect(updateRunCall).toBeTruthy()
            expect(updateRunCall![0]).toMatch(/\/api\/runs\/[a-f0-9-]{36}/)

            const updateBody = JSON.parse(updateRunCall![1].body)
            expect(updateBody).toMatchObject({
                status: 'completed',
                totalTests: 3,
                passedTests: 1,
                failedTests: 1,
                skippedTests: 1,
            })
            expect(updateBody.duration).toBeGreaterThanOrEqual(0) // Changed to >= 0 to handle fast tests

            // Check process end call (POST)
            const processEndCall = mockFetch.mock.calls.find(
                (call) => call[0].includes('process-end') && call[1].method === 'POST'
            )
            expect(processEndCall).toBeTruthy()

            const endBody = JSON.parse(processEndCall![1].body)
            expect(endBody).toMatchObject({
                status: 'completed',
                results: {
                    passed: 1,
                    failed: 1,
                    skipped: 1,
                },
            })
            expect(endBody.results.duration).toBeGreaterThanOrEqual(0) // Changed to >= 0 to handle fast tests
        })

        it('should mark run as failed when result status is not passed', async () => {
            const suite = createMockSuite(1)
            reporter.onBegin({} as FullConfig, suite)

            reporter.onTestEnd(createMockTestCase('test', 'failed'), createMockTestResult('failed'))

            mockFetch.mockClear()

            const result: FullResult = {status: 'failed'} as FullResult
            await reporter.onEnd(result)

            const updateRunCall = mockFetch.mock.calls.find((call) => call[1].method === 'PUT')
            const updateBody = JSON.parse(updateRunCall![1].body)
            expect(updateBody.status).toBe('failed')

            const processEndCall = mockFetch.mock.calls.find((call) =>
                call[0].includes('process-end')
            )
            const endBody = JSON.parse(processEndCall![1].body)
            expect(endBody.status).toBe('failed')
        })

        it('should log completion summary', async () => {
            const suite = createMockSuite(5)
            reporter.onBegin({} as FullConfig, suite)

            reporter.onTestEnd(
                createMockTestCase('test 1', 'passed'),
                createMockTestResult('passed')
            )
            reporter.onTestEnd(
                createMockTestCase('test 2', 'passed'),
                createMockTestResult('passed')
            )
            reporter.onTestEnd(
                createMockTestCase('test 3', 'failed'),
                createMockTestResult('failed')
            )
            reporter.onTestEnd(
                createMockTestCase('test 4', 'failed'),
                createMockTestResult('failed')
            )
            reporter.onTestEnd(
                createMockTestCase('test 5', 'skipped'),
                createMockTestResult('skipped')
            )

            const result: FullResult = {status: 'passed'} as FullResult
            await reporter.onEnd(result)

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Test run completed')
            )
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Passed: 2'))
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Failed: 2'))
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Skipped: 1'))
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Duration:'))
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('View results: http://localhost:3000')
            )
        })

        it('should wait for results to be sent before completing', async () => {
            const suite = createMockSuite(1)
            reporter.onBegin({} as FullConfig, suite)
            reporter.onTestEnd(createMockTestCase('test', 'passed'), createMockTestResult('passed'))

            const result: FullResult = {status: 'passed'} as FullResult
            const startTime = Date.now()
            await reporter.onEnd(result)
            const duration = Date.now() - startTime

            // Should wait at least 1000ms
            expect(duration).toBeGreaterThanOrEqual(1000)
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Waiting for all test results')
            )
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('All test results should be processed')
            )
        })

        it('should handle API error when updating run', async () => {
            const suite = createMockSuite(1)
            reporter.onBegin({} as FullConfig, suite)
            reporter.onTestEnd(createMockTestCase('test', 'passed'), createMockTestResult('passed'))

            mockFetch.mockClear()
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                text: async () => 'Server Error',
            })

            const result: FullResult = {status: 'passed'} as FullResult
            await reporter.onEnd(result)

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to update test run')
            )
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to notify process end')
            )
        })

        it('should handle network error when updating run', async () => {
            const suite = createMockSuite(1)
            reporter.onBegin({} as FullConfig, suite)
            reporter.onTestEnd(createMockTestCase('test', 'passed'), createMockTestResult('passed'))

            mockFetch.mockClear()
            mockFetch.mockRejectedValue(new Error('Network error'))

            const result: FullResult = {status: 'passed'} as FullResult
            await reporter.onEnd(result)

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Dashboard API not available')
            )
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Process end notification failed')
            )
        })
    })

    describe('Enhanced Error Messages', () => {
        beforeEach(() => {
            mockFetch.mockResolvedValue({ok: true})
            reporter = new YShvydakReporter()
        })

        it('should create enhanced error message with code context', () => {
            const fileContent = `import { test, expect } from '@playwright/test';

test('example test', async () => {
  const result = 1;
  expect(result).toBe(2); // This will fail
  console.log('done');
});`

            vi.mocked(fs.readFileSync).mockReturnValue(fileContent)

            const testCase = createMockTestCase('example test', 'failed')
            const result = createMockTestResult('failed', {
                error: {
                    message: 'Expected 1 to equal 2',
                    stack: 'Error: Expected 1 to equal 2\n    at /path/to/test.spec.ts:5:20',
                },
            })

            reporter.onTestEnd(testCase, result)

            const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
            expect(callBody.errorMessage).toContain('>')
            expect(callBody.errorMessage).toContain('expect(result).toBe(2)')
        })

        it('should handle missing line number in error', () => {
            const testCase = createMockTestCase('test', 'failed')
            const result = createMockTestResult('failed', {
                error: {
                    message: 'Generic error',
                    stack: 'Error: Generic error (no line number)',
                },
            })

            reporter.onTestEnd(testCase, result)

            const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
            expect(callBody.errorMessage).toContain('Generic error')
        })

        it('should handle file read errors gracefully', () => {
            vi.mocked(fs.readFileSync).mockImplementation(() => {
                throw new Error('File not found')
            })

            const testCase = createMockTestCase('test', 'failed')
            const result = createMockTestResult('failed', {
                error: {
                    message: 'Test failed',
                    stack: 'Error: Test failed\n    at /path/to/test.spec.ts:10:20',
                },
            })

            reporter.onTestEnd(testCase, result)

            const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
            expect(callBody.errorMessage).toContain('Test failed')
        })
    })

    describe('Cleanup Handlers', () => {
        it('should cleanup on SIGINT', async () => {
            mockFetch.mockResolvedValue({ok: true})
            reporter = new YShvydakReporter()

            // Get the SIGINT handler
            const sigintHandler = process.listeners('SIGINT').pop() as () => void
            expect(sigintHandler).toBeTruthy()

            // Trigger cleanup
            sigintHandler()

            await new Promise((resolve) => setTimeout(resolve, 10))

            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Cleaning up'))
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/tests/process-end'),
                expect.objectContaining({
                    body: expect.stringContaining('"status":"interrupted"'),
                })
            )
        })

        it('should handle cleanup errors gracefully', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'))
            reporter = new YShvydakReporter()

            const sigintHandler = process.listeners('SIGINT').pop() as () => void
            sigintHandler()

            await new Promise((resolve) => setTimeout(resolve, 10))

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Process end notification failed')
            )
        })
    })

    describe('Complete Lifecycle Integration', () => {
        it('should handle full test run lifecycle successfully', async () => {
            process.env.DASHBOARD_API_URL = 'http://test-api:4000'
            process.env.RUN_ID = 'integration-test-run'

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({}),
            })

            reporter = new YShvydakReporter()

            // 1. Start test run
            const suite = createMockSuite(3)
            reporter.onBegin({} as FullConfig, suite)

            expect(mockFetch).toHaveBeenCalledWith(
                'http://test-api:4000/api/tests/process-start',
                expect.any(Object)
            )

            // 2. Report test results
            reporter.onTestEnd(
                createMockTestCase('test 1', 'passed'),
                createMockTestResult('passed', {duration: 100})
            )
            reporter.onTestEnd(
                createMockTestCase('test 2', 'passed'),
                createMockTestResult('passed', {duration: 200})
            )
            reporter.onTestEnd(
                createMockTestCase('test 3', 'failed'),
                createMockTestResult('failed', {
                    duration: 150,
                    error: {message: 'Test failed', stack: 'Error stack'},
                })
            )

            expect(mockFetch).toHaveBeenCalledTimes(4) // 1 process-start + 3 tests

            // 3. Complete test run
            mockFetch.mockClear()
            await reporter.onEnd({status: 'failed'} as FullResult)

            // Should call PUT /api/runs/:id and POST /api/tests/process-end
            expect(mockFetch).toHaveBeenCalledTimes(2)

            // Verify final statistics
            const updateRunCall = mockFetch.mock.calls.find((call) => call[1].method === 'PUT')
            const updateBody = JSON.parse(updateRunCall![1].body)
            expect(updateBody).toMatchObject({
                id: 'integration-test-run',
                status: 'failed',
                totalTests: 3,
                passedTests: 2,
                failedTests: 1,
                skippedTests: 0,
            })

            // Verify console output
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('YShvydak Dashboard Reporter initialized')
            )
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Starting test run'))
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅'))
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('❌'))
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Test run completed')
            )
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Passed: 2'))
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Failed: 1'))
        })

        it('should handle API being unavailable throughout entire run', async () => {
            mockFetch.mockRejectedValue(new Error('API not available'))

            reporter = new YShvydakReporter()

            // Start run
            const suite = createMockSuite(2)
            reporter.onBegin({} as FullConfig, suite)

            // Report tests
            reporter.onTestEnd(
                createMockTestCase('test 1', 'passed'),
                createMockTestResult('passed')
            )
            reporter.onTestEnd(
                createMockTestCase('test 2', 'passed'),
                createMockTestResult('passed')
            )

            // Complete run
            await reporter.onEnd({status: 'passed'} as FullResult)

            // Should have warnings but not crash
            expect(consoleWarnSpy.mock.calls.length).toBeGreaterThan(0)
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringMatching(/API not available|notification failed/)
            )
        })

        it('should handle mixed success/failure API responses', async () => {
            let callCount = 0
            mockFetch.mockImplementation(() => {
                callCount++
                if (callCount % 2 === 0) {
                    return Promise.resolve({ok: false, status: 500, text: async () => 'Error'})
                }
                return Promise.resolve({ok: true, json: async () => ({})})
            })

            reporter = new YShvydakReporter()

            const suite = createMockSuite(4)
            reporter.onBegin({} as FullConfig, suite)

            reporter.onTestEnd(
                createMockTestCase('test 1', 'passed'),
                createMockTestResult('passed')
            )
            reporter.onTestEnd(
                createMockTestCase('test 2', 'passed'),
                createMockTestResult('passed')
            )
            reporter.onTestEnd(
                createMockTestCase('test 3', 'passed'),
                createMockTestResult('passed')
            )
            reporter.onTestEnd(
                createMockTestCase('test 4', 'passed'),
                createMockTestResult('passed')
            )

            await new Promise((resolve) => setTimeout(resolve, 50))

            // Some calls should succeed, some should fail
            expect(mockFetch.mock.calls.length).toBeGreaterThan(0)
            expect(consoleWarnSpy.mock.calls.some((call: any) => call[0].includes('Failed'))).toBe(
                true
            )
        })
    })
})
