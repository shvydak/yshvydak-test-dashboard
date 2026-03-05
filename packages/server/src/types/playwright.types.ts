/**
 * TypeScript interfaces for Playwright test discovery and execution
 */

export interface PlaywrightSpec {
    id?: string
    title: string
    file: string
    line?: number
}

export interface PlaywrightSuite {
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
