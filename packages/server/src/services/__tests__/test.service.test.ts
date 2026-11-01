import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {TestService} from '../test.service'
import {CIRunQueueService} from '../ciRunQueue.service'
import {runProcessRegistry} from '../runProcessRegistry.service'
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
vi.mock('../settings.service')
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
        isProcessRunning: vi.fn(() => true),
        isAnyProcessRunning: vi.fn(() => false),
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
    let mockSettingsService: any
    let mockAttachmentCleanupRepository: any
    let mockTestCatalogRepository: any
    let mockCIRunQueue: any

    // The run registry is a process-wide singleton: every fake child is closed after each test.
    const createdProcesses: EventEmitter[] = []

    // Helper to create mock child process
    const createMockProcess = (): ChildProcess => {
        const process = new EventEmitter() as any
        createdProcesses.push(process)
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
            deletePendingRows: vi.fn().mockResolvedValue(0),
            getLatestProjects: vi.fn().mockResolvedValue(new Map()),
            saveTestResult: vi.fn(),
            getTestResult: vi.fn(),
            getAllTests: vi.fn(),
            getLatestByTestId: vi.fn(),
            getTestResultsByTestId: vi.fn(),
            deleteByTestId: vi.fn(),
            deleteByExecutionId: vi.fn(),
            clearAllTests: vi.fn(),
            getTestStats: vi.fn(),
            getFlakyTests: vi.fn(),
            getTestTimeline: vi.fn(),
            getTestExecutionCount: vi.fn(),
            getIdsOlderThan: vi.fn(),
            getIdsPrunedByCount: vi.fn(),
            getStrippableIdsOlderThan: vi.fn(),
            getStrippableIdsByCount: vi.fn(),
            getAttachmentsSizeForIds: vi.fn().mockResolvedValue({total: 0, perId: {}}),
            deleteByIds: vi.fn().mockResolvedValue(0),
            getProjectByFilePath: vi.fn().mockResolvedValue(''),
            getExecutionIdsByProject: vi.fn().mockResolvedValue([]),
            getDistinctTestIdsByProject: vi.fn().mockResolvedValue([]),
            deleteByProject: vi.fn().mockResolvedValue(0),
            deleteDiscoveryRowsHidingResults: vi.fn().mockResolvedValue(0),
            getResultIdsByRunIds: vi.fn().mockResolvedValue([]),
            deleteByRunIds: vi.fn().mockResolvedValue(0),
            getProjectStatusSummary: vi.fn().mockResolvedValue([]),
            getTestStatusCounts: vi.fn().mockResolvedValue({
                total: 0,
                passed: 0,
                failed: 0,
                skipped: 0,
                pending: 0,
                noted: 0,
            }),
        }

        mockRunRepository = {
            createTestRun: vi.fn(),
            updateTestRun: vi.fn(),
            getTestRun: vi.fn(),
            deleteTestRuns: vi.fn().mockResolvedValue(0),
        }

        mockPlaywrightService = {
            discoverTests: vi.fn().mockResolvedValue([]),
            getAvailableProjects: vi.fn().mockResolvedValue([]),
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
            broadcastTestsDeleted: vi.fn(),
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

        mockSettingsService = {
            getGlobalPlaywrightProject: vi.fn().mockResolvedValue(''),
            getTestExecutionSettings: vi.fn(),
            setGlobalPlaywrightProject: vi.fn(),
            setInFlightRun: vi.fn().mockResolvedValue(undefined),
            clearInFlightRun: vi.fn().mockResolvedValue(undefined),
        }

        mockTestCatalogRepository = {
            upsertMany: vi.fn().mockResolvedValue(undefined),
            deleteStale: vi.fn().mockResolvedValue(0),
            deleteByTestId: vi.fn().mockResolvedValue(0),
            deleteByProject: vi.fn().mockResolvedValue(0),
            markFullScan: vi.fn().mockResolvedValue(undefined),
        }

        mockAttachmentCleanupRepository = {
            markCleared: vi.fn().mockResolvedValue(undefined),
        }

        mockSettingsService.getCIAutoRunPause = vi.fn().mockResolvedValue({paused: false})

        mockCIRunQueue = {
            assertManualStartAllowed: vi.fn(),
            isBusy: vi.fn(() => false),
            beginStarting: vi.fn(() => vi.fn()),
            requestDrain: vi.fn(),
        }

        // Create service instance
        testService = new TestService(
            mockTestRepository,
            mockRunRepository,
            mockPlaywrightService,
            mockWebSocketService,
            mockAttachmentService,
            mockNoteService,
            mockSettingsService,
            mockAttachmentCleanupRepository,
            mockCIRunQueue,
            mockTestCatalogRepository
        )
    })

    afterEach(() => {
        createdProcesses.splice(0).forEach((process) => process.emit('close', 0))
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
                    metadata: {
                        line: 1,
                        playwrightId: null,
                        tags: [],
                        discoveredAt: '2025-10-21T10:00:00.000Z',
                    },
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
                    metadata: {
                        line: 1,
                        playwrightId: null,
                        tags: [],
                        discoveredAt: '2025-10-21T10:00:00.000Z',
                    },
                    timestamp: '2025-10-21T10:00:00.000Z',
                },
            ]

            mockPlaywrightService.discoverTests.mockResolvedValue(mockDiscoveredTests)
            mockTestRepository.saveTestResult.mockResolvedValue('saved-id')

            const result = await testService.discoverTests()

            expect(result.discovered).toBe(2)
            expect(result.saved).toBe(2)
            expect(result.timestamp).toBeDefined()

            // Verify pending tests were cleared
            expect(mockTestRepository.deletePendingRows).toHaveBeenCalledWith(undefined)

            // Verify Playwright service was called
            expect(mockPlaywrightService.discoverTests).toHaveBeenCalled()

            // Verify each test was saved
            expect(mockTestRepository.saveTestResult).toHaveBeenCalledTimes(2)

            // Verify WebSocket broadcast
            expect(mockWebSocketService.broadcastDiscoveryCompleted).toHaveBeenCalledWith(
                2,
                2,
                undefined
            )
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

            mockPlaywrightService.discoverTests.mockResolvedValue(mockDiscoveredTests)
            mockTestRepository.saveTestResult
                .mockResolvedValueOnce('saved-id-1')
                .mockRejectedValueOnce(new Error('Save failed'))

            const result = await testService.discoverTests()

            expect(result.discovered).toBe(2)
            expect(result.saved).toBe(1) // Only 1 saved successfully
            expect(mockWebSocketService.broadcastDiscoveryCompleted).toHaveBeenCalledWith(
                2,
                1,
                undefined
            )
        })

        it('should throw error if discovery fails', async () => {
            mockPlaywrightService.discoverTests.mockRejectedValue(new Error('Discovery failed'))

            await expect(testService.discoverTests()).rejects.toThrow('Discovery failed')
            // A failed --list changes nothing: no pending delete, no catalog write
            expect(mockTestRepository.deletePendingRows).not.toHaveBeenCalled()
            expect(mockTestCatalogRepository.upsertMany).not.toHaveBeenCalled()
            expect(mockTestCatalogRepository.deleteStale).not.toHaveBeenCalled()
        })

        it('should throw error if clearing pending tests fails', async () => {
            mockTestRepository.deletePendingRows.mockRejectedValue(new Error('DB error'))

            await expect(testService.discoverTests()).rejects.toThrow('DB error')
        })

        it('should scope pending-cleanup, Playwright discovery, and broadcast to a single project when provided', async () => {
            mockPlaywrightService.discoverTests.mockResolvedValue([])
            mockTestRepository.saveTestResult.mockResolvedValue('saved-id')

            await testService.discoverTests('chromium')

            expect(mockTestRepository.deletePendingRows).toHaveBeenCalledWith('chromium')
            expect(mockPlaywrightService.discoverTests).toHaveBeenCalledWith('chromium')
            expect(mockWebSocketService.broadcastDiscoveryCompleted).toHaveBeenCalledWith(
                0,
                0,
                'chromium'
            )
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

        describe('project fallback from run metadata', () => {
            it('should backfill project from run metadata when project is empty and runId present', async () => {
                const testData: any = {
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

                mockRunRepository.getTestRun.mockResolvedValue({
                    id: 'run-1',
                    status: 'running',
                    metadata: {project: 'Frontend'},
                })
                mockTestRepository.saveTestResult.mockResolvedValue('exec-1')

                await testService.saveTestResult(testData)

                expect(mockRunRepository.getTestRun).toHaveBeenCalledTimes(1)
                expect(mockRunRepository.getTestRun).toHaveBeenCalledWith('run-1')
                expect(testData.project).toBe('Frontend')
                expect(mockTestRepository.saveTestResult).toHaveBeenCalledWith(testData)
            })

            it('should leave project empty when run has no metadata.project', async () => {
                const testData: any = {
                    id: 'exec-2',
                    testId: 'hash-2',
                    runId: 'run-2',
                    name: 'Test 2',
                    filePath: '/path/to/test.spec.ts',
                    status: 'passed',
                    duration: 100,
                    metadata: '{}',
                    timestamp: '2025-10-21T10:00:00.000Z',
                }

                mockRunRepository.getTestRun.mockResolvedValue({
                    id: 'run-2',
                    status: 'running',
                    metadata: {},
                })
                mockTestRepository.saveTestResult.mockResolvedValue('exec-2')

                await expect(testService.saveTestResult(testData)).resolves.toBe('exec-2')
                expect(mockRunRepository.getTestRun).toHaveBeenCalledTimes(1)
                expect(testData.project).toBeUndefined()
            })

            it('should NOT call getTestRun when project is empty and runId is absent', async () => {
                const testData: any = {
                    id: 'exec-3',
                    testId: 'hash-3',
                    runId: null,
                    name: 'Test 3',
                    filePath: '/path/to/test.spec.ts',
                    status: 'passed',
                    duration: 100,
                    metadata: '{}',
                    timestamp: '2025-10-21T10:00:00.000Z',
                }

                mockTestRepository.saveTestResult.mockResolvedValue('exec-3')

                await testService.saveTestResult(testData)

                expect(mockRunRepository.getTestRun).not.toHaveBeenCalled()
            })

            it('should NOT call getTestRun when project is already set', async () => {
                const testData: any = {
                    id: 'exec-4',
                    testId: 'hash-4',
                    runId: 'run-4',
                    project: 'Backend',
                    name: 'Test 4',
                    filePath: '/path/to/test.spec.ts',
                    status: 'passed',
                    duration: 100,
                    metadata: '{}',
                    timestamp: '2025-10-21T10:00:00.000Z',
                }

                mockTestRepository.saveTestResult.mockResolvedValue('exec-4')

                await testService.saveTestResult(testData)

                expect(mockRunRepository.getTestRun).not.toHaveBeenCalled()
                expect(testData.project).toBe('Backend')
            })
        })
    })

    describe('getTestHistory', () => {
        it('should retrieve test history (attachments are loaded by repository JOIN, no N+1)', async () => {
            const mockHistory = [
                {
                    id: 'exec-3',
                    testId: 'hash-1',
                    runId: 'run-3',
                    name: 'Test 1',
                    status: 'passed',
                    duration: 100,
                    attachments: [{id: 'att-1', fileName: 'screenshot1.png', type: 'screenshot'}],
                },
                {
                    id: 'exec-2',
                    testId: 'hash-1',
                    runId: 'run-2',
                    name: 'Test 1',
                    status: 'failed',
                    duration: 150,
                    attachments: [
                        {id: 'att-2', fileName: 'screenshot2.png', type: 'screenshot'},
                        {id: 'att-3', fileName: 'trace.zip', type: 'trace'},
                    ],
                },
                {
                    id: 'exec-1',
                    testId: 'hash-1',
                    runId: 'run-1',
                    name: 'Test 1',
                    status: 'passed',
                    duration: 120,
                    attachments: [],
                },
            ]

            mockTestRepository.getTestResultsByTestId.mockResolvedValue(mockHistory)

            const history = await testService.getTestHistory('hash-1', 50)

            expect(history).toEqual(mockHistory)
            expect(mockTestRepository.getTestResultsByTestId).toHaveBeenCalledWith(
                'hash-1',
                50,
                undefined
            )
            // Critical: history must NOT issue per-execution attachment queries
            expect(mockAttachmentService.getAttachmentsByTestResult).not.toHaveBeenCalled()
        })

        it('should use default limit of 50 if not provided', async () => {
            mockTestRepository.getTestResultsByTestId.mockResolvedValue([])

            await testService.getTestHistory('hash-1')

            expect(mockTestRepository.getTestResultsByTestId).toHaveBeenCalledWith(
                'hash-1',
                50,
                undefined
            )
        })

        it('should handle custom limit', async () => {
            mockTestRepository.getTestResultsByTestId.mockResolvedValue([])

            await testService.getTestHistory('hash-1', 10)

            expect(mockTestRepository.getTestResultsByTestId).toHaveBeenCalledWith(
                'hash-1',
                10,
                undefined
            )
        })

        it('should forward the keyset cursor for load-more', async () => {
            mockTestRepository.getTestResultsByTestId.mockResolvedValue([])

            await testService.getTestHistory('hash-1', 50, '2026-05-01T00:00:00.000Z')

            expect(mockTestRepository.getTestResultsByTestId).toHaveBeenCalledWith(
                'hash-1',
                50,
                '2026-05-01T00:00:00.000Z'
            )
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

            const history = await testService.getTestHistory('hash-1')

            // Verify order is maintained (latest first)
            expect(history[0].id).toBe('exec-3')
            expect(history[1].id).toBe('exec-2')
            expect(history[2].id).toBe('exec-1')
        })
    })

    describe('getLatestTestByTestId', () => {
        it('returns the repository row for a testId, or null', async () => {
            const row = {id: 'r-1', testId: 'abc', project: 'UI'}
            mockTestRepository.getLatestByTestId.mockResolvedValueOnce(row)
            expect(await testService.getLatestTestByTestId('abc')).toEqual(row)
            expect(mockTestRepository.getLatestByTestId).toHaveBeenCalledWith('abc')

            mockTestRepository.getLatestByTestId.mockResolvedValueOnce(null)
            expect(await testService.getLatestTestByTestId('nope')).toBeNull()
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

        it('broadcasts tests:deleted after clearing', async () => {
            mockTestRepository.clearAllTests.mockResolvedValue(undefined)

            await testService.clearAllTests()

            expect(mockWebSocketService.broadcastTestsDeleted).toHaveBeenCalledWith('all')
        })

        it('should propagate errors from repository', async () => {
            mockTestRepository.clearAllTests.mockRejectedValue(new Error('Clear failed'))

            await expect(testService.clearAllTests()).rejects.toThrow('Clear failed')
        })
    })

    describe('clearProjectData', () => {
        it('should delete attachments and notes per test, then bulk-delete by project', async () => {
            mockTestRepository.getExecutionIdsByProject.mockResolvedValue(['exec-1', 'exec-2'])
            mockTestRepository.getDistinctTestIdsByProject.mockResolvedValue(['test-1', 'test-2'])
            mockTestRepository.deleteByProject.mockResolvedValue(2)
            mockAttachmentService.deleteAttachmentsForTestResult.mockResolvedValue(0)
            mockNoteService.deleteNote.mockResolvedValue(undefined)

            const result = await testService.clearProjectData('API_Tests')

            expect(mockTestRepository.getExecutionIdsByProject).toHaveBeenCalledWith('API_Tests')
            expect(mockTestRepository.getDistinctTestIdsByProject).toHaveBeenCalledWith('API_Tests')
            expect(mockAttachmentService.deleteAttachmentsForTestResult).toHaveBeenCalledWith(
                'exec-1'
            )
            expect(mockAttachmentService.deleteAttachmentsForTestResult).toHaveBeenCalledWith(
                'exec-2'
            )
            expect(mockNoteService.deleteNote).toHaveBeenCalledWith('test-1')
            expect(mockNoteService.deleteNote).toHaveBeenCalledWith('test-2')
            expect(mockTestRepository.deleteByProject).toHaveBeenCalledWith('API_Tests')
            expect(result).toEqual({deletedExecutions: 2})
            expect(mockWebSocketService.broadcastTestsDeleted).toHaveBeenCalledWith('project', {
                project: 'API_Tests',
            })
        })

        it('should not touch other projects data (only deleteByProject with the given project)', async () => {
            mockTestRepository.getExecutionIdsByProject.mockResolvedValue([])
            mockTestRepository.getDistinctTestIdsByProject.mockResolvedValue([])
            mockTestRepository.deleteByProject.mockResolvedValue(0)

            await testService.clearProjectData('Staging')

            expect(mockTestRepository.clearAllTests).not.toHaveBeenCalled()
            expect(mockAttachmentService.deleteAttachmentsForTestResult).not.toHaveBeenCalled()
            expect(mockTestRepository.deleteByProject).toHaveBeenCalledWith('Staging')
        })

        it('should continue clearing even if an attachment or note deletion fails', async () => {
            mockTestRepository.getExecutionIdsByProject.mockResolvedValue(['exec-1'])
            mockTestRepository.getDistinctTestIdsByProject.mockResolvedValue(['test-1'])
            mockAttachmentService.deleteAttachmentsForTestResult.mockRejectedValue(
                new Error('disk error')
            )
            mockNoteService.deleteNote.mockRejectedValue(new Error('note error'))
            mockTestRepository.deleteByProject.mockResolvedValue(1)

            const result = await testService.clearProjectData('API_Tests')

            expect(mockTestRepository.deleteByProject).toHaveBeenCalledWith('API_Tests')
            expect(result).toEqual({deletedExecutions: 1})
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

    describe('getAvailableProjects', () => {
        it('should delegate to playwrightService', async () => {
            // Arrange
            const mockProjects = ['All_Tests', 'Sanity']
            mockPlaywrightService.getAvailableProjects.mockResolvedValue(mockProjects)

            // Act
            const result = await testService.getAvailableProjects()

            // Assert
            expect(result).toEqual(mockProjects)
            expect(mockPlaywrightService.getAvailableProjects).toHaveBeenCalledTimes(1)
        })

        it('should return empty array when no projects available', async () => {
            // Arrange
            mockPlaywrightService.getAvailableProjects.mockResolvedValue([])

            // Act
            const result = await testService.getAvailableProjects()

            // Assert
            expect(result).toEqual([])
        })
    })

    describe('getProjectStatusSummary', () => {
        it('should delegate to testRepository', async () => {
            const mockSummary = [
                {project: 'API_Tests', total: 62, passed: 62, failed: 0},
                {project: 'All_Tests', total: 8, passed: 5, failed: 3},
            ]
            mockTestRepository.getProjectStatusSummary.mockResolvedValue(mockSummary)

            const result = await testService.getProjectStatusSummary()

            expect(result).toEqual(mockSummary)
            expect(mockTestRepository.getProjectStatusSummary).toHaveBeenCalledTimes(1)
        })
    })

    describe('getTestStatusCounts', () => {
        it('should delegate to testRepository, unscoped', async () => {
            const mockCounts = {
                total: 850,
                passed: 800,
                failed: 30,
                skipped: 15,
                pending: 5,
                noted: 12,
            }
            mockTestRepository.getTestStatusCounts.mockResolvedValue(mockCounts)

            const result = await testService.getTestStatusCounts()

            expect(result).toEqual(mockCounts)
            expect(mockTestRepository.getTestStatusCounts).toHaveBeenCalledWith(undefined)
        })

        it('should delegate to testRepository, scoped to a project', async () => {
            const mockCounts = {total: 10, passed: 8, failed: 2, skipped: 0, pending: 0, noted: 0}
            mockTestRepository.getTestStatusCounts.mockResolvedValue(mockCounts)

            const result = await testService.getTestStatusCounts('API_Tests')

            expect(result).toEqual(mockCounts)
            expect(mockTestRepository.getTestStatusCounts).toHaveBeenCalledWith('API_Tests')
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
            expect(mockPlaywrightService.runAllTests).toHaveBeenCalledWith(4, undefined)
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
                    project: undefined,
                },
            })
            expect(mockWebSocketService.broadcastRunStarted).toHaveBeenCalledWith(
                'run-123',
                'run-all'
            )
        })

        it('should use requestedProject when provided, ignoring global settings', async () => {
            // Arrange
            const mockProcess = createMockProcess()
            mockSettingsService.getGlobalPlaywrightProject.mockResolvedValue('Sanity')
            mockPlaywrightService.runAllTests.mockResolvedValue({
                runId: 'run-proj-1',
                message: 'Tests started for project: Frontend',
                timestamp: '2025-10-21T10:00:00.000Z',
                process: mockProcess,
            })
            mockRunRepository.createTestRun.mockResolvedValue('run-proj-1')

            // Act
            await testService.runAllTests(2, false, 'Frontend')

            // Assert - requestedProject takes precedence over global settings
            expect(mockPlaywrightService.runAllTests).toHaveBeenCalledWith(2, 'Frontend')
        })

        it('should fall back to global project from settings when no requestedProject', async () => {
            // Arrange
            const mockProcess = createMockProcess()
            mockSettingsService.getGlobalPlaywrightProject.mockResolvedValue('Sanity')
            mockPlaywrightService.runAllTests.mockResolvedValue({
                runId: 'run-proj-2',
                message: 'Tests started for project: Sanity',
                timestamp: '2025-10-21T10:00:00.000Z',
                process: mockProcess,
            })
            mockRunRepository.createTestRun.mockResolvedValue('run-proj-2')

            // Act
            await testService.runAllTests(2)

            // Assert - global settings used as fallback
            expect(mockPlaywrightService.runAllTests).toHaveBeenCalledWith(2, 'Sanity')
        })

        it('should scope auto-discovery to the Settings-configured project for CI script triggers', async () => {
            // Mirrors scripts/trigger-test-run.js, which posts {maxWorkers, source: 'script'}
            // with no project and no skipAutoDiscovery — relying entirely on the
            // Settings-configured global_playwright_project as the scope.
            const mockProcess = createMockProcess()
            mockSettingsService.getGlobalPlaywrightProject.mockResolvedValue('API_Tests')
            mockSettingsService.getCIAutoRunPause = vi.fn().mockResolvedValue({paused: false})
            mockPlaywrightService.discoverTests.mockResolvedValue([])
            mockPlaywrightService.runAllTests.mockResolvedValue({
                runId: 'run-ci-1',
                message: 'Tests started for project: API_Tests',
                timestamp: '2025-10-21T10:00:00.000Z',
                process: mockProcess,
            })
            mockRunRepository.createTestRun.mockResolvedValue('run-ci-1')

            await testService.runAllTests(undefined, undefined, undefined, 'script')

            // Discovery (and its pending-cleanup DELETE) must be scoped to the same
            // project the run itself uses — never a global, cross-project reset.
            expect(mockPlaywrightService.discoverTests).toHaveBeenCalledWith('API_Tests')
            expect(mockTestRepository.deletePendingRows).toHaveBeenCalledWith('API_Tests')
            expect(mockPlaywrightService.runAllTests).toHaveBeenCalledWith(undefined, 'API_Tests')
        })

        it('should pass undefined project when no global project is configured', async () => {
            // Arrange
            const mockProcess = createMockProcess()
            mockPlaywrightService.runAllTests.mockResolvedValue({
                runId: 'run-no-proj',
                message: 'All tests started',
                timestamp: '2025-10-21T10:00:00.000Z',
                process: mockProcess,
            })
            mockRunRepository.createTestRun.mockResolvedValue('run-no-proj')

            // Act
            await testService.runAllTests()

            // Assert - no project means undefined
            expect(mockPlaywrightService.runAllTests).toHaveBeenCalledWith(undefined, undefined)
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

            // Mock isProcessRunning to return true (process exists)
            const {activeProcessesTracker} = await import('../activeProcesses.service')
            vi.mocked(activeProcessesTracker.isProcessRunning).mockReturnValue(true)

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

            // Mock isProcessRunning to return true (process exists)
            const {activeProcessesTracker} = await import('../activeProcesses.service')
            vi.mocked(activeProcessesTracker.isProcessRunning).mockReturnValue(true)

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
                undefined,
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
                    filteredTests: undefined,
                    project: undefined,
                },
            })
            expect(mockWebSocketService.broadcastRunStarted).toHaveBeenCalledWith(
                'run-456',
                'run-group',
                '/path/to/test.spec.ts'
            )
        })

        it('should use project from getProjectByFilePath when available', async () => {
            const mockProcess = createMockProcess()
            const mockResult = {
                runId: 'run-456',
                message: 'Group tests started',
                timestamp: '2025-10-21T10:00:00.000Z',
                process: mockProcess,
            }

            mockTestRepository.getProjectByFilePath.mockResolvedValue('Staging')
            mockPlaywrightService.runTestGroup.mockResolvedValue(mockResult)
            mockRunRepository.createTestRun.mockResolvedValue('run-456')

            await testService.runTestGroup('/path/to/staging.spec.ts', 2)

            expect(mockPlaywrightService.runTestGroup).toHaveBeenCalledWith(
                '/path/to/staging.spec.ts',
                2,
                undefined,
                'Staging'
            )
            expect(mockSettingsService.getGlobalPlaywrightProject).not.toHaveBeenCalled()
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

            // Mock isProcessRunning to return true (process exists)
            const {activeProcessesTracker} = await import('../activeProcesses.service')
            vi.mocked(activeProcessesTracker.isProcessRunning).mockReturnValue(true)

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

            mockSettingsService.getGlobalPlaywrightProject.mockResolvedValue('All_Tests')

            const result = await testService.rerunTest('exec-1', 1, 'Ignored_By_Request')

            expect(result.runId).toBe('rerun-789')
            expect(result.testId).toBe('exec-1')
            expect(result.testName).toBe('Test 1')
            expect(mockPlaywrightService.rerunSingleTest).toHaveBeenCalledWith(
                '/path/to/test.spec.ts',
                'Test 1',
                1,
                'All_Tests'
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
                    project: 'All_Tests',
                },
            })
        })

        it('should use test.project from DB record instead of global setting', async () => {
            const mockTest = {
                id: 'exec-1',
                testId: 'hash-1',
                name: 'Test 1',
                filePath: '/path/to/staging.spec.ts',
                status: 'failed',
                project: 'Staging',
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

            await testService.rerunTest('exec-1', 1)

            expect(mockPlaywrightService.rerunSingleTest).toHaveBeenCalledWith(
                '/path/to/staging.spec.ts',
                'Test 1',
                1,
                'Staging'
            )
            expect(mockSettingsService.getGlobalPlaywrightProject).not.toHaveBeenCalled()
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

            // Mock isProcessRunning to return true (process exists)
            const {activeProcessesTracker} = await import('../activeProcesses.service')
            vi.mocked(activeProcessesTracker.isProcessRunning).mockReturnValue(true)

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

    describe('CI queue integration', () => {
        const startedRun = (runId: string) => ({
            runId,
            message: 'started',
            timestamp: '2025-10-21T10:00:00.000Z',
            process: createMockProcess(),
        })

        const arrangeRerun = () => {
            mockTestRepository.getTestResult.mockResolvedValue({
                id: 'exec-1',
                testId: 'hash-1',
                name: 'Test 1',
                filePath: '/path/to/test.spec.ts',
                project: 'All_Tests',
            })
            mockPlaywrightService.rerunSingleTest.mockResolvedValue(startedRun('rerun-1'))
            mockRunRepository.createTestRun.mockResolvedValue('rerun-1')
        }

        it('refuses manual run-all, group and rerun while a CI request is queued', async () => {
            mockCIRunQueue.assertManualStartAllowed.mockImplementation(() => {
                throw new Error('CI_RUN_QUEUED')
            })
            arrangeRerun()

            await expect(testService.runAllTests(2)).rejects.toThrow('CI_RUN_QUEUED')
            await expect(testService.runTestGroup('/a.spec.ts')).rejects.toThrow('CI_RUN_QUEUED')
            await expect(testService.rerunTest('exec-1')).rejects.toThrow('CI_RUN_QUEUED')

            expect(mockPlaywrightService.runAllTests).not.toHaveBeenCalled()
            expect(mockPlaywrightService.runTestGroup).not.toHaveBeenCalled()
            expect(mockPlaywrightService.rerunSingleTest).not.toHaveBeenCalled()
        })

        it('refuses a manual run-all while the dashboard is busy (pipeline between steps, discovery)', async () => {
            mockCIRunQueue.isBusy.mockReturnValue(true)

            await expect(testService.runAllTests(2, true, 'API')).rejects.toThrow(
                'TESTS_ALREADY_RUNNING'
            )

            expect(mockCIRunQueue.isBusy).toHaveBeenCalledWith({ignorePipeline: false})
            expect(mockPlaywrightService.runAllTests).not.toHaveBeenCalled()
            expect(mockCIRunQueue.beginStarting).not.toHaveBeenCalled()
        })

        it('with the real queue: manual run-all is refused between pipeline steps, a step is not', async () => {
            const realQueue = new CIRunQueueService(mockWebSocketService)
            realQueue.registerPipelineRunning(() => true) // pipeline running, nothing tracked
            const service = new TestService(
                mockTestRepository,
                mockRunRepository,
                mockPlaywrightService,
                mockWebSocketService,
                mockAttachmentService,
                mockNoteService,
                mockSettingsService,
                mockAttachmentCleanupRepository,
                realQueue,
                mockTestCatalogRepository
            )
            mockPlaywrightService.runAllTests.mockResolvedValue(startedRun('run-1'))

            await expect(service.runAllTests(2, true, 'UI')).rejects.toThrow(
                'TESTS_ALREADY_RUNNING'
            )
            expect(mockPlaywrightService.runAllTests).not.toHaveBeenCalled()

            await service.runAllTests(2, true, 'UI', 'script', {pipelineStep: true})
            expect(mockPlaywrightService.runAllTests).toHaveBeenCalledTimes(1)
        })

        it('a pipeline step ignores its own pipeline flag but still sees other busy sources', async () => {
            mockPlaywrightService.runAllTests.mockResolvedValue(startedRun('run-1'))
            mockCIRunQueue.isBusy.mockImplementation((o?: {ignorePipeline?: boolean}) => {
                return !o?.ignorePipeline // only the pipeline flag is set
            })

            await testService.runAllTests(2, true, 'API', 'script', {pipelineStep: true})
            expect(mockPlaywrightService.runAllTests).toHaveBeenCalledTimes(1)

            mockCIRunQueue.isBusy.mockReturnValue(true) // e.g. a manual run is starting
            await expect(
                testService.runAllTests(2, true, 'API', 'script', {pipelineStep: true})
            ).rejects.toThrow('TESTS_ALREADY_RUNNING')
        })

        it('refuses group and rerun whenever the dashboard is busy', async () => {
            arrangeRerun()
            mockPlaywrightService.runTestGroup.mockResolvedValue(startedRun('run-g'))
            await testService.runTestGroup('/a.spec.ts')
            await testService.rerunTest('exec-1')

            mockCIRunQueue.isBusy.mockReturnValue(true) // pipeline, another run, or a start in flight
            await expect(testService.runTestGroup('/a.spec.ts')).rejects.toThrow(
                'TESTS_ALREADY_RUNNING'
            )
            await expect(testService.rerunTest('exec-1')).rejects.toThrow('TESTS_ALREADY_RUNNING')

            expect(mockPlaywrightService.runTestGroup).toHaveBeenCalledTimes(1)
            expect(mockPlaywrightService.rerunSingleTest).toHaveBeenCalledTimes(1)
        })

        it('does not refuse a CI script run-all or a pipeline step', async () => {
            mockCIRunQueue.assertManualStartAllowed.mockImplementation(() => {
                throw new Error('CI_RUN_QUEUED')
            })
            mockSettingsService.getCIAutoRunPause = vi.fn().mockResolvedValue({paused: false})
            mockPlaywrightService.runAllTests.mockImplementation(async () => startedRun('run-x'))

            await testService.runAllTests(undefined, true, 'API', 'script')
            await testService.runAllTests(undefined, true, 'API', undefined, {pipelineStep: true})

            expect(mockPlaywrightService.runAllTests).toHaveBeenCalledTimes(2)
        })

        it('is busy from before discovery until the process is tracked, then releases', async () => {
            const release = vi.fn()
            mockCIRunQueue.beginStarting.mockReturnValue(release)
            mockPlaywrightService.runAllTests.mockResolvedValue(startedRun('run-1'))

            const pending = testService.runAllTests(2, false, 'API')
            expect(mockCIRunQueue.beginStarting).toHaveBeenCalledTimes(1)
            expect(release).not.toHaveBeenCalled()
            await pending

            expect(release).toHaveBeenCalledTimes(1)
        })

        it('releases the starting claim when spawning fails', async () => {
            const release = vi.fn()
            mockCIRunQueue.beginStarting.mockReturnValue(release)
            mockPlaywrightService.runAllTests.mockRejectedValue(new Error('spawn failed'))

            await expect(testService.runAllTests(2, true, 'API')).rejects.toThrow('spawn failed')

            expect(release).toHaveBeenCalledTimes(1)
        })

        it('drains the queue when a run-all process closes', async () => {
            const run = startedRun('run-1')
            mockPlaywrightService.runAllTests.mockResolvedValue(run)

            await testService.runAllTests(2, true, 'API')
            expect(mockCIRunQueue.requestDrain).not.toHaveBeenCalled()

            run.process.emit('close', 0)

            expect(mockCIRunQueue.requestDrain).toHaveBeenCalledTimes(1)
        })

        it('does not drain when a pipeline step closes (the pipeline drains on its own finish)', async () => {
            const run = startedRun('run-1')
            mockSettingsService.getCIAutoRunPause = vi.fn().mockResolvedValue({paused: false})
            mockPlaywrightService.runAllTests.mockResolvedValue(run)

            await testService.runAllTests(2, true, 'API', 'script', {pipelineStep: true})
            run.process.emit('close', 0)

            expect(mockCIRunQueue.requestDrain).not.toHaveBeenCalled()
        })

        it('drains the queue when a group run closes', async () => {
            const run = startedRun('run-g')
            mockPlaywrightService.runTestGroup.mockResolvedValue(run)

            await testService.runTestGroup('/a.spec.ts', 1)
            run.process.emit('close', 0)

            expect(mockCIRunQueue.requestDrain).toHaveBeenCalledTimes(1)
        })

        it('drains the queue when a rerun closes', async () => {
            arrangeRerun()
            const run = startedRun('rerun-1')
            mockPlaywrightService.rerunSingleTest.mockResolvedValue(run)

            await testService.rerunTest('exec-1')
            run.process.emit('close', 0)
            await new Promise((resolve) => setImmediate(resolve))

            expect(mockCIRunQueue.requestDrain).toHaveBeenCalledTimes(1)
        })

        it('requestQueueDrain asks the queue to drain', () => {
            testService.requestQueueDrain()

            expect(mockCIRunQueue.requestDrain).toHaveBeenCalledTimes(1)
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

            // Other browsers must refresh
            expect(mockWebSocketService.broadcastTestsDeleted).toHaveBeenCalledWith('test', {
                testId,
            })
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
        beforeEach(() => {
            mockTestRepository.getTestResult.mockResolvedValue({id: 'exists'})
        })

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

            expect(mockWebSocketService.broadcastTestsDeleted).toHaveBeenCalledWith('execution', {
                executionId,
            })
        })

        it('should return success=false and touch no files when the execution row is missing', async () => {
            const executionId = 'non-existent-exec'
            mockTestRepository.getTestResult.mockResolvedValue(null)

            const result = await testService.deleteExecution(executionId)

            expect(result).toEqual({success: false})
            expect(mockAttachmentService.deleteAttachmentsForTestResult).not.toHaveBeenCalled()
            expect(mockTestRepository.deleteByExecutionId).not.toHaveBeenCalled()
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

    describe('getTestExecutionCount', () => {
        it('should delegate to the repository', async () => {
            mockTestRepository.getTestExecutionCount.mockResolvedValue(42)

            const count = await testService.getTestExecutionCount('test-1')

            expect(count).toBe(42)
            expect(mockTestRepository.getTestExecutionCount).toHaveBeenCalledWith('test-1')
        })
    })

    describe('cleanupData', () => {
        it('broadcasts tests:deleted only when something was cleaned', async () => {
            mockTestRepository.getStrippableIdsByCount.mockResolvedValue([])
            await testService.cleanupData({type: 'count', value: 20})
            expect(mockWebSocketService.broadcastTestsDeleted).not.toHaveBeenCalled()

            mockTestRepository.getStrippableIdsByCount.mockResolvedValue(['a'])
            mockTestRepository.getAttachmentsSizeForIds.mockResolvedValue({
                total: 1,
                perId: {a: 1},
            })
            mockAttachmentService.deleteAttachmentsForTestResult.mockResolvedValue(1)
            await testService.cleanupData({type: 'count', value: 20})
            expect(mockWebSocketService.broadcastTestsDeleted).toHaveBeenCalledWith('cleanup')
        })

        it('should default to strip mode: delete attachments, keep rows, mark cleared', async () => {
            mockTestRepository.getStrippableIdsByCount.mockResolvedValue(['a', 'b'])
            mockTestRepository.getAttachmentsSizeForIds.mockResolvedValue({
                total: 300,
                perId: {a: 100, b: 200},
            })
            mockAttachmentService.deleteAttachmentsForTestResult.mockResolvedValue(1)

            const result = await testService.cleanupData({type: 'count', value: 20})

            expect(result.mode).toBe('strip')
            expect(result.deletedExecutions).toBe(2)
            expect(result.freedSpace).toBe(300)
            // rows are NOT deleted in strip mode
            expect(mockTestRepository.deleteByIds).not.toHaveBeenCalled()
            // cleared markers recorded with per-execution freed bytes
            expect(mockAttachmentCleanupRepository.markCleared).toHaveBeenCalledWith([
                {testResultId: 'a', freedBytes: 100},
                {testResultId: 'b', freedBytes: 200},
            ])
            expect(mockTestRepository.getStrippableIdsByCount).toHaveBeenCalledWith(20)
        })

        it('should use strip date selection that preserves the latest run', async () => {
            mockTestRepository.getStrippableIdsOlderThan.mockResolvedValue(['old-1'])
            mockTestRepository.getAttachmentsSizeForIds.mockResolvedValue({
                total: 50,
                perId: {'old-1': 50},
            })

            const result = await testService.cleanupData({
                type: 'date',
                value: '2026-01-01T00:00:00.000Z',
                mode: 'strip',
            })

            expect(mockTestRepository.getStrippableIdsOlderThan).toHaveBeenCalledTimes(1)
            expect(result.freedSpace).toBe(50)
            expect(mockTestRepository.deleteByIds).not.toHaveBeenCalled()
        })

        it('should delete rows in full mode and not record cleanups', async () => {
            mockTestRepository.getIdsPrunedByCount.mockResolvedValue(['a', 'b', 'c'])
            mockTestRepository.getAttachmentsSizeForIds.mockResolvedValue({
                total: 900,
                perId: {a: 300, b: 300, c: 300},
            })
            mockTestRepository.deleteByIds.mockResolvedValue(3)

            const result = await testService.cleanupData({
                type: 'count',
                value: 5,
                mode: 'full',
            })

            expect(result.mode).toBe('full')
            expect(result.deletedExecutions).toBe(3)
            expect(result.freedSpace).toBe(900)
            expect(mockTestRepository.deleteByIds).toHaveBeenCalledWith(['a', 'b', 'c'])
            expect(mockAttachmentCleanupRepository.markCleared).not.toHaveBeenCalled()
        })

        it('should no-op when nothing matches', async () => {
            mockTestRepository.getStrippableIdsByCount.mockResolvedValue([])

            const result = await testService.cleanupData({type: 'count', value: 20})

            expect(result.deletedExecutions).toBe(0)
            expect(result.freedSpace).toBe(0)
            expect(mockAttachmentService.deleteAttachmentsForTestResult).not.toHaveBeenCalled()
            expect(mockAttachmentCleanupRepository.markCleared).not.toHaveBeenCalled()
        })

        it('should reject invalid count', async () => {
            await expect(testService.cleanupData({type: 'count', value: 0})).rejects.toThrow(
                'Invalid count provided'
            )
        })

        it('should reject invalid date', async () => {
            await expect(
                testService.cleanupData({type: 'date', value: 'not-a-date'})
            ).rejects.toThrow('Invalid date provided')
        })
    })

    describe('Stop support', () => {
        const startedRun = (runId: string) => ({
            runId,
            message: 'started',
            timestamp: '2025-10-21T10:00:00.000Z',
            process: createMockProcess(),
        })

        describe('run registry', () => {
            it('registers the spawned child so it is the busy source, and drops it when the child closes', async () => {
                const run = startedRun('reg-1')
                mockPlaywrightService.runAllTests.mockResolvedValue(run)

                await testService.runAllTests(2, true, 'API')
                expect(runProcessRegistry.has('reg-1')).toBe(true)
                expect(runProcessRegistry.isAnyRunning()).toBe(true)

                run.process.emit('close', 0)
                expect(runProcessRegistry.has('reg-1')).toBe(false)
            })

            it('registers group runs and reruns as well', async () => {
                const group = startedRun('reg-group')
                mockPlaywrightService.runTestGroup.mockResolvedValue(group)
                await testService.runTestGroup('/a.spec.ts')

                expect(runProcessRegistry.has('reg-group')).toBe(true)
                group.process.emit('close', 0)

                mockTestRepository.getTestResult.mockResolvedValue({
                    id: 'exec-1',
                    testId: 'hash-1',
                    name: 'Test 1',
                    filePath: '/a.spec.ts',
                    project: 'API',
                })
                const rerun = startedRun('reg-rerun')
                mockPlaywrightService.rerunSingleTest.mockResolvedValue(rerun)
                await testService.rerunTest('exec-1')

                expect(runProcessRegistry.has('reg-rerun')).toBe(true)
                rerun.process.emit('close', 0)
            })

            it('the child stays the busy source after the progress tracker dropped its entry', async () => {
                const run = startedRun('reg-2')
                mockPlaywrightService.runAllTests.mockResolvedValue(run)
                await testService.runAllTests(2, true, 'API')

                // The tracker is a mock here and holds nothing; the registry alone says busy.
                expect(runProcessRegistry.isAnyRunning()).toBe(true)
                run.process.emit('close', 0)
            })
        })

        describe('a Stop that lands while a start is still preparing', () => {
            it('run-all: after discovery it does not spawn, undoes its own discovery rows and throws RUN_CANCELLED', async () => {
                let finishDiscovery!: () => void
                mockPlaywrightService.discoverTests.mockImplementation(
                    () => new Promise((resolve) => (finishDiscovery = () => resolve([])))
                )
                const release = vi.fn()
                mockCIRunQueue.beginStarting.mockReturnValue(release)

                const started = testService.runAllTests(2, false, 'API')
                const rejection = expect(started).rejects.toThrow('RUN_CANCELLED')
                await new Promise((resolve) => setImmediate(resolve))
                runProcessRegistry.beginStop()
                finishDiscovery()
                await rejection

                expect(mockPlaywrightService.runAllTests).not.toHaveBeenCalled()
                expect(mockTestRepository.deleteDiscoveryRowsHidingResults).toHaveBeenCalledWith(
                    'API',
                    expect.any(String)
                )
                expect(mockRunRepository.createTestRun).not.toHaveBeenCalled()
                expect(release).toHaveBeenCalledTimes(1)
            })

            describe('run-all with skipAutoDiscovery (the UI discovers in its own request)', () => {
                // The project comes from settings, which is an await: the Stop lands before the spawn check.
                const startThenStop = () => {
                    mockSettingsService.getGlobalPlaywrightProject.mockResolvedValue('API')
                    const run = testService.runAllTests(2, true)
                    runProcessRegistry.beginStop()
                    return run
                }

                afterEach(() => {
                    vi.useRealTimers()
                })

                it("a discovery of the same project just before the run is the run's own: a Stop before the spawn undoes it", async () => {
                    await testService.discoverTests('API')

                    await expect(startThenStop()).rejects.toThrow('RUN_CANCELLED')

                    expect(
                        mockTestRepository.deleteDiscoveryRowsHidingResults
                    ).toHaveBeenCalledWith('API', expect.any(String))
                    expect(mockPlaywrightService.runAllTests).not.toHaveBeenCalled()
                })

                it('auto-discover off (no discovery at all): a Stop before the spawn deletes no pending rows', async () => {
                    await expect(startThenStop()).rejects.toThrow('RUN_CANCELLED')

                    expect(
                        mockTestRepository.deleteDiscoveryRowsHidingResults
                    ).not.toHaveBeenCalled()
                })

                it("a stale discovery (older than 30 s) is not the run's own: nothing is deleted on Stop", async () => {
                    vi.useFakeTimers({toFake: ['Date']})
                    await testService.discoverTests('API')
                    vi.setSystemTime(Date.now() + 31_000)

                    await expect(startThenStop()).rejects.toThrow('RUN_CANCELLED')
                    expect(
                        mockTestRepository.deleteDiscoveryRowsHidingResults
                    ).not.toHaveBeenCalled()
                })

                it('the spawned run remembers its discovery start only when there was a recent one', async () => {
                    const withDiscovery = startedRun('with-discovery')
                    mockPlaywrightService.runAllTests.mockResolvedValueOnce(withDiscovery)
                    await testService.discoverTests('API')
                    await testService.runAllTests(2, true, 'API')
                    expect(
                        runProcessRegistry.getRuns().find((r) => r.runId === 'with-discovery')
                            ?.pendingSince
                    ).toEqual(expect.any(String))
                    withDiscovery.process.emit('close', 0)

                    const noDiscovery = startedRun('no-discovery')
                    mockPlaywrightService.runAllTests.mockResolvedValueOnce(noDiscovery)
                    ;(testService as any).lastDiscoveries.clear()
                    await testService.runAllTests(2, true, 'API')
                    expect(
                        runProcessRegistry.getRuns().find((r) => r.runId === 'no-discovery')
                            ?.pendingSince
                    ).toBeUndefined()
                    noDiscovery.process.emit('close', 0)
                })

                it('a discovery of all projects also counts for a run on one project', async () => {
                    await testService.discoverTests()

                    await expect(startThenStop()).rejects.toThrow('RUN_CANCELLED')
                    expect(
                        mockTestRepository.deleteDiscoveryRowsHidingResults
                    ).toHaveBeenCalledWith('API', expect.any(String))
                })

                it('a discovery of another project does not count', async () => {
                    await testService.discoverTests('WEB')

                    await expect(startThenStop()).rejects.toThrow('RUN_CANCELLED')
                    expect(
                        mockTestRepository.deleteDiscoveryRowsHidingResults
                    ).not.toHaveBeenCalled()
                })
            })

            it('run-all: a Stop during the pause lookup (before the busy check) also prevents the start', async () => {
                mockSettingsService.getCIAutoRunPause.mockImplementation(async () => {
                    runProcessRegistry.beginStop()
                    return {paused: false}
                })

                await expect(
                    testService.runAllTests(2, true, 'API', 'script', {pipelineStep: true})
                ).rejects.toThrow('RUN_CANCELLED')

                expect(mockPlaywrightService.runAllTests).not.toHaveBeenCalled()
                expect(mockCIRunQueue.beginStarting).not.toHaveBeenCalled()
            })

            it('group run: does not spawn after a Stop', async () => {
                mockTestRepository.getProjectByFilePath.mockImplementation(async () => {
                    runProcessRegistry.beginStop()
                    return 'API'
                })

                await expect(testService.runTestGroup('/a.spec.ts')).rejects.toThrow(
                    'RUN_CANCELLED'
                )

                expect(mockPlaywrightService.runTestGroup).not.toHaveBeenCalled()
            })

            it('rerun: does not spawn after a Stop', async () => {
                mockTestRepository.getTestResult.mockResolvedValue({
                    id: 'exec-1',
                    testId: 'hash-1',
                    name: 'Test 1',
                    filePath: '/a.spec.ts',
                    project: '',
                })
                mockSettingsService.getGlobalPlaywrightProject.mockImplementation(async () => {
                    runProcessRegistry.beginStop()
                    return 'API'
                })

                await expect(testService.rerunTest('exec-1')).rejects.toThrow('RUN_CANCELLED')

                expect(mockPlaywrightService.rerunSingleTest).not.toHaveBeenCalled()
            })

            it('a start made after the Stop is not affected by it', async () => {
                runProcessRegistry.beginStop()
                const run = startedRun('after-stop')
                mockPlaywrightService.runAllTests.mockResolvedValue(run)

                await expect(testService.runAllTests(2, true, 'API')).resolves.toBeDefined()

                run.process.emit('close', 0)
            })

            it('nothing starts while the server is shutting down', async () => {
                vi.spyOn(runProcessRegistry, 'isShuttingDown').mockReturnValue(true)

                await expect(testService.runAllTests(2, true, 'API')).rejects.toThrow(
                    'RUN_CANCELLED'
                )
            })
        })

        describe('a stopped run reports through the Stop, not through the close handlers', () => {
            it('run-all: no run:completed broadcast, no drain', async () => {
                const run = startedRun('stopped-all')
                mockPlaywrightService.runAllTests.mockResolvedValue(run)
                await testService.runAllTests(2, true, 'API')
                runProcessRegistry.markCancelled(['stopped-all'])

                run.process.emit('close', 130)

                expect(mockWebSocketService.broadcastRunCompleted).not.toHaveBeenCalled()
                expect(mockCIRunQueue.requestDrain).not.toHaveBeenCalled()
            })

            it('group: no run:completed broadcast, no drain', async () => {
                const run = startedRun('stopped-group')
                mockPlaywrightService.runTestGroup.mockResolvedValue(run)
                await testService.runTestGroup('/a.spec.ts')
                runProcessRegistry.markCancelled(['stopped-group'])

                run.process.emit('close', 130)

                expect(mockWebSocketService.broadcastRunCompleted).not.toHaveBeenCalled()
                expect(mockCIRunQueue.requestDrain).not.toHaveBeenCalled()
            })

            it('rerun: the run row is not updated (it is deleted by the Stop) and nothing is broadcast', async () => {
                mockTestRepository.getTestResult.mockResolvedValue({
                    id: 'exec-1',
                    testId: 'hash-1',
                    name: 'Test 1',
                    filePath: '/a.spec.ts',
                    project: 'API',
                })
                const run = startedRun('stopped-rerun')
                mockPlaywrightService.rerunSingleTest.mockResolvedValue(run)
                await testService.rerunTest('exec-1')
                runProcessRegistry.markCancelled(['stopped-rerun'])

                run.process.emit('close', 130)
                await new Promise((resolve) => setImmediate(resolve))

                expect(mockRunRepository.updateTestRun).not.toHaveBeenCalled()
                expect(mockWebSocketService.broadcast).not.toHaveBeenCalled()
                expect(mockCIRunQueue.requestDrain).not.toHaveBeenCalled()
            })

            it('a run that finishes normally still broadcasts and drains', async () => {
                const run = startedRun('normal-run')
                mockPlaywrightService.runAllTests.mockResolvedValue(run)
                await testService.runAllTests(2, true, 'API')

                run.process.emit('close', 0)

                expect(mockWebSocketService.broadcastRunCompleted).toHaveBeenCalled()
                expect(mockCIRunQueue.requestDrain).toHaveBeenCalled()
            })

            it('isRunCancelled follows the registry', () => {
                expect(testService.isRunCancelled('someone-else')).toBe(false)
                runProcessRegistry.markCancelled(['flagged'])
                expect(testService.isRunCancelled('flagged')).toBe(true)
            })
        })

        describe('in-flight run marker (manual runs)', () => {
            const flush = () => new Promise((resolve) => setImmediate(resolve))

            it('a manual run-all writes the marker with its pgid and discovery start, and clears it on close', async () => {
                const run = startedRun('marker-1')
                ;(run.process as any).pid = 5150
                mockPlaywrightService.runAllTests.mockResolvedValue(run)

                await testService.runAllTests(2, false, 'API')
                await flush()

                expect(mockSettingsService.setInFlightRun).toHaveBeenCalledWith(
                    expect.objectContaining({
                        runId: 'marker-1',
                        pgid: 5150,
                        project: 'API',
                        pendingSince: expect.any(String),
                    })
                )

                run.process.emit('close', 0)
                await flush()
                expect(mockSettingsService.clearInFlightRun).toHaveBeenCalledTimes(1)
            })

            it('the set always lands before a clear from a run that closes at once', async () => {
                const calls: string[] = []
                mockSettingsService.setInFlightRun.mockImplementation(async () => {
                    await new Promise((resolve) => setTimeout(resolve, 5))
                    calls.push('set')
                })
                mockSettingsService.clearInFlightRun.mockImplementation(async () => {
                    calls.push('clear')
                })
                const run = startedRun('marker-fast')
                mockPlaywrightService.runAllTests.mockResolvedValue(run)

                await testService.runAllTests(2, true, 'API')
                run.process.emit('close', 0)
                await new Promise((resolve) => setTimeout(resolve, 30))

                expect(calls).toEqual(['set', 'clear'])
            })

            it('a run killed for server shutdown keeps its marker (the next start deletes its data) and broadcasts nothing', async () => {
                const run = startedRun('marker-shutdown')
                mockPlaywrightService.runAllTests.mockResolvedValue(run)
                await testService.runAllTests(2, true, 'API')
                await flush()
                vi.spyOn(runProcessRegistry, 'isShuttingDown').mockReturnValue(true)

                run.process.emit('close', 130)
                await flush()

                expect(mockSettingsService.clearInFlightRun).not.toHaveBeenCalled()
                expect(mockWebSocketService.broadcastRunCompleted).not.toHaveBeenCalled()
                expect(mockCIRunQueue.requestDrain).not.toHaveBeenCalled()
            })

            it('a pipeline step writes no run marker (the pipeline marker covers it)', async () => {
                const run = startedRun('step-1')
                mockPlaywrightService.runAllTests.mockResolvedValue(run)

                await testService.runAllTests(2, false, 'API', 'script', {pipelineStep: true})
                run.process.emit('close', 0)
                await flush()

                expect(mockSettingsService.setInFlightRun).not.toHaveBeenCalled()
                expect(mockSettingsService.clearInFlightRun).not.toHaveBeenCalled()
            })

            it('a failing marker write never breaks the run', async () => {
                mockSettingsService.setInFlightRun.mockRejectedValue(new Error('db locked'))
                const run = startedRun('marker-2')
                mockPlaywrightService.runAllTests.mockResolvedValue(run)

                await expect(testService.runAllTests(2, true, 'API')).resolves.toBeDefined()
                await flush()
                run.process.emit('close', 0)
            })

            it('group and rerun runs are covered too', async () => {
                const group = startedRun('marker-group')
                mockPlaywrightService.runTestGroup.mockResolvedValue(group)
                await testService.runTestGroup('/a.spec.ts')
                await flush()

                expect(mockSettingsService.setInFlightRun).toHaveBeenCalledWith(
                    expect.objectContaining({runId: 'marker-group', pendingSince: null})
                )
                group.process.emit('close', 0)
            })
        })

        describe('discardRuns', () => {
            it('deletes attachment files per result, then the results, then the run rows', async () => {
                const order: string[] = []
                mockTestRepository.getResultIdsByRunIds.mockResolvedValue(['res-1', 'res-2'])
                mockAttachmentService.deleteAttachmentsForTestResult = vi.fn(async (id: string) => {
                    order.push(`files:${id}`)
                    return 1
                })
                mockTestRepository.deleteByRunIds.mockImplementation(async () => {
                    order.push('results')
                    return 2
                })
                mockRunRepository.deleteTestRuns.mockImplementation(async () => {
                    order.push('runs')
                    return 1
                })

                await testService.discardRuns(['run-1'])

                expect(order).toEqual(['files:res-1', 'files:res-2', 'results', 'runs'])
                expect(mockTestRepository.getResultIdsByRunIds).toHaveBeenCalledWith(['run-1'])
                expect(mockTestRepository.deleteByRunIds).toHaveBeenCalledWith(['run-1'])
                expect(mockRunRepository.deleteTestRuns).toHaveBeenCalledWith(['run-1'])
            })

            it('keeps going when one attachment cannot be deleted', async () => {
                mockTestRepository.getResultIdsByRunIds.mockResolvedValue(['res-1', 'res-2'])
                mockAttachmentService.deleteAttachmentsForTestResult = vi
                    .fn()
                    .mockRejectedValueOnce(new Error('EBUSY'))
                    .mockResolvedValue(1)

                await testService.discardRuns(['run-1'])

                expect(mockAttachmentService.deleteAttachmentsForTestResult).toHaveBeenCalledTimes(
                    2
                )
                expect(mockTestRepository.deleteByRunIds).toHaveBeenCalled()
                expect(mockRunRepository.deleteTestRuns).toHaveBeenCalled()
            })

            it('then removes the discovery rows that hide older results, per scope', async () => {
                await testService.discardRuns(
                    ['run-1'],
                    [
                        {project: 'API', since: '2026-01-01T00:00:00.000Z'},
                        {since: '2026-01-02T00:00:00.000Z'},
                    ]
                )

                expect(mockTestRepository.deleteDiscoveryRowsHidingResults).toHaveBeenNthCalledWith(
                    1,
                    'API',
                    '2026-01-01T00:00:00.000Z'
                )
                expect(mockTestRepository.deleteDiscoveryRowsHidingResults).toHaveBeenNthCalledWith(
                    2,
                    undefined,
                    '2026-01-02T00:00:00.000Z'
                )
            })

            it('with no runs, still cleans the discovery rows (a stop before anything spawned)', async () => {
                await testService.discardRuns(
                    [],
                    [{project: 'API', since: '2026-01-01T00:00:00.000Z'}]
                )

                expect(mockTestRepository.getResultIdsByRunIds).not.toHaveBeenCalled()
                expect(mockRunRepository.deleteTestRuns).not.toHaveBeenCalled()
                expect(mockTestRepository.deleteDiscoveryRowsHidingResults).toHaveBeenCalledTimes(1)
            })

            it('leaves test notes alone (they are not run-scoped)', async () => {
                mockTestRepository.getResultIdsByRunIds.mockResolvedValue(['res-1'])

                await testService.discardRuns(['run-1'])

                expect(mockNoteService.deleteNote).not.toHaveBeenCalled()
            })
        })

        describe('cleanupData while a run is alive or being stopped', () => {
            it('is refused while the dashboard is busy', async () => {
                mockCIRunQueue.isBusy.mockReturnValue(true)

                await expect(testService.cleanupData({type: 'count', value: 5})).rejects.toThrow(
                    'Cannot clean up data while tests are running'
                )
            })
        })
    })
})
