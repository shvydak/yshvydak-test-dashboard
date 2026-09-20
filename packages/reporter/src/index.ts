import {
    FullConfig,
    FullResult,
    Reporter,
    Suite,
    TestCase,
    TestResult,
} from '@playwright/test/reporter'

import * as path from 'path'
import * as fs from 'fs'
import {v4 as uuidv4} from 'uuid'
import * as dotenv from 'dotenv'
dotenv.config()

function normalizeTestPath(filePath: string): string {
    const prefixesToRemove = ['e2e/tests/', 'e2e\\tests\\', 'tests/', 'tests\\', 'e2e/', 'e2e\\']
    for (const prefix of prefixesToRemove) {
        if (filePath.startsWith(prefix)) {
            return filePath.substring(prefix.length)
        }
    }
    return filePath
}

// ---------------------------------------------------------------------------
// Per-test metadata. Everything here is additive and best-effort: the peer range starts
// at Playwright 1.40, so any API may be missing or a getter may throw. A failure omits
// that field and never breaks onTestEnd, the run or the POST.
// Discover (server playwright.service.ts) builds `describe`/`annotations`/`line`/`tags`
// in the same shape: keep the caps and normalisation in sync (parity test in the server).
// ---------------------------------------------------------------------------
const MAX_ANNOTATIONS = 10
const MAX_ANNOTATION_TYPE_CHARS = 100
const MAX_ANNOTATION_DESCRIPTION_CHARS = 300
const MAX_ERRORS = 5
const MAX_ERROR_MESSAGE_CHARS = 2000
const MAX_ERROR_STACK_CHARS = 4000
const OUTCOMES = ['skipped', 'expected', 'unexpected', 'flaky'] as const

function safely<T>(read: () => T): T | undefined {
    try {
        return read()
    } catch {
        return undefined
    }
}

function cut(text: string, max: number): {value: string; truncated: boolean} {
    return text.length > max
        ? {value: text.slice(0, max), truncated: true}
        : {value: text, truncated: false}
}

function finiteNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Describe titles only, outermost first. Suite layout is root > project > file > describe...
 * `Suite.type` exists from Playwright 1.44; older versions fall back to dropping the three
 * outermost ancestors. Anonymous describes (empty title) are skipped, like titlePath() does.
 */
function getDescribeChain(test: TestCase): string[] {
    const ancestors: Array<{title?: unknown; type?: unknown}> = []
    for (let suite: any = test.parent; suite; suite = suite.parent) {
        ancestors.push(suite)
    }
    const describes = ancestors.every((suite) => typeof suite.type === 'string')
        ? ancestors.filter((suite) => suite.type === 'describe')
        : ancestors.slice(0, -3)
    return describes
        .map((suite) => suite.title)
        .filter((title): title is string => typeof title === 'string' && title !== '')
        .reverse()
}

/** Normalised, de-duplicated, capped annotations from any number of raw lists. */
function normalizeAnnotations(...lists: unknown[]): TestAnnotation[] {
    const result: TestAnnotation[] = []
    const seen = new Set<string>()
    for (const list of lists) {
        if (!Array.isArray(list)) continue
        for (const item of list) {
            if (!item || typeof item.type !== 'string') continue
            const type = cut(item.type, MAX_ANNOTATION_TYPE_CHARS).value
            const description =
                typeof item.description === 'string'
                    ? cut(item.description, MAX_ANNOTATION_DESCRIPTION_CHARS).value
                    : undefined
            const key = `${type}\u0000${description ?? ''}`
            if (seen.has(key)) continue
            seen.add(key)
            result.push(description === undefined ? {type} : {type, description})
            if (result.length >= MAX_ANNOTATIONS) return result
        }
    }
    return result
}

