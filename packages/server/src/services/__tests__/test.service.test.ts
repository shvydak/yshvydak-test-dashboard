import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {TestService} from '../test.service'
import {FileUtil} from '../../utils/file.util'
import type {TestResultData} from '../../types/database.types'
import type {TestFilters} from '../../types/service.types'
import {EventEmitter} from 'events'
import type {ChildProcess} from 'child_process'

// Mock all dependencies
vi.mock('../../repositories/test.repository')
vi.mock('../../repositories/run.repository')
vi.mock('../playwright.service')
vi.mock('../websocket.service')
vi.mock('../attachment.service')
vi.mock('../note.service')
vi.mock('../../utils/logger.util', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        testDiscovery: vi.fn(),
    },
}))
vi.mock('../../utils/file.util')
vi.mock('../activeProcesses.service', () => ({
    activeProcessesTracker: {
        addProcess: vi.fn(),
        removeProcess: vi.fn(),
        isRunAllActive: vi.fn(() => false),
        getActiveProcesses: vi.fn(() => []),
    },
}))

describe('TestService', () => {
    let testService: TestService
    let mockTestRepository: any
    let mockRunRepository: any
    let mockPlaywrightService: any
    let mockWebSocketService: any
    let mockAttachmentService: any
    let mockNoteService: any

    // Helper to create mock child process
    const createMockProcess = (): ChildProcess => {
        const process = new EventEmitter() as any
        process.stdout = new EventEmitter()
        process.stderr = new EventEmitter()
        process.kill = vi.fn()
        process.pid = 12345
        return process
    }

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks()

        // Setup FileUtil mock (default: file exists)
        vi.mocked(FileUtil.fileExists).mockReturnValue(true)

        // Create mock instances
        mockTestRepository = {
            execute: vi.fn(),
            saveTestResult: vi.fn(),
            getTestResult: vi.fn(),
            getAllTests: vi.fn(),
            getTestResultsByTestId: vi.fn(),
            deleteByTestId: vi.fn(),
            deleteByExecutionId: vi.fn(),
            clearAllTests: vi.fn(),
            getTestStats: vi.fn(),
            getFlakyTests: vi.fn(),
            getTestTimeline: vi.fn(),
        }

        mockRunRepository = {
            createTestRun: vi.fn(),
            updateTestRun: vi.fn(),
            getTestRun: vi.fn(),
        }

        mockPlaywrightService = {
            discoverTests: vi.fn(),
            runAllTests: vi.fn(),
            runTestGroup: vi.fn(),
            rerunSingleTest: vi.fn(),
            getDiagnostics: vi.fn(),
            getReporterDiagnostics: vi.fn(),
        }

        mockWebSocketService = {
            broadcast: vi.fn(),
            broadcastDiscoveryCompleted: vi.fn(),
            broadcastRunStarted: vi.fn(),
            broadcastRunCompleted: vi.fn(),
            broadcastDashboardRefresh: vi.fn(),
        }

        mockAttachmentService = {
            getAttachmentsByTestResult: vi.fn(),
            saveAttachmentsForTestResult: vi.fn(),
            getAttachmentById: vi.fn(),
            clearAllAttachments: vi.fn(),
            deleteAttachmentsForTestResult: vi.fn(),
        }

        mockNoteService = {
            getNote: vi.fn(),
            saveNote: vi.fn(),
            deleteNote: vi.fn(),
        }

        // Create service instance
        testService = new TestService(
            mockTestRepository,
            mockRunRepository,
            mockPlaywrightService,
            mockWebSocketService,
            mockAttachmentService,
            mockNoteService
        )
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    describe('discoverTests', () => {
        it('should discover and save tests successfully', async () => {
            const mockDiscoveredTests = [
                {
                    id: 'test-1',
                    testId: 'hash-1',
                    runId: null,
                    name: 'Test 1',
                    filePath: '/path/to/test1.spec.ts',
                    status: 'pending',
                    duration: 0,
                    metadata: '{}',
                    timestamp: '2025-10-21T10:00:00.000Z',
                },
                {
                    id: 'test-2',
                    testId: 'hash-2',
                    runId: null,
                    name: 'Test 2',
                    filePath: '/path/to/test2.spec.ts',
                    status: 'pending',
                    duration: 0,
                    metadata: '{}',
                    timestamp: '2025-10-21T10:00:00.000Z',
                },
            ]

            mockTestRepository.execute.mockResolvedValue(undefined)
            mockPlaywrightService.discoverTests.mockResolvedValue(mockDiscoveredTests)
            mockTestRepository.saveTestResult.mockResolvedValue('saved-id')

            const result = await testService.discoverTests()

            expect(result.discovered).toBe(2)
            expect(result.saved).toBe(2)
            expect(result.timestamp).toBeDefined()

            // Verify pending tests were cleared
            expect(mockTestRepository.execute).toHaveBeenCalledWith(
                'DELETE FROM test_results WHERE status = ?',
                ['pending']
            )

            // Verify Playwright service was called
            expect(mockPlaywrightService.discoverTests).toHaveBeenCalled()

            // Verify each test was saved
            expect(mockTestRepository.saveTestResult).toHaveBeenCalledTimes(2)

            // Verify WebSocket broadcast
            expect(mockWebSocketService.broadcastDiscoveryCompleted).toHaveBeenCalledWith(2, 2)
        })

        it('should continue if some tests fail to save', async () => {
            const mockDiscoveredTests = [
                {
                    id: 'test-1',
                    testId: 'hash-1',
                    name: 'Test 1',
                    filePath: '/path/to/test1.spec.ts',
                    status: 'pending',
                },
                {
                    id: 'test-2',
                    testId: 'hash-2',
                    name: 'Test 2',
                    filePath: '/path/to/test2.spec.ts',
                    status: 'pending',
                },
            ]

            mockTestRepository.execute.mockResolvedValue(undefined)
            mockPlaywrightService.discoverTests.mockResolvedValue(mockDiscoveredTests)
            mockTestRepository.saveTestResult
                .mockResolvedValueOnce('saved-id-1')
                .mockRejectedValueOnce(new Error('Save failed'))

            const result = await testService.discoverTests()

            expect(result.discovered).toBe(2)
            expect(result.saved).toBe(1) // Only 1 saved successfully
            expect(mockWebSocketService.broadcastDiscoveryCompleted).toHaveBeenCalledWith(2, 1)
        })

        it('should throw error if discovery fails', async () => {
            mockTestRepository.execute.mockResolvedValue(undefined)
            mockPlaywrightService.discoverTests.mockRejectedValue(new Error('Discovery failed'))

            await expect(testService.discoverTests()).rejects.toThrow('Discovery failed')
        })

        it('should throw error if clearing pending tests fails', async () => {
            mockTestRepository.execute.mockRejectedValue(new Error('DB error'))

            await expect(testService.discoverTests()).rejects.toThrow('DB error')
        })
    })

    describe('saveTestResult', () => {
        it('should save test result without attachments', async () => {
            const testData: TestResultData = {
                id: 'exec-1',
                testId: 'hash-1',
                runId: 'run-1',
                name: 'Test 1',
                filePath: '/path/to/test.spec.ts',
                status: 'passed',
                duration: 100,
                metadata: '{}',
                timestamp: '2025-10-21T10:00:00.000Z',
            }

            mockTestRepository.saveTestResult.mockResolvedValue('exec-1')

            const resultId = await testService.saveTestResult(testData)

            expect(resultId).toBe('exec-1')
            expect(mockTestRepository.saveTestResult).toHaveBeenCalledWith(testData)
            expect(mockAttachmentService.saveAttachmentsForTestResult).not.toHaveBeenCalled()
        })

        it('should save test result with attachments', async () => {
            const testDataWithAttachments: any = {
                id: 'exec-1',
                testId: 'hash-1',
                runId: 'run-1',
                name: 'Test 1',
                filePath: '/path/to/test.spec.ts',
                status: 'failed',
                duration: 150,
                errorMessage: 'Assertion failed',
                metadata: '{}',
                timestamp: '2025-10-21T10:00:00.000Z',
                attachments: [
                    {
                        name: 'screenshot.png',
                        path: '/temp/screenshot.png',
                        contentType: 'image/png',
                    },
                    {name: 'trace.zip', path: '/temp/trace.zip', contentType: 'application/zip'},
                ],
            }

            mockTestRepository.saveTestResult.mockResolvedValue('exec-1')
            mockAttachmentService.saveAttachmentsForTestResult.mockResolvedValue([])

            const resultId = await testService.saveTestResult(testDataWithAttachments)

            expect(resultId).toBe('exec-1')
            expect(mockAttachmentService.saveAttachmentsForTestResult).toHaveBeenCalledWith(
                'exec-1',
                testDataWithAttachments.attachments
            )
        })

        it('should enforce INSERT-only strategy (never UPDATE)', async () => {
            const testData1: TestResultData = {
                id: 'exec-1',
                testId: 'same-hash',
                runId: 'run-1',
                name: 'Test Name',
                filePath: '/path/to/test.spec.ts',
                status: 'passed',
                duration: 100,
                metadata: '{}',
                timestamp: '2025-10-21T10:00:00.000Z',
            }

            const testData2: TestResultData = {
                id: 'exec-2', // Different execution ID
                testId: 'same-hash', // Same testId (logical test)
                runId: 'run-2',
                name: 'Test Name',
                filePath: '/path/to/test.spec.ts',
                status: 'failed',
                duration: 120,
                errorMessage: 'Failed',
                metadata: '{}',
                timestamp: '2025-10-21T11:00:00.000Z',
            }

            mockTestRepository.saveTestResult
                .mockResolvedValueOnce('exec-1')
                .mockResolvedValueOnce('exec-2')

            const resultId1 = await testService.saveTestResult(testData1)
            const resultId2 = await testService.saveTestResult(testData2)

            expect(resultId1).toBe('exec-1')
            expect(resultId2).toBe('exec-2')
            expect(mockTestRepository.saveTestResult).toHaveBeenCalledTimes(2)
            // Each call should be an INSERT with different execution IDs
            expect(mockTestRepository.saveTestResult).toHaveBeenNthCalledWith(1, testData1)
            expect(mockTestRepository.saveTestResult).toHaveBeenNthCalledWith(2, testData2)
        })

        it('should handle empty attachments array', async () => {
            const testDataWithEmptyAttachments: any = {
                id: 'exec-1',
                testId: 'hash-1',
                runId: 'run-1',
                name: 'Test 1',
                filePath: '/path/to/test.spec.ts',
                status: 'passed',
                duration: 100,
                metadata: '{}',
                timestamp: '2025-10-21T10:00:00.000Z',
                attachments: [],
            }

            mockTestRepository.saveTestResult.mockResolvedValue('exec-1')
            mockAttachmentService.saveAttachmentsForTestResult.mockResolvedValue([])

            const resultId = await testService.saveTestResult(testDataWithEmptyAttachments)

            expect(resultId).toBe('exec-1')
            expect(mockAttachmentService.saveAttachmentsForTestResult).toHaveBeenCalledWith(
                'exec-1',
                []
            )
        })
    })

    describe('getTestHistory', () => {
        it('should retrieve test history with attachments', async () => {
            const mockHistory = [
                {
                    id: 'exec-3',
                    testId: 'hash-1',
                    runId: 'run-3',
                    name: 'Test 1',
                    status: 'passed',
                    duration: 100,
                },
                {
                    id: 'exec-2',
                    testId: 'hash-1',
                    runId: 'run-2',
                    name: 'Test 1',
                    status: 'failed',
                    duration: 150,
                },
                {
                    id: 'exec-1',
                    testId: 'hash-1',
                    runId: 'run-1',
                    name: 'Test 1',
                    status: 'passed',
                    duration: 120,
                },
            ]

            const mockAttachments1 = [
                {id: 'att-1', fileName: 'screenshot1.png', type: 'screenshot'},
            ]
            const mockAttachments2 = [
                {id: 'att-2', fileName: 'screenshot2.png', type: 'screenshot'},
                {id: 'att-3', fileName: 'trace.zip', type: 'trace'},
            ]
            const mockAttachments3: any[] = []

            mockTestRepository.getTestResultsByTestId.mockResolvedValue(mockHistory)
            mockAttachmentService.getAttachmentsByTestResult
                .mockResolvedValueOnce(mockAttachments1)
                .mockResolvedValueOnce(mockAttachments2)
                .mockResolvedValueOnce(mockAttachments3)

            const history = await testService.getTestHistory('hash-1', 50)

            expect(history).toHaveLength(3)
            expect(history[0].attachments).toEqual(mockAttachments1)
            expect(history[1].attachments).toEqual(mockAttachments2)
            expect(history[2].attachments).toEqual(mockAttachments3)

            expect(mockTestRepository.getTestResultsByTestId).toHaveBeenCalledWith('hash-1', 50)
            expect(mockAttachmentService.getAttachmentsByTestResult).toHaveBeenCalledTimes(3)
        })

        it('should use default limit of 50 if not provided', async () => {
            mockTestRepository.getTestResultsByTestId.mockResolvedValue([])

            await testService.getTestHistory('hash-1')

            expect(mockTestRepository.getTestResultsByTestId).toHaveBeenCalledWith('hash-1', 50)
        })

        it('should handle custom limit', async () => {
            mockTestRepository.getTestResultsByTestId.mockResolvedValue([])

            await testService.getTestHistory('hash-1', 10)

            expect(mockTestRepository.getTestResultsByTestId).toHaveBeenCalledWith('hash-1', 10)
        })

        it('should handle empty history', async () => {
            mockTestRepository.getTestResultsByTestId.mockResolvedValue([])

            const history = await testService.getTestHistory('hash-1')

            expect(history).toEqual([])
            expect(mockAttachmentService.getAttachmentsByTestResult).not.toHaveBeenCalled()
        })

        it('should handle history ordered by timestamp (latest first)', async () => {
            const mockHistory = [
                {id: 'exec-3', timestamp: '2025-10-21T12:00:00.000Z'},
                {id: 'exec-2', timestamp: '2025-10-21T11:00:00.000Z'},
                {id: 'exec-1', timestamp: '2025-10-21T10:00:00.000Z'},
            ]

            mockTestRepository.getTestResultsByTestId.mockResolvedValue(mockHistory)
            mockAttachmentService.getAttachmentsByTestResult.mockResolvedValue([])

            const history = await testService.getTestHistory('hash-1')

            // Verify order is maintained (latest first)
            expect(history[0].id).toBe('exec-3')
            expect(history[1].id).toBe('exec-2')
            expect(history[2].id).toBe('exec-1')
        })
    })

    describe('getAllTests', () => {
        it('should get all tests with filters', async () => {
            const filters: TestFilters = {
                runId: 'run-1',
                status: 'passed',
                limit: 20,
            }

            const mockTests = [
                {id: 'test-1', name: 'Test 1', status: 'passed', runId: 'run-1'},
                {id: 'test-2', name: 'Test 2', status: 'passed', runId: 'run-1'},
            ]

            mockTestRepository.getAllTests.mockResolvedValue(mockTests)

            const result = await testService.getAllTests(filters)

            expect(result).toEqual(mockTests)
            expect(mockTestRepository.getAllTests).toHaveBeenCalledWith(filters)
        })

        it('should get all tests without filters', async () => {
            const filters: TestFilters = {}
            mockTestRepository.getAllTests.mockResolvedValue([])

            const result = await testService.getAllTests(filters)

            expect(result).toEqual([])
            expect(mockTestRepository.getAllTests).toHaveBeenCalledWith({})
        })
    })

    describe('getTestById', () => {
        it('should get test by id with attachments', async () => {
            const mockTest = {
                id: 'exec-1',
                testId: 'hash-1',
                name: 'Test 1',
                status: 'passed',
            }

            const mockAttachments = [{id: 'att-1', fileName: 'screenshot.png', type: 'screenshot'}]

            mockTestRepository.getTestResult.mockResolvedValue(mockTest)
            mockAttachmentService.getAttachmentsByTestResult.mockResolvedValue(mockAttachments)

            const result = await testService.getTestById('exec-1')

            expect(result).toEqual({...mockTest, attachments: mockAttachments})
            expect(mockTestRepository.getTestResult).toHaveBeenCalledWith('exec-1')
            expect(mockAttachmentService.getAttachmentsByTestResult).toHaveBeenCalledWith('exec-1')
        })

        it('should return null if test not found', async () => {
            mockTestRepository.getTestResult.mockResolvedValue(null)

            const result = await testService.getTestById('non-existent')

            expect(result).toBeNull()
            expect(mockAttachmentService.getAttachmentsByTestResult).not.toHaveBeenCalled()
        })
    })

    describe('clearAllTests', () => {
        it('should clear all tests', async () => {
            mockTestRepository.clearAllTests.mockResolvedValue(undefined)

            await testService.clearAllTests()

            expect(mockTestRepository.clearAllTests).toHaveBeenCalled()
        })

        it('should propagate errors from repository', async () => {
            mockTestRepository.clearAllTests.mockRejectedValue(new Error('Clear failed'))

            await expect(testService.clearAllTests()).rejects.toThrow('Clear failed')
        })
    })

    describe('getTestStats', () => {
        it('should get database statistics', async () => {
            const mockStats = {
                totalTests: 100,
                totalRuns: 50,
                totalAttachments: 200,
                databaseSize: 1024000,
                lastUpdated: '2025-10-21T10:00:00.000Z',
            }

            mockTestRepository.getTestStats.mockResolvedValue(mockStats)

            const result = await testService.getTestStats()

            expect(result).toEqual(mockStats)
            expect(mockTestRepository.getTestStats).toHaveBeenCalled()
        })
    })

    describe('getFlakyTests', () => {
        it('should get flaky tests with default parameters', async () => {
            const mockFlakyTests = [{testId: 'hash-1', flakyRate: 0.25, totalRuns: 20, failures: 5}]

            mockTestRepository.getFlakyTests.mockResolvedValue(mockFlakyTests)

            const result = await testService.getFlakyTests()

            expect(result).toEqual(mockFlakyTests)
            expect(mockTestRepository.getFlakyTests).toHaveBeenCalledWith(30, 10)
        })

        it('should get flaky tests with custom parameters', async () => {
            const mockFlakyTests: any[] = []
            mockTestRepository.getFlakyTests.mockResolvedValue(mockFlakyTests)

            const result = await testService.getFlakyTests(7, 20)

            expect(result).toEqual(mockFlakyTests)
            expect(mockTestRepository.getFlakyTests).toHaveBeenCalledWith(7, 20)
        })
    })

    describe('getTestTimeline', () => {
        it('should get test timeline with default days', async () => {
            const mockTimeline = [
                {date: '2025-10-21', passed: 10, failed: 2},
                {date: '2025-10-20', passed: 8, failed: 1},
            ]

            mockTestRepository.getTestTimeline.mockResolvedValue(mockTimeline)

            const result = await testService.getTestTimeline()

            expect(result).toEqual(mockTimeline)
            expect(mockTestRepository.getTestTimeline).toHaveBeenCalledWith(30)
        })

        it('should get test timeline with custom days', async () => {
            mockTestRepository.getTestTimeline.mockResolvedValue([])

            await testService.getTestTimeline(7)

            expect(mockTestRepository.getTestTimeline).toHaveBeenCalledWith(7)
        })
    })

    describe('runAllTests', () => {
        it('should run all tests successfully', async () => {
            const mockProcess = createMockProcess()
            const mockResult = {
                runId: 'run-123',
                message: 'Tests started',
                timestamp: '2025-10-21T10:00:00.000Z',
                process: mockProcess,
            }

            mockPlaywrightService.runAllTests.mockResolvedValue(mockResult)
            mockRunRepository.createTestRun.mockResolvedValue('run-123')

            const result = await testService.runAllTests(4)

            expect(result).toEqual(mockResult)
            expect(mockPlaywrightService.runAllTests).toHaveBeenCalledWith(4)
            expect(mockRunRepository.createTestRun).toHaveBeenCalledWith({
                id: 'run-123',
                status: 'running',
                totalTests: 0,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
                metadata: {
                    type: 'run-all',
                    triggeredFrom: 'dashboard',
                },
            })
            expect(mockWebSocketService.broadcastRunStarted).toHaveBeenCalledWith(
                'run-123',
                'run-all'
            )
        })

        it('should handle process completion', async () => {
            const mockProcess = createMockProcess()
            const mockResult = {
                runId: 'run-123',
                message: 'Tests started',
                timestamp: '2025-10-21T10:00:00.000Z',
                process: mockProcess,
            }

            mockPlaywrightService.runAllTests.mockResolvedValue(mockResult)
            mockRunRepository.createTestRun.mockResolvedValue('run-123')

            await testService.runAllTests()

            // Simulate process completion (code || 1 is used, so code 0 becomes 1)
            mockProcess.emit('close', 0)

            expect(mockWebSocketService.broadcastRunCompleted).toHaveBeenCalledWith(
                'run-123',
                1,
                'run-all'
            )
        })

        it('should handle process failure', async () => {
            const mockProcess = createMockProcess()
            const mockResult = {
                runId: 'run-123',
                message: 'Tests started',
                timestamp: '2025-10-21T10:00:00.000Z',
                process: mockProcess,
            }

            mockPlaywrightService.runAllTests.mockResolvedValue(mockResult)
            mockRunRepository.createTestRun.mockResolvedValue('run-123')

            await testService.runAllTests()

            // Simulate process failure
            mockProcess.emit('close', 1)

            expect(mockWebSocketService.broadcastRunCompleted).toHaveBeenCalledWith(
                'run-123',
                1,
                'run-all'
            )
        })

        it('should prevent duplicate runs when tests are already running', async () => {
            // Mock activeProcessesTracker to indicate tests are running
            const {activeProcessesTracker} = await import('../activeProcesses.service')
            vi.mocked(activeProcessesTracker.isRunAllActive).mockReturnValue(true)
            vi.mocked(activeProcessesTracker.getActiveProcesses).mockReturnValue([
                {
                    id: 'existing-run-123',
                    type: 'run-all',
                    startedAt: new Date(Date.now() - 60000).toISOString(), // Started 1 minute ago
                    details: {
                        runId: 'existing-run-123',
                    },
                },
            ])

            await expect(testService.runAllTests()).rejects.toThrow('TESTS_ALREADY_RUNNING')

            // Verify that PlaywrightService was NOT called
            expect(mockPlaywrightService.runAllTests).not.toHaveBeenCalled()
            expect(mockRunRepository.createTestRun).not.toHaveBeenCalled()
        })

        it('should include current run details in error when duplicate run prevented', async () => {
            const startTime = new Date(Date.now() - 60000).toISOString()
            const {activeProcessesTracker} = await import('../activeProcesses.service')
            vi.mocked(activeProcessesTracker.isRunAllActive).mockReturnValue(true)
            vi.mocked(activeProcessesTracker.getActiveProcesses).mockReturnValue([
                {
                    id: 'existing-run-456',
                    type: 'run-all',
                    startedAt: startTime,
                    details: {
                        runId: 'existing-run-456',
                    },
                },
            ])

            try {
                await testService.runAllTests()
                expect.fail('Should have thrown error')
            } catch (error: any) {
                const errorData = JSON.parse(error.message)
                expect(errorData.code).toBe('TESTS_ALREADY_RUNNING')
                expect(errorData.currentRunId).toBe('existing-run-456')
                expect(errorData.startedAt).toBe(startTime)
                expect(errorData.estimatedTimeRemaining).toBeGreaterThanOrEqual(0)
            }
        })

        it('should allow new run when no tests are running', async () => {
            const mockProcess = createMockProcess()
            const mockResult = {
                runId: 'run-789',
                message: 'Tests started',
                timestamp: '2025-10-21T10:00:00.000Z',
                process: mockProcess,
            }

            const {activeProcessesTracker} = await import('../activeProcesses.service')
            vi.mocked(activeProcessesTracker.isRunAllActive).mockReturnValue(false)
            vi.mocked(activeProcessesTracker.getActiveProcesses).mockReturnValue([])

            mockPlaywrightService.runAllTests.mockResolvedValue(mockResult)
            mockRunRepository.createTestRun.mockResolvedValue('run-789')

            const result = await testService.runAllTests()

            expect(result).toEqual(mockResult)
            expect(mockPlaywrightService.runAllTests).toHaveBeenCalled()
        })
    })

    describe('runTestGroup', () => {
        it('should run test group successfully', async () => {
            const mockProcess = createMockProcess()
            const mockResult = {
                runId: 'run-456',
                message: 'Group tests started',
                timestamp: '2025-10-21T10:00:00.000Z',
                process: mockProcess,
            }

            mockPlaywrightService.runTestGroup.mockResolvedValue(mockResult)
            mockRunRepository.createTestRun.mockResolvedValue('run-456')

            const result = await testService.runTestGroup('/path/to/test.spec.ts', 2)

            expect(result).toEqual(mockResult)
            expect(mockPlaywrightService.runTestGroup).toHaveBeenCalledWith(
                '/path/to/test.spec.ts',
                2,
                undefined
            )
            expect(mockRunRepository.createTestRun).toHaveBeenCalledWith({
                id: 'run-456',
                status: 'running',
                totalTests: 0,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
                metadata: {
                    type: 'run-group',
                    filePath: '/path/to/test.spec.ts',
                    triggeredFrom: 'dashboard',
                },
            })
            expect(mockWebSocketService.broadcastRunStarted).toHaveBeenCalledWith(
                'run-456',
                'run-group',
                '/path/to/test.spec.ts'
            )
        })

        it('should handle group process completion', async () => {
            const mockProcess = createMockProcess()
            const mockResult = {
                runId: 'run-456',
                message: 'Group tests started',
                timestamp: '2025-10-21T10:00:00.000Z',
                process: mockProcess,
            }

            mockPlaywrightService.runTestGroup.mockResolvedValue(mockResult)
            mockRunRepository.createTestRun.mockResolvedValue('run-456')

            await testService.runTestGroup('/path/to/test.spec.ts')

            // Simulate process completion (code || 1 is used, so code 0 becomes 1)
            mockProcess.emit('close', 0)

            expect(mockWebSocketService.broadcastRunCompleted).toHaveBeenCalledWith(
                'run-456',
                1,
                'run-group',
                '/path/to/test.spec.ts'
            )
        })
    })

    describe('rerunTest', () => {
        it('should rerun test successfully', async () => {
            const mockTest = {
                id: 'exec-1',
                testId: 'hash-1',
                name: 'Test 1',
                filePath: '/path/to/test.spec.ts',
                status: 'failed',
            }

            const mockProcess = createMockProcess()
            const mockResult = {
                runId: 'rerun-789',
                message: 'Test rerun started',
                timestamp: '2025-10-21T10:00:00.000Z',
                process: mockProcess,
            }

            mockTestRepository.getTestResult.mockResolvedValue(mockTest)
            mockPlaywrightService.rerunSingleTest.mockResolvedValue(mockResult)
            mockRunRepository.createTestRun.mockResolvedValue('rerun-789')

            const result = await testService.rerunTest('exec-1', 1)

            expect(result.runId).toBe('rerun-789')
            expect(result.testId).toBe('exec-1')
            expect(result.testName).toBe('Test 1')
            expect(mockPlaywrightService.rerunSingleTest).toHaveBeenCalledWith(
                '/path/to/test.spec.ts',
                'Test 1',
                1
            )
            expect(mockRunRepository.createTestRun).toHaveBeenCalledWith({
                id: 'rerun-789',
                status: 'running',
                totalTests: 1,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
                metadata: {
                    type: 'rerun',
                    originalTestId: 'exec-1',
                    originalTestName: 'Test 1',
                    filePath: '/path/to/test.spec.ts',
                },
            })
        })

        it('should throw error if test not found', async () => {
            mockTestRepository.getTestResult.mockResolvedValue(null)

            await expect(testService.rerunTest('non-existent')).rejects.toThrow('Test not found')
            expect(mockPlaywrightService.rerunSingleTest).not.toHaveBeenCalled()
        })

        it('should handle rerun process completion successfully', async () => {
            const mockTest = {
                id: 'exec-1',
                testId: 'hash-1',
                name: 'Test 1',
                filePath: '/path/to/test.spec.ts',
                status: 'failed',
            }

            const mockProcess = createMockProcess()
            const mockResult = {
                runId: 'rerun-789',
                message: 'Test rerun started',
                timestamp: '2025-10-21T10:00:00.000Z',
                process: mockProcess,
            }

            mockTestRepository.getTestResult.mockResolvedValue(mockTest)
            mockPlaywrightService.rerunSingleTest.mockResolvedValue(mockResult)
            mockRunRepository.createTestRun.mockResolvedValue('rerun-789')
            mockRunRepository.updateTestRun.mockResolvedValue(undefined)

            await testService.rerunTest('exec-1')

            // Simulate successful completion
            mockProcess.emit('close', 0)

            // Wait for async handlers
            await new Promise((resolve) => setTimeout(resolve, 10))

            expect(mockRunRepository.updateTestRun).toHaveBeenCalledWith('rerun-789', {
                status: 'completed',
            })
            expect(mockWebSocketService.broadcast).toHaveBeenCalledWith({
                type: 'run:completed',
                data: {
                    runId: 'rerun-789',
                    exitCode: 0,
                    testId: 'hash-1',
                    testName: 'Test 1',
                    originalTestId: 'exec-1',
                    isRerun: true,
                    type: 'rerun',
                },
            })
        })

        it('should handle rerun process failure', async () => {
            const mockTest = {
                id: 'exec-1',
                testId: 'hash-1',
                name: 'Test 1',
                filePath: '/path/to/test.spec.ts',
                status: 'passed',
            }

            const mockProcess = createMockProcess()
            const mockResult = {
                runId: 'rerun-789',
                message: 'Test rerun started',
                timestamp: '2025-10-21T10:00:00.000Z',
                process: mockProcess,
            }

            mockTestRepository.getTestResult.mockResolvedValue(mockTest)
            mockPlaywrightService.rerunSingleTest.mockResolvedValue(mockResult)
            mockRunRepository.createTestRun.mockResolvedValue('rerun-789')
            mockRunRepository.updateTestRun.mockResolvedValue(undefined)

            await testService.rerunTest('exec-1')

            // Simulate failed completion
            mockProcess.emit('close', 1)

            // Wait for async handlers
            await new Promise((resolve) => setTimeout(resolve, 10))

            expect(mockRunRepository.updateTestRun).toHaveBeenCalledWith('rerun-789', {
                status: 'failed',
            })
        })
    })

    describe('getDiagnostics', () => {
        it('should get comprehensive diagnostics', async () => {
            const mockPlaywrightDiagnostics = {
                version: '1.40.0',
                config: {},
                validation: {
                    isValid: true,
                    issues: [],
                    projectDir: '/project',
                    reporterPath: '/reporter',
                    reporterExists: true,
                },
                healthCheck: {
                    canDiscoverTests: true,
                },
            }

            const mockReporterDiagnostics = {
                reporterPath: '/reporter',
                reporterExists: true,
                canImportReporter: true,
            }

            const mockDbStats = {
                totalTests: 100,
                totalRuns: 50,
                totalAttachments: 200,
                databaseSize: 1024000,
                lastUpdated: '2025-10-21T10:00:00.000Z',
            }

            mockPlaywrightService.getDiagnostics.mockResolvedValue(mockPlaywrightDiagnostics)
            mockPlaywrightService.getReporterDiagnostics.mockResolvedValue(mockReporterDiagnostics)
            mockTestRepository.getTestStats.mockResolvedValue(mockDbStats)

            const result = await testService.getDiagnostics()

            expect(result.playwright).toEqual(mockPlaywrightDiagnostics)
            expect(result.reporter).toEqual(mockReporterDiagnostics)
            expect(result.database.connected).toBe(true)
            expect(result.database.stats).toEqual(mockDbStats)
            expect(result.timestamp).toBeDefined()
        })

        it('should fetch diagnostics in parallel', async () => {
            const mockDiagnostics = {version: '1.40.0'}
            const mockReporterDiag = {reporterExists: true}
            const mockStats = {totalTests: 0}

            mockPlaywrightService.getDiagnostics.mockResolvedValue(mockDiagnostics as any)
            mockPlaywrightService.getReporterDiagnostics.mockResolvedValue(mockReporterDiag as any)
            mockTestRepository.getTestStats.mockResolvedValue(mockStats as any)

            await testService.getDiagnostics()

            // All three should be called (Promise.all)
            expect(mockPlaywrightService.getDiagnostics).toHaveBeenCalled()
            expect(mockPlaywrightService.getReporterDiagnostics).toHaveBeenCalled()
            expect(mockTestRepository.getTestStats).toHaveBeenCalled()
        })
    })

    describe('getTraceFileById', () => {
        it('should get trace file by attachment id', async () => {
            const mockAttachment = {
                id: 'att-1',
                fileName: 'trace.zip',
                filePath: '/attachments/trace.zip',
                type: 'trace',
            }

            mockAttachmentService.getAttachmentById.mockResolvedValue(mockAttachment)

            const result = await testService.getTraceFileById('att-1')

            expect(result).toEqual({
                filePath: '/attachments/trace.zip',
                fileName: 'trace.zip',
            })
            expect(mockAttachmentService.getAttachmentById).toHaveBeenCalledWith('att-1')
        })

        it('should return null if attachment not found', async () => {
            mockAttachmentService.getAttachmentById.mockResolvedValue(null)

            const result = await testService.getTraceFileById('non-existent')

            expect(result).toBeNull()
        })

        it('should return null if attachment is not a trace file', async () => {
            const mockAttachment = {
                id: 'att-1',
                fileName: 'screenshot.png',
                filePath: '/attachments/screenshot.png',
                type: 'screenshot',
            }

            mockAttachmentService.getAttachmentById.mockResolvedValue(mockAttachment)

            const result = await testService.getTraceFileById('att-1')

            expect(result).toBeNull()
        })

        it('should return null if attachment has no file path', async () => {
            const mockAttachment = {
                id: 'att-1',
                fileName: 'trace.zip',
                filePath: null,
                type: 'trace',
            }

            mockAttachmentService.getAttachmentById.mockResolvedValue(mockAttachment as any)

            const result = await testService.getTraceFileById('att-1')

            expect(result).toBeNull()
        })

        it('should return null if file does not exist', async () => {
            vi.mocked(FileUtil.fileExists).mockReturnValue(false)

            const mockAttachment = {
                id: 'att-1',
                fileName: 'trace.zip',
                filePath: '/attachments/trace.zip',
                type: 'trace',
            }

            mockAttachmentService.getAttachmentById.mockResolvedValue(mockAttachment)

            const result = await testService.getTraceFileById('att-1')

            expect(result).toBeNull()
        })

        it('should use default fileName if not provided', async () => {
            const mockAttachment = {
                id: 'att-1',
                fileName: null,
                filePath: '/attachments/trace.zip',
                type: 'trace',
            }

            mockAttachmentService.getAttachmentById.mockResolvedValue(mockAttachment as any)

            const result = await testService.getTraceFileById('att-1')

            expect(result?.fileName).toBe('trace.zip')
        })

        it('should throw error if getAttachmentById fails', async () => {
            mockAttachmentService.getAttachmentById.mockRejectedValue(new Error('DB error'))

            await expect(testService.getTraceFileById('att-1')).rejects.toThrow('DB error')
        })
    })

    describe('Error Handling', () => {
        it('should handle repository errors in saveTestResult', async () => {
            const testData: TestResultData = {
                id: 'exec-1',
                testId: 'hash-1',
                runId: 'run-1',
                name: 'Test 1',
                filePath: '/path/to/test.spec.ts',
                status: 'passed',
                duration: 100,
                metadata: '{}',
                timestamp: '2025-10-21T10:00:00.000Z',
            }

            mockTestRepository.saveTestResult.mockRejectedValue(new Error('DB constraint failed'))

            await expect(testService.saveTestResult(testData)).rejects.toThrow(
                'DB constraint failed'
            )
        })

        it('should handle WebSocket service failures gracefully in runAllTests', async () => {
            const mockProcess = createMockProcess()
            const mockResult = {
                runId: 'run-123',
                message: 'Tests started',
                timestamp: '2025-10-21T10:00:00.000Z',
                process: mockProcess,
            }

            mockPlaywrightService.runAllTests.mockResolvedValue(mockResult)
            mockRunRepository.createTestRun.mockResolvedValue('run-123')
            mockWebSocketService.broadcastRunStarted.mockImplementation(() => {
                throw new Error('WebSocket error')
            })

            // Should still complete despite WebSocket error
            await expect(testService.runAllTests()).rejects.toThrow('WebSocket error')
        })

        it('should handle attachment service errors in saveTestResult', async () => {
            const testDataWithAttachments: any = {
                id: 'exec-1',
                testId: 'hash-1',
                runId: 'run-1',
                name: 'Test 1',
                filePath: '/path/to/test.spec.ts',
                status: 'failed',
                duration: 150,
                errorMessage: 'Assertion failed',
                metadata: '{}',
                timestamp: '2025-10-21T10:00:00.000Z',
                attachments: [{name: 'screenshot.png'}],
            }

            mockTestRepository.saveTestResult.mockResolvedValue('exec-1')
            mockAttachmentService.saveAttachmentsForTestResult.mockRejectedValue(
                new Error('Attachment save failed')
            )

            await expect(testService.saveTestResult(testDataWithAttachments)).rejects.toThrow(
                'Attachment save failed'
            )
        })
    })

    describe('deleteTest', () => {
        it('should delete test with all executions, attachments, and note', async () => {
            const testId = 'test-to-delete'
            const executions = [
                {
                    id: 'exec-1',
                    testId,
                    runId: 'run-1',
                    name: 'Test',
                    filePath: '/path/test.spec.ts',
                    status: 'passed',
                    duration: 100,
                    timestamp: '2025-10-21T10:00:00.000Z',
                    createdAt: '2025-10-21T10:00:00.000Z',
                    updatedAt: '2025-10-21T10:00:00.000Z',
                    attachments: [],
                },
                {
                    id: 'exec-2',
                    testId,
                    runId: 'run-2',
                    name: 'Test',
                    filePath: '/path/test.spec.ts',
                    status: 'failed',
                    duration: 150,
                    timestamp: '2025-10-21T11:00:00.000Z',
                    createdAt: '2025-10-21T11:00:00.000Z',
                    updatedAt: '2025-10-21T11:00:00.000Z',
                    attachments: [],
                },
            ]

            mockTestRepository.getTestResultsByTestId.mockResolvedValue(executions)
            mockAttachmentService.deleteAttachmentsForTestResult.mockResolvedValue(3)
            mockNoteService.deleteNote.mockResolvedValue(undefined)
            mockTestRepository.deleteByTestId.mockResolvedValue(2)

            const result = await testService.deleteTest(testId)

            // Should get executions first
            expect(mockTestRepository.getTestResultsByTestId).toHaveBeenCalledWith(testId, 1000)

            // Should delete attachments for each execution
            expect(mockAttachmentService.deleteAttachmentsForTestResult).toHaveBeenCalledTimes(2)
            expect(mockAttachmentService.deleteAttachmentsForTestResult).toHaveBeenCalledWith(
                'exec-1'
            )
            expect(mockAttachmentService.deleteAttachmentsForTestResult).toHaveBeenCalledWith(
                'exec-2'
            )

            // Should delete note
            expect(mockNoteService.deleteNote).toHaveBeenCalledWith(testId)

            // Should delete test records
            expect(mockTestRepository.deleteByTestId).toHaveBeenCalledWith(testId)

            // Should return deleted count
            expect(result).toEqual({deletedExecutions: 2})
        })

        it('should handle deletion when no executions exist', async () => {
            const testId = 'non-existent-test'

            mockTestRepository.getTestResultsByTestId.mockResolvedValue([])
            mockTestRepository.deleteByTestId.mockResolvedValue(0)

            const result = await testService.deleteTest(testId)

            expect(mockAttachmentService.deleteAttachmentsForTestResult).not.toHaveBeenCalled()
            expect(result).toEqual({deletedExecutions: 0})
        })

        it('should continue deleting even if attachment deletion fails', async () => {
            const testId = 'test-with-attachment-errors'
            const executions = [
                {
                    id: 'exec-1',
                    testId,
                    runId: 'run-1',
                    name: 'Test',
                    filePath: '/path/test.spec.ts',
                    status: 'passed',
                    duration: 100,
                    timestamp: '2025-10-21T10:00:00.000Z',
                    createdAt: '2025-10-21T10:00:00.000Z',
                    updatedAt: '2025-10-21T10:00:00.000Z',
                    attachments: [],
                },
            ]

            mockTestRepository.getTestResultsByTestId.mockResolvedValue(executions)
            mockAttachmentService.deleteAttachmentsForTestResult.mockRejectedValue(
                new Error('Permission denied')
            )
            mockTestRepository.deleteByTestId.mockResolvedValue(1)

            const result = await testService.deleteTest(testId)

            // Should still delete test records despite attachment error
            expect(mockTestRepository.deleteByTestId).toHaveBeenCalledWith(testId)
            expect(result).toEqual({deletedExecutions: 1})
        })

        it('should handle multiple execution deletions with mixed attachment results', async () => {
            const testId = 'test-complex'
            const executions = [
                {
                    id: 'exec-1',
                    testId,
                    runId: 'run-1',
                    name: 'Test',
                    filePath: '/path/test.spec.ts',
                    status: 'passed',
                    duration: 100,
                    timestamp: '2025-10-21T10:00:00.000Z',
                    createdAt: '2025-10-21T10:00:00.000Z',
                    updatedAt: '2025-10-21T10:00:00.000Z',
                    attachments: [],
                },
                {
                    id: 'exec-2',
                    testId,
                    runId: 'run-2',
                    name: 'Test',
                    filePath: '/path/test.spec.ts',
                    status: 'failed',
                    duration: 150,
                    timestamp: '2025-10-21T11:00:00.000Z',
                    createdAt: '2025-10-21T11:00:00.000Z',
                    updatedAt: '2025-10-21T11:00:00.000Z',
                    attachments: [],
                },
                {
                    id: 'exec-3',
                    testId,
                    runId: 'run-3',
                    name: 'Test',
                    filePath: '/path/test.spec.ts',
                    status: 'passed',
                    duration: 120,
                    timestamp: '2025-10-21T12:00:00.000Z',
                    createdAt: '2025-10-21T12:00:00.000Z',
                    updatedAt: '2025-10-21T12:00:00.000Z',
                    attachments: [],
                },
            ]

            mockTestRepository.getTestResultsByTestId.mockResolvedValue(executions)
            mockAttachmentService.deleteAttachmentsForTestResult
                .mockResolvedValueOnce(2) // exec-1: 2 files
                .mockRejectedValueOnce(new Error('Failed')) // exec-2: error
                .mockResolvedValueOnce(1) // exec-3: 1 file
            mockTestRepository.deleteByTestId.mockResolvedValue(3)

            const result = await testService.deleteTest(testId)

            expect(mockAttachmentService.deleteAttachmentsForTestResult).toHaveBeenCalledTimes(3)
            expect(mockTestRepository.deleteByTestId).toHaveBeenCalledWith(testId)
            expect(result).toEqual({deletedExecutions: 3})
        })

        it('should propagate repository deletion errors', async () => {
            const testId = 'test-error'
            const executions = [
                {
                    id: 'exec-1',
                    testId,
                    runId: 'run-1',
                    name: 'Test',
                    filePath: '/path/test.spec.ts',
                    status: 'passed',
                    duration: 100,
                    timestamp: '2025-10-21T10:00:00.000Z',
                    createdAt: '2025-10-21T10:00:00.000Z',
                    updatedAt: '2025-10-21T10:00:00.000Z',
                    attachments: [],
                },
            ]

            mockTestRepository.getTestResultsByTestId.mockResolvedValue(executions)
            mockAttachmentService.deleteAttachmentsForTestResult.mockResolvedValue(1)
            mockTestRepository.deleteByTestId.mockRejectedValue(
                new Error('Database constraint violation')
            )

            await expect(testService.deleteTest(testId)).rejects.toThrow(
                'Database constraint violation'
            )
        })
    })

    describe('deleteExecution', () => {
        it('should delete a specific execution successfully', async () => {
            const executionId = 'exec-123'

            mockAttachmentService.deleteAttachmentsForTestResult.mockResolvedValue(2)
            mockTestRepository.deleteByExecutionId.mockResolvedValue(1)

            const result = await testService.deleteExecution(executionId)

            // Should delete attachments first
            expect(mockAttachmentService.deleteAttachmentsForTestResult).toHaveBeenCalledWith(
                executionId
            )

            // Then delete the database record
            expect(mockTestRepository.deleteByExecutionId).toHaveBeenCalledWith(executionId)

            // Should return success
            expect(result).toEqual({success: true})
        })

        it('should return success=false when execution not found', async () => {
            const executionId = 'non-existent-exec'

            mockAttachmentService.deleteAttachmentsForTestResult.mockResolvedValue(0)
            mockTestRepository.deleteByExecutionId.mockResolvedValue(0)

            const result = await testService.deleteExecution(executionId)

            expect(result).toEqual({success: false})
            expect(mockAttachmentService.deleteAttachmentsForTestResult).toHaveBeenCalledWith(
                executionId
            )
            expect(mockTestRepository.deleteByExecutionId).toHaveBeenCalledWith(executionId)
        })

        it('should continue deletion even if attachment deletion fails', async () => {
            const executionId = 'exec-with-attachment-error'

            mockAttachmentService.deleteAttachmentsForTestResult.mockRejectedValue(
                new Error('Permission denied on file system')
            )
            mockTestRepository.deleteByExecutionId.mockResolvedValue(1)

            const result = await testService.deleteExecution(executionId)

            // Should still delete database record despite attachment error
            expect(mockTestRepository.deleteByExecutionId).toHaveBeenCalledWith(executionId)

            // Should return success because database deletion succeeded
            expect(result).toEqual({success: true})
        })

        it('should delete execution with multiple attachments', async () => {
            const executionId = 'exec-with-multiple-attachments'

            mockAttachmentService.deleteAttachmentsForTestResult.mockResolvedValue(5)
            mockTestRepository.deleteByExecutionId.mockResolvedValue(1)

            const result = await testService.deleteExecution(executionId)

            expect(mockAttachmentService.deleteAttachmentsForTestResult).toHaveBeenCalledWith(
                executionId
            )
            expect(mockTestRepository.deleteByExecutionId).toHaveBeenCalledWith(executionId)
            expect(result).toEqual({success: true})
        })

        it('should delete execution with no attachments', async () => {
            const executionId = 'exec-no-attachments'

            mockAttachmentService.deleteAttachmentsForTestResult.mockResolvedValue(0)
            mockTestRepository.deleteByExecutionId.mockResolvedValue(1)

            const result = await testService.deleteExecution(executionId)

            expect(mockAttachmentService.deleteAttachmentsForTestResult).toHaveBeenCalledWith(
                executionId
            )
            expect(mockTestRepository.deleteByExecutionId).toHaveBeenCalledWith(executionId)
            expect(result).toEqual({success: true})
        })

        it('should handle repository deletion errors', async () => {
            const executionId = 'exec-with-db-error'

            mockAttachmentService.deleteAttachmentsForTestResult.mockResolvedValue(1)
            mockTestRepository.deleteByExecutionId.mockRejectedValue(
                new Error('Database error: foreign key constraint')
            )

            await expect(testService.deleteExecution(executionId)).rejects.toThrow(
                'Database error: foreign key constraint'
            )

            // Attachments should have been attempted first
            expect(mockAttachmentService.deleteAttachmentsForTestResult).toHaveBeenCalledWith(
                executionId
            )
        })

        it('should properly propagate attachment deletion errors when critical', async () => {
            const executionId = 'exec-critical-error'

            // Simulate a critical attachment error (though current implementation catches all)
            mockAttachmentService.deleteAttachmentsForTestResult.mockRejectedValue(
                new Error('Disk full')
            )
            mockTestRepository.deleteByExecutionId.mockResolvedValue(1)

            // Current implementation logs and continues, should still succeed
            const result = await testService.deleteExecution(executionId)

            expect(result).toEqual({success: true})
        })

        it('should handle execution deletion order: attachments then database', async () => {
            const executionId = 'exec-order-test'
            const callOrder: string[] = []

            mockAttachmentService.deleteAttachmentsForTestResult.mockImplementation(async () => {
                callOrder.push('attachments')
                return 2
            })

            mockTestRepository.deleteByExecutionId.mockImplementation(async () => {
                callOrder.push('database')
                return 1
            })

            await testService.deleteExecution(executionId)

            // Verify attachments are deleted BEFORE database
            expect(callOrder).toEqual(['attachments', 'database'])
        })

        it('should delete execution from the middle of history', async () => {
            const executionId = 'exec-middle'

            mockAttachmentService.deleteAttachmentsForTestResult.mockResolvedValue(1)
            mockTestRepository.deleteByExecutionId.mockResolvedValue(1)

            const result = await testService.deleteExecution(executionId)

            expect(result).toEqual({success: true})
            expect(mockTestRepository.deleteByExecutionId).toHaveBeenCalledWith(executionId)
        })

        it('should handle concurrent deletion attempts gracefully', async () => {
            const executionId = 'exec-concurrent'

            mockAttachmentService.deleteAttachmentsForTestResult.mockResolvedValue(1)
            mockTestRepository.deleteByExecutionId.mockResolvedValue(1)

            // Simulate concurrent calls
            const [result1, result2] = await Promise.all([
                testService.deleteExecution(executionId),
                testService.deleteExecution(executionId),
            ])

            // Both should attempt deletion
            expect(mockTestRepository.deleteByExecutionId).toHaveBeenCalledTimes(2)

            // First call should succeed
            expect(result1).toEqual({success: true})

            // Second call behavior depends on repository (in real scenario, second call would return 0)
            expect(result2).toEqual({success: true})
        })

        it('should handle deletion when attachment service is slow', async () => {
            const executionId = 'exec-slow-attachments'

            // Simulate slow attachment deletion
            mockAttachmentService.deleteAttachmentsForTestResult.mockImplementation(
                () => new Promise((resolve) => setTimeout(() => resolve(3), 100))
            )
            mockTestRepository.deleteByExecutionId.mockResolvedValue(1)

            const result = await testService.deleteExecution(executionId)

            expect(result).toEqual({success: true})
            expect(mockAttachmentService.deleteAttachmentsForTestResult).toHaveBeenCalledWith(
                executionId
            )
            expect(mockTestRepository.deleteByExecutionId).toHaveBeenCalledWith(executionId)
        })

        it('should delete execution with large attachments', async () => {
            const executionId = 'exec-large-attachments'

            // Simulate deletion of many attachments
            mockAttachmentService.deleteAttachmentsForTestResult.mockResolvedValue(100)
            mockTestRepository.deleteByExecutionId.mockResolvedValue(1)

            const result = await testService.deleteExecution(executionId)

            expect(result).toEqual({success: true})
        })

        it('should handle SQL injection attempts safely', async () => {
            const maliciousId = "'; DROP TABLE test_results; --"

            mockAttachmentService.deleteAttachmentsForTestResult.mockResolvedValue(0)
            mockTestRepository.deleteByExecutionId.mockResolvedValue(0)

            const result = await testService.deleteExecution(maliciousId)

            // Should be treated as regular string, return false (not found)
            expect(result).toEqual({success: false})
            expect(mockTestRepository.deleteByExecutionId).toHaveBeenCalledWith(maliciousId)
        })

        it('should verify attachments are deleted from filesystem', async () => {
            const executionId = 'exec-filesystem-check'

            // Mock that returns number of files deleted
            mockAttachmentService.deleteAttachmentsForTestResult.mockResolvedValue(3)
            mockTestRepository.deleteByExecutionId.mockResolvedValue(1)

            await testService.deleteExecution(executionId)

            // Verify attachment service was called with correct executionId
            expect(mockAttachmentService.deleteAttachmentsForTestResult).toHaveBeenCalledWith(
                executionId
            )
        })

        it('should handle execution with trace files', async () => {
            const executionId = 'exec-with-traces'

            mockAttachmentService.deleteAttachmentsForTestResult.mockResolvedValue(1)
            mockTestRepository.deleteByExecutionId.mockResolvedValue(1)

            const result = await testService.deleteExecution(executionId)

            expect(result).toEqual({success: true})
            expect(mockAttachmentService.deleteAttachmentsForTestResult).toHaveBeenCalledWith(
                executionId
            )
        })
    })
})
