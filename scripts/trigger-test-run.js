#!/usr/bin/env node

/**
 * YShvydak Test Dashboard - CI Pipeline Trigger Script
 *
 * Triggers the configured CI pipeline (an ordered sequence of project tabs,
 * see Settings > Project Tabs) via the dashboard API. Designed to be called
 * from external automation systems like GitHub Actions or n8n.
 *
 * Features:
 * - Automatic authentication (if ENABLE_AUTH=true)
 * - Health check before execution
 * - Real-time status monitoring across all pipeline steps
 * - JSON output for CI/n8n integration
 * - Error handling and retries
 *
 * Usage:
 *   node scripts/trigger-test-run.js [options]
 *
 * Options:
 *   --max-workers <number>  Maximum number of parallel workers (default: from config)
 *   --wait                  Wait for pipeline completion and return results
 *   --timeout <seconds>     Maximum wait time in seconds (default: 600)
 *   --silent                Suppress console output (only JSON result)
 *
 * Exit codes:
 *   0 - Success (all steps ran; non-blocking failures still count as success)
 *   1 - Pipeline stopped early on a blocking failure, API error, or timeout
 *   2 - CI auto-run is paused (intentional skip)
 *   3 - Configuration error (including no pipeline steps configured)
 *   4 - Authentication error
 *
 * A final `::PIPELINE_RESULT::{...}` JSON line is always printed to stdout so
 * the calling workflow can branch its notification (e.g. Slack) on the
 * outcome without re-parsing the human-readable log.
 *
 * Example:
 *   node scripts/trigger-test-run.js --wait --max-workers 2
 */

const fs = require('fs')
const path = require('path')

// ============================================================================
// Configuration
// ============================================================================

const BUSY_WAIT_TIMEOUT = 30 * 60 // 30 minutes max wait when dashboard is busy
const BUSY_POLL_INTERVAL = 10000 // 10 seconds between polls

const SCRIPT_DIR = __dirname
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..')
const ENV_FILE = path.join(PROJECT_ROOT, '.env')

// Parse command line arguments
const args = process.argv.slice(2)
const config = {
    maxWorkers: parseInt(args[args.indexOf('--max-workers') + 1]) || undefined,
    wait: args.includes('--wait'),
    timeout: parseInt(args[args.indexOf('--timeout') + 1]) || 1200, // 20 minutes default
    silent: args.includes('--silent'),
    help: args.includes('--help') || args.includes('-h'),
}

// ============================================================================
// Helper Functions
// ============================================================================

function log(message, level = 'info') {
    if (config.silent && level !== 'error') return

    const timestamp = new Date().toISOString()
    const icons = {
        info: '📋',
        success: '✅',
        error: '❌',
        warning: '⚠️',
        debug: '🔍',
    }

    console.log(`[${timestamp}] ${icons[level] || 'ℹ️'} ${message}`)
}

function exitWithError(message, code = 1) {
    log(message, 'error')
    if (config.silent) {
        console.log(
            JSON.stringify({
                success: false,
                error: message,
                code,
            })
        )
    }
    process.exit(code)
}

function loadEnvConfig() {
    if (!fs.existsSync(ENV_FILE)) {
        exitWithError(`Configuration file not found: ${ENV_FILE}`, 3)
    }

    const envContent = fs.readFileSync(ENV_FILE, 'utf-8')
    const envVars = {}

    envContent.split('\n').forEach((line) => {
        line = line.trim()
        if (!line || line.startsWith('#')) return

        const match = line.match(/^([^=]+)=(.*)$/)
        if (match) {
            const key = match[1].trim()
            let value = match[2].trim()

            // Remove quotes if present
            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1)
            }

            envVars[key] = value
        }
    })

    return {
        baseUrl: envVars.BASE_URL || 'http://localhost:3001',
        enableAuth: envVars.ENABLE_AUTH === 'true',
        adminEmail: envVars.ADMIN_EMAIL,
        adminPassword: envVars.ADMIN_PASSWORD,
    }
}

