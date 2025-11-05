/**
 * PlaywrightService Tests (CRITICAL)
 *
 * These tests verify the core test discovery and execution functionality.
 * This is CRITICAL because:
 * 1. Test discovery is the foundation of the entire dashboard
 * 2. Process spawning controls all test execution
 * 3. Test ID generation must match reporter for historical tracking
 * 4. Environment variable handling enables run tracking and reruns
 * 5. Validation ensures proper Playwright installation
 *
 * Coverage target: 80%+
 */

import {describe, it, expect, beforeEach, vi, afterEach, Mock} from 'vitest'
import {PlaywrightService} from '../playwright.service'
import {ChildProcess, spawn} from 'child_process'
import {EventEmitter} from 'events'
import {Readable} from 'stream'
import {PathLike} from 'fs'

// Mock child_process
vi.mock('child_process', () => ({
    spawn: vi.fn(),
}))

// Mock fs module for validation tests
vi.mock('fs', () => ({
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
}))

// Mock config
vi.mock('../../config/environment.config', () => ({
    config: {
        playwright: {
            projectDir: '/test/project',
            reporterPath: 'playwright-dashboard-reporter',
        },
        api: {
            baseUrl: 'http://localhost:3000',
        },
        server: {
            environment: 'test',
        },
    },
}))

// Helper to create mock Readable stream
const createMockReadable = (): Readable => {
    const readable = new EventEmitter() as any
    return readable
}

