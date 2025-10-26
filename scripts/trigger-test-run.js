#!/usr/bin/env node

/**
 * YShvydak Test Dashboard - Test Execution Trigger Script
 *
 * This script triggers test execution via the dashboard API and is designed
 * to be called from external automation systems like n8n.
 *
 * Features:
 * - Automatic authentication (if ENABLE_AUTH=true)
 * - Health check before execution
 * - Real-time status monitoring
 * - JSON output for n8n integration
 * - Error handling and retries
 *
 * Usage:
 *   node scripts/trigger-test-run.js [options]
 *
 * Options:
 *   --max-workers <number>  Maximum number of parallel workers (default: from config)
 *   --wait                  Wait for test completion and return results
 *   --timeout <seconds>     Maximum wait time in seconds (default: 600)
 *   --silent                Suppress console output (only JSON result)
 *
 * Exit codes:
 *   0 - Success (all tests passed or --wait not used)
 *   1 - Test execution failed or API error
 *   2 - Configuration error
 *   3 - Authentication error
 *
 * Example:
 *   node scripts/trigger-test-run.js --wait --max-workers 2
 */

const fs = require('fs')
const path = require('path')

// ============================================================================
// Configuration
// ============================================================================

const SCRIPT_DIR = __dirname
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..')
const ENV_FILE = path.join(PROJECT_ROOT, '.env')

// Parse command line arguments
const args = process.argv.slice(2)
const config = {
    maxWorkers: parseInt(args[args.indexOf('--max-workers') + 1]) || undefined,
    wait: args.includes('--wait'),
    timeout: parseInt(args[args.indexOf('--timeout') + 1]) || 600, // 10 minutes default
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
        exitWithError(`Configuration file not found: ${ENV_FILE}`, 2)
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
        exitWithError(`Dashboard health check failed: ${error.message}`, 2)
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
        exitWithError(`Authentication failed: ${error.message}`, 3)
    }
}

async function triggerTestRun(baseUrl, token, maxWorkers) {
    log(`Triggering test run${maxWorkers ? ` with ${maxWorkers} workers` : ''}...`)

    const headers = {}
    if (token) {
        headers.Authorization = `Bearer ${token}`
    }

    try {
        const data = await makeRequest(`${baseUrl}/api/tests/run-all`, {
            method: 'POST',
            headers,
            body: JSON.stringify({maxWorkers}),
        })

        if (data.status === 'success' || data.success) {
            log(`Test run started successfully: ${data.data.runId}`, 'success')
            return data.data
        }

        throw new Error('Invalid test run response')
    } catch (error) {
        exitWithError(`Failed to trigger test run: ${error.message}`, 1)
    }
}

async function waitForTestCompletion(baseUrl, token, runId, timeout) {
    log(`Waiting for test run ${runId} to complete (timeout: ${timeout}s)...`)

    const startTime = Date.now()
    const pollInterval = 3000 // 3 seconds

    const headers = {}
    if (token) {
        headers.Authorization = `Bearer ${token}`
    }

    while (true) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)

        if (elapsed >= timeout) {
            log('Timeout waiting for test completion', 'warning')
            return {
                status: 'timeout',
                message: 'Test execution exceeded timeout limit',
                runId,
            }
        }

        try {
            // Get recent runs to check status
            const data = await makeRequest(`${baseUrl}/api/runs?limit=50`, {headers})

            if ((data.status === 'success' || data.success) && data.data) {
                const run = data.data.find((r) => r.id === runId)

                if (run && run.status !== 'running') {
                    log(`Test run completed with status: ${run.status}`, 'success')
                    return {
                        status: run.status,
                        runId: run.id,
                        results: {
                            totalTests: run.totalTests,
                            passedTests: run.passedTests,
                            failedTests: run.failedTests,
                            skippedTests: run.skippedTests,
                            duration: run.duration,
                            successRate:
                                run.totalTests > 0
                                    ? ((run.passedTests / run.totalTests) * 100).toFixed(2)
                                    : 0,
                        },
                        timestamp: run.timestamp,
                    }
                }
            }
        } catch (error) {
            log(`Error polling run status: ${error.message}`, 'warning')
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

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
    // Show help if requested
    if (config.help) {
        console.log(`
YShvydak Test Dashboard - Test Execution Trigger

Usage: node scripts/trigger-test-run.js [options]

Options:
  --max-workers <number>  Maximum number of parallel workers
  --wait                  Wait for test completion and return results
  --timeout <seconds>     Maximum wait time (default: 600)
  --silent                Suppress console output (JSON only)
  --help, -h              Show this help message

Examples:
  # Trigger tests and exit immediately
  node scripts/trigger-test-run.js

  # Trigger tests and wait for completion
  node scripts/trigger-test-run.js --wait

  # Trigger with 2 workers and wait
  node scripts/trigger-test-run.js --max-workers 2 --wait

  # Silent mode for n8n (JSON output only)
  node scripts/trigger-test-run.js --wait --silent

Exit Codes:
  0 - Success
  1 - Test execution failed
  2 - Configuration error
  3 - Authentication error
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
            exitWithError('ADMIN_EMAIL and ADMIN_PASSWORD must be set when ENABLE_AUTH=true', 2)
        }
        token = await authenticate(envConfig.baseUrl, envConfig.adminEmail, envConfig.adminPassword)
    }

    // Trigger test run
    const runData = await triggerTestRun(envConfig.baseUrl, token, config.maxWorkers)

    // If not waiting, return immediately
    if (!config.wait) {
        const result = {
            success: true,
            message: 'Test run triggered successfully',
            runId: runData.runId,
            timestamp: runData.timestamp,
            dashboardUrl: envConfig.baseUrl,
        }

        if (config.silent) {
            console.log(JSON.stringify(result, null, 2))
        } else {
            log('=== Test run triggered ===')
            log(`Run ID: ${result.runId}`)
            log(`View results: ${envConfig.baseUrl}`)
        }

        process.exit(0)
    }

    // Wait for completion
    const completionData = await waitForTestCompletion(
        envConfig.baseUrl,
        token,
        runData.runId,
        config.timeout
    )

    // Get dashboard stats
    const stats = await getRunStats(envConfig.baseUrl, token)

    // Prepare final result
    const result = {
        success: completionData.status === 'completed',
        message:
            completionData.status === 'completed'
                ? 'All tests completed successfully'
                : completionData.status === 'failed'
                  ? 'Tests completed with failures'
                  : 'Test execution timeout',
        runId: completionData.runId,
        status: completionData.status,
        results: completionData.results,
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
        log('\n=== Test Execution Complete ===')
        log(`Status: ${completionData.status}`)
        if (completionData.results) {
            log(`Total Tests: ${completionData.results.totalTests}`)
            log(`Passed: ${completionData.results.passedTests} ✅`)
            log(`Failed: ${completionData.results.failedTests} ❌`)
            log(`Skipped: ${completionData.results.skippedTests} ⏭️`)
            log(`Duration: ${(completionData.results.duration / 1000).toFixed(1)}s`)
            log(`Success Rate: ${completionData.results.successRate}%`)
        }
        log(`\nView full results: ${envConfig.baseUrl}`)
    }

    // Exit with appropriate code
    process.exit(result.success ? 0 : 1)
}

// Run the script
main().catch((error) => {
    exitWithError(`Unexpected error: ${error.message}`, 1)
})