async function makeRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        })

        const data = await response.json()

        if (!response.ok) {
            // Handle "tests already running" case (409 Conflict)
            if (response.status === 409 && data.code === 'TESTS_ALREADY_RUNNING') {
                const error = new Error(data.message || 'Tests already running')
                error.code = 'TESTS_ALREADY_RUNNING'
                error.data = data
                throw error
            }

            if (response.status === 423 && data.code === 'CI_AUTORUN_PAUSED') {
                const error = new Error(data.message || 'CI auto-run is paused')
                error.code = 'CI_AUTORUN_PAUSED'
                error.data = data
                throw error
            }

            throw new Error(data.message || `HTTP ${response.status}: ${response.statusText}`)
        }

        return data
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            throw new Error(`Dashboard API is not accessible at ${url}. Is the server running?`)
        }
        throw error
    }
}

// ============================================================================
// Main Functions
// ============================================================================

async function checkDashboardHealth(baseUrl) {
    log('Checking dashboard health...')

    try {
        const data = await makeRequest(`${baseUrl}/api/health`)

        if (data.status === 'ok') {
            log(`Dashboard is healthy: ${data.service}`, 'success')
            return true
        }

        throw new Error(`Unexpected health check response: ${JSON.stringify(data)}`)
    } catch (error) {
        exitWithError(`Dashboard health check failed: ${error.message}`, 3)
    }
}

async function authenticate(baseUrl, email, password) {
    log('Authenticating with dashboard...')

    try {
        const data = await makeRequest(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            body: JSON.stringify({email, password}),
        })

        if ((data.status === 'success' || data.success) && data.data?.token) {
            log('Authentication successful', 'success')
            return data.data.token
        }

        throw new Error('Invalid authentication response')
    } catch (error) {
        exitWithError(`Authentication failed: ${error.message}`, 4)
    }
}

async function triggerTestRun(baseUrl, token, maxWorkers) {
    log(`Triggering CI pipeline${maxWorkers ? ` with ${maxWorkers} workers` : ''}...`)

    const headers = {}
    if (token) {
        headers.Authorization = `Bearer ${token}`
    }

    try {
        const data = await makeRequest(`${baseUrl}/api/pipeline/run`, {
            method: 'POST',
            headers,
            body: JSON.stringify({maxWorkers, source: 'script'}),
        })

        if (data.status === 'success' || data.success) {
            log(`Pipeline started successfully: ${data.data.pipelineRunId}`, 'success')
            return data.data
        }

        throw new Error('Invalid pipeline run response')
    } catch (error) {
        // Handle "tests already running" case
        if (error.code === 'TESTS_ALREADY_RUNNING') {
            throw error // let caller handle wait-and-retry
        }

        if (error.code === 'CI_AUTORUN_PAUSED') {
            const resumeAt = error.data?.resumeAt
            const resumeMsg = resumeAt
                ? ` Resumes at ${new Date(resumeAt).toLocaleString()}.`
                : ' No auto-resume scheduled.'
            log(`CI auto-run is paused.${resumeMsg}`, 'warning')
            if (config.silent) {
                console.log(
                    JSON.stringify({
                        success: false,
                        code: 'CI_AUTORUN_PAUSED',
                        message: 'CI auto-run is paused',
                        resumeAt,
                    })
                )
            }
            process.exit(2)
        }

        if (error.data?.code === 'PIPELINE_EMPTY') {
            exitWithError(
                'No project tabs are configured to run in the CI pipeline. ' +
                    'Enable "In CI pipeline" for at least one tab in Dashboard Settings.',
                3
            )
        }

        exitWithError(`Failed to trigger pipeline run: ${error.message}`, 1)
    }
}

async function waitForTestCompletion(baseUrl, token, pipelineRunId, timeout) {
    log(`Waiting for pipeline ${pipelineRunId} to complete (timeout: ${timeout}s)...`)

    const startTime = Date.now()
    const pollInterval = 3000 // 3 seconds

    const headers = {}
    if (token) {
        headers.Authorization = `Bearer ${token}`
    }

    while (true) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)

        if (elapsed >= timeout) {
            log('Timeout waiting for pipeline completion', 'warning')
            return {
                status: 'timeout',
                message: 'Pipeline execution exceeded timeout limit',
                pipelineRunId,
            }
        }

        try {
            const data = await makeRequest(`${baseUrl}/api/pipeline/status/${pipelineRunId}`, {
                headers,
            })

            if ((data.status === 'success' || data.success) && data.data) {
                const pipeline = data.data

                if (pipeline.status !== 'running') {
                    log(`Pipeline finished with status: ${pipeline.status}`, 'success')
                    return {
                        status: pipeline.status,
                        pipelineRunId: pipeline.pipelineRunId,
                        steps: pipeline.steps,
                        timestamp: new Date().toISOString(),
                    }
                }
            }
        } catch (error) {
            log(`Error polling pipeline status: ${error.message}`, 'warning')
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollInterval))

        if (!config.silent) {
            process.stdout.write(`\r⏳ Waiting... ${elapsed}s elapsed`)
        }
    }
}

