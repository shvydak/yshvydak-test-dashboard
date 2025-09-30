import {spawn, ChildProcess} from 'child_process'
import path from 'path'
import {v4 as uuidv4} from 'uuid'
import {IPlaywrightService, TestRunProcess, DiscoveredTest} from '../types/service.types'
import {config} from '../config/environment.config'
import {Logger} from '../utils/logger.util'

export class PlaywrightService implements IPlaywrightService {
    async discoverTests(): Promise<DiscoveredTest[]> {
        Logger.info('Discovering tests', {projectDir: config.playwright.projectDir})

        // Execute playwright test --list command directly
        let playwrightData: any

        try {
            playwrightData = await this.executePlaywrightListCommand()
        } catch (error) {
            throw new Error(
                `Test discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
                    `Make sure Playwright is installed in ${config.playwright.projectDir}`
            )
        }

        const discoveredTests: DiscoveredTest[] = []

        // Extract all tests from both top-level and nested structures
        for (const suite of playwrightData.suites || []) {
            // Handle top-level specs directly under the suite
            for (const spec of suite.specs || []) {
                // Generate stable test ID (same as in reporter)
                const fullFilePath = `e2e/tests/${spec.file}`
                const stableTestId = this.generateStableTestId(fullFilePath, spec.title)

                discoveredTests.push({
                    id: uuidv4(),
                    testId: stableTestId,
                    runId: null,
                    name: spec.title,
                    filePath: fullFilePath,
                    status: 'pending',
                    duration: 0,
                    metadata: JSON.stringify({
                        line: spec.line || 0,
                        playwrightId: spec.id || null,
                        discoveredAt: new Date().toISOString(),
                    }),
                    timestamp: new Date().toISOString(),
                })
            }

            // Handle nested specs within sub-suites
            for (const subSuite of suite.suites || []) {
                for (const spec of subSuite.specs || []) {
                    // Generate stable test ID (same as in reporter)
                    const fullFilePath = `e2e/tests/${spec.file}`
                    const stableTestId = this.generateStableTestId(fullFilePath, spec.title)

                    discoveredTests.push({
                        id: uuidv4(),
                        testId: stableTestId,
                        runId: null,
                        name: spec.title,
                        filePath: fullFilePath,
                        status: 'pending',
                        duration: 0,
                        metadata: JSON.stringify({
                            line: spec.line || 0,
                            playwrightId: spec.id || null,
                            discoveredAt: new Date().toISOString(),
                        }),
                        timestamp: new Date().toISOString(),
                    })
                }
            }
        }

        return discoveredTests
    }

    async runAllTests(): Promise<TestRunProcess> {
        const runId = uuidv4()
        Logger.testRun('run-all', runId)

        const process = this.spawnPlaywrightProcess(
            ['playwright', 'test', `--reporter=${config.playwright.reporterPath}`],
            {runId, type: 'run-all'}
        )

        return {
            runId,
            message: 'All tests started',
            timestamp: new Date().toISOString(),
            process,
        }
    }

    async runTestGroup(filePath: string): Promise<TestRunProcess> {
        const runId = uuidv4()
        Logger.testRun('run-group', runId)

        // Handle both cases: filePath with or without 'e2e/tests/' prefix
        let testFilePath = filePath
        if (!filePath.startsWith('e2e/tests/')) {
            testFilePath = path.join('e2e/tests', filePath)
        }

        const process = this.spawnPlaywrightProcess(
            ['playwright', 'test', testFilePath, `--reporter=${config.playwright.reporterPath}`],
            {runId, type: 'run-group', filePath}
        )

        return {
            runId,
            message: `Tests started for ${filePath}`,
            timestamp: new Date().toISOString(),
            process,
        }
    }

    async rerunSingleTest(testFile: string, testName: string): Promise<TestRunProcess> {
        const runId = uuidv4()
        Logger.testRerun(testName, runId)

        const process = this.spawnPlaywrightProcess(
            [
                'playwright',
                'test',
                testFile,
                '--grep',
                testName,
                `--reporter=json,${config.playwright.reporterPath}`,
            ],
            {
                runId,
                type: 'rerun',
                env: {
                    RERUN_MODE: 'true',
                    RERUN_ID: runId,
                },
            }
        )

        return {
            runId,
            message: 'Test rerun started',
            timestamp: new Date().toISOString(),
            process,
        }
    }

    private spawnPlaywrightProcess(
        args: string[],
        options: {runId: string; type: string; filePath?: string; env?: Record<string, string>}
    ): ChildProcess {
        return spawn('npx', args, {
            cwd: config.playwright.projectDir,
            stdio: options.type === 'rerun' ? ['ignore', 'pipe', 'pipe'] : 'inherit',
            env: {
                ...process.env,
                DASHBOARD_API_URL: config.api.baseUrl,
                ...options.env,
            },
        })
    }

    private async executePlaywrightListCommand(): Promise<any> {
        return new Promise((resolve, reject) => {
            const process = spawn('npx', ['playwright', 'test', '--list', '--reporter=json'], {
                cwd: config.playwright.projectDir,
                stdio: ['ignore', 'pipe', 'pipe'],
            })

            let stdout = ''
            let stderr = ''

            process.stdout?.on('data', (data) => {
                stdout += data.toString()
            })

            process.stderr?.on('data', (data) => {
                stderr += data.toString()
            })

            process.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Playwright command failed with code ${code}: ${stderr}`))
                    return
                }