function collectErrors(rawErrors: unknown): {errors: TestErrorInfo[]; truncated: boolean} {
    const errors: TestErrorInfo[] = []
    if (!Array.isArray(rawErrors)) return {errors, truncated: false}
    for (const raw of rawErrors.slice(0, MAX_ERRORS)) {
        const entry: TestErrorInfo = {}
        let truncated = false
        if (typeof raw?.message === 'string') {
            const message = cut(raw.message, MAX_ERROR_MESSAGE_CHARS)
            entry.message = message.value
            truncated = truncated || message.truncated
        }
        if (typeof raw?.stack === 'string') {
            const stack = cut(raw.stack, MAX_ERROR_STACK_CHARS)
            entry.stack = stack.value
            truncated = truncated || stack.truncated
        }
        if (entry.message === undefined && entry.stack === undefined) continue
        if (truncated) entry.truncated = true
        errors.push(entry)
    }
    return {errors, truncated: rawErrors.length > MAX_ERRORS}
}

function collectTestMetadata(
    test: TestCase,
    result: TestResult
): Partial<NonNullable<YShvydakTestResult['metadata']>> {
    const meta: Partial<NonNullable<YShvydakTestResult['metadata']>> = {}

    const describe = safely(() => getDescribeChain(test))
    if (describe && describe.length > 0) meta.describe = describe

    const annotations = safely(() => normalizeAnnotations(test.annotations, result.annotations))
    if (annotations && annotations.length > 0) meta.annotations = annotations

    meta.line = safely(() => finiteNumber(test.location?.line))
    meta.column = safely(() => finiteNumber(test.location?.column))

    const collected = safely(() => collectErrors(result.errors))
    if (collected && collected.errors.length > 0) {
        meta.errors = collected.errors
        if (collected.truncated) meta.errorsTruncated = true
    }

    const outcome = safely(() => (typeof test.outcome === 'function' ? test.outcome() : undefined))
    if (outcome && (OUTCOMES as readonly string[]).includes(outcome)) meta.outcome = outcome

    const expectedStatus = safely(() => test.expectedStatus)
    if (typeof expectedStatus === 'string') meta.expectedStatus = expectedStatus

    meta.retry = safely(() => finiteNumber(result.retry))
    meta.retries = safely(() => finiteNumber(test.retries))
    meta.timeout = safely(() => finiteNumber(test.timeout))

    meta.startTime = safely(() => {
        const start: unknown = result.startTime
        if (start instanceof Date) return start.toISOString()
        return typeof start === 'string' ? start : undefined
    })
    meta.workerIndex = safely(() => finiteNumber(result.workerIndex))
    meta.parallelIndex = safely(() => finiteNumber(result.parallelIndex))

    return meta
}

interface TestStep {
    title: string
    category: string
    duration: number
    startTime: Date
    error?: string
}

type ConsoleEntryType = 'stdout' | 'stderr'

interface ConsoleEntry {
    type: ConsoleEntryType
    text: string
    timestamp: string
}

interface YShvydakTestResult {
    id: string
    testId: string
    runId: string
    name: string
    filePath: string
    status: 'passed' | 'failed' | 'skipped' | 'timedOut'
    duration: number
    timestamp: string
    errorMessage?: string
    errorStack?: string
    attachments: Array<{
        name: string
        path: string
        contentType: string
    }>
    metadata?: {
        steps?: TestStep[]
        console?: {
            entries: ConsoleEntry[]
            truncated?: boolean
        }
        // Playwright tags incl. leading '@' (e.g. '@ABC-123')
        tags?: string[]
        // Describe titles only (no root/project/file/test title), outermost first
        describe?: string[]
        // De-duplicated test + result annotations (skip/fixme/fail reasons, custom); capped
        annotations?: TestAnnotation[]
        // Test declaration position in the file
        line?: number
        column?: number
        // All errors of the result (soft assertions too), capped; the singular errorMessage/
        // errorStack above are unchanged. errorsTruncated = more errors existed than kept.
        errors?: TestErrorInfo[]
        errorsTruncated?: boolean
        // test.outcome(); expectedStatus/retry/retries/timeout as Playwright reports them
        outcome?: 'skipped' | 'expected' | 'unexpected' | 'flaky'
        expectedStatus?: string
        retry?: number
        retries?: number
        timeout?: number
        // ISO start time of this result and the worker that ran it
        startTime?: string
        workerIndex?: number
        parallelIndex?: number
    }
}