async function getRunStats(baseUrl, token) {
    log('Fetching dashboard statistics...')

    const headers = {}
    if (token) {
        headers.Authorization = `Bearer ${token}`
    }

    try {
        const data = await makeRequest(`${baseUrl}/api/runs/stats`, {headers})

        if (data.status === 'success' || data.success) {
            return data.data
        }

        throw new Error('Invalid stats response')
    } catch (error) {
        log(`Failed to fetch stats: ${error.message}`, 'warning')
        return null
    }
}

async function waitUntilFree(baseUrl, token, currentRunId) {
    const startTime = Date.now()
    const headers = token ? {Authorization: `Bearer ${token}`} : {}

    if (!config.silent) process.stdout.write('\n')

    while (true) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)

        if (elapsed >= BUSY_WAIT_TIMEOUT) {
            if (!config.silent) process.stdout.write('\n')
            return false
        }

        await new Promise((resolve) => setTimeout(resolve, BUSY_POLL_INTERVAL))

        if (!config.silent) {
            process.stdout.write(`\r⏳ Waiting for running tests to finish... ${elapsed}s elapsed`)
        }

        try {
            const data = await makeRequest(`${baseUrl}/api/runs?limit=50`, {headers})

            if ((data.status === 'success' || data.success) && data.data) {
                const run = data.data.find((r) => r.id === currentRunId)
                if (!run || run.status !== 'running') {
                    if (!config.silent) process.stdout.write('\n')
                    return true
                }
            }
        } catch (error) {
            log(`Error polling run status: ${error.message}`, 'warning')
        }
    }
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
    // Show help if requested
    if (config.help) {
        console.log(`
YShvydak Test Dashboard - CI Pipeline Trigger

Usage: node scripts/trigger-test-run.js [options]

Options:
  --max-workers <number>  Maximum number of parallel workers
  --wait                  Wait for pipeline completion and return results
  --timeout <seconds>     Maximum wait time (default: 600)
  --silent                Suppress console output (JSON only)
  --help, -h              Show this help message

Examples:
  # Trigger the pipeline and exit immediately
  node scripts/trigger-test-run.js

  # Trigger the pipeline and wait for completion
  node scripts/trigger-test-run.js --wait

  # Trigger with 2 workers and wait
  node scripts/trigger-test-run.js --max-workers 2 --wait

  # Silent mode for n8n (JSON output only)
  node scripts/trigger-test-run.js --wait --silent

Exit Codes:
  0 - Success (non-blocking failures still count as success)
  1 - Pipeline stopped early on a blocking failure, API error, or timeout
  2 - CI auto-run is paused (intentional skip)
  3 - Configuration error (including no pipeline steps configured)
  4 - Authentication error
        `)
        process.exit(0)
    }

    log('=== YShvydak Test Dashboard - Test Trigger ===')

    // Load configuration
    const envConfig = loadEnvConfig()
    log(`Loaded configuration from: ${ENV_FILE}`)
    log(`Dashboard URL: ${envConfig.baseUrl}`)
    log(`Authentication: ${envConfig.enableAuth ? 'enabled' : 'disabled'}`)

    // Check dashboard health
    await checkDashboardHealth(envConfig.baseUrl)

    // Authenticate if needed
    let token = null
    if (envConfig.enableAuth) {
        if (!envConfig.adminEmail || !envConfig.adminPassword) {
            exitWithError('ADMIN_EMAIL and ADMIN_PASSWORD must be set when ENABLE_AUTH=true', 3)
        }
        token = await authenticate(envConfig.baseUrl, envConfig.adminEmail, envConfig.adminPassword)
    }

    // Trigger test run (with wait-and-retry if dashboard is busy)
    let runData
    while (true) {
        try {
            runData = await triggerTestRun(envConfig.baseUrl, token, config.maxWorkers)
            break
        } catch (error) {
            if (error.code === 'TESTS_ALREADY_RUNNING') {
                const errorData = error.data
                log('Tests are already running — waiting for completion before retrying', 'warning')
                log(`  Current Run ID: ${errorData.currentRunId}`, 'warning')
                log(`  Started: ${new Date(errorData.startedAt).toLocaleString()}`, 'warning')
                log(`  Estimated time remaining: ${errorData.estimatedTimeRemaining}s`, 'warning')

                const free = await waitUntilFree(envConfig.baseUrl, token, errorData.currentRunId)
                if (!free) {
                    exitWithError(
                        `Timed out waiting for running tests to finish (${BUSY_WAIT_TIMEOUT / 60} minutes)`,
                        1
                    )
                }
                log('Dashboard is now free. Retrying test run...', 'info')
                // loop retries triggerTestRun
            } else {
                throw error
            }
        }
    }

    // If not waiting, return immediately
    if (!config.wait) {
        const result = {
            success: true,
            message: 'Pipeline triggered successfully',
            pipelineRunId: runData.pipelineRunId,
            steps: runData.steps,
            dashboardUrl: envConfig.baseUrl,
        }

        if (config.silent) {
            console.log(JSON.stringify(result, null, 2))
        } else {
            log('=== Pipeline triggered ===')
            log(`Pipeline Run ID: ${result.pipelineRunId}`)
            log(`View results: ${envConfig.baseUrl}`)
        }

        process.exit(0)
    }

    // Wait for completion
    const completionData = await waitForTestCompletion(
        envConfig.baseUrl,
        token,
        runData.pipelineRunId,
        config.timeout
    )

    const steps = completionData.steps || []
    const failedStepEntry = steps.find((s) => s.status === 'failed')
    const totalFailed = steps.reduce((sum, s) => sum + (s.failed || 0), 0)

    // stopped_early (a blocking step failed) and timeout are real problems.
    // completed_with_failures covers non-blocking failures (e.g. permanently
    // failing known-issue tests) — that's expected, not an alarm, so it does
    // not fail the CI job.
    let pipelineOutcome
    if (completionData.status === 'timeout') {
        pipelineOutcome = 'timeout'
    } else if (completionData.status === 'stopped_early') {
        pipelineOutcome = 'stopped_early'
    } else {
        pipelineOutcome = totalFailed > 0 ? 'completed_with_failures' : 'completed_success'
    }

    const success =
        pipelineOutcome === 'completed_success' || pipelineOutcome === 'completed_with_failures'

    // Get dashboard stats
    const stats = await getRunStats(envConfig.baseUrl, token)

    // Prepare final result
    const result = {
        success,
        message:
            pipelineOutcome === 'completed_success'
                ? 'All pipeline steps completed successfully'
                : pipelineOutcome === 'completed_with_failures'
                  ? 'Pipeline completed with non-blocking failures'
                  : pipelineOutcome === 'stopped_early'
                    ? `Pipeline stopped early at ${failedStepEntry?.project || 'unknown step'}`
                    : 'Pipeline execution timeout',
        pipelineRunId: completionData.pipelineRunId,
        status: pipelineOutcome,
        steps,
        timestamp: completionData.timestamp,
        dashboardUrl: envConfig.baseUrl,
        stats: stats
            ? {
                  totalRuns: stats.total_runs,
                  totalTests: stats.total_tests,
                  successRate: stats.success_rate,
              }
            : null,
    }

    // Output result
    if (config.silent) {
        console.log(JSON.stringify(result, null, 2))
    } else {
        log('\n=== Pipeline Execution Complete ===')
        log(`Status: ${pipelineOutcome}`)
        for (const step of steps) {
            const icon =
                step.status === 'success'
                    ? '✅'
                    : step.status === 'failed'
                      ? '❌'
                      : step.status === 'skipped'
                        ? '⏭️'
                        : '⏳'
            log(
                `  ${icon} ${step.displayName}: ${step.status} (${step.passed ?? 0} passed, ${step.failed ?? 0} failed)`
            )
        }
        log(`\nView full results: ${envConfig.baseUrl}`)
    }

    // Machine-readable line for the calling CI workflow (always printed, even in --silent mode)
    console.log(
        '::PIPELINE_RESULT::' +
            JSON.stringify({
                status: pipelineOutcome,
                failedStep: failedStepEntry?.project || null,
                steps,
            })
    )

    // Exit with appropriate code
    process.exit(success ? 0 : 1)
}

// Run the script
main().catch((error) => {
    exitWithError(`Unexpected error: ${error.message}`, 1)
})
