/**
 * TypeScript interfaces for Playwright test discovery and execution
 */

export interface PlaywrightTestEntry {
    projectId?: string
    projectName?: string
    timeout?: number
    expectedStatus?: string
    annotations?: Array<{type?: string; description?: string}>
}

export interface PlaywrightSpec {
    id?: string
    title: string
    file: string
    line?: number
    column?: number
    // Playwright's JSON reporter strips the leading '@' (bare 'ABC-123'); Discover re-adds it
    tags?: string[]
    tests?: PlaywrightTestEntry[]
}

export interface PlaywrightSuite {
    // Top-level entries are FILE suites (title = file path); nested suites are describes
    title?: string
    specs?: PlaywrightSpec[]
    suites?: PlaywrightSuite[]
}

export interface PlaywrightProjectConfig {
    id: string
    name: string
}

export interface PlaywrightListOutput {
    suites?: PlaywrightSuite[]
    config?: {
        projects?: PlaywrightProjectConfig[]
    }
}

export interface PlaywrightSpawnOptions {
    runId: string
    type: 'run-all' | 'run-group' | 'rerun'
    filePath?: string
    env?: Record<string, string>
}

export interface ValidationIssue {
    type: 'error' | 'warning'
    message: string
}

export interface ValidationResult {
    isValid: boolean
    issues: string[]
    projectDir: string
    reporterPath: string
    reporterExists: boolean
}