interface TestAnnotation {
    type: string
    description?: string
}

interface TestErrorInfo {
    message?: string
    stack?: string
    // message and/or stack were cut to their cap
    truncated?: boolean
}

interface YShvydakTestRun {
    id: string
    status: 'running' | 'completed' | 'failed'
    timestamp: string
    totalTests: number
    passedTests: number
    failedTests: number
    skippedTests: number
    duration: number
}

interface ProcessStartData {
    runId: string
    type: 'run-all' | 'run-group' | 'rerun'
    totalTests?: number
    filePath?: string
    testId?: string
    originalTestId?: string
}

interface ProcessEndData {
    runId: string
    status: 'completed' | 'failed' | 'interrupted'
    results?: {
        passed: number
        failed: number
        skipped: number
        duration: number
    } | null
}

class YShvydakReporter implements Reporter {
    private runId: string
    private results: YShvydakTestResult[] = []
    private startTime: number = 0
    private apiBaseUrl: string
    private readonly consoleEntriesByResult = new WeakMap<TestResult, ConsoleEntry[]>()
    private readonly consoleWasTruncatedByResult = new WeakMap<TestResult, boolean>()
    private static readonly MAX_CONSOLE_LINES = 500
    private static readonly MAX_CONSOLE_CHARS = 200_000

    constructor() {
        // Get the base URL from environment variables
        let baseUrl = process.env.DASHBOARD_API_URL || 'http://localhost:3001'

        // Remove trailing /api if present (for backward compatibility)
        if (baseUrl.endsWith('/api')) {
            baseUrl = baseUrl.slice(0, -4)
        }

        this.apiBaseUrl = baseUrl

        // Use RUN_ID from environment if provided by dashboard, otherwise generate new one
        this.runId = process.env.RUN_ID || process.env.RERUN_ID || uuidv4()

        console.log(`🎭 YShvydak Dashboard Reporter initialized (Run ID: ${this.runId})`)
        console.log(`🌐 API Base URL: ${this.apiBaseUrl}`)

        if (!this.apiBaseUrl || this.apiBaseUrl === 'undefined') {
            console.warn(
                `⚠️  Dashboard API URL not configured! Using fallback: http://localhost:3001`
            )
            this.apiBaseUrl = 'http://localhost:3001'
        }

        // Setup cleanup handlers for unexpected termination
        this.setupCleanupHandlers()
    }

    onStdOut(chunk: string | Buffer, test?: TestCase, result?: TestResult) {
        this.captureConsoleChunk('stdout', chunk, test, result)
    }

    onStdErr(chunk: string | Buffer, test?: TestCase, result?: TestResult) {
        this.captureConsoleChunk('stderr', chunk, test, result)
    }

    onBegin(_config: FullConfig, suite: Suite) {
        this.startTime = Date.now()
        const processType = process.env.RERUN_MODE === 'true' ? 'rerun' : 'run-all'

        // Notify dashboard that process is starting
        this.notifyProcessStart({
            runId: this.runId,
            type: processType,
            totalTests: suite.allTests().length,
        })

        console.log(`🚀 Starting test run with ${suite.allTests().length} tests`)
    }

    onTestBegin(test: TestCase) {
        const testId = this.generateStableTestId(test)
        // Normalize path for consistent file path display
        const filePath = normalizeTestPath(path.relative(process.cwd(), test.location.file))

        // Notify dashboard that test is starting
        this.notifyTestStart({
            testId,
            name: test.title,
            filePath,
        })

        console.log(`▶️  Starting: ${test.title}`)
    }