                try {
                    const jsonData = JSON.parse(stdout)
                    resolve(jsonData)
                } catch (parseError) {
                    reject(new Error(`Failed to parse Playwright output: ${parseError}`))
                }
            })

            process.on('error', (error) => {
                reject(new Error(`Failed to execute Playwright command: ${error.message}`))
            })
        })
    }

    private generateStableTestId(filePath: string, title: string): string {
        const content = `${filePath}:${title}`
        let hash = 0
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i)
            hash = (hash << 5) - hash + char
            hash = hash & hash // Convert to 32-bit integer
        }
        return `test-${Math.abs(hash).toString(36)}`
    }

    // New validation and diagnostics methods
    async validateConfiguration(): Promise<{
        isValid: boolean
        issues: string[]
        projectDir: string
        reporterPath: string
        reporterExists: boolean
    }> {
        const issues: string[] = []
        const projectDir = config.playwright.projectDir
        const reporterPath = path.resolve(projectDir, config.playwright.reporterPath)

        // Check if project directory exists
        const fs = await import('fs')
        if (!fs.existsSync(projectDir)) {
            issues.push(`Project directory does not exist: ${projectDir}`)
        }

        // Check if playwright.config.ts exists
        const playwrightConfig = path.join(projectDir, 'playwright.config.ts')
        const playwrightConfigJs = path.join(projectDir, 'playwright.config.js')
        if (!fs.existsSync(playwrightConfig) && !fs.existsSync(playwrightConfigJs)) {
            issues.push(`Playwright config not found in: ${projectDir}`)
        }

        // Check if reporter file exists
        const reporterExists = fs.existsSync(reporterPath)
        if (!reporterExists) {
            issues.push(`Reporter file not found: ${reporterPath}`)
        }

        // Check if @playwright/test is installed
        const nodeModulesPath = path.join(projectDir, 'node_modules', '@playwright', 'test')
        if (!fs.existsSync(nodeModulesPath)) {
            issues.push(`@playwright/test not installed in: ${projectDir}`)
        }

        Logger.info('Configuration validation completed', {
            projectDir,
            reporterPath,
            reporterExists,
            issuesCount: issues.length,
        })

        return {
            isValid: issues.length === 0,
            issues,
            projectDir,
            reporterPath,
            reporterExists,
        }
    }

    async getDiagnostics(): Promise<{
        version: string
        config: typeof config.playwright
        validation: {
            isValid: boolean
            issues: string[]
            projectDir: string
            reporterPath: string
            reporterExists: boolean
        }
        healthCheck: {
            canDiscoverTests: boolean
            error?: string
        }
    }> {
        const validation = await this.validateConfiguration()

        let healthCheck = {canDiscoverTests: false, error: undefined as string | undefined}

        if (validation.isValid) {
            try {
                await this.executePlaywrightListCommand()
                healthCheck.canDiscoverTests = true
            } catch (error) {
                healthCheck.error = error instanceof Error ? error.message : 'Unknown error'
            }
        } else {
            healthCheck.error = `Configuration invalid: ${validation.issues.join(', ')}`
        }

        return {
            version: '1.0.0',
            config: config.playwright,
            validation,
            healthCheck,
        }
    }

    async getReporterDiagnostics(): Promise<{
        reporterPath: string
        reporterExists: boolean
        canImportReporter: boolean
        reporterDiagnostics?: any
        error?: string
    }> {
        const fs = await import('fs')
        const reporterPath = path.resolve(
            config.playwright.projectDir,
            config.playwright.reporterPath
        )
        const reporterExists = fs.existsSync(reporterPath)

        let canImportReporter = false
        let reporterDiagnostics: any
        let error: string | undefined

        if (reporterExists) {
            try {
                // Try to import the reporter for diagnostics
                const reporterModule = await import(reporterPath)
                const ReporterClass = reporterModule.default || reporterModule.YShvydakReporter

                if (ReporterClass) {
                    const reporter = new ReporterClass({silent: true})
                    canImportReporter = true

                    // If reporter has getDiagnostics method, call it
                    if (typeof reporter.getDiagnostics === 'function') {
                        reporterDiagnostics = await reporter.getDiagnostics()
                    }
                }
            } catch (importError) {
                error =
                    importError instanceof Error ? importError.message : 'Failed to import reporter'
            }
        }

        Logger.info('Reporter diagnostics completed', {
            reporterPath,
            reporterExists,
            canImportReporter,
            hasError: !!error,
        })

        return {
            reporterPath,
            reporterExists,
            canImportReporter,
            reporterDiagnostics,
            error,
        }
    }
}