describe('PlaywrightService', () => {
    let service: PlaywrightService
    let mockSpawn: Mock

    beforeEach(async () => {
        service = new PlaywrightService()
        mockSpawn = spawn as Mock

        // Clear all mocks before each test
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    // ============================================================================
    // TEST DISCOVERY
    // ============================================================================

    describe('discoverTests', () => {
        it('should discover tests from top-level specs', async () => {
            // Arrange
            const mockPlaywrightOutput = {
                suites: [
                    {
                        specs: [
                            {
                                id: 'spec-1',
                                title: 'should login successfully',
                                file: 'auth.spec.ts',
                                line: 10,
                            },
                            {
                                id: 'spec-2',
                                title: 'should handle invalid credentials',
                                file: 'auth.spec.ts',
                                line: 20,
                            },
                        ],
                    },
                ],
            }

            mockSpawn.mockReturnValue(createMockProcess(JSON.stringify(mockPlaywrightOutput)))

            // Act
            const tests = await service.discoverTests()

            // Assert
            expect(tests).toHaveLength(2)
            expect(tests[0]).toMatchObject({
                name: 'should login successfully',
                filePath: 'auth.spec.ts',
                status: 'pending',
            })
            expect(tests[0].testId).toMatch(/^test-/)
            expect(tests[0].id).toBeDefined()
            expect(mockSpawn).toHaveBeenCalledWith(
                'npx',
                ['playwright', 'test', '--list', '--reporter=json'],
                expect.objectContaining({
                    cwd: '/test/project',
                    stdio: ['ignore', 'pipe', 'pipe'],
                })
            )
        })

        it('should discover tests from nested suites', async () => {
            // Arrange
            const mockPlaywrightOutput = {
                suites: [
                    {
                        suites: [
                            {
                                specs: [
                                    {
                                        title: 'nested test 1',
                                        file: 'nested/test.spec.ts',
                                        line: 5,
                                    },
                                    {
                                        title: 'nested test 2',
                                        file: 'nested/test.spec.ts',
                                        line: 15,
                                    },
                                ],
                            },
                        ],
                    },
                ],
            }

            mockSpawn.mockReturnValue(createMockProcess(JSON.stringify(mockPlaywrightOutput)))

            // Act
            const tests = await service.discoverTests()

            // Assert
            expect(tests).toHaveLength(2)
            expect(tests[0].name).toBe('nested test 1')
            expect(tests[0].filePath).toBe('nested/test.spec.ts')
        })

        it('should discover tests from both top-level and nested suites', async () => {
            // Arrange
            const mockPlaywrightOutput = {
                suites: [
                    {
                        specs: [{title: 'top-level test', file: 'top.spec.ts', line: 1}],
                        suites: [
                            {
                                specs: [{title: 'nested test', file: 'nested.spec.ts', line: 1}],
                            },
                        ],
                    },
                ],
            }

            mockSpawn.mockReturnValue(createMockProcess(JSON.stringify(mockPlaywrightOutput)))

            // Act
            const tests = await service.discoverTests()

            // Assert
            expect(tests).toHaveLength(2)
            expect(tests.map((t) => t.name)).toContain('top-level test')
            expect(tests.map((t) => t.name)).toContain('nested test')
        })

        it('should generate stable test IDs using hash algorithm', async () => {
            // Arrange
            const mockPlaywrightOutput = {
                suites: [
                    {
                        specs: [{title: 'test 1', file: 'test.spec.ts', line: 1}],
                    },
                ],
            }

            mockSpawn.mockReturnValue(createMockProcess(JSON.stringify(mockPlaywrightOutput)))

            // Act
            const tests1 = await service.discoverTests()
            vi.clearAllMocks()
            mockSpawn.mockReturnValue(createMockProcess(JSON.stringify(mockPlaywrightOutput)))
            const tests2 = await service.discoverTests()

            // Assert - Same test should get same testId
            expect(tests1[0].testId).toBe(tests2[0].testId)
            expect(tests1[0].testId).toMatch(/^test-/)
        })

        it('should include metadata with line number and discovery timestamp', async () => {
            // Arrange
            const mockPlaywrightOutput = {
                suites: [
                    {
                        specs: [
                            {
                                id: 'spec-123',
                                title: 'test with metadata',
                                file: 'test.spec.ts',
                                line: 42,
                            },
                        ],
                    },
                ],
            }

            mockSpawn.mockReturnValue(createMockProcess(JSON.stringify(mockPlaywrightOutput)))

            // Act
            const tests = await service.discoverTests()

            // Assert
            const metadata = JSON.parse(tests[0].metadata)
            expect(metadata.line).toBe(42)
            expect(metadata.playwrightId).toBe('spec-123')
            expect(metadata.discoveredAt).toBeDefined()
        })

        it('should handle empty test suites', async () => {
            // Arrange
            const mockPlaywrightOutput = {suites: []}

            mockSpawn.mockReturnValue(createMockProcess(JSON.stringify(mockPlaywrightOutput)))

            // Act
            const tests = await service.discoverTests()

            // Assert
            expect(tests).toEqual([])
        })

        it('should throw error when Playwright command fails', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess('', 'Playwright not found', 1))

            // Act & Assert
            await expect(service.discoverTests()).rejects.toThrow(
                /Test discovery failed.*Playwright not found/
            )
        })

        it('should throw error when Playwright output is invalid JSON', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess('invalid json'))

            // Act & Assert
            await expect(service.discoverTests()).rejects.toThrow(
                /Failed to parse Playwright output/
            )
        })

        it('should handle process spawn error', async () => {
            // Arrange
            const mockProcess = new EventEmitter() as ChildProcess & {
                stdout: Readable
                stderr: Readable
            }
            mockProcess.stdout = createMockReadable()
            mockProcess.stderr = createMockReadable()

            mockSpawn.mockReturnValue(mockProcess)

            // Emit error immediately without close event
            setImmediate(() => {
                mockProcess.emit('error', new Error('Spawn failed'))
            })

            // Act & Assert
            await expect(service.discoverTests()).rejects.toThrow(
                /Failed to execute Playwright command: Spawn failed/
            )
        })
    })

    // ============================================================================
    // TEST EXECUTION - runAllTests
    // ============================================================================

    describe('runAllTests', () => {
        it('should spawn process with correct arguments', async () => {
            // Arrange
            const mockProcess = createMockProcess('')
            mockSpawn.mockReturnValue(mockProcess)

            // Act
            const result = await service.runAllTests()

            // Assert
            expect(mockSpawn).toHaveBeenCalledWith(
                'npx',
                ['playwright', 'test', '--reporter=playwright-dashboard-reporter'],
                expect.objectContaining({
                    cwd: '/test/project',
                    stdio: 'inherit',
                })
            )
            expect(result.runId).toBeDefined()
            expect(result.message).toBe('All tests started')
            expect(result.process).toBe(mockProcess)
        })

        it('should include maxWorkers when provided', async () => {
            // Arrange
            const mockProcess = createMockProcess('')
            mockSpawn.mockReturnValue(mockProcess)

            // Act
            await service.runAllTests(4)

            // Assert
            expect(mockSpawn).toHaveBeenCalledWith(
                'npx',
                ['playwright', 'test', '--workers=4', '--reporter=playwright-dashboard-reporter'],
                expect.anything()
            )
        })

        it('should set RUN_ID environment variable', async () => {
            // Arrange
            const mockProcess = createMockProcess('')
            mockSpawn.mockReturnValue(mockProcess)

            // Act
            const result = await service.runAllTests()

            // Assert
            const spawnCall = mockSpawn.mock.calls[0]
            const options = spawnCall[2]
            expect(options.env.RUN_ID).toBe(result.runId)
            expect(options.env.DASHBOARD_API_URL).toBe('http://localhost:3000')
            expect(options.env.NODE_ENV).toBe('test')
        })

        it('should return unique runId for each execution', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(''))

            // Act
            const result1 = await service.runAllTests()
            const result2 = await service.runAllTests()

            // Assert
            expect(result1.runId).not.toBe(result2.runId)
            expect(result1.runId).toMatch(/^[0-9a-f-]{36}$/) // UUID v4 format
        })

        it('should include timestamp in ISO format', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(''))

            // Act
            const result = await service.runAllTests()

            // Assert
            expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
            expect(() => new Date(result.timestamp)).not.toThrow()
        })
    })

    // ============================================================================
    // TEST EXECUTION - runTestGroup
    // ============================================================================

    describe('runTestGroup', () => {
        it('should spawn process with file path', async () => {
            // Arrange
            const mockProcess = createMockProcess('')
            mockSpawn.mockReturnValue(mockProcess)

            // Act
            await service.runTestGroup('auth.spec.ts')

            // Assert
            expect(mockSpawn).toHaveBeenCalledWith(
                'npx',
                ['playwright', 'test', 'auth.spec.ts', '--reporter=playwright-dashboard-reporter'],
                expect.anything()
            )
        })

        it('should pass file path unchanged to Playwright', async () => {
            // Arrange
            const mockProcess = createMockProcess('')
            mockSpawn.mockReturnValue(mockProcess)

            // Act
            await service.runTestGroup('auth.spec.ts')

            // Assert - path is passed as-is, Playwright handles resolution
            const args = mockSpawn.mock.calls[0][1]
            expect(args[2]).toBe('auth.spec.ts')
        })

        it('should pass full paths unchanged to Playwright', async () => {
            // Arrange
            const mockProcess = createMockProcess('')
            mockSpawn.mockReturnValue(mockProcess)

            // Act
            await service.runTestGroup('e2e/tests/auth.spec.ts')

            // Assert - full paths are also passed unchanged
            const args = mockSpawn.mock.calls[0][1]
            expect(args[2]).toBe('e2e/tests/auth.spec.ts')
        })

        it('should include maxWorkers when provided', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(''))

            // Act
            await service.runTestGroup('test.spec.ts', 2)

            // Assert
            const args = mockSpawn.mock.calls[0][1]
            expect(args).toContain('--workers=2')
        })

        it('should set RUN_ID environment variable', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(''))

            // Act
            const result = await service.runTestGroup('test.spec.ts')

            // Assert
            const options = mockSpawn.mock.calls[0][2]
            expect(options.env.RUN_ID).toBe(result.runId)
        })

        it('should return message with file path', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(''))

            // Act
            const result = await service.runTestGroup('auth.spec.ts')

            // Assert
            expect(result.message).toBe('Tests started for auth.spec.ts')
        })

        // ============================================================================
        // NEW: Test filtering with testNames parameter
        // ============================================================================

        it('should add --grep flag when testNames are provided', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(''))
            const testNames = ['Login Test', 'Logout Test']

            // Act
            await service.runTestGroup('auth.spec.ts', undefined, testNames)

            // Assert
            const args = mockSpawn.mock.calls[0][1]
            expect(args).toContain('--grep')
            const grepIndex = args.indexOf('--grep')
            const grepPattern = args[grepIndex + 1]
            expect(grepPattern).toBe(
                '(?<![a-zA-Z])Login Test(?![a-zA-Z])|(?<![a-zA-Z])Logout Test(?![a-zA-Z])'
            )
        })

        it('should escape special regex characters in test names', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(''))
            const testNames = ['Test with (parens)', 'Test with [brackets]']

            // Act
            await service.runTestGroup('test.spec.ts', undefined, testNames)

            // Assert
            const args = mockSpawn.mock.calls[0][1]
            const grepIndex = args.indexOf('--grep')
            const grepPattern = args[grepIndex + 1]
            expect(grepPattern).toContain('\\(parens\\)')
            expect(grepPattern).toContain('\\[brackets\\]')
        })

        it('should not add --grep flag when testNames is undefined', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(''))

            // Act
            await service.runTestGroup('test.spec.ts', undefined, undefined)

            // Assert
            const args = mockSpawn.mock.calls[0][1]
            expect(args).not.toContain('--grep')
        })

        it('should not add --grep flag when testNames is empty array', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(''))

            // Act
            await service.runTestGroup('test.spec.ts', undefined, [])

            // Assert
            const args = mockSpawn.mock.calls[0][1]
            expect(args).not.toContain('--grep')
        })

        it('should work with both maxWorkers and testNames', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(''))
            const testNames = ['Test 1', 'Test 2']

            // Act
            await service.runTestGroup('test.spec.ts', 4, testNames)

            // Assert
            const args = mockSpawn.mock.calls[0][1]
            expect(args).toContain('--workers=4')
            expect(args).toContain('--grep')
        })

        it('should handle single test name in array', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(''))
            const testNames = ['Single Test']

            // Act
            await service.runTestGroup('test.spec.ts', undefined, testNames)

            // Assert
            const args = mockSpawn.mock.calls[0][1]
            const grepIndex = args.indexOf('--grep')
            const grepPattern = args[grepIndex + 1]
            expect(grepPattern).toBe('(?<![a-zA-Z])Single Test(?![a-zA-Z])')
        })
    })

    // ============================================================================
    // TEST EXECUTION - rerunSingleTest
    // ============================================================================

    describe('rerunSingleTest', () => {
        it('should spawn process with --grep flag', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(''))

            // Act
            await service.rerunSingleTest('auth.spec.ts', 'should login successfully')

            // Assert
            expect(mockSpawn).toHaveBeenCalledWith(
                'npx',
                [
                    'playwright',
                    'test',
                    'auth.spec.ts',
                    '--grep',
                    '(?<![a-zA-Z])should login successfully(?![a-zA-Z])', // Pattern uses lookahead/lookbehind to match exact test name
                    '--reporter=json,playwright-dashboard-reporter',
                ],
                expect.anything()
            )
        })

        it('should set RERUN_MODE and RERUN_ID environment variables', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(''))

            // Act
            const result = await service.rerunSingleTest('test.spec.ts', 'test name')

            // Assert
            const options = mockSpawn.mock.calls[0][2]
            expect(options.env.RERUN_MODE).toBe('true')
            expect(options.env.RERUN_ID).toBe(result.runId)
            expect(options.env.RUN_ID).toBeUndefined() // RERUN uses RERUN_ID, not RUN_ID
        })

        it('should use pipe stdio for rerun (not inherit)', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(''))

            // Act
            await service.rerunSingleTest('test.spec.ts', 'test name')

            // Assert
            const options = mockSpawn.mock.calls[0][2]
            expect(options.stdio).toEqual(['ignore', 'pipe', 'pipe'])
        })

        it('should include maxWorkers when provided', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(''))

            // Act
            await service.rerunSingleTest('test.spec.ts', 'test name', 1)

            // Assert
            const args = mockSpawn.mock.calls[0][1]
            expect(args).toContain('--workers=1')
        })

        it('should escape special regex characters in test name', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(''))

            // Act - Test name with special regex characters
            await service.rerunSingleTest('test.spec.ts', 'test with (parentheses) and [brackets]')

            // Assert
            const args = mockSpawn.mock.calls[0][1]
            const grepIndex = args.indexOf('--grep')
            expect(grepIndex).toBeGreaterThan(-1)
            // Special characters should be escaped
            expect(args[grepIndex + 1]).toBe(
                '(?<![a-zA-Z])test with \\(parentheses\\) and \\[brackets\\](?![a-zA-Z])'
            )
        })

        it('should anchor pattern to prevent partial matches', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(''))

            // Act - Test name that could partially match other tests
            await service.rerunSingleTest('login.spec.ts', 'Successful Login')

            // Assert
            const args = mockSpawn.mock.calls[0][1]
            const grepIndex = args.indexOf('--grep')
            expect(grepIndex).toBeGreaterThan(-1)
            // Pattern should use negative lookahead/lookbehind to match exact test name
            expect(args[grepIndex + 1]).toBe('(?<![a-zA-Z])Successful Login(?![a-zA-Z])')
            // This prevents matching "Unsuccessful Login with invalid email"
        })

        it('should return message indicating test rerun', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(''))

            // Act
            const result = await service.rerunSingleTest('test.spec.ts', 'test name')

            // Assert
            expect(result.message).toBe('Test rerun started')
            expect(result.runId).toBeDefined()
        })
    })

    // ============================================================================
    // VALIDATION - validateConfiguration
    // ============================================================================

    describe('validateConfiguration', () => {
        async function getMockFs() {
            const fs = await import('fs')
            return vi.mocked(fs)
        }

        beforeEach(async () => {
            const mockFs = await getMockFs()

            // Default: everything exists
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readFileSync.mockReturnValue(
                JSON.stringify({
                    main: 'index.js',
                })
            )
        })

        it('should return valid when all checks pass', async () => {
            // Act
            const result = await service.validateConfiguration()

            // Assert
            expect(result.isValid).toBe(true)
            expect(result.issues).toEqual([])
            expect(result.projectDir).toBe('/test/project')
            expect(result.reporterExists).toBe(true)
        })

        it('should detect missing project directory', async () => {
            // Arrange
            const mockFs = await getMockFs()
            mockFs.existsSync.mockImplementation((path: PathLike) => {
                const pathStr = path.toString()
                if (pathStr === '/test/project') return false
                return true
            })

            // Act
            const result = await service.validateConfiguration()

            // Assert
            expect(result.isValid).toBe(false)
            expect(result.issues).toContain('Project directory does not exist: /test/project')
        })

        it('should detect missing Playwright config', async () => {
            // Arrange
            const mockFs = await getMockFs()
            mockFs.existsSync.mockImplementation((path: PathLike) => {
                const pathStr = path.toString()
                if (pathStr.includes('playwright.config')) return false
                return true
            })

            // Act
            const result = await service.validateConfiguration()

            // Assert
            expect(result.isValid).toBe(false)
            expect(
                result.issues.some((issue) => issue.includes('Playwright config not found'))
            ).toBe(true)
        })

        it('should detect missing @playwright/test package', async () => {
            // Arrange
            const mockFs = await getMockFs()
            mockFs.existsSync.mockImplementation((path: PathLike) => {
                const pathStr = path.toString()
                if (pathStr.includes('@playwright/test')) return false
                return true
            })

            // Act
            const result = await service.validateConfiguration()

            // Assert
            expect(result.isValid).toBe(false)
            expect(
                result.issues.some((issue) => issue.includes('@playwright/test not installed'))
            ).toBe(true)
        })

        it('should detect missing reporter npm package', async () => {
            // Arrange
            const mockFs = await getMockFs()
            mockFs.existsSync.mockImplementation((path: PathLike) => {
                const pathStr = path.toString()
                if (pathStr.includes('playwright-dashboard-reporter')) return false
                return true
            })

            // Act
            const result = await service.validateConfiguration()

            // Assert
            expect(result.isValid).toBe(false)
            expect(result.reporterExists).toBe(false)
            expect(
                result.issues.some((issue) =>
                    issue.includes('Reporter npm package not found: playwright-dashboard-reporter')
                )
            ).toBe(true)
        })

        it('should detect invalid reporter package.json', async () => {
            // Arrange
            const mockFs = await getMockFs()
            mockFs.readFileSync.mockImplementation(() => {
                throw new Error('Invalid JSON')
            })

            // Act
            const result = await service.validateConfiguration()

            // Assert
            expect(result.isValid).toBe(false)
            expect(
                result.issues.some((issue) => issue.includes('Invalid package.json in reporter'))
            ).toBe(true)
        })

        it('should detect missing reporter main file', async () => {
            // Arrange
            const mockFs = await getMockFs()
            mockFs.existsSync.mockImplementation((path: PathLike) => {
                const pathStr = path.toString()
                if (pathStr.includes('index.js')) return false
                return true
            })
            mockFs.readFileSync.mockReturnValue(JSON.stringify({main: 'index.js'}))

            // Act
            const result = await service.validateConfiguration()

            // Assert
            expect(result.isValid).toBe(false)
            expect(
                result.issues.some((issue) =>
                    issue.includes('Reporter package main file not found: index.js')
                )
            ).toBe(true)
        })

        it('should aggregate multiple validation issues', async () => {
            // Arrange
            const mockFs = await getMockFs()
            mockFs.existsSync.mockReturnValue(false) // Everything missing

            // Act
            const result = await service.validateConfiguration()

            // Assert
            expect(result.isValid).toBe(false)
            expect(result.issues.length).toBeGreaterThan(1)
        })
    })

    // ============================================================================
    // DIAGNOSTICS
    // ============================================================================

    describe('getDiagnostics', () => {
        beforeEach(async () => {
            const fs = await import('fs')
            const mockFs = vi.mocked(fs)

            mockFs.existsSync.mockReturnValue(true)
            mockFs.readFileSync.mockReturnValue(JSON.stringify({main: 'index.js'}))
        })

        it('should return diagnostics with version and config', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(JSON.stringify({suites: []})))

            // Act
            const result = await service.getDiagnostics()

            // Assert
            expect(result.version).toBe('1.0.0')
            expect(result.config).toBeDefined()
            expect(result.config.projectDir).toBe('/test/project')
        })

        it('should include validation results', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(JSON.stringify({suites: []})))

            // Act
            const result = await service.getDiagnostics()

            // Assert
            expect(result.validation).toBeDefined()
            expect(result.validation.isValid).toBe(true)
        })

        it('should test discovery capability when validation passes', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess(JSON.stringify({suites: []})))

            // Act
            const result = await service.getDiagnostics()

            // Assert
            expect(result.healthCheck.canDiscoverTests).toBe(true)
            expect(result.healthCheck.error).toBeUndefined()
        })

        it('should capture discovery errors in health check', async () => {
            // Arrange
            mockSpawn.mockReturnValue(createMockProcess('', 'Discovery failed', 1))

            // Act
            const result = await service.getDiagnostics()

            // Assert
            expect(result.healthCheck.canDiscoverTests).toBe(false)
            expect(result.healthCheck.error).toContain('Discovery failed')
        })

        it('should skip discovery test when validation fails', async () => {
            // Arrange
            const fs = await import('fs')
            const mockFs = vi.mocked(fs)
            mockFs.existsSync.mockReturnValue(false)

            // Act
            const result = await service.getDiagnostics()

            // Assert
            expect(result.healthCheck.canDiscoverTests).toBe(false)
            expect(result.healthCheck.error).toContain('Configuration invalid')
        })
    })

    describe('getReporterDiagnostics', () => {
        beforeEach(async () => {
            const fs = await import('fs')
            const mockFs = vi.mocked(fs)

            mockFs.existsSync.mockReturnValue(true)
        })

        it('should return reporter path and existence status', async () => {
            // Act
            const result = await service.getReporterDiagnostics()

            // Assert
            expect(result.reporterPath).toContain('playwright-dashboard-reporter')
            expect(result.reporterExists).toBe(true)
        })

        it('should detect when reporter does not exist', async () => {
            // Arrange
            const fs = await import('fs')
            const mockFs = vi.mocked(fs)
            mockFs.existsSync.mockReturnValue(false)

            // Act
            const result = await service.getReporterDiagnostics()

            // Assert
            expect(result.reporterExists).toBe(false)
            expect(result.canImportReporter).toBe(false)
        })
    })
})

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Creates a mock ChildProcess that emits data/close events
 */
function createMockProcess(
    stdout = '',
    stderr = '',
    exitCode = 0
): ChildProcess & {stdout: Readable; stderr: Readable} {
    const mockProcess = new EventEmitter() as ChildProcess & {
        stdout: Readable
        stderr: Readable
    }

    mockProcess.stdout = createMockReadable()
    mockProcess.stderr = createMockReadable()

    // Emit data and close after a short delay
    setImmediate(() => {
        if (stdout) mockProcess.stdout.emit('data', Buffer.from(stdout))
        if (stderr) mockProcess.stderr.emit('data', Buffer.from(stderr))
        mockProcess.emit('close', exitCode)
    })

    return mockProcess
}