    onTestEnd(test: TestCase, result: TestResult) {
        const testId = this.generateStableTestId(test)
        // Normalize path for consistent file path display
        const filePath = normalizeTestPath(path.relative(process.cwd(), test.location.file))

        // Create enhanced error message with code context like in original Playwright report
        let enhancedErrorMessage = result.error?.stack || result.error?.message
        if (result.status === 'failed' && result.error) {
            enhancedErrorMessage = this.createEnhancedErrorMessage(test, result.error)
        }

        // Capture test steps from Playwright
        const steps: TestStep[] = result.steps
            ? result.steps.map((step) => ({
                  title: step.title,
                  category: step.category,
                  duration: step.duration,
                  startTime: step.startTime,
                  error: step.error?.message,
              }))
            : []

        const consoleEntries = this.consoleEntriesByResult.get(result) || []
        const consoleTruncated = this.consoleWasTruncatedByResult.get(result) || false

        const testResult: YShvydakTestResult = {
            id: uuidv4(),
            testId,
            runId: this.runId,
            name: test.title,
            filePath: filePath,
            status: this.mapStatus(result.status),
            duration: result.duration,
            timestamp: new Date().toISOString(),
            errorMessage: enhancedErrorMessage,
            errorStack: result.error?.stack,
            attachments: this.processAttachments(result.attachments),
            metadata: {
                steps: steps.length > 0 ? steps : undefined,
                console:
                    consoleEntries.length > 0
                        ? {entries: consoleEntries, truncated: consoleTruncated || undefined}
                        : undefined,
                // TestCase.tags needs Playwright >= 1.42; peer range starts at 1.40
                tags: safely(() => test.tags) ?? [],
                ...(safely(() => collectTestMetadata(test, result)) ?? {}),
            },
        }

        this.results.push(testResult)

        // Send result to dashboard API
        this.sendTestResult(testResult)

        console.log(
            `${this.getStatusIcon(testResult.status)} ${testResult.name} (${testResult.duration}ms)`
        )
    }

    private captureConsoleChunk(
        type: ConsoleEntryType,
        chunk: string | Buffer,
        _test?: TestCase,
        result?: TestResult
    ) {
        // We only store per-test output when Playwright provides the TestResult object.
        // Global output (no result) is ignored to avoid polluting individual test logs.
        if (!result) return

        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8')
        if (!text) return

        const entries = this.consoleEntriesByResult.get(result) || []
        const lines = text.split(/\r?\n/)

        // Preserve trailing newline behavior: split() drops the delimiter; re-add '\n' for all but last line
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (line === '' && i === lines.length - 1) continue

            const entryText = i < lines.length - 1 ? `${line}\n` : line
            entries.push({
                type,
                text: entryText,
                timestamp: new Date().toISOString(),
            })
        }

        // Trim by line count
        let truncated = false
        while (entries.length > YShvydakReporter.MAX_CONSOLE_LINES) {
            entries.shift()
            truncated = true
        }

        // Trim by total size
        let totalChars = entries.reduce((acc, e) => acc + e.text.length, 0)
        while (totalChars > YShvydakReporter.MAX_CONSOLE_CHARS && entries.length > 0) {
            const removed = entries.shift()!
            totalChars -= removed.text.length
            truncated = true
        }

