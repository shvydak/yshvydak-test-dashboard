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

export interface YShvydakTestResult {
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
}

export interface YShvydakTestRun {
    id: string
    status: 'running' | 'completed' | 'failed'
    timestamp: string
    totalTests: number
    passedTests: number
    failedTests: number
    skippedTests: number
    duration: number
}

export interface ReporterDiagnostics {
    version: string
    apiBaseUrl: string
    isConfigured: boolean
    healthCheck: {
        success: boolean
        error?: string
        responseTime?: number
    }
}

export class YShvydakReporter implements Reporter {
    private runId: string = uuidv4()
    private results: YShvydakTestResult[] = []
    private startTime: number = 0
    private apiBaseUrl: string = ''
    private isConfigured: boolean = false
    private readonly version = '1.0.0'

    constructor(private options: {silent?: boolean} = {}) {
        this.initializeReporter()
    }

    private initializeReporter(): void {
        // Get the base URL from environment variables
        let baseUrl = process.env.DASHBOARD_API_URL || 'http://localhost:3001'

        // Remove trailing /api if present (for backward compatibility)
        if (baseUrl.endsWith('/api')) {
            baseUrl = baseUrl.slice(0, -4)
        }

        this.apiBaseUrl = baseUrl
        this.isConfigured = !!process.env.DASHBOARD_API_URL

        if (!this.options.silent) {
            console.log(`🎭 YShvydak Dashboard Reporter v${this.version} initialized`)
            console.log(`   Run ID: ${this.runId}`)
            console.log(`   API Base URL: ${this.apiBaseUrl}`)
            console.log(
                `   Configuration: ${this.isConfigured ? '✅ From environment' : '⚠️  Using defaults'}`
            )
        }

        if (!this.apiBaseUrl || this.apiBaseUrl === 'undefined') {
            console.warn(
                `⚠️  Dashboard API URL not configured! Using fallback: http://localhost:3001`
            )
            this.apiBaseUrl = 'http://localhost:3001'
        }
    }

    async getDiagnostics(): Promise<ReporterDiagnostics> {
        const startTime = Date.now()
        let healthCheck = {
            success: false,
            error: undefined as string | undefined,
            responseTime: undefined as number | undefined,
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/health`, {
                method: 'GET',
                headers: {'Content-Type': 'application/json'},
            })

            healthCheck = {
                success: response.ok,
                responseTime: Date.now() - startTime,
                error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
            }
        } catch (error) {
            healthCheck = {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                responseTime: Date.now() - startTime,
            }
        }

        return {
            version: this.version,
            apiBaseUrl: this.apiBaseUrl,
            isConfigured: this.isConfigured,
            healthCheck,
        }
    }

    onBegin(_config: FullConfig, suite: Suite) {
        this.startTime = Date.now()

        // Create test run
        this.createTestRun({
            id: this.runId,
            status: 'running',
            timestamp: new Date().toISOString(),
            totalTests: suite.allTests().length,
            passedTests: 0,
            failedTests: 0,
            skippedTests: 0,
            duration: 0,
        })

        if (!this.options.silent) {
            console.log(`🚀 Starting test run with ${suite.allTests().length} tests`)
        }
    }

    onTestEnd(test: TestCase, result: TestResult) {
        const testId = this.generateStableTestId(test)

        // Create enhanced error message with code context like in original Playwright report
        let enhancedErrorMessage = result.error?.stack || result.error?.message
        if (result.status === 'failed' && result.error) {
            enhancedErrorMessage = this.createEnhancedErrorMessage(test, result.error)
        }

        const testResult: YShvydakTestResult = {
            id: uuidv4(),
            testId,
            runId: this.runId,
            name: test.title,
            filePath: path.relative(process.cwd(), test.location.file),
            status: this.mapStatus(result.status),
            duration: result.duration,
            timestamp: new Date().toISOString(),
            errorMessage: enhancedErrorMessage,
            errorStack: result.error?.stack,
            attachments: this.processAttachments(result.attachments),
        }

        this.results.push(testResult)

        // Send result to dashboard API
        this.sendTestResult(testResult)

        if (!this.options.silent) {
            console.log(
                `${this.getStatusIcon(testResult.status)} ${testResult.name} (${testResult.duration}ms)`
            )
        }
    }

    onEnd(result: FullResult) {
        const duration = Date.now() - this.startTime
        const passed = this.results.filter((r) => r.status === 'passed').length
        const failed = this.results.filter((r) => r.status === 'failed').length
        const skipped = this.results.filter((r) => r.status === 'skipped').length

        // Update test run
        this.updateTestRun({
            id: this.runId,
            status: result.status === 'passed' ? 'completed' : 'failed',
            timestamp: new Date().toISOString(),
            totalTests: this.results.length,
            passedTests: passed,
            failedTests: failed,
            skippedTests: skipped,
            duration,
        })

        if (!this.options.silent) {
            console.log(`\n📊 Test run completed:`)
            console.log(`   ✅ Passed: ${passed}`)
            console.log(`   ❌ Failed: ${failed}`)
            console.log(`   ⏭️  Skipped: ${skipped}`)
            console.log(`   ⏱️  Duration: ${(duration / 1000).toFixed(1)}s`)
            console.log(`\n🌐 View results: ${this.apiBaseUrl.replace('3001', '3000')}`)
        }
    }

    private generateStableTestId(test: TestCase): string {
        // Generate stable ID based on file path and test title
        const filePath = path.relative(process.cwd(), test.location.file)
        const content = `${filePath}:${test.title}`

        // Simple hash function for stable IDs
        let hash = 0
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i)
            hash = (hash << 5) - hash + char
            hash = hash & hash // Convert to 32-bit integer
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
                    (line: string) =>
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
            // If we can't read the file, return the original error
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
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/tests`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(result),
            })

            if (!response.ok) {
                console.warn(`⚠️  Failed to send test result: ${response.status}`)
            }
        } catch (error) {
            if (!this.options.silent) {
                console.warn(`⚠️  Dashboard API not available: ${error}`)
            }
        }
    }

    private async createTestRun(run: YShvydakTestRun) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/runs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(run),
            })

            if (!response.ok) {
                console.warn(`⚠️  Failed to create test run: ${response.status}`)
            }
        } catch (error) {
            if (!this.options.silent) {
                console.warn(`⚠️  Dashboard API not available: ${error}`)
            }
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
            }
        } catch (error) {
            if (!this.options.silent) {
                console.warn(`⚠️  Dashboard API not available: ${error}`)
            }
        }
    }
}

export default YShvydakReporter
