import {spawn, ChildProcess} from 'child_process'
import path from 'path'
import {v4 as uuidv4} from 'uuid'
import {IPlaywrightService, TestRunProcess, DiscoveredTest} from '../types/service.types'
import {
    PlaywrightListOutput,
    PlaywrightSpec,
    PlaywrightSpawnOptions,
    ValidationResult,
} from '../types/playwright.types'
import {config} from '../config/environment.config'
import {PLAYWRIGHT_CONSTANTS} from '../config/constants'
import {Logger} from '../utils/logger.util'

export class PlaywrightService implements IPlaywrightService {
    // ============================================================================
    // TEST DISCOVERY & EXECUTION
    // ============================================================================

    async discoverTests(): Promise<DiscoveredTest[]> {
        Logger.info('Discovering tests', {projectDir: config.playwright.projectDir})

        let playwrightData: PlaywrightListOutput

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
                discoveredTests.push(this.createDiscoveredTest(spec))
            }

            // Handle nested specs within sub-suites
            for (const subSuite of suite.suites || []) {
                for (const spec of subSuite.specs || []) {
                    discoveredTests.push(this.createDiscoveredTest(spec))
                }
            }
        }

        return discoveredTests
    }

    async runAllTests(maxWorkers?: number): Promise<TestRunProcess> {
        const runId = uuidv4()
        Logger.testRun('run-all', runId)

        const args = ['playwright', 'test']
        if (maxWorkers) {
            args.push(`--workers=${maxWorkers}`)
        }
        args.push(`--reporter=${config.playwright.reporterPath}`)

        const process = this.spawnPlaywrightProcess(args, {
            runId,
            type: 'run-all',
            env: {
                RUN_ID: runId,
            },
        })

        return {
            runId,
            message: 'All tests started',
            timestamp: new Date().toISOString(),
            process,
        }
    }

    async runTestGroup(filePath: string, maxWorkers?: number): Promise<TestRunProcess> {
        const runId = uuidv4()
        Logger.testRun('run-group', runId)

        const normalizedPath = this.normalizeFilePath(filePath)

        const args = ['playwright', 'test', normalizedPath]
        if (maxWorkers) {
            args.push(`--workers=${maxWorkers}`)
        }
        args.push(`--reporter=${config.playwright.reporterPath}`)

        const process = this.spawnPlaywrightProcess(args, {
            runId,
            type: 'run-group',
            filePath,
            env: {
                RUN_ID: runId,
            },
        })

        return {
            runId,
            message: `Tests started for ${filePath}`,
            timestamp: new Date().toISOString(),
            process,
        }
    }

    async rerunSingleTest(
        testFile: string,
        testName: string,
        maxWorkers?: number
    ): Promise<TestRunProcess> {
        const runId = uuidv4()
        Logger.testRerun(testName, runId)

        const args = ['playwright', 'test', testFile, '--grep', testName]
        if (maxWorkers) {
            args.push(`--workers=${maxWorkers}`)
        }
        args.push(`--reporter=json,${config.playwright.reporterPath}`)

        const process = this.spawnPlaywrightProcess(args, {
            runId,
            type: 'rerun',
            env: {
                RERUN_MODE: 'true',
                RERUN_ID: runId,
            },
        })

        return {
            runId,
            message: 'Test rerun started',
            timestamp: new Date().toISOString(),
            process,
        }
    }

    // ============================================================================
    // VALIDATION & DIAGNOSTICS
    // ============================================================================

    async validateConfiguration(): Promise<ValidationResult> {
        const issues: string[] = []
        const projectDir = config.playwright.projectDir

        // Run all validation checks
        issues.push(...(await this.validateProjectDirectory()))
        issues.push(...(await this.validatePlaywrightConfig()))
        issues.push(...(await this.validatePlaywrightInstallation()))

        const reporterValidation = await this.validateReporterPackage()
        issues.push(...reporterValidation.issues)

        Logger.info('Configuration validation completed', {
            projectDir,
            reporterPath: reporterValidation.reporterPath,
            reporterExists: reporterValidation.reporterExists,
            nodeEnv: config.server.environment,
            issuesCount: issues.length,
        })

        return {
            isValid: issues.length === 0,
            issues,
            projectDir,
            reporterPath: reporterValidation.reporterPath,
            reporterExists: reporterValidation.reporterExists,
        }
    }

    async getDiagnostics(): Promise<{
        version: string
        config: typeof config.playwright
        validation: ValidationResult
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

    // ============================================================================
    // PRIVATE HELPER METHODS
    // ============================================================================

    /**
     * Creates a DiscoveredTest object from a Playwright spec
     */
    private createDiscoveredTest(spec: PlaywrightSpec): DiscoveredTest {
        const fullFilePath = `${PLAYWRIGHT_CONSTANTS.E2E_TESTS_PATH}${spec.file}`
        const stableTestId = this.generateStableTestId(fullFilePath, spec.title)

        return {
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
        }
    }

    /**
     * Normalizes file path by ensuring it has the correct e2e/tests/ prefix
     */
    private normalizeFilePath(filePath: string): string {
        if (!filePath.startsWith(PLAYWRIGHT_CONSTANTS.E2E_TESTS_PATH)) {
            return path.join(PLAYWRIGHT_CONSTANTS.E2E_TESTS_PATH, filePath)
        }
        return filePath
    }

    /**
     * Spawns a Playwright process with the given arguments and options
     */
    private spawnPlaywrightProcess(args: string[], options: PlaywrightSpawnOptions): ChildProcess {
        const env = {
            ...process.env,
            DASHBOARD_API_URL: config.api.baseUrl,
            ...options.env,
            NODE_ENV: config.server.environment,
        }

        Logger.info('Spawning Playwright process', {
            args: args.join(' '),
            type: options.type,
            NODE_ENV: env.NODE_ENV,
        })

        return spawn('npx', args, {
            cwd: config.playwright.projectDir,
            stdio: options.type === 'rerun' ? ['ignore', 'pipe', 'pipe'] : 'inherit',
            env,
        })
    }

    /**
     * Executes the playwright test --list command and returns parsed JSON output
     */
    private async executePlaywrightListCommand(): Promise<PlaywrightListOutput> {
        return new Promise((resolve, reject) => {
            const process = spawn(
                'npx',
                [
                    'playwright',
                    'test',
                    '--list',
                    `--reporter=${PLAYWRIGHT_CONSTANTS.LIST_REPORTER}`,
                ],
                {
                    cwd: config.playwright.projectDir,
                    stdio: ['ignore', 'pipe', 'pipe'],
                }
            )

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

    /**
     * Generates a stable test ID using a hash of file path and title
     * This ensures the same test always gets the same ID across discovery and execution
     */
    private generateStableTestId(filePath: string, title: string): string {
        const content = `${filePath}:${title}`
        let hash = 0
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i)
            hash = (hash << 5) - hash + char
            hash = hash | 0
        }
        return `${PLAYWRIGHT_CONSTANTS.STABLE_TEST_ID_PREFIX}${Math.abs(hash).toString(36)}`
    }

    // ============================================================================
    // PRIVATE VALIDATION METHODS
    // ============================================================================

    /**
     * Validates that the project directory exists
     */
    private async validateProjectDirectory(): Promise<string[]> {
        const issues: string[] = []
        const fs = await import('fs')
        const projectDir = config.playwright.projectDir

        if (!fs.existsSync(projectDir)) {
            issues.push(`Project directory does not exist: ${projectDir}`)
        }

        return issues
    }

    /**
     * Validates that Playwright configuration file exists
     */
    private async validatePlaywrightConfig(): Promise<string[]> {
        const issues: string[] = []
        const fs = await import('fs')
        const projectDir = config.playwright.projectDir

        const configExists = PLAYWRIGHT_CONSTANTS.CONFIG_FILES.some((configFile) =>
            fs.existsSync(path.join(projectDir, configFile))
        )

        if (!configExists) {
            issues.push(`Playwright config not found in: ${projectDir}`)
        }

        return issues
    }

    /**
     * Validates that the reporter npm package exists and is properly configured
     */
    private async validateReporterPackage(): Promise<{
        issues: string[]
        reporterPath: string
        reporterExists: boolean
    }> {
        const issues: string[] = []
        const fs = await import('fs')
        const projectDir = config.playwright.projectDir
        const configReporterPath = config.playwright.reporterPath

        // Check if reporter npm package exists in node_modules
        const packagePath = path.join(projectDir, 'node_modules', configReporterPath)
        let reporterExists = fs.existsSync(packagePath)

        if (!reporterExists) {
            issues.push(`Reporter npm package not found: ${configReporterPath}`)
        } else {
            // Verify package has valid entry point
            const packageJsonPath = path.join(packagePath, 'package.json')
            if (fs.existsSync(packageJsonPath)) {
                try {
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
                    const mainFile = packageJson.main || 'index.js'
                    const mainFilePath = path.join(packagePath, mainFile)
                    if (!fs.existsSync(mainFilePath)) {
                        issues.push(`Reporter package main file not found: ${mainFile}`)
                        reporterExists = false
                    }
                } catch (error) {
                    issues.push(`Invalid package.json in reporter package`)
                    reporterExists = false
                }
            }
        }

        return {
            issues,
            reporterPath: packagePath,
            reporterExists,
        }
    }

    /**
     * Validates that @playwright/test is installed
     */
    private async validatePlaywrightInstallation(): Promise<string[]> {
        const issues: string[] = []
        const fs = await import('fs')
        const projectDir = config.playwright.projectDir

        const nodeModulesPath = path.join(
            projectDir,
            'node_modules',
            PLAYWRIGHT_CONSTANTS.PACKAGE_NAME
        )

        if (!fs.existsSync(nodeModulesPath)) {
            issues.push(`${PLAYWRIGHT_CONSTANTS.PACKAGE_NAME} not installed in: ${projectDir}`)
        }

        return issues
    }
}