        this.consoleEntriesByResult.set(result, entries)
        if (truncated) this.consoleWasTruncatedByResult.set(result, true)
    }

    async onEnd(result: FullResult) {
        const duration = Date.now() - this.startTime
        const passed = this.results.filter((r) => r.status === 'passed').length
        const failed = this.results.filter((r) => r.status === 'failed').length
        const skipped = this.results.filter((r) => r.status === 'skipped').length

        console.log(`\n⏳ Waiting for all test results to be sent to dashboard...`)

        await new Promise((resolve) => setTimeout(resolve, 1000))

        console.log(`✅ All test results should be processed by dashboard now`)

        // Update test run
        await this.updateTestRun({
            id: this.runId,
            status: result.status === 'passed' ? 'completed' : 'failed',
            timestamp: new Date().toISOString(),
            totalTests: this.results.length,
            passedTests: passed,
            failedTests: failed,
            skippedTests: skipped,
            duration,
        })

        // Notify dashboard that process is ending
        console.log('🔄 Sending process end notification...')
        await this.notifyProcessEnd({
            runId: this.runId,
            status: result.status === 'passed' ? 'completed' : 'failed',
            results: {
                passed,
                failed,
                skipped,
                duration,
            },
        })

        console.log(`\n📊 Test run completed:`)
        console.log(`   ✅ Passed: ${passed}`)
        console.log(`   ❌ Failed: ${failed}`)
        console.log(`   ⏭️  Skipped: ${skipped}`)
        console.log(`   ⏱️  Duration: ${(duration / 1000).toFixed(1)}s`)
        console.log(`\n🌐 View results: http://localhost:3000`)
    }

    private generateStableTestId(test: TestCase): string {
        // Generate stable ID based on file path and test title
        const originalPath = path.relative(process.cwd(), test.location.file)

        // Normalize path by removing common test directory prefixes
        // This ensures consistent testId generation across different project structures
        const filePath = normalizeTestPath(originalPath)

        const content = `${filePath}:${test.title}`

        // Simple hash function for stable IDs
        let hash = 0
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i)
            hash = (hash << 5) - hash + char
            hash = hash | 0 // Convert to 32-bit integer
        }

        return `test-${Math.abs(hash).toString(36)}`
    }

    private mapStatus(status: string): 'passed' | 'failed' | 'skipped' | 'timedOut' {
        switch (status) {
            case 'passed':
                return 'passed'
            case 'failed':
                return 'failed'
            case 'skipped':
                return 'skipped'
            case 'timedOut':
                return 'timedOut'
            default:
                return 'failed'
        }
    }

    private processAttachments(attachments: TestResult['attachments']) {
        return attachments.map((attachment) => ({
            name: attachment.name,
            path: attachment.path || '',
            contentType: attachment.contentType,
        }))
    }

    private createEnhancedErrorMessage(test: TestCase, error: any): string {
        const originalStack = error.stack || error.message || ''

        // Extract line number from stack trace
        const stackMatch = originalStack.match(/at .*:(\d+):\d+/)
        if (!stackMatch) {
            return originalStack
        }

        const lineNumber = parseInt(stackMatch[1])
        const filePath = test.location.file

        try {
            // Read the actual file content
            const fileContent = fs.readFileSync(filePath, 'utf-8')
            const lines = fileContent.split('\n')

            // Create context lines like in original Playwright report
            const contextLines: string[] = []
            const startLine = Math.max(0, lineNumber - 3)
            const endLine = Math.min(lines.length - 1, lineNumber + 2)

            for (let i = startLine; i <= endLine; i++) {
                const lineNum = i + 1
                const isErrorLine = lineNum === lineNumber
                const prefix = isErrorLine ? '>' : ' '
                const line = lines[i] || ''
                contextLines.push(`${prefix} ${lineNum} |${line}`)
            }

            // Add caret pointer for the error line
            if (lineNumber <= lines.length) {
                const errorLine = lines[lineNumber - 1] || ''
                const caretPosition = this.findCaretPosition(errorLine, error.message)
                if (caretPosition > 0) {
                    const spaces = ' '.repeat(caretPosition + ` ${lineNumber} |`.length)
                    contextLines.splice(
                        contextLines.findIndex((line) => line.startsWith('>')) + 1,
                        0,
                        `     |${spaces}^`
                    )
                }
            }

            // Combine original error message with code context
            const mainErrorLines = originalStack
                .split('\n')
                .filter(
                    (line: any) =>
                        !line.trim().startsWith('at ') ||
                        line.includes(path.relative(process.cwd(), filePath))
                )

            return [
                ...mainErrorLines.slice(0, -1), // Remove the last 'at' line
                '',
                ...contextLines,
                '',
                mainErrorLines[mainErrorLines.length - 1], // Add back the 'at' line
            ].join('\n')
        } catch (err) {
            console.log(err)
            return originalStack
        }
    }

    private findCaretPosition(line: string, errorMessage: string): number {
        // Try to find the position of the error in the line
        // This is a simple heuristic - in real Playwright it's more sophisticated
        if (errorMessage.includes('toBe')) {
            const toBeIndex = line.indexOf('toBe')
            if (toBeIndex !== -1) {
                return toBeIndex + 2 // Position at 'Be'
            }
        }

        // Default to finding 'expect' if present
        const expectIndex = line.indexOf('expect')
        if (expectIndex !== -1) {
            return expectIndex
        }

        return 0
    }

    private getStatusIcon(status: string): string {
        switch (status) {
            case 'passed':
                return '✅'
            case 'failed':
                return '❌'
            case 'skipped':
                return '⏭️'
            case 'timedOut':
                return '⏰'
            default:
                return '❓'
        }
    }

    private async sendTestResult(result: YShvydakTestResult) {
        const startTime = Date.now()
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/tests`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(result),
            })

            const duration = Date.now() - startTime

            if (!response.ok) {
                console.warn(`⚠️  Failed to send test result (${duration}ms): ${response.status}`)
                const responseText = await response.text()
                console.warn(`⚠️  Response: ${responseText}`)
            }
        } catch (error) {
            const duration = Date.now() - startTime
            console.warn(`⚠️  Dashboard API not available (${duration}ms): ${error}`)
        }
    }

    private async updateTestRun(run: YShvydakTestRun) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/runs/${run.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(run),
            })

            if (!response.ok) {
                console.warn(`⚠️  Failed to update test run: ${response.status}`)
                const responseText = await response.text()
                console.warn(`⚠️  Response: ${responseText}`)
            }
        } catch (error) {
            console.warn(`⚠️  Dashboard API not available: ${error}`)
        }
    }

    private async notifyProcessStart(data: ProcessStartData) {
        try {
            console.log(`📤 Sending process start notification for: ${data.runId}`)
            const response = await fetch(`${this.apiBaseUrl}/api/tests/process-start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            })

            if (!response.ok) {
                console.warn(`⚠️  Failed to notify process start: ${response.status}`)
                const responseText = await response.text()
                console.warn(`⚠️  Response: ${responseText}`)
            } else {
                console.log(`✅ Process start notification sent successfully: ${data.runId}`)
            }
        } catch (error) {
            console.warn(`⚠️  Process start notification failed: ${error}`)
        }
    }

    private async notifyTestStart(data: {testId: string; name: string; filePath: string}) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/tests/test-start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    runId: this.runId,
                    ...data,
                }),
            })

            if (!response.ok) {
                console.warn(`⚠️  Failed to notify test start: ${response.status}`)
            }
        } catch (error) {
            // Silently fail - don't interrupt test execution
            console.warn(`⚠️  Test start notification failed: ${error}`)
        }
    }

    private async notifyProcessEnd(data: ProcessEndData) {
        try {
            console.log(`📤 Sending process end notification for: ${data.runId} (${data.status})`)
            const response = await fetch(`${this.apiBaseUrl}/api/tests/process-end`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            })

            if (!response.ok) {
                console.warn(`⚠️  Failed to notify process end: ${response.status}`)
                const responseText = await response.text()
                console.warn(`⚠️  Response: ${responseText}`)
            } else {
                console.log(
                    `✅ Process end notification sent successfully: ${data.runId} (${data.status})`
                )
            }
        } catch (error) {
            console.warn(`⚠️  Process end notification failed: ${error}`)
        }
    }

    private setupCleanupHandlers() {
        // Handle process termination signals
        process.on('SIGINT', () => this.cleanup('interrupted'))
        process.on('SIGTERM', () => this.cleanup('interrupted'))
        process.on('uncaughtException', () => this.cleanup('interrupted'))
        process.on('unhandledRejection', () => this.cleanup('interrupted'))
    }

    private async cleanup(status: 'interrupted' = 'interrupted') {
        console.log('🧹 Cleaning up reporter...')
        try {
            await this.notifyProcessEnd({
                runId: this.runId,
                status: status,
                results: null,
            })
        } catch (error) {
            console.warn('⚠️  Cleanup notification failed:', error)
        }
    }
}

export default YShvydakReporter
